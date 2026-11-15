'use strict';

const { Pool, types } = require('pg');
const config = require('./env');
const { tables, columns } = require('./postgres-identifiers.json');

// Keep DATE/TIME values as PostgreSQL text. Numeric values are used in payroll
// arithmetic and therefore parsed as numbers, matching the old SQL Server driver.
types.setTypeParser(1082, (value) => value); // date
types.setTypeParser(1083, (value) => value); // time
types.setTypeParser(1114, (value) => value); // timestamp without time zone
types.setTypeParser(1184, (value) => value); // timestamptz
types.setTypeParser(1700, (value) => Number.parseFloat(value)); // numeric

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (err) => console.error('[DB] PostgreSQL pool error:', err.message));

const identifiers = new Set([...Object.keys(tables), ...columns]);
const identifierPattern = new RegExp(`\\b(${[...identifiers].sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')})\\b`, 'g');

function quoteIdentifiers(sql) {
  // SQL is application-owned; literals are temporarily shielded from identifier rewriting.
  const literals = [];
  let text = sql.replace(/'(?:''|[^'])*'/g, (literal) => {
    literals.push(literal);
    return `\u0001${literals.length - 1}\u0002`;
  });
  text = text.replace(/\[dbo\]\.\[([^\]]+)\]/gi, (_, table) => `"${table}"`)
    .replace(/\[([^\]]+)\]/g, (_, name) => `"${name}"`)
    .replace(identifierPattern, '"$1"');
  return text.replace(/\u0001(\d+)\u0002/g, (_, i) => literals[Number(i)]);
}

function splitTopLevelSelects(sql) {
  // Rewrite each SELECT TOP n by adding LIMIT at that SELECT's query boundary.
  const edits = [];
  const regex = /\bSELECT\s+(DISTINCT\s+)?TOP\s+(\(?\s*(?:@\w+|\d+)\s*\)?)\s+/gi;
  for (const match of sql.matchAll(regex)) {
    const start = match.index;
    const depth = (sql.slice(0, start).match(/\(/g) || []).length - (sql.slice(0, start).match(/\)/g) || []).length;
    let quote = false;
    let level = depth;
    let end = sql.length;
    for (let i = start + match[0].length; i < sql.length; i += 1) {
      const c = sql[i];
      if (c === "'") { if (quote && sql[i + 1] === "'") { i += 1; continue; } quote = !quote; }
      if (quote) continue;
      if (c === '(') level += 1;
      else if (c === ')') { if (level === depth) { end = i; break; } level -= 1; }
      else if (c === ';' && level === depth) { end = i; break; }
    }
    edits.push({ start, end, distinct: match[1] || '', top: match[2].replace(/[()\s]/g, ''), bodyStart: start + match[0].length });
  }
  for (const edit of edits.reverse()) {
    let end = edit.end;
    const body = sql.slice(edit.bodyStart, end).trimEnd();
    const hasLimit = /\bLIMIT\s+/i.test(body);
    sql = `${sql.slice(0, edit.start)}SELECT ${edit.distinct}${sql.slice(edit.bodyStart, edit.end)}${hasLimit ? '' : ` LIMIT ${edit.top}`}${sql.slice(edit.end)}`;
  }
  return sql;
}

function translateSql(source, params = {}) {
  let text = String(source).replace(/\bN(?=')/g, '');
  text = splitTopLevelSelects(text);
  text = text.replace(/\bGETDATE\s*\(\s*\)/gi, "(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')")
    .replace(/\bISNULL\s*\(/gi, 'COALESCE(')
    .replace(/\bCONVERT\s*\(\s*char\s*\(\s*10\s*\)\s*,\s*([^,()]+)\s*,\s*23\s*\)/gi, 'TO_CHAR($1, \'YYYY-MM-DD\')')
    .replace(/\bCONVERT\s*\(\s*date\s*,\s*([^,()]+)\s*,\s*23\s*\)/gi, 'CAST($1 AS DATE)')
    .replace(/\bAS\s+BIT\b/gi, 'AS INTEGER')
    .replace(/\bTRY_CAST\s*\(\s*SUBSTRING\(([^()]*)\)\s+AS\s+INT\s*\)/gi, (_, expression) =>
      `CASE WHEN SUBSTRING(${expression}) ~ '^[0-9]+$' THEN CAST(SUBSTRING(${expression}) AS INTEGER) ELSE NULL END`,
    );
  text = quoteIdentifiers(text);
  text = text.replace(/\bAS\s+([A-Za-z][A-Za-z0-9_]*)\b/g, (match, alias) =>
    /[A-Z]/.test(alias) && /[a-z]/.test(alias) ? `AS "${alias}"` : match,
  );

  const values = [];
  const indexes = new Map();
  const findValue = (name) => {
    if (Object.hasOwn(params, name)) {
      const value = params[name];
      return value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value;
    }
    throw new Error(`Missing query parameter: ${name}`);
  };
  text = text.replace(/'(?:''|[^'])*'|@(\w+)/g, (match, name) => {
    if (!name) return match;
    if (!indexes.has(name)) { indexes.set(name, values.length + 1); values.push(findValue(name)); }
    return `$${indexes.get(name)}`;
  });
  return { text, values };
}

async function execute(client, source, params = {}) {
  const translated = translateSql(source, params);
  const result = await client.query(translated.text, translated.values);
  return { recordset: result.rows, recordsets: [result.rows], rowsAffected: [result.rowCount || 0], ...result };
}

async function query(source, params = {}) { return execute(pool, source, params); }
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

class Request {
  constructor(client = pool) { this.client = client?.client || client; this.params = {}; }
  input(name, _type, value) { this.params[name] = arguments.length === 2 ? _type : value; return this; }
  query(source) { return execute(this.client, source, this.params); }
}
class Transaction {
  constructor() { this.client = null; }
  async begin() { this.client = await pool.connect(); await this.client.query('BEGIN'); }
  async commit() { await this.client.query('COMMIT'); this.client.release(); }
  async rollback() { if (this.client) { await this.client.query('ROLLBACK'); this.client.release(); } }
}
class ConnectionPool {
  async connect() { return this; }
  request() { return new Request(pool); }
  async close() { await pool.end(); }
}

const scalarType = (name) => (...args) => ({ name, args });
const sql = Object.freeze({
  Char: scalarType('char'), VarChar: scalarType('varchar'), NVarChar: scalarType('nvarchar'),
  Decimal: scalarType('decimal'), Int: 'integer', Date: 'date', DateTime: 'timestamp',
  Time: 'time', MAX: -1, Request, Transaction, ConnectionPool,
});

async function closePool() { await pool.end(); }
function txRequest(tx) { return new Request(tx.client || tx); }

module.exports = { sql, pool, getPool: async () => pool, query, withTransaction, txRequest, closePool, translateSql };

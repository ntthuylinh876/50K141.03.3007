'use strict';

const connectPgSimple = require('connect-pg-simple');
const { pool } = require('./db');

function createSessionStore(session, pgPool = pool) {
  const PgStore = connectPgSimple(session);
  return new PgStore({
    pool: pgPool,
    schemaName: 'public',
    tableName: 'user_sessions',
    createTableIfMissing: false,
    pruneSessionInterval: false,
  });
}

module.exports = { createSessionStore };

'use strict';

// Opt-in local integration check. This script is deliberately not wired to npm
// scripts and must only be run after reviewing its database scope.

const COOKIE_NAME = 'nj.sid';
const SESSION_TABLE = '"public"."user_sessions"';
const TEST_PATHS = Object.freeze({
  employee: '/nhan-vien/trang-chu',
  manager: '/quan-ly/trang-chu',
  owner: '/chu-quan/trang-chu',
});

const results = new Map([
  ['login', 'NOT TESTED'],
  ['session persistence', 'NOT TESTED'],
  ['role access', 'NOT TESTED'],
  ['logout', 'NOT TESTED'],
  ['stale-cookie replay', 'NOT TESTED'],
  ['verified SID cleanup', 'NOT TESTED'],
]);
const cleanupNotes = [];

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
}

function callbackOrPromise(promise, callback) {
  if (typeof callback === 'function') {
    promise.then((value) => callback(null, value), callback);
    return undefined;
  }
  return promise;
}

function readSidCookie(response, signature) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);

  for (const line of setCookies) {
    const match = line.match(new RegExp(`^${COOKIE_NAME}=([^;]*)`));
    if (!match || !match[1]) continue;
    let value;
    try {
      value = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    if (!value.startsWith('s:')) return null;
    const sid = signature.unsign(value.slice(2), require('../src/config/env').session.secret);
    if (typeof sid !== 'string' || !sid) return null;
    return { rawValue: match[1], sid };
  }
  return null;
}

function hasClearedCookie(response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return setCookies.some((line) => new RegExp(`^${COOKIE_NAME}=;`, 'i').test(line));
}

function extractCsrfToken(html) {
  for (const match of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const name = tag.match(/\bname\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (name !== '_csrf') continue;
    const value = tag.match(/\bvalue\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (value) return value;
  }
  return null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const config = require('../src/config/env');
  const { app } = require('../src/server');
  const { pool } = require('../src/config/db');
  const signature = require('cookie-signature');

  const testPhone = process.env.SESSION_TEST_PHONE;
  const testPassword = process.env.SESSION_TEST_PASSWORD;
  assert(testPhone && testPassword, 'Test credentials are not configured.');

  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);
  const originalEnd = pool.end.bind(pool);
  const readonlyClient = await originalConnect();
  let sessionClient;
  let server;
  let readOnlyStarted = false;
  let testPhase = 'setup';
  let sessionQueue = Promise.resolve();
  let candidateSid1 = null;
  let candidateSid2 = null;
  let sid1InsertSeen = false;
  let sid2InsertSeen = false;
  let sid1CookieSeen = false;
  let sid2CookieSeen = false;
  let sid1Verified = false;
  let sid2Verified = false;
  let sid1ExistsAfterLogout = null;
  let sid2ExistsAfterLogout = null;
  let activeCookie = null;
  let role = null;
  let businessQueryCount = 0;
  let cleanupFailed = false;
  let runFailed = false;

  function registeredSid(sid) {
    return Boolean(sid && (sid === candidateSid1 || sid === candidateSid2));
  }

  async function querySessionDirect(sql, values) {
    if (!sessionClient) throw new Error('Session database connection is unavailable.');
    return sessionClient.query(sql, values);
  }

  async function sidExists(sid) {
    const result = await querySessionDirect(
      `SELECT sid FROM ${SESSION_TABLE} WHERE sid = $1`,
      [sid],
    );
    return result.rows.length === 1;
  }

  async function verifySessionCookie(response, expectedSid) {
    const cookie = readSidCookie(response, signature);
    if (!cookie || cookie.sid !== expectedSid) return false;
    activeCookie = cookie.rawValue;
    if (expectedSid === candidateSid1) sid1CookieSeen = true;
    if (expectedSid === candidateSid2) sid2CookieSeen = true;
    if (expectedSid === candidateSid1) sid1Verified = sid1InsertSeen && sid1CookieSeen;
    if (expectedSid === candidateSid2) sid2Verified = sid2InsertSeen && sid2CookieSeen;
    return expectedSid === candidateSid1 ? sid1Verified : sid2Verified;
  }

  function allowKnownSid(sid) {
    return (sid === candidateSid1 && sid1Verified) || (sid === candidateSid2 && sid2Verified);
  }

  function routeSessionQuery(sql, values, callback) {
    const normalized = normalizeSql(sql);
    const params = Array.isArray(values) ? values : [];
    let sid;
    let operation;

    if (normalized === `select sess from ${SESSION_TABLE.toLowerCase()} where sid = $1 and expire >= to_timestamp($2)`) {
      operation = 'get';
      sid = params[0];
      if (!allowKnownSid(sid)) throw new Error('Blocked session lookup for an unverified SID.');
    } else if (normalized === `insert into ${SESSION_TABLE.toLowerCase()} (sess, expire, sid) select $1, to_timestamp($2), $3 on conflict (sid) do update set sess=$1, expire=to_timestamp($2) returning sid`) {
      operation = 'set';
      sid = params[2];
      if (typeof sid !== 'string' || !sid) throw new Error('Blocked session insert without a SID.');

      if (registeredSid(sid)) {
        if (!allowKnownSid(sid) && sid !== candidateSid1 && sid !== candidateSid2) {
          throw new Error('Blocked session update for an unverified SID.');
        }
      } else if (candidateSid1 === null && testPhase === 'login-page') {
        candidateSid1 = sid;
      } else if (candidateSid2 === null && testPhase === 'login-post' && sid1Verified) {
        candidateSid2 = sid;
      } else {
        throw new Error('Blocked an unexpected third or unowned session SID.');
      }
    } else if (normalized === `delete from ${SESSION_TABLE.toLowerCase()} where sid = $1`) {
      operation = 'destroy';
      sid = params[0];
      if (!allowKnownSid(sid)) throw new Error('Blocked session delete for an unverified SID.');
    } else if (normalized === `update ${SESSION_TABLE.toLowerCase()} set expire = to_timestamp($1) where sid = $2 returning sid`) {
      operation = 'touch';
      sid = params[1];
      if (!allowKnownSid(sid)) throw new Error('Blocked session touch for an unverified SID.');
    } else {
      throw new Error('Blocked an unrecognized session-store query.');
    }

    const run = async () => {
      if (operation === 'set') {
        const isFirstInsert = sid === candidateSid1 ? !sid1InsertSeen : !sid2InsertSeen;
        if (isFirstInsert) {
          const exists = await sidExists(sid);
          if (exists) throw new Error('Refusing to overwrite an existing session SID.');
        }
      }
      const result = await querySessionDirect(sql, params);
      if (operation === 'set' && result.rows?.some((row) => row.sid === sid)) {
        if (sid === candidateSid1) sid1InsertSeen = true;
        if (sid === candidateSid2) sid2InsertSeen = true;
      }
      return result;
    };

    const promise = sessionQueue.then(run);
    sessionQueue = promise.catch(() => {});
    return callbackOrPromise(promise, callback);
  }

  function guardedPoolQuery(sql, values, callback) {
    if (typeof sql !== 'string') throw new Error('Blocked non-string database query during guarded test.');
    const normalized = normalizeSql(sql);
    if (normalized.includes(SESSION_TABLE.toLowerCase())) {
      return routeSessionQuery(sql, values, callback);
    }

    // Route business reads through a held READ ONLY transaction. The routes
    // under test use plain SELECTs; reject other verbs and multi-statement SQL.
    if (!/^select\b/i.test(sql.trim()) || sql.includes(';')) {
      throw new Error('Blocked a non-SELECT or multi-statement business query.');
    }
    businessQueryCount += 1;
    const queryArgs = typeof values === 'function' ? [values] : [values, callback].filter((x) => x !== undefined);
    return readonlyClient.query(sql, ...queryArgs);
  }

  async function stopServer() {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  async function cleanupOneSid(label, sid, verified) {
    if (!sid) {
      cleanupNotes.push(`${label}: no SID was created.`);
      return true;
    }
    if (!verified) {
      cleanupNotes.push(`${label}: cleanup skipped; INSERT parameter and response cookie were not both verified.`);
      return false;
    }
    const exists = await sidExists(sid);
    if (exists) {
      await querySessionDirect(`DELETE FROM ${SESSION_TABLE} WHERE sid = $1`, [sid]);
    }
    const remains = await sidExists(sid);
    if (remains) throw new Error(`${label}: verified SID still exists after exact-SID cleanup.`);
    cleanupNotes.push(`${label}: verified SID absent.`);
    return true;
  }

  try {
    await readonlyClient.query('BEGIN READ ONLY');
    readOnlyStarted = true;
    sessionClient = await originalConnect();

    // Reserve the only two clients before blocking application-level connects.
    pool.connect = function blockApplicationConnect() {
      throw new Error('Blocked pool.connect() during session integration test.');
    };
    pool.query = guardedPoolQuery;
    pool.end = function blockApplicationPoolEnd() {
      throw new Error('Blocked pool.end() before guarded test cleanup.');
    };

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    testPhase = 'login-page';
    const loginPage = await fetch(`${baseUrl}/dang-nhap`, { redirect: 'manual' });
    const loginHtml = await loginPage.text();
    assert(loginPage.status === 200, 'GET /dang-nhap did not return 200.');
    const csrf = extractCsrfToken(loginHtml);
    assert(csrf, 'CSRF token was not found in the login form.');
    assert(candidateSid1 && sid1InsertSeen, 'Pre-login SID was not inserted by the session store.');
    assert(await verifySessionCookie(loginPage, candidateSid1), 'Pre-login SID did not match its signed response cookie.');

    testPhase = 'login-post';
    const loginResponse = await fetch(`${baseUrl}/dang-nhap`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${COOKIE_NAME}=${activeCookie}`,
      },
      body: new URLSearchParams({ _csrf: csrf, phone: testPhone, password: testPassword }),
    });
    await loginResponse.arrayBuffer();
    assert(loginResponse.status === 302, 'POST /dang-nhap did not redirect after successful login.');
    assert(candidateSid2 && sid2InsertSeen, 'Post-login SID was not inserted by the session store.');
    assert(await verifySessionCookie(loginResponse, candidateSid2), 'Post-login SID did not match its signed response cookie.');
    const loginLocation = loginResponse.headers.get('location');
    assert(Object.values(TEST_PATHS).includes(loginLocation), 'Login redirect was not one of the three role home routes.');

    const sessionRow = await querySessionDirect(`SELECT sess FROM ${SESSION_TABLE} WHERE sid = $1`, [candidateSid2]);
    role = sessionRow.rows[0]?.sess?.user?.role;
    assert(Object.hasOwn(TEST_PATHS, role), 'Stored authenticated session has an unknown role.');
    assert(loginLocation === TEST_PATHS[role], 'Login redirect does not match the role stored in the session.');
    results.set('login', 'PASS');

    const expectedStatuses = {
      employee: { employee: 200, manager: 403, owner: 403 },
      manager: { employee: 403, manager: 200, owner: 403 },
      owner: { employee: 403, manager: 200, owner: 200 },
    }[role];
    let ownHomeHtml = '';
    let roleChecksPassed = true;
    for (const [targetRole, path] of Object.entries(TEST_PATHS)) {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: 'manual',
        headers: { cookie: `${COOKIE_NAME}=${activeCookie}`, accept: 'text/html' },
      });
      const html = await response.text();
      if (response.status !== expectedStatuses[targetRole]) roleChecksPassed = false;
      if (targetRole === role && response.status === 200) ownHomeHtml = html;
    }
    results.set('role access', roleChecksPassed ? 'PASS' : 'FAIL');
    assert(roleChecksPassed, 'One or more role route status codes differed from the middleware.');

    const persisted = await querySessionDirect(`SELECT sess FROM ${SESSION_TABLE} WHERE sid = $1`, [candidateSid2]);
    assert(persisted.rows[0]?.sess?.user?.role === role, 'Authenticated session did not persist across requests.');
    results.set('session persistence', 'PASS');

    const logoutCsrf = extractCsrfToken(ownHomeHtml);
    assert(logoutCsrf, 'CSRF token was not found on the authenticated home page.');
    const logout = await fetch(`${baseUrl}/dang-xuat`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${COOKIE_NAME}=${activeCookie}`,
      },
      body: new URLSearchParams({ _csrf: logoutCsrf }),
    });
    await logout.arrayBuffer();
    assert(logout.status === 302 && logout.headers.get('location') === '/dang-nhap', 'Logout did not redirect to /dang-nhap.');
    assert(hasClearedCookie(logout), 'Logout response did not clear the nj.sid cookie.');
    await sessionQueue;
    sid1ExistsAfterLogout = await sidExists(candidateSid1);
    sid2ExistsAfterLogout = await sidExists(candidateSid2);
    assert(!sid1ExistsAfterLogout && !sid2ExistsAfterLogout, 'A verified test SID remained after logout.');
    results.set('logout', 'PASS');
    // Replaying the old cookie against a protected GET may cause the global
    // CSRF middleware to create another anonymous SID. The two-SID limit means
    // stale-cookie HTTP replay is intentionally not sent.
    results.set('stale-cookie replay', 'NOT TESTED');
  } catch (err) {
    runFailed = true;
    if (results.get('login') === 'NOT TESTED') results.set('login', 'FAIL');
    cleanupNotes.push(`Test stopped safely (${String(err?.message || 'unknown error').replace(/[\r\n]/g, ' ').slice(0, 180)}).`);
  } finally {
    try {
      await stopServer();
    } catch {
      cleanupFailed = true;
      cleanupNotes.push('Server close reported an error; cleanup continued.');
    }

    try {
      await sessionQueue;
    } catch {
      cleanupFailed = true;
      cleanupNotes.push('A queued session operation failed; cleanup continued.');
    }

    if (readOnlyStarted) {
      try {
        await readonlyClient.query('ROLLBACK');
      } catch {
        cleanupFailed = true;
        cleanupNotes.push('Read-only transaction rollback reported an error.');
      }
    }
    try {
      readonlyClient.release();
    } catch {
      cleanupFailed = true;
      cleanupNotes.push('Read-only client release reported an error.');
    }

    if (sessionClient) {
      try {
        const clean1 = await cleanupOneSid('SID 1', candidateSid1, sid1Verified);
        const clean2 = await cleanupOneSid('SID 2', candidateSid2, sid2Verified);
        if (clean1 && clean2) results.set('verified SID cleanup', 'PASS');
        else results.set('verified SID cleanup', 'BLOCKED');
      } catch {
        cleanupFailed = true;
        results.set('verified SID cleanup', 'FAIL');
        cleanupNotes.push('Exact-SID cleanup or verification failed; no other SID was targeted.');
      }
      try {
        sessionClient.release();
      } catch {
        cleanupFailed = true;
        cleanupNotes.push('Session client release reported an error.');
      }
    }

    pool.query = originalQuery;
    pool.connect = originalConnect;
    pool.end = originalEnd;
    try {
      await originalEnd();
    } catch {
      cleanupFailed = true;
      cleanupNotes.push('Pool shutdown reported an error.');
    }

    console.log('\nSession integration test report');
    for (const [name, status] of results) console.log(`${status}: ${name}`);
    console.log(`Business queries routed through READ ONLY client: ${businessQueryCount}`);
    for (const note of cleanupNotes) console.log(`NOTE: ${note}`);
    console.log('NOTE: stale-cookie HTTP replay was not sent because it may create a third SID.');
    if (sid1Verified && sid1ExistsAfterLogout === true) console.log('SID 1: verified test SID may remain; decide manually before removal.');
    if (sid2Verified && sid2ExistsAfterLogout === true) console.log('SID 2: verified test SID may remain; decide manually before removal.');
    if ((!sid1Verified && candidateSid1) || (!sid2Verified && candidateSid2)) {
      console.log('An unverified candidate SID may remain; it was intentionally not deleted.');
    }
    if (runFailed || cleanupFailed || [...results.values()].some((status) => status === 'FAIL' || status === 'BLOCKED')) {
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('Session integration test could not initialize; no credential or connection details were printed.');
    process.exitCode = 1;
  });
}

const assert = require('node:assert/strict');
process.env.VERCEL = '1';
process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io';
process.env.TURSO_AUTH_TOKEN = 'test-token';
process.env.JWT_SECRET = 'isolated-test-secret';
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.PROGRESS_FILE;
const accounts = new Map();
const progress = new Map();
function cell(type, value) { return value == null ? { type: 'null' } : { type, value: String(value) }; }
global.fetch = async (url, options) => {
  assert.equal(url, 'https://example.turso.io/v2/pipeline');
  assert.equal(options.headers.authorization, 'Bearer test-token');
  const stmt = JSON.parse(options.body).requests[0].stmt;
  const sql = stmt.sql;
  const args = (stmt.args || []).map((item) => item.type === 'null' ? null : item.value);
  let result = { cols: [], rows: [], affected_row_count: 0 };
  if (sql.startsWith('CREATE')) result.affected_row_count = 0;
  else if (sql.startsWith('SELECT body FROM accounts')) {
    const row = accounts.get(args[0]);
    if (row) result.rows = [[cell('text', row)]];
  } else if (sql.startsWith('INSERT INTO accounts')) {
    if (accounts.has(args[0])) {
      return { ok: true, status: 200, json: async () => ({ results: [{ type: 'error', error: { message: 'UNIQUE constraint failed: accounts.username' } }] }) };
    }
    accounts.set(args[0], args[1]);
    result.affected_row_count = 1;
  } else if (sql.startsWith('SELECT body, version')) {
    const row = progress.get(args[0]);
    if (row) result.rows = [[cell('text', row.body), cell('integer', row.version)]];
  } else if (sql.startsWith('INSERT INTO progress') && sql.includes('ON CONFLICT')) {
    progress.set(args[0], { body: args[1], version: (progress.get(args[0]) || { version: 0 }).version + 1 });
    result.affected_row_count = 1;
  } else if (sql.startsWith('INSERT INTO progress')) {
    if (progress.has(args[0])) {
      return { ok: true, status: 200, json: async () => ({ results: [{ type: 'error', error: { message: 'UNIQUE constraint failed: progress.username' } }] }) };
    }
    progress.set(args[0], { body: args[1], version: 1 });
    result.affected_row_count = 1;
  } else if (sql.startsWith('UPDATE progress')) {
    const row = progress.get(args[1]);
    if (row && String(row.version) === String(args[2])) {
      progress.set(args[1], { body: args[0], version: row.version + 1 });
      result.affected_row_count = 1;
    }
  } else throw new Error('Unexpected SQL');
  return { ok: true, status: 200, json: async () => ({ results: [{ type: 'ok', response: { type: 'execute', result } }] }) };
};
const db = require('../api/_db');
(async () => {
  await db.registerUser('alice', 'a-long-test-password');
  await assert.rejects(() => db.registerUser('alice', 'another-long-password'), /already taken/);
  assert.equal((await db.loginUser('alice', 'a-long-test-password')).username, 'alice');
  await assert.rejects(() => db.loginUser('alice', 'wrong-password'));
  await db.saveProgress('alice', { stars: { one: 3 } });
  await Promise.all([db.saveProgress('alice', { stars: { two: 4 } }), db.saveProgress('alice', { stars: { three: 5 } })]);
  assert.deepEqual((await db.getProgress('alice')).stars, { one: 3, two: 4, three: 5 });
  progress.set('alice', { body: '{', version: 9 });
  await db.saveProgress('alice', { stars: { six: 1 } });
  assert.deepEqual((await db.getProgress('alice')).stars, { six: 1 });
  assert.equal(db.isCloudConnected(), true);
  console.log('Turso checks passed: online account, merged progress, and recovery from an unreadable row.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

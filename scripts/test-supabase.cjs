const assert = require('node:assert/strict');
process.env.VERCEL = '1';
process.env.POSTGRES_URL = 'postgres://example.supabase.co/postgres';
process.env.JWT_SECRET = 'isolated-test-secret';
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.PROGRESS_FILE;
const accounts = new Map();
const progress = new Map();
function query(strings, values) {
  const sql = strings.join('?');
  if (sql.startsWith('CREATE') || sql.startsWith('ALTER')) return [];
  if (sql.startsWith('SELECT body FROM accounts')) {
    const body = accounts.get(values[0]);
    return body ? [{ body }] : [];
  }
  if (sql.startsWith('INSERT INTO accounts')) {
    if (accounts.has(values[0])) { const error = new Error('duplicate'); error.code = '23505'; throw error; }
    accounts.set(values[0], values[1]);
    return [];
  }
  if (sql.startsWith('SELECT body, version')) {
    const row = progress.get(values[0]);
    return row ? [{ body: row.body, version: row.version }] : [];
  }
  if (sql.startsWith('INSERT INTO progress') && sql.includes('ON CONFLICT')) {
    const old = progress.get(values[0]);
    progress.set(values[0], { body: values[1], version: (old ? old.version : 0) + 1 });
    return [];
  }
  if (sql.startsWith('INSERT INTO progress')) {
    if (progress.has(values[0])) { const error = new Error('duplicate'); error.code = '23505'; throw error; }
    progress.set(values[0], { body: values[1], version: 1 });
    return [];
  }
  if (sql.startsWith('UPDATE progress')) {
    const row = progress.get(values[1]);
    const out = [];
    if (row && Number(row.version) === Number(values[2])) {
      progress.set(values[1], { body: values[0], version: row.version + 1 });
      out.count = 1;
    } else out.count = 0;
    return out;
  }
  throw new Error('Unexpected SQL');
}
require.cache[require.resolve('postgres')] = {
  id: require.resolve('postgres'),
  filename: require.resolve('postgres'),
  loaded: true,
  exports: function () {
    return function (strings, ...values) { return Promise.resolve(query(strings, values)); };
  }
};
const db = require('../api/_db');
(async () => {
  await db.registerUser('alice', 'a-long-test-password');
  await assert.rejects(() => db.registerUser('alice', 'another-long-password'), /already taken/);
  assert.equal((await db.loginUser('alice', 'a-long-test-password')).username, 'alice');
  await db.saveProgress('alice', { stars: { one: 3 } });
  await Promise.all([db.saveProgress('alice', { stars: { two: 4 } }), db.saveProgress('alice', { stars: { three: 5 } })]);
  assert.deepEqual((await db.getProgress('alice')).stars, { one: 3, two: 4, three: 5 });
  progress.set('alice', { body: '{', version: 4 });
  await db.saveProgress('alice', { stars: { six: 1 } });
  assert.deepEqual((await db.getProgress('alice')).stars, { six: 1 });
  assert.equal(db.isCloudConnected(), true);
  console.log('Supabase checks passed: online account, merged progress, and recovery from an unreadable row.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

const postgres = require('postgres');
let sql;
let ready;
function db() {
  if (!sql) sql = postgres(process.env.POSTGRES_URL, { ssl: 'require', max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15 });
  return sql;
}
function ensure() {
  if (!ready) ready = (async () => {
    const q = db();
    await q`CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, body TEXT NOT NULL)`;
    await q`CREATE TABLE IF NOT EXISTS progress (username TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)`;
    await q`ALTER TABLE accounts ENABLE ROW LEVEL SECURITY`;
    await q`ALTER TABLE progress ENABLE ROW LEVEL SECURITY`;
  })();
  return ready;
}
function taken(error) {
  if (!error || error.code !== '23505') return error;
  const err = new Error('Username already taken. Please sign in.');
  err.name = 'BlobAlreadyExistsError';
  return err;
}
async function getAccount(username) {
  await ensure();
  const rows = await db()`SELECT body FROM accounts WHERE username = ${username}`;
  if (!rows.length) return null;
  return JSON.parse(rows[0].body);
}
async function putAccount(username, user) {
  await ensure();
  try { await db()`INSERT INTO accounts (username, body) VALUES (${username}, ${JSON.stringify(user)})`; }
  catch (error) { throw taken(error); }
}
async function getProgress(username) {
  await ensure();
  const rows = await db()`SELECT body, version FROM progress WHERE username = ${username}`;
  if (!rows.length) return null;
  try { return { data: JSON.parse(rows[0].body), version: Number(rows[0].version) || 1 }; }
  catch (error) {
    const err = new Error('Cloud progress is unreadable.');
    err.code = 'BLOB_CORRUPT';
    err.version = Number(rows[0].version) || 1;
    throw err;
  }
}
async function insertProgress(username, data) {
  await ensure();
  try { await db()`INSERT INTO progress (username, body, version) VALUES (${username}, ${JSON.stringify(data)}, 1)`; }
  catch (error) { throw taken(error); }
}
async function updateProgress(username, data, version) {
  await ensure();
  const rows = await db()`UPDATE progress SET body = ${JSON.stringify(data)}, version = version + 1 WHERE username = ${username} AND version = ${version}`;
  return Number(rows.count || 0);
}
async function overwriteProgress(username, data) {
  await ensure();
  await db()`INSERT INTO progress (username, body, version) VALUES (${username}, ${JSON.stringify(data)}, 1) ON CONFLICT (username) DO UPDATE SET body = excluded.body, version = progress.version + 1`;
}
function reset() { ready = null; sql = null; }
module.exports = { getAccount, putAccount, getProgress, insertProgress, updateProgress, overwriteProgress, reset };

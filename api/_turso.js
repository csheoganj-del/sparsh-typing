function endpoint() {
  const raw = String(process.env.TURSO_DATABASE_URL || '').trim().replace(/\/$/, '');
  if (!raw || !process.env.TURSO_AUTH_TOKEN) throw new Error('Cloud database is not configured.');
  return raw.replace(/^libsql:\/\//, 'https://') + '/v2/pipeline';
}
function arg(value, type) {
  if (value == null) return { type: 'null' };
  if (type === 'integer') return { type: 'integer', value: String(value) };
  return { type: 'text', value: String(value) };
}
function cell(value) {
  if (value == null) return null;
  if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) return value.value;
  return value;
}
let ready = null;
async function execute(sql, args) {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: { authorization: 'Bearer ' + process.env.TURSO_AUTH_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args: args || [] } }, { type: 'close' }] })
  });
  const data = await response.json().catch(() => ({}));
  const first = data.results && data.results[0];
  if (!response.ok || !first || first.type === 'error') {
    const message = String(first && first.error && first.error.message || ('Cloud database HTTP ' + response.status)).slice(0, 180);
    const err = new Error(/UNIQUE/i.test(message) ? 'Username already taken. Please sign in.' : 'Could not read cloud data.' + (response.ok ? '' : ' (HTTP ' + response.status + ')'));
    err.cause = new Error(message);
    if (/UNIQUE/i.test(message)) err.name = 'BlobAlreadyExistsError';
    else err.code = 'BLOB_UNAVAILABLE';
    throw err;
  }
  return first.response && first.response.result || {};
}
function ensure() {
  if (!ready) ready = Promise.all([
    execute('CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, body TEXT NOT NULL)'),
    execute('CREATE TABLE IF NOT EXISTS progress (username TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)')
  ]);
  return ready;
}
function parsed(body, version) {
  try { return { data: JSON.parse(body), version: Number(version) || 1 }; }
  catch (e) {
    const err = new Error('Cloud progress is unreadable.');
    err.code = 'BLOB_CORRUPT';
    err.version = Number(version) || 1;
    throw err;
  }
}
async function getAccount(username) {
  await ensure();
  const result = await execute('SELECT body FROM accounts WHERE username = ?', [arg(username)]);
  const row = result.rows && result.rows[0];
  if (!row) return null;
  const record = parsed(cell(row[0]), 1);
  return record.data;
}
async function putAccount(username, user) {
  await ensure();
  await execute('INSERT INTO accounts (username, body) VALUES (?, ?)', [arg(username), arg(JSON.stringify(user))]);
}
async function getProgress(username) {
  await ensure();
  const result = await execute('SELECT body, version FROM progress WHERE username = ?', [arg(username)]);
  const row = result.rows && result.rows[0];
  if (!row) return null;
  return parsed(cell(row[0]), cell(row[1]));
}
async function insertProgress(username, data) {
  await ensure();
  await execute('INSERT INTO progress (username, body, version) VALUES (?, ?, 1)', [arg(username), arg(JSON.stringify(data))]);
}
async function updateProgress(username, data, version) {
  await ensure();
  const result = await execute('UPDATE progress SET body = ?, version = version + 1 WHERE username = ? AND version = ?', [arg(JSON.stringify(data)), arg(username), arg(version, 'integer')]);
  return Number(result.affected_row_count || 0);
}
async function overwriteProgress(username, data) {
  await ensure();
  await execute('INSERT INTO progress (username, body, version) VALUES (?, ?, 1) ON CONFLICT(username) DO UPDATE SET body = excluded.body, version = progress.version + 1', [arg(username), arg(JSON.stringify(data))]);
}
function reset() { ready = null; }
module.exports = { getAccount, putAccount, getProgress, insertProgress, updateProgress, overwriteProgress, reset };

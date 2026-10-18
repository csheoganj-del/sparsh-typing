const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const PREVIEW = process.env.PROGRESS_FILE ? path.resolve(process.env.PROGRESS_FILE) : null;
const SUPABASE = !PREVIEW && !!process.env.POSTGRES_URL;
const TURSO = !PREVIEW && !SUPABASE && !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
const BLOB = !PREVIEW && !SUPABASE && !TURSO && !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const CLOUD = SUPABASE || TURSO || BLOB;
function remote() {
  if (SUPABASE) return require('./_supabase');
  if (TURSO) return require('./_turso');
  return null;
}
const HOSTED = process.env.VERCEL === '1';
const SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || (!HOSTED ? crypto.randomBytes(48).toString('hex') : null);
const ITERATIONS = 210000;
for (const f of ['engine', 'teaching', 'profile', 'practice']) require('../js/' + f);
function username(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(name)) throw new Error('Use 3–32 letters, numbers, underscores or hyphens for your username.');
  return name;
}
function empty() { return {stars:{},placed:{},misses:{},settings:{sound:true,hints:true},touch:{keys:{},pairs:{}},log:[],tries:{}}; }
function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } }
function write(file, data) { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,JSON.stringify(data,null,2)); }
function requireStorage() { if (HOSTED && (!CLOUD || !SECRET)) throw new Error('Cloud storage is not configured.'); }
function passwordHash(password, salt, iterations = ITERATIONS) { return crypto.pbkdf2Sync(password,salt,iterations,64,'sha512').toString('hex'); }
function createToken(name) {
  if (!SECRET) throw new Error('Authentication is not configured.');
  const data = username(name) + ':' + (Date.now()+30*86400000);
  return Buffer.from(data+':'+crypto.createHmac('sha256',SECRET).update(data).digest('hex')).toString('base64url');
}
function verifyToken(token) {
  if (!SECRET || !token || token.length > 512) return null;
  try {
    const [name, expires, sig, extra] = Buffer.from(token,'base64url').toString().split(':');
    if (extra || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(sig) || Number(expires)<=Date.now()) return null;
    username(name);
    const expected = crypto.createHmac('sha256',SECRET).update(name+':'+expires).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(expected,'hex')) ? {username:name,exp:Number(expires)} : null;
  } catch { return null; }
}
function cloudReadError(cause) {
  const raw = String(cause && cause.message || '');
  const status = Number((raw.match(/Failed to fetch blob:\s*(\d+)/) || [])[1]) || Number(cause && cause.status) || 0;
  const suspended = (cause && cause.name) === 'BlobStoreSuspendedError' || /suspended/i.test(raw) || status === 402 || status === 403;
  const err = new Error(suspended ? 'Cloud storage is paused.' : 'Could not read cloud data.' + (status ? ' (HTTP ' + status + ')' : ''));
  err.code = suspended ? 'STORAGE_PAUSED' : 'BLOB_UNAVAILABLE';
  if (status) err.status = status;
  err.cause = cause;
  return err;
}
async function blobRead(key) {
  let result;
  try {
    result = await require('@vercel/blob').get(key,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});
  } catch (e) {
    throw cloudReadError(e);
  }
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) {
    const err = new Error('Could not read cloud data.');
    err.code = 'BLOB_UNAVAILABLE';
    throw err;
  }
  const text = await new Response(result.stream).text();
  try { return {data:JSON.parse(text),etag:result.blob.etag}; }
  catch (e) {
    const err = new Error('Cloud progress is unreadable.');
    err.code = 'BLOB_CORRUPT';
    err.etag = result.blob && result.blob.etag;
    throw err;
  }
}
async function blobWrite(key, data, etag, create = false) {
  return require('@vercel/blob').put(key,JSON.stringify(data),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!create,cacheControlMaxAge:60,...(etag ? {ifMatch:etag} : {})});
}
async function getUser(value) {
  requireStorage(); const name = username(value);
  if (remote()) return remote().getAccount(name);
  if (BLOB) { const row=await blobRead('auth/'+name+'.json'); return row ? row.data : null; }
  return read(path.join(ROOT,'progress','users.json'),{})[name] || null;
}
async function registerUser(value, password) {
  requireStorage(); const name=username(value);
  if (typeof password !== 'string' || password.length<10 || password.length>128) throw new Error('Use a password with 10–128 characters.');
  if (await getUser(name)) throw new Error('Username already taken. Please sign in.');
  const salt=crypto.randomBytes(16).toString('hex');
  const user={username:name,salt,hash:passwordHash(password,salt),iterations:ITERATIONS,role:'student',createdAt:Date.now()};
  if (remote()) await remote().putAccount(name, user);
  else if (BLOB) {
    try { await blobWrite('auth/'+name+'.json',user,null,true); }
    catch (e) { if (e.name==='BlobAlreadyExistsError' || e.name==='BlobPreconditionFailedError') throw new Error('Username already taken. Please sign in.'); throw e; }
  } else { const file=path.join(ROOT,'progress','users.json'), users=read(file,{}); users[name]=user; write(file,users); }
  return user;
}
async function loginUser(value, password) {
  if (typeof password !== 'string' || password.length>128) throw new Error('Invalid username or password.');
  const user=await getUser(value);
  const actual=passwordHash(password,user ? user.salt : 'unknown-user',user ? (user.iterations || 10000) : ITERATIONS);
  if (!user || !/^[a-f0-9]{128}$/.test(user.hash) || !crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(user.hash,'hex'))) throw new Error('Invalid username or password.');
  return user;
}
async function getProgress(value) {
  if (PREVIEW) return read(PREVIEW,empty());
  requireStorage(); const name=username(value);
  if (remote()) { const row=await remote().getProgress(name); return row ? row.data : empty(); }
  if (BLOB) { const row=await blobRead('progress/'+name+'.json'); return row ? row.data : empty(); }
  const file=path.join(ROOT,'progress','user-'+name+'.json');
  return read(file,name==='kalpesh' ? read(path.join(ROOT,'progress','sparsh-rssb-v1.json'),empty()) : empty());
}
async function saveProgress(value, data) {
  if (PREVIEW) { write(PREVIEW,data); return data; }
  requireStorage(); const name=username(value);
  if (remote()) {
    const turso=remote();
    for (let i=0;i<4;i++) {
      let current;
      try { current=await turso.getProgress(name); }
      catch (e) {
        if (e.code !== 'BLOB_CORRUPT') throw e;
        await turso.overwriteProgress(name, data);
        return data;
      }
      const merged=global.KD.mergeProgress(data, current && current.data);
      try {
        if (!current) await turso.insertProgress(name, merged);
        else if (!await turso.updateProgress(name, merged, current.version)) throw Object.assign(new Error('conflict'), {name:'BlobPreconditionFailedError'});
        return merged;
      } catch (e) {
        if (['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(e.name) && i<3) continue;
        throw e;
      }
    }
    throw new Error('Could not save cloud data.');
  }
  if (BLOB) {
    const key='progress/'+name+'.json';
    for (let i=0;i<4;i++) {
      let current;
      try { current=await blobRead(key); }
      catch (e) {
        if (e.code !== 'BLOB_CORRUPT') throw e;
        await blobWrite(key,data,e.etag,false);
        return data;
      }
      const merged=global.KD.mergeProgress(data,current && current.data);
      try { await blobWrite(key,merged,current && current.etag,!current); return merged; }
      catch(e) {
        if (['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(e.name) && i<3) continue;
        throw (e && e.name === 'BlobStoreSuspendedError') ? cloudReadError(e) : e;
      }
    }
  }
  const merged=global.KD.mergeProgress(data,await getProgress(name));
  write(path.join(ROOT,'progress','user-'+name+'.json'),merged);
  if (name==='kalpesh') write(path.join(ROOT,'progress','sparsh-rssb-v1.json'),merged);
  return merged;
}
module.exports={createToken,verifyToken,getUser,registerUser,loginUser,getProgress,saveProgress,isCloudConnected:()=>CLOUD};

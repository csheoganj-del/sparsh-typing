const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const PREVIEW = process.env.PROGRESS_FILE ? path.resolve(process.env.PROGRESS_FILE) : null;
const CLOUD = !PREVIEW && !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
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
async function blobRead(key) {
  const result = await require('@vercel/blob').get(key,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) throw new Error('Could not read cloud data.');
  return {data:await new Response(result.stream).json(),etag:result.blob.etag};
}
async function blobWrite(key, data, etag, create = false) {
  return require('@vercel/blob').put(key,JSON.stringify(data),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!create,cacheControlMaxAge:60,...(etag ? {ifMatch:etag} : {})});
}
async function getUser(value) {
  requireStorage(); const name = username(value);
  if (CLOUD) { const row=await blobRead('auth/'+name+'.json'); return row ? row.data : null; }
  return read(path.join(ROOT,'progress','users.json'),{})[name] || null;
}
async function registerUser(value, password) {
  requireStorage(); const name=username(value);
  if (typeof password !== 'string' || password.length<10 || password.length>128) throw new Error('Use a password with 10–128 characters.');
  if (await getUser(name)) throw new Error('Username already taken. Please sign in.');
  const salt=crypto.randomBytes(16).toString('hex');
  const user={username:name,salt,hash:passwordHash(password,salt),iterations:ITERATIONS,role:'student',createdAt:Date.now()};
  if (CLOUD) {
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
  if (CLOUD) { const row=await blobRead('progress/'+name+'.json'); return row ? row.data : empty(); }
  const file=path.join(ROOT,'progress','user-'+name+'.json');
  return read(file,name==='kalpesh' ? read(path.join(ROOT,'progress','sparsh-rssb-v1.json'),empty()) : empty());
}
async function saveProgress(value, data) {
  if (PREVIEW) { write(PREVIEW,data); return data; }
  requireStorage(); const name=username(value);
  if (CLOUD) {
    const key='progress/'+name+'.json';
    for (let i=0;i<4;i++) {
      const current=await blobRead(key), merged=global.KD.mergeProgress(data,current && current.data);
      try { await blobWrite(key,merged,current && current.etag,!current); return merged; }
      catch(e) { if (!['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(e.name) || i===3) throw e; }
    }
  }
  const merged=global.KD.mergeProgress(data,await getProgress(name));
  write(path.join(ROOT,'progress','user-'+name+'.json'),merged);
  if (name==='kalpesh') write(path.join(ROOT,'progress','sparsh-rssb-v1.json'),merged);
  return merged;
}
module.exports={createToken,verifyToken,getUser,registerUser,loginUser,getProgress,saveProgress,isCloudConnected:()=>CLOUD};

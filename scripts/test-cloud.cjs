const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const original=fs.readFileSync(path.join(__dirname,'../progress/sparsh-rssb-v1.json'));
process.env.VERCEL='1'; process.env.BLOB_STORE_ID='test-store'; process.env.JWT_SECRET='isolated-test-secret'; delete process.env.PROGRESS_FILE;
const rows=new Map(); let version=0, fail=false;
require.cache[require.resolve('@vercel/blob')]={id:require.resolve('@vercel/blob'),filename:require.resolve('@vercel/blob'),loaded:true,exports:{
  async get(key, options){assert.equal(options.access,'private');assert.equal(options.useCache,false);assert.equal(options.headers['Accept-Encoding'],'identity');if(fail)throw new Error('offline');const row=rows.get(key);return row ? {statusCode:200,stream:new Response(row.body).body,blob:{etag:row.etag}} : null;},
  async put(key, body, options){assert.equal(options.access,'private');const row=rows.get(key);if(row && ((!options.allowOverwrite) || options.ifMatch!==row.etag)){const e=new Error('conflict');e.name='BlobPreconditionFailedError';throw e;}if(fail)throw new Error('offline');rows.set(key,{body,etag:String(++version)});return {etag:String(version)};}
}};
const db=require('../api/_db'), handler=require('../api/progress');
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};}
(async()=>{
  const res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.statusCode,401);assert.equal(rows.size,0);
  await db.registerUser('alice','a-long-test-password');await db.registerUser('bob','another-test-password');
  assert.deepEqual((await db.getProgress('bob')).stars,{});
  await assert.rejects(()=>db.loginUser('alice','wrong-password'));
  await assert.rejects(()=>db.getProgress('../alice'));
  assert.equal((await db.loginUser('alice','a-long-test-password')).username,'alice');
  const token=db.createToken('alice');assert.equal(db.verifyToken(token).username,'alice');assert.equal(db.verifyToken(token+'broken'),null);
  await db.saveProgress('alice',{stars:{one:3}});
  await Promise.all([db.saveProgress('alice',{stars:{two:4}}),db.saveProgress('alice',{stars:{three:5}})]);
  assert.deepEqual((await db.getProgress('alice')).stars,{one:3,two:4,three:5});
  assert.deepEqual((await db.getProgress('bob')).stars,{});
  const saved=response();await handler({method:'POST',headers:{authorization:'Bearer '+token},body:{stars:{four:2}}},saved);
  assert.equal(saved.statusCode,200);assert(saved.body.cloud);assert.equal(saved.body.progress.stars.four,2);
  fail=true;await assert.rejects(()=>db.saveProgress('alice',{stars:{five:1}}));
  assert.deepEqual(fs.readFileSync(path.join(__dirname,'../progress/sparsh-rssb-v1.json')),original);
  console.log('Cloud checks passed: authenticated access, private storage, account isolation, concurrent merges, and honest failure reporting.');
})().catch(e=>{console.error(e);process.exitCode=1});

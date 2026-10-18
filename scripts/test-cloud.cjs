const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const original=fs.readFileSync(path.join(__dirname,'../progress/sparsh-rssb-v1.json'));
process.env.VERCEL='1'; process.env.BLOB_STORE_ID='test-store'; process.env.JWT_SECRET='isolated-test-secret'; delete process.env.PROGRESS_FILE;
const rows=new Map(); let version=0, fail=false;
require.cache[require.resolve('@vercel/blob')]={id:require.resolve('@vercel/blob'),filename:require.resolve('@vercel/blob'),loaded:true,exports:{
  async get(key, options){assert.equal(options.access,'private');assert.equal(options.useCache,false);assert.equal(options.headers['Accept-Encoding'],'identity');if(fail)throw (fail instanceof Error ? fail : new Error(typeof fail==='string' ? fail : 'offline'));const row=rows.get(key);return row ? {statusCode:200,stream:new Response(row.body).body,blob:{etag:row.etag}} : null;},
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
  assert.equal(saved.statusCode,200);assert(saved.body.cloud);assert.equal(saved.body.ok,true);assert.deepEqual(saved.body.progress.stars,{one:3,two:4,three:5,four:2});assert.equal((await db.getProgress('alice')).stars.four,2);
  fail=true;await assert.rejects(()=>db.saveProgress('alice',{stars:{five:1}}));
  assert.deepEqual(fs.readFileSync(path.join(__dirname,'../progress/sparsh-rssb-v1.json')),original);
  const down=response();await handler({method:'GET',headers:{authorization:'Bearer '+token}},down);
  assert.equal(down.statusCode,500);assert.match(down.body.details,/Could not read cloud data/);
  fail=new Error('Failed to fetch blob: 403 Forbidden');
  await assert.rejects(()=>db.getProgress('alice'),e=>e.code==='STORAGE_PAUSED'&&e.message==='Cloud storage is paused.');
  const paused=response();await handler({method:'GET',headers:{authorization:'Bearer '+token}},paused);
  assert.equal(paused.statusCode,503);assert.equal(paused.body.code,'storage_paused');
  const pausedSave=response();await handler({method:'POST',headers:{authorization:'Bearer '+token},body:{stars:{six:1}}},pausedSave);
  assert.equal(pausedSave.statusCode,503);assert.equal(pausedSave.body.code,'storage_paused');
  fail=new Error('Failed to fetch blob: 500 Internal Server Error');
  await assert.rejects(()=>db.getProgress('alice'),e=>e.code==='BLOB_UNAVAILABLE'&&/HTTP 500/.test(e.message));
  const suspended=new Error('This store has been suspended.');suspended.name='BlobStoreSuspendedError';fail=suspended;
  await assert.rejects(()=>db.getProgress('alice'),e=>e.code==='STORAGE_PAUSED');
  const gen=require('../api/_sentences'), previous=gen.generate; let genCalls=0;
  gen.generate=async()=>{genCalls++;return {aiGenerated:true,tokens:[{h:'क',k:'d'}],model:'stub'};};
  const sentences=require('../api/sentences');
  try {
    fail=new Error('Failed to fetch blob: 403 Forbidden');
    const ai=response();await sentences({method:'POST',headers:{authorization:'Bearer '+token},body:{weakKeys:['KeyD'],recent:[]}},ai);
    assert.equal(genCalls,1);assert.equal(ai.body.model,'stub');assert.ok(!ai.statusCode||ai.statusCode===200);
    genCalls=0;fail=false;
    const missing=response();await sentences({method:'POST',headers:{authorization:'Bearer '+db.createToken('nobody')},body:{weakKeys:['KeyD']}},missing);
    assert.equal(missing.statusCode,401);assert.equal(genCalls,0);
    const anon=response();await sentences({method:'POST',headers:{}},anon);
    assert.equal(anon.statusCode,401);assert.equal(genCalls,0);
  } finally { gen.generate=previous; fail=false; }
  assert.equal((await db.getProgress('alice')).stars.four,2);
  assert.equal(KD.CLOUD_PAUSE_MS,6*60*60*1000);
  assert.equal(KD.cloudDelay(100000, 0, 0, false), 1500);
  assert.equal(KD.cloudDelay(100000, 0, 0, true), 0);
  assert.equal(KD.cloudDelay(100000, 90000, 0, false), 50000);
  assert.equal(KD.cloudDelay(100000, 90000, 0, true), 0);
  assert.equal(KD.cloudDelay(100000, 0, 90000, true), 50000);
  assert.equal(KD.cloudDelay(100000, 0, 0, true, 100000+KD.CLOUD_PAUSE_MS), KD.CLOUD_PAUSE_MS);
  assert.equal(KD.cloudDelay(100000+KD.CLOUD_PAUSE_MS, 0, 90000, true, 100000+KD.CLOUD_PAUSE_MS), 0);
  const appSrc=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
  assert.match(appSrc,/cloudPausedUntil/);
  assert.match(appSrc,/storage_paused/);
  assert.ok(appSrc.includes('KD.cloudDelay(Date.now(), lastCloudSave, cloudFailedAt, immediate === true, cloudPausedUntil)'));
  console.log('Cloud checks passed: authenticated access, private storage, account isolation, concurrent merges, paused-store backoff, and sentence generation while storage is down.');
})().catch(e=>{console.error(e);process.exitCode=1});

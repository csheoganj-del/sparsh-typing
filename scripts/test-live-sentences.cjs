const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
for (const f of ['convert','keys','engine','lessons','words','passages','teaching','profile','curriculum','practice']) require('../js/'+f);
const full = {stars:{},learned:{},touch:{keys:{},pairs:{}},live:{past:[]}};
for (const l of KD.LESSONS) {full.stars[l.id]=5;full.learned[l.id]=true;}
const signature = l => l.tokens.map(t=>t.k).join(' ');
let previous = null;
const seenSentences = new Set();
for (let i=0;i<50;i++) {
  const lesson = KD.composeLive(full);
  if (previous) assert.notEqual(signature(lesson),signature(previous),'Completed low-star runs must generate new sentences');
  assert.equal(lesson.source,'practice-pool');
  for (const id of lesson.sentenceIds) {
    assert(!seenSentences.has(id),'Low-star completion must rotate complete sentences, not just their order');
    seenSentences.add(id);
  }
  full.live.lesson=lesson;
  KD.recordSentenceUsage(full.live,lesson,i+1);
  full.live.past.push({id:lesson.id,pattern:'history',stars:2,high:32,words:lesson.tokens.map(t=>t.h),at:i+1});
  full.live.past=full.live.past.slice(-40); previous=lesson;
}
assert.equal(KD.composeLive(full).id,'hist-51','IDs must advance after history reaches its cap');
const crossMode = structuredClone(full);
crossMode.live={past:[]};
const passage = KD.practice40Lesson({...crossMode,unlockedAll:true},()=>.25);
crossMode.practice40=KD.mergePractice40(null,{attempts:[{at:1000,ms:120000,wpm:33,full:true,sentenceIds:passage.sentenceIds}]});
const afterCheck=KD.composeLive(crossMode,()=>.25);
assert(afterCheck.sentenceIds.every(id=>!passage.sentenceIds.includes(id)),'Live fallback must avoid speed-check sentences completed on another device');
crossMode.live.sentenceUsage=Object.fromEntries(afterCheck.sentenceIds.map(id=>[id,{count:1,at:1001}]));
const afterLive=KD.practice40Lesson({...crossMode,unlockedAll:true},()=>.25);
assert(afterLive.sentenceIds.every(id=>!afterCheck.sentenceIds.includes(id)),'Speed checks must also avoid completed live sentences');
const app=fs.readFileSync('js/app.js','utf8');
function fn(name,next){return app.slice(app.indexOf('  function '+name+'('),app.indexOf('  function '+next+'('));}
const current=KD.composeLive(full);
full.live.lesson=current; full.live.resume={id:current.id,phase:'intro',i:0}; full.live.updatedAt=100;
const ctx=vm.createContext({KD,store:full,booting:true,save(){},session:null});
vm.runInContext(fn('lessonSig','ensureLive')+fn('ensureLive','liveResume')+fn('liveResume','resumeMid'),ctx);
ctx.ensureLive(); assert.equal(signature(ctx.store.live.lesson),signature(current),'Opened text must survive reload before first key');
ctx.store.live.resume=null; ctx.ensureLive(); assert.equal(signature(ctx.store.live.lesson),signature(current),'Queued next lesson must stay fixed');
const old=JSON.parse(JSON.stringify(full));
const newer=JSON.parse(JSON.stringify(full)); newer.live.lesson=KD.composeLive(full);newer.live.updatedAt=200;newer.live.resume=null;
assert.equal(KD.mergeProgress(old,newer).live.lesson.id,newer.live.lesson.id,'Cloud merge must retain queued next sentence at history cap');
const restart=JSON.parse(JSON.stringify(old)); restart.live.resume={id:current.id,i:0,savedAt:300};restart.live.updatedAt=300;
old.live.resume={id:current.id,i:7,savedAt:100};
assert.equal(KD.mergeProgress(old,restart).live.resume.i,0,'Explicit restart must not restore old cursor');
ctx.session={live:true,phase:'run',lesson:{id:'old-id'}};
vm.runInContext(fn('captureResume','syncStatus'),ctx);
ctx.captureResume(); assert.equal(ctx.store.live.resume,null,'Finishing old lesson cannot overwrite next lesson resume');
console.log('Live sentence checks passed: reload retention, fresh sentences after low-star completion, 50 unique IDs, capped-history cloud merge, restart cursor.');

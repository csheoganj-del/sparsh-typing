const assert=require('node:assert/strict');
const {validate,nearDuplicate,configuredKey}=require('../api/_sentences');
const data={sentences:['कार्यालय के कर्मचारी ने सभी आवेदन ध्यान से पढ़े और उनकी सूची तैयार की।','अधिकारी ने पूरी जानकारी मिलने पर संबंधित विभाग को आवश्यक कार्य करने का निर्देश दिया।']};
const valid=validate(data,[],['KeyD']);
assert(valid.aiGenerated);assert(valid.tokens.length>=20);
assert.throws(()=>validate(data,[data.sentences[0]],[]),/Previously/);
assert.throws(()=>validate({sentences:[data.sentences[0],data.sentences[0]]},[],[]),/Repeated/);
assert.throws(()=>validate({sentences:['English text।',data.sentences[1]]},[],[]),/Invalid Hindi/);
assert.throws(()=>validate(data,[],['Digit9']),/Missing target/);
assert.throws(()=>validate({sentences:['माँ ने बच्चे को घर आने के लिए कहा और उसे भोजन दिया।',data.sentences[1]]},[],[]),/Unsupported/);
const reworded=data.sentences[0].replace('ध्यान','सावधानी');
assert(nearDuplicate(data.sentences[0],reworded));
assert.throws(()=>validate({sentences:[reworded,data.sentences[1]]},[data.sentences[0]],[]),/Previously practised sentence wording/);
assert.equal(configuredKey({GEMINI_API_KEY:'  test-primary  '},()=>{throw Error('Unexpected local read');}),'test-primary');
assert.equal(configuredKey({GOOGLE_API_KEY:'test-secondary'},()=>''),'test-secondary');
assert.equal(configuredKey({},()=> '  fake-local-key  '),'fake-local-key');
assert.equal(configuredKey({VERCEL:'1'},()=>{throw Error('Hosted code must not read local key files');}),'');
console.log('AI sentence validation passed: mapped DevLys keys, target coverage, length, recent duplicates, Hindi-only output and no Alt characters.');
// Exercise background installation and verify it cannot replace active text.
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('js/app.js','utf8');
const request=app.slice(app.indexOf('  function requestAISentence('),app.indexOf('  function startLive('));
(async()=>{
  let calls=0,saves=0;
  const live={lesson:{id:'hist-90',pattern:'history',min:14,high:38},sentenceUsage:{}};
  const ctx=vm.createContext({KD,store:{live,touch:{keys:{},pairs:{}},misses:{KeyD:4}},session:{live:true,phase:'done',lesson:{id:'hist-89'}},authToken:'test',sentenceJobs:{},screen:'result',liveResume:()=>null,save(){saves++;},draw(){},fetch:async()=>{calls++;return{ok:true,json:async()=>valid};}});
  vm.runInContext(request,ctx);
  await Promise.all([ctx.requestAISentence(live.lesson),ctx.requestAISentence(live.lesson)]);
  assert.equal(calls,1,'One request per queued lesson');assert.equal(saves,1);assert(live.lesson.aiGenerated);
  const stored=JSON.stringify(live.lesson.tokens);await ctx.requestAISentence(live.lesson);assert.equal(JSON.stringify(live.lesson.tokens),stored);
  ctx.sentenceJobs={};live.lesson={id:'hist-91',pattern:'history',tokens:[{h:'कर',k:'dj'}]};ctx.session={live:true,phase:'run',lesson:{id:'hist-91'}};
  await ctx.requestAISentence(live.lesson);assert.equal(live.lesson.tokens[0].h,'कर','Background response must not replace an active passage');
  const models=require('../api/_models');
  const ranked=models.rank(['gemini-2.5-flash','gemini-3.5-flash-lite','gemini-flash-lite-latest','gemini-2.5-flash-image','gemini-3-flash-preview','gemma-4-31b-it']);
  assert.deepEqual(ranked,['gemini-flash-lite-latest','gemini-3.5-flash-lite','gemini-2.5-flash']);
  const originalFetch=global.fetch, originalKey=process.env.GEMINI_API_KEY;
  let providerCalls=0;process.env.GEMINI_API_KEY='test-key';models.reset();
  global.fetch=async(url)=>{
    const href=String(url);
    if(href.includes('/v1beta/models?'))return{ok:true,status:200,json:async()=>({models:[
      {name:'models/gemini-flash-lite-latest',supportedGenerationMethods:['generateContent']},
      {name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},
      {name:'models/gemini-2.5-flash-image',supportedGenerationMethods:['generateContent']}
    ]})};
    providerCalls++;
    const model=decodeURIComponent(href.split('/models/')[1].split(':')[0]);
    if(model==='gemini-flash-lite-latest')return{ok:false,status:404};
    return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(data)}]}}]})};
  };
  try {
    const generated=await require('../api/_sentences').generate({weakKeys:['KeyD'],recent:[],training:{baselineWpm:33,targetWpm:50,firstTryAccuracy:99,plateau:true}});
    assert.equal(providerCalls,2);assert.equal(generated.model,'gemini-2.5-flash');assert(generated.aiGenerated);
    providerCalls=0;
    const again=await require('../api/_sentences').generate({weakKeys:['KeyD'],recent:[]});
    assert.equal(again.model,'gemini-2.5-flash');assert.equal(providerCalls,1,'A retired model is skipped on the next lesson');
  }finally{models.reset();global.fetch=originalFetch;if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey;}
  console.log('AI background checks passed: one request per queued lesson, persistent AI text, no changes to active passages.');
})().catch(e=>{console.error(e);process.exitCode=1;});

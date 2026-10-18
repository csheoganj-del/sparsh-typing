const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
for (const name of ['convert','keys','devlys','engine','lessons','words','passages','teaching','profile','curriculum','practice','adaptive']) require('../js/' + name);
const KD = global.KD;
const source = fs.readFileSync('js/app.js', 'utf8');
function section(from, until) { return source.slice(source.indexOf('  function ' + from + '('), source.indexOf('  function ' + until + '(')); }
function completed() {
  const store = KD.mergeProgress({}, null);
  KD.LESSONS.forEach(lesson => { store.stars[lesson.id] = 5; store.learned[lesson.id] = true; });
  return store;
}
const store = completed();
let saves = 0;
const context = vm.createContext({KD, store, session:null, screen:'home', Date, Math, Promise,
  nextLessonIndex:()=>0, save(){saves++;}, paintShell(){}, startLesson(index, recovery){
    context.session = {index, tokens:recovery.tokens, steps:KD.buildSteps(recovery.tokens), lesson:{tokens:recovery.tokens,scoreFree:true}};
  }});
vm.runInContext(section('startWeak','startCoach'), context);
context.startWeak();
assert.equal(context.session.lesson.id,'adaptive-drill');
assert.equal(context.session.index,-1);
assert.equal(context.session.recoveryFor,null);
assert(context.session.tokens.length >= 12);
assert(context.session.tokens.every(t=>KD.safeToken(t.h) && KD.allowedToken(t, context.session.lesson.allowed)));
assert(context.session.tokens.some(t=>t.h.length>1));
assert.equal(store.adaptive.drills.length,1);
assert.equal(saves,1);
const firstSignature=store.adaptive.drills[0].signature;
context.startWeak();
assert.notEqual(store.adaptive.drills[1].signature, firstSignature);
vm.runInContext(section('act','startExam'),context);
context.act('practice40-weak');
assert.equal(context.session.lesson.id,'adaptive-drill','The real weak-combinations button must use adaptive recovery');
assert.equal(store.adaptive.drills.length,3);
const now=Date.now();
store.practice40={attempts:[{at:now-1000,ms:120000,full:true,guided:false,wpm:33,acc:99,realAcc:99,sentenceIds:['नई पंक्ति।']}]};
context.startRhythmBurst();
assert.equal(context.session.lesson.id,'adaptive-burst');
assert.equal(context.session.limit,25000);
assert.equal(context.session.lesson.scoreFree,true);
assert(context.session.steps.length>=550);
assert.equal(context.session.practice40,undefined,'Short bursts must not count as two-minute checks');

// A completed lesson cannot be resumed even when a stale cursor is present.
const passage=KD.historyLesson(store);
store.live={lesson:passage,resume:{id:passage.id,i:4,savedAt:now+1000},past:[{id:passage.id,passageSig:KD.livePassageSignature(passage),at:now,pattern:'history'}]};
context.booting=true;
vm.runInContext(section('lessonSig','resumeMid'),context);
assert.equal(context.liveResume(),null);
context.ensureLive();
assert.notEqual(store.live.lesson.id,passage.id);
assert.equal(store.live.resume,null);

// Verify the actual dashboard exposes the goal and routine without inventing speed.
Object.assign(context,{esc:s=>String(s),fmt:n=>String(n),historyOffer:()=>null});
vm.runInContext(section('practice40HTML','startPractice40'),context);
const html=context.practice40HTML();
assert.match(html,/Hindi · 50 WPM/);
assert.match(html,/Day 1 of 20/);
assert.match(html,/98% first-try accuracy/);
assert.match(html,/Your daily routine/);
assert.match(html,/two-minute check/);
console.log('Training flow passed: real recovery button, varied learned words, clean-data fallback, unscored bursts, stale resume rejection and 50 WPM dashboard.');

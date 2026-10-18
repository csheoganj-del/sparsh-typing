const assert = require('node:assert/strict');
for (const f of ['convert','keys','engine','lessons','words','passages','teaching','profile','curriculum','practice']) require('../js/' + f);
const empty = KD.mergeProgress({}, {});
assert.equal(KD.practice40Lesson(empty), null, 'No speed check before Space is learned');
const beginner = KD.mergeProgress({}, {});
for (const l of KD.LESSONS.slice(0, 14)) {
  if (l.scoreFree) beginner.learned[l.id] = true;
  else beginner.stars[l.id] = 1;
}
const state = KD.practice40State(beginner), check = KD.practice40Lesson(beginner, () => .25);
assert(state.canStart); assert(!state.full); assert(check);
assert(KD.buildSteps(check.tokens).length >= 1800);
for (const t of check.tokens) assert(KD.allowedToken(t, state.allowed), 'Untaught action in speed practice');
const fluent = KD.mergeProgress({unlockedAll:true}, {});
assert(KD.practice40State(fluent).full);
const fullCheck = KD.practice40Lesson(fluent, () => .25);
assert(fullCheck.tokens.length >= 400);
assert(KD.buildSteps(fullCheck.tokens).length >= 2001, 'Enough text for a full two-minute check at 200 physical-key WPM');
assert(fullCheck.tokens.at(-1).h.endsWith('।'), 'Passages must retain complete final sentences');
assert.equal(fullCheck.tokens.map(t => t.h).join(' '), fullCheck.sentenceIds.join(' '));
assert.equal(fullCheck.source, 'practice-pool');
assert.equal(KD.PRACTICE_TARGET, 50);
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
assert.deepEqual(KD.practice40Lesson(fluent,seeded(7)).sentenceIds,KD.practice40Lesson(fluent,seeded(7)).sentenceIds,'Injected randomness makes passage selection reproducible');
assert.notDeepEqual(KD.practice40Lesson(fluent,seeded(7)).sentenceIds,KD.practice40Lesson(fluent,seeded(8)).sentenceIds,'Unused sentences have varied starting order');
const result = (at, extras={}) => ({at, ms:120000, wpm:50, acc:99, realAcc:98, full:true, guided:false, sentenceIds:['अभ्यास क्रम ' + at + ' है।'], ...extras});
fluent.practice40 = {attempts:[result(1),result(2),result(3)]};
assert(KD.practice40State(fluent).reached);
for (const extras of [{full:false},{guided:true},{realAcc:97},{acc:97},{wpm:49.9},{sentenceIds:[]}]) {
  fluent.practice40 = {attempts:[result(1),result(2),result(3,extras)]};
  assert(!KD.practice40State(fluent).reached, 'Weak, repeated or assisted checks cannot claim 50 WPM');
}
fluent.practice40 = {attempts:[result(1),result(2),result(3,{sentenceIds:result(1).sentenceIds})]};
assert(!KD.practice40State(fluent).reached, 'Repeating a memorized sentence cannot count as three fresh checks');
assert.equal(KD.mergePractice40({attempts:[result(1),result(2,{ms:5000})]}, {attempts:[result(1),result(3)]}).attempts.length, 2);
const merged = KD.mergeProgress({practice40:{attempts:[result(1)]}}, {practice40:{attempts:[result(3)]}});
assert.deepEqual(merged.practice40.attempts.map(r=>r.at), [1,3]);
assert.equal(KD.mergePractice40({attempts:Array.from({length:130},(_,i)=>result(i+1))}).attempts.length,120);
assert.equal(KD.latestLessonRun({live:{past:[{pattern:'history',wpm:30,at:1,acc:99},{pattern:'repair',wpm:50,at:3},{pattern:'history',wpm:42,at:2,acc:100}]}}).wpm, 42);
assert.equal(KD.latestLessonRun({practice40:{attempts:[result(5)]}}), null);
// Completed checks carry sentence history between devices, independent of AI.
const rotating = KD.mergeProgress({unlockedAll:true}, {}), seenSentences = new Set();
for (let i=0;i<7;i++) {
  const passage = KD.practice40Lesson(rotating, () => .25);
  for (const id of passage.sentenceIds) {
    assert(!seenSentences.has(id), 'Use all unused sentences before repeating a speed-check sentence');
    seenSentences.add(id);
  }
  rotating.practice40 = KD.mergePractice40(rotating.practice40, {attempts:[result(i+1,{sentenceIds:passage.sentenceIds})]});
}
const left = KD.practice40Lesson(KD.mergeProgress({unlockedAll:true}, {}), () => .25);
const deviceA = {attempts:[result(1000,{sentenceIds:left.sentenceIds})]};
const deviceB = {attempts:[result(1001,{sentenceIds:['यह अलग अभ्यास वाक्य है।']})], sentenceUsage:{'पुराना वाक्य सुरक्षित है।':{count:1,at:1}}};
const together = KD.mergePractice40(deviceA,deviceB);
assert(together.sentenceUsage[left.sentenceIds[0]]);
assert(together.sentenceUsage['यह अलग अभ्यास वाक्य है।']);
assert(together.sentenceUsage['पुराना वाक्य सुरक्षित है।']);
assert.deepEqual(KD.mergePractice40(together,together).sentenceUsage, together.sentenceUsage, 'Cloud merges must not count the same practice twice');
const next = KD.practice40Lesson(KD.mergeProgress({unlockedAll:true,practice40:together}, {}), () => .25);
assert(next.sentenceIds.every(id => !left.sentenceIds.includes(id)), 'A second device must avoid sentences completed on the first');
const oldHistory = KD.mergePractice40({attempts:Array.from({length:130},(_,i)=>result(i+1))});
assert(oldHistory.sentenceUsage[result(1).sentenceIds[0]], 'Sentence history survives the 120-attempt display cap');
const pool = KD.hindiSentenceRows(), cycleUsage = {}, cycleSeen = new Set();
assert(pool.length >= 300);
assert.equal(pool.length, new Set(KD.HI_SENTENCES).size, 'Every curated sentence must support physical DevLys keys');
for (let i=0;i<pool.length;i++) {
  const pick = KD.selectHindiPassage({count:1,random:()=>.25,sentenceUsage:cycleUsage});
  assert.equal(pick.sentenceIds.length,1);
  const id = pick.sentenceIds[0];
  assert(!cycleSeen.has(id), 'No repeat before the entire pool is exhausted');
  cycleSeen.add(id); cycleUsage[id]={count:1,at:i+1};
}
assert(cycleSeen.has(KD.selectHindiPassage({count:1,random:()=>.25,sentenceUsage:cycleUsage}).sentenceIds[0]));
console.log('Practice checks passed: 350 safe sentences, complete passages, no-repeat rotation across devices, history retention and 50 WPM accuracy gates.');

// Exercise the actual app handlers with a deterministic clock and stub UI.
const fs = require('node:fs'), vm = require('node:vm');
const app = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function handler(name, next) { return app.slice(app.indexOf('  function ' + name + '('), app.indexOf('  function ' + next + '(')); }
let clock = 1000, finishes = 0;
const context = vm.createContext({session:{practice40:{full:true}, phase:'intro', limit:120000}, screen:'run', heldKeys:{},
  performance:{now:()=>clock}, paint(){}, ensureTick(){}, stopTick(){}, save(){},
  document:{querySelector:()=>null}, showAuthModal:false, finish(){finishes++;}, act(){}, go(){}});
vm.runInContext(handler('elapsed','remain') + handler('remain','clock') + handler('beginRun','ensureTick') + handler('togglePause','formedHTML') + handler('onKeyDown','exactKey'), context);
context.beginRun(); assert.equal(context.session.t0,1000);
clock += 30000; context.togglePause(); assert(!context.session.paused); assert.equal(context.elapsed(),30000);
clock += 90000;
const event = {key:'x',code:'KeyX',target:{},preventDefault(){this.prevented=true;}};
context.onKeyDown(event); assert.equal(finishes,1); assert(event.prevented);
assert.equal(context.remain(),0);
console.log('Practice timer checks passed: starts immediately, cannot pause, rejects input after expiry.');

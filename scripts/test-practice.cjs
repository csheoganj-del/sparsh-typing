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
assert.equal(KD.practice40Lesson(fluent).tokens.length, 400);
const result = (at, extras={}) => ({at, ms:120000, wpm:40, acc:99, realAcc:98, full:true, guided:false, ...extras});
fluent.practice40 = {attempts:[result(1),result(2),result(3)]};
assert(KD.practice40State(fluent).reached);
for (const extras of [{full:false},{guided:true},{realAcc:97},{acc:97},{wpm:39.9}]) {
  fluent.practice40 = {attempts:[result(1),result(2),result(3,extras)]};
  assert(!KD.practice40State(fluent).reached, 'Weak or assisted checks cannot claim 40 WPM');
}
assert.equal(KD.mergePractice40({attempts:[result(1),result(2,{ms:5000})]}, {attempts:[result(1),result(3)]}).attempts.length, 2);
const merged = KD.mergeProgress({practice40:{attempts:[result(1)]}}, {practice40:{attempts:[result(3)]}});
assert.deepEqual(merged.practice40.attempts.map(r=>r.at), [1,3]);
assert.equal(KD.mergePractice40({attempts:Array.from({length:130},(_,i)=>result(i+1))}).attempts.length,120);
console.log('Practice checks passed: taught keys, fresh passages, accuracy gates, timed history and progress merge.');

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

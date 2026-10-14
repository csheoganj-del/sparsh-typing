const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
for (const file of ['convert','keys','engine','lessons','words','passages','teaching','profile','curriculum']) require('../js/' + file);
const app = fs.readFileSync('js/app.js','utf8');
const code = app.slice(app.indexOf('  function tokensFor('),app.indexOf('  function startLesson('));
const ctx = vm.createContext({store:{touch:{},tries:{},misses:{}},KD});
vm.runInContext(code,ctx);
for (const lesson of KD.LESSONS) {
  const first = JSON.stringify(ctx.tokensFor(lesson));
  ctx.store = {touch:{keys:{KeyJ:{n:100,ms:80000}}},tries:{[lesson.id]:[{slips:[{word:'र'}]}]},misses:{KeyJ:50}};
  for (let retry=0;retry<3;retry++) assert.equal(JSON.stringify(ctx.tokensFor(lesson)),first,lesson.id);
  const returned = ctx.tokensFor(lesson);
  assert.equal(returned.extra.length,0);
  const original = lesson.tokens[0].h;
  returned.tokens[0].h = 'changed';
  assert.equal(lesson.tokens[0].h,original,'Sessions must not mutate lesson text');
}
const fresh = {dynamic:true,fresh(){throw Error('Unexpected regeneration');},tokens:[{h:'कर',k:'dj'}]};
assert.equal(ctx.tokensFor(fresh).tokens[0].k,'dj');
console.log('Course text checks passed: all 288 numbered lessons stay identical across retries and changing practice history.');

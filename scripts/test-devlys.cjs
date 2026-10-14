const assert = require('node:assert/strict');
const fs = require('node:fs');
for (const f of ['convert','keys','devlys','engine','lessons','words','passages','teaching','profile','curriculum']) require('../js/' + f);
const reference = require('./devlys-official-keys.json');
assert.equal(reference.rows.length, 94);
for (const row of reference.rows) {
  const meta = KD.BY_CODE[row.code];
  assert.equal(row.shift ? meta.shifted : meta.normal, row.raw);
  // RajKaj's converter leaves $ unconverted, although the actual font draws +.
  // Its lone f becomes a detached ि; app previews wait for the consonant.
  if (row.raw !== '$' && row.raw !== 'f') assert.equal(KD.krutiToUnicode(row.raw), row.official, row.code);
}
assert(KD.examWordCorrect('dsoy','dsoy'));
assert(!KD.examWordCorrect('dsssssoy','dsoy'), 'Hidden duplicate matras must be rejected');
assert(!KD.examWordCorrect('Ik','i'), 'Half प + vertical must not substitute for the full प key');
assert.deepEqual(KD.stepsFromKruti(KD.unicodeToKruti('ऋषि')).map(KD.actionId), ['Minus+S','KeyF','Quote+S','KeyK']);
assert.equal(KD.LESSONS[99].tokens[0].k, 'd`');
assert.equal(KD.LESSONS[147].tokens[0].k, 'dz');
assert.equal(KD.LESSONS[147].tokens[0].h, 'क्र');
for (const lesson of KD.LESSONS) for (const step of KD.buildSteps(lesson.tokens)) assert.equal(step.type,'key');
assert.equal(fs.readFileSync('fonts/devlys-010.ttf').length, 62308);
assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync('fonts/devlys-010.ttf')).digest('hex'), '2054a3a013d0c00d2e9628ff5d401f843c7ad6721a698e56dbc3cc1f7a9757eb');
// Exercise the real word commit handler, including invisible-sequence errors.
const vm = require('node:vm'), app = fs.readFileSync('js/app.js', 'utf8');
const keyHTML = app.slice(app.indexOf('  function keyHTML('), app.indexOf('  function handsSVG('));
const renderCtx = vm.createContext({KD,session:null,esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')});
vm.runInContext(keyHTML, renderCtx);
const digit2 = renderCtx.keyHTML(KD.BY_CODE.Digit2, {code:'Digit2',shift:true});
assert(digit2.includes('Printed Shift symbol @'), 'Keyboard must show the physical @ label');
assert(digit2.includes('aria-label="/">@</div>'), 'DevLys output must remain / from the @ byte');
assert.equal(KD.LESSONS[199].tokens[0].k, '@');
assert.equal(KD.LESSONS[199].tokens[0].h, '/');
const commit = app.slice(app.indexOf('  function commitWord('), app.indexOf('  function finish('));
for (const typed of ['dsoy','dsssssoy']) {
  const s = {lang:'hi', words:[{h:'केवल',k:'dsoy'},{h:'र',k:'j'}], wi:0, typed, t0:1, marks:[], wrong:[]};
  const ctx = vm.createContext({KD, session:s, performance:{now:()=>1}, pushTape(){}, beep(){}, rememberTap(){}, forgetTiming(){}, paint(){}});
  vm.runInContext(commit, ctx); ctx.commitWord();
  assert.equal(s.marks[0], typed === 'dsoy' ? 'ok' : 'bad');
  assert.equal(s.typedWords[0].raw, typed);
}
const keyHandler = app.slice(app.indexOf('  function onKeyDown('), app.indexOf('  function exactKey('));
const keyCtx = vm.createContext({session:{lang:'hi',phase:'run'},screen:'run',heldKeys:{},document:{body:{classList:{contains:()=>false}}}});
vm.runInContext(keyHandler,keyCtx);
for (const modifier of ['altKey','ctrlKey']) {
  const event = {key:'f',code:'KeyF',target:{},[modifier]:true,preventDefault(){this.prevented=true;}};
  keyCtx.onKeyDown(event); assert(event.prevented, 'Disallowed modifier must not reach typing handler');
}
console.log('DevLys checks passed: 94 key positions audited, strict sequences, no Alt lessons, ऋषि and कृ.');

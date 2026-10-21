const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const f of ['convert', 'keys', 'devlys', 'engine', 'lessons', 'words', 'passages', 'teaching', 'profile', 'curriculum', 'practice', 'adaptive']) {
  require('../js/' + f);
}

// 1. Test KD.cumulativeSpeed
assert.equal(KD.cumulativeSpeed(null), null);
assert.equal(KD.cumulativeSpeed({}), null);
assert.equal(KD.cumulativeSpeed({ log: [] }), null);

// Single attempt: 30 WPM for 1 minute = 30 WPM
const store1 = {
  log: [{ at: 1000, wpm: 30, ms: 60000 }]
};
assert.equal(KD.cumulativeSpeed(store1), 30);

// Two attempts:
// Attempt 1: 20 WPM for 30 seconds = 10 words
// Attempt 2: 40 WPM for 30 seconds = 20 words
// Total = 30 words in 1 minute = 30 WPM
const store2 = {
  log: [
    { at: 1000, wpm: 20, ms: 30000 },
    { at: 2000, wpm: 40, ms: 30000 }
  ]
};
assert.equal(KD.cumulativeSpeed(store2), 30);

// As the user improves over time with a new attempt:
// Attempt 3: 50 WPM for 60 seconds = 50 words
// Total = 80 words in 2 minutes = 40 WPM (changing from 30 to 40)
store2.log.push({ at: 3000, wpm: 50, ms: 60000 });
assert.equal(KD.cumulativeSpeed(store2), 40);

// Deduplication across log, live.past, practice40.attempts, and tries
const storeDedupe = {
  log: [{ at: 5000, wpm: 35, ms: 60000 }],
  live: { past: [{ at: 5000, wpm: 35, ms: 60000 }, { at: 6000, wpm: 45, ms: 60000 }] },
  practice40: { attempts: [{ at: 6000, wpm: 45, ms: 60000 }] }
};
// 35 words (1 min) + 45 words (1 min) = 80 words / 2 min = 40 WPM
assert.equal(KD.cumulativeSpeed(storeDedupe), 40);

// 2. Test boxHTML rendering for matras
const appSource = fs.readFileSync('js/app.js', 'utf8');
const boxHTMLFn = appSource.slice(appSource.indexOf('  function boxHTML('), appSource.indexOf('  var caretWidths = '));
const ctx = vm.createContext({
  session: { lang: 'hi' },
  esc: s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
});
vm.runInContext(boxHTMLFn, ctx);

// Test "केवल" (legacy: dsoy)
// When at = 0 (before typing): over is empty
let html0 = ctx.boxHTML('now', 'केवल', '', false, false, 'dsoy', '');
assert(html0.includes('<span class="over" aria-hidden="true"></span>'), 'over must be empty before typing: ' + html0);
assert(!html0.includes('typed'), 'box must not have typed class: ' + html0);

// When at = 1 (user typed 'd' = 'क', now ON matra 's' = 'े'):
// over must contain ONLY 'd' (the typed consonant), NOT the matra or remaining word!
let html1 = ctx.boxHTML('now', 'केवल', 'क', false, false, 'dsoy', 'd');
assert(html1.includes('<span class="over" aria-hidden="true">d</span>'), 'over must contain only d when on matra: ' + html1);
assert(!html1.includes('typed'), 'box must not have typed class when only consonant is typed: ' + html1);

// When at = 2 (user typed 'ds' = 'के', completing the matra):
// over must contain ONLY 'ds', NOT the rest of the word 'oy' ('वल')!
let html2 = ctx.boxHTML('now', 'केवल', 'के', false, false, 'dsoy', 'ds');
assert(html2.includes('<span class="over" aria-hidden="true">ds</span>'), 'over must contain only ds after typing matra: ' + html2);
assert(!html2.includes('typed'), 'box must not be marked typed while rest of word remains: ' + html2);

// When at = 4 (word completely typed):
let html4 = ctx.boxHTML('now', 'केवल', 'केवल', false, false, 'dsoy', 'dsoy');
assert(html4.includes('<span class="over" aria-hidden="true">dsoy</span>'), 'over must contain full word when done');
assert(html4.includes('typed'), 'box must have typed class when done');

// Test "राम" (legacy: jke)
// User typed 'j' = 'र', now ON matra 'k' = 'ा'
let htmlRam1 = ctx.boxHTML('now', 'राम', 'र', false, false, 'jke', 'j');
assert(htmlRam1.includes('<span class="over" aria-hidden="true">j</span>'), 'over must contain only j when on aa matra: ' + htmlRam1);

// User typed 'jk' = 'रा'
let htmlRam2 = ctx.boxHTML('now', 'राम', 'रा', false, false, 'jke', 'jk');
assert(htmlRam2.includes('<span class="over" aria-hidden="true">jk</span>'), 'over must contain only jk after typing aa matra: ' + htmlRam2);

// Test Authentic Hindi view rendering (when store is active and devlysView is false)
const hindiCtx = vm.createContext({
  session: { lang: 'hi' },
  store: { settings: { devlysView: false } },
  esc: s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
});
vm.runInContext(appSource.slice(appSource.indexOf('  function isLegacyView('), appSource.indexOf('  var caretWidths = ')), hindiCtx);

let h0 = hindiCtx.boxHTML('now', 'ऊंची', '', false, false, 'mwaph', '');
assert(h0.includes('<span class="ink">ऊंची</span>'), 'Target must be authentic Hindi ऊंची, not mwaph: ' + h0);
assert(!h0.includes('devlys'), 'Authentic Hindi box must not have devlys class: ' + h0);

let h1 = hindiCtx.boxHTML('now', 'ऊंची', 'ऊ', false, false, 'mwaph', 'mw');
assert(h1.includes('<span class="over" aria-hidden="true">ऊ</span>'), 'over must contain clean authentic Hindi character: ' + h1);

let hDone = hindiCtx.boxHTML('now', 'ऊंची', 'ऊंची', false, false, 'mwaph', 'mwaph');
assert(hDone.includes('<span class="over" aria-hidden="true">ऊंची</span>'), 'full authentic Hindi word completed: ' + hDone);
assert(hDone.includes('typed'), 'box must have typed class when completed: ' + hDone);

// When devlysView is explicitly set to true:
hindiCtx.store.settings.devlysView = true;
let d0 = hindiCtx.boxHTML('now', 'ऊंची', '', false, false, 'mwaph', '');
assert(d0.includes('<span class="ink">mwaph</span>'), 'Target must be raw DevLys mwaph when toggled: ' + d0);
assert(d0.includes('devlys'), 'DevLys box must have devlys class: ' + d0);

// 3. Test conversion and rendering of matras for r, u, ri, and au
const rMatras = ['धर्म', 'कर्म', 'सूर्य', 'वर्ष', 'गर्व', 'ईर्ष्या', 'तीर्थंकर', 'सर्वोच्च', 'प्रकाश', 'क्रम', 'ट्रक', 'ड्रम', 'भ्रम', 'ग्राम', 'प्रेम', 'तीव्र'];
for (const w of rMatras) {
  const k = KD.unicodeToKruti(w);
  const back = KD.krutiToUnicode(k);
  assert.equal(back, w, 'Reph/Paden round-trip mismatch for: ' + w);
  assert(!/[\u0900-\u097f]/.test(k), 'Kruti conversion leaked Unicode in: ' + w);
}

const uMatras = ['कुसुम', 'सुख', 'दुकान', 'पुत्र', 'फूल', 'धूप', 'सूरज', 'मूल', 'शुरू', 'जरूर', 'रुपया', 'रूप', 'रुचि', 'रूखा', 'गुरु'];
for (const w of uMatras) {
  const k = KD.unicodeToKruti(w);
  const back = KD.krutiToUnicode(k);
  assert.equal(back, w, 'U/UU matra round-trip mismatch for: ' + w);
  assert(!/[\u0900-\u097f]/.test(k), 'Kruti conversion leaked Unicode in: ' + w);
}

assert(KD.examWordCorrect('#i;k', '#i;k'), 'Direct Kruti match for रुपया');

const riMatras = ['कृपा', 'कृषि', 'दृष्टि', 'हृदय', 'प्रकृति', 'ऋषि', 'ऋतु', 'पृथ्वी', 'सृष्टि', 'अमृत'];
for (const w of riMatras) {
  const k = KD.unicodeToKruti(w);
  const back = KD.krutiToUnicode(k);
  assert.equal(back, w, 'Ri matra round-trip mismatch for: ' + w);
  assert(!/[\u0900-\u097f]/.test(k), 'Kruti conversion leaked Unicode in: ' + w);
}

const auWords = ['चौपाल', 'चौराहा', 'चौक', 'दौड़', 'मौसम', 'मौका'];
for (const w of auWords) {
  const k = KD.unicodeToKruti(w);
  const back = KD.krutiToUnicode(k);
  assert.equal(KD.cleanUni(back), KD.cleanUni(w), 'Au matra round-trip mismatch for: ' + w);
}

console.log('All matra highlight, r/u/ri conversions, and cumulative speed checks passed successfully.');

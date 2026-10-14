const assert = require('node:assert/strict');
for (const file of ['convert', 'keys', 'engine', 'lessons', 'words', 'passages', 'teaching', 'profile', 'curriculum']) require('../js/' + file);

const steps = KD.buildSteps([{ k: 'fdd', h: 'किक' }]);
let measurement = KD.measurePosition(null, 0, steps[0], true, 0);
measurement = KD.measurePosition(measurement, 1, steps[1], false, 100);
measurement = KD.measurePosition(measurement, 2, steps[2], false, 100, true);
measurement = KD.measurePosition(measurement, 1, steps[1], true, 100);
measurement = KD.measurePosition(measurement, 2, steps[2], true, 100);
const summary = KD.measurementSummary(measurement);
assert.equal(summary.acc, 100);
assert.equal(summary.realAcc, 67);
assert.equal(summary.correct, 3);
assert.equal(KD.measurementSummary({ positions: Array.from({ length: 49 }, (_, i) => ({ visited: true, valid: i < 46, first: i < 46 })) }).acc, 94,
  'Displayed accuracy and the passing comparison must use the same rounding');
assert.equal(measurement.positions[1].ms, 200);
let profile = KD.updateProfile(null, measurement, 1);
assert.equal(profile.keys.KeyD.samples.length, 2);
assert.equal(KD.profileRow(profile.keys.KeyD).accuracy, 50);
assert(KD.profileSpeed(profile) > 0);
assert.equal(KD.updateProfile(profile, measurement, 1).keys.KeyD.samples.length, 2, 'Duplicate finish must not inflate evidence');
assert.deepEqual(KD.mergeProfile(profile, null), profile);
assert.deepEqual(KD.mergeProfile({ at: 0 }, profile), profile);
assert.equal(KD.predictDuration(0, 400, 16), 400);
assert.equal(KD.predictDuration(405, 400, 16), 400);
assert(Math.abs(KD.predictDuration(1200, 400, 16) - 991.2978151240967) < 0.001);

for (let at = 2; at < 105; at++) profile = KD.updateProfile(profile, { positions: [{ id: 'KeyD', ti: 0, ms: 200, first: true, valid: true, visited: true }] }, at);
assert.equal(profile.keys.KeyD.samples.length, 16);
assert.equal(profile.history.filter(id => id === 'KeyD').length, 13, 'Repeated drills must not dominate the short history');
assert(profile.history.length <= 1000);
assert.equal(KD.profileRow(profile.keys.KeyD).accuracy, 100);

const full = KD.LESSONS.find(l => l.id === 'w-common');
const pairs = {};
(full.tokens || []).concat(full.reviewPool || []).forEach(token => {
  const actions = KD.tokenActions(token);
  for (let i = 1; i < actions.length; i++) pairs[actions[i - 1] + '>' + actions[i]] = { samples: [{ at: 1, ok: false, ms: 0 }, { at: 2, ok: true, ms: 400 }] };
});
assert(Object.keys(pairs).length > 10);
const review = KD.progressiveReview(full, { mastery: { pairs } }, null, () => 0);
assert.equal(review.lines.length, 4);
assert.equal(new Set(review.targets).size, 4);
review.lines.forEach(line => {
  assert.equal(line.tokens.length, 7);
  assert.equal(line.tokens[0].k, line.tokens[1].k);
  line.tokens.forEach(token => {
    assert(KD.allowedToken(token, full.allowed));
    assert.equal(KD.cleanUni(KD.krutiToUnicode(token.k)), token.h);
    assert(!/^[\u0900-\u0903\u093a-\u094d]/.test(token.h));
  });
});
for (const lesson of KD.LESSONS.filter(l => l.dynamic)) {
  const tokens = KD.dynamicTokens(lesson, {});
  assert(tokens.length);
  tokens.forEach(token => {
    assert(KD.allowedToken(token, lesson.allowed), lesson.id + ' introduced a new key');
    assert.equal(KD.cleanUni(KD.krutiToUnicode(token.k)), token.h);
  });
}
assert(KD.LESSONS.every(l => !l.wordlock), 'Course practice must support character corrections');
console.log('Learning model checks passed: first-try accuracy, corrections, smoothing, bounded history, four-pair selection, and valid Hindi progression.');

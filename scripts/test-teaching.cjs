const assert = require('node:assert/strict');
for (const file of ['convert', 'keys', 'engine', 'lessons', 'words', 'passages', 'teaching', 'profile']) require('../js/' + file);
const original = KD.LESSONS.map(lesson => lesson.id);
require('../js/curriculum');
const course = KD.LESSONS;
const seen = new Set(), lessonIds = new Set();
for (const lesson of course) {
  assert(!lessonIds.has(lesson.id), 'Duplicate lesson ID ' + lesson.id);
  lessonIds.add(lesson.id);
  if (lesson.scoreFree) assert.equal(lesson.introduces.length, 1, 'Introduce one action at a time');
  for (const id of lesson.introduces || []) seen.add(id);
  assert(lesson.tokens.length, 'Empty lesson ' + lesson.id);
  for (const step of KD.buildSteps(lesson.tokens)) {
    assert.notEqual(step.code, 'UNMAPPED');
    assert.notEqual(step.type, 'alt');
    assert(seen.has(KD.actionId(step)), lesson.id + ' uses an untaught key ' + KD.actionId(step));
  }
  for (const token of lesson.tokens) {
    assert(KD.allowedToken(token, lesson.allowed), 'Unknown key in lesson ' + lesson.id);
    assert.equal(KD.cleanUni(KD.krutiToUnicode(token.k)), KD.cleanUni(token.h), 'Wrong Hindi display in ' + lesson.id);
  }
}
for (const id of original) assert(lessonIds.has(id), 'Saved history lost its lesson ' + id);
for (const row of KD.ROWS) for (const key of row) {
  assert(seen.has(key.code), 'Missing key ' + key.code);
  assert(seen.has(key.code + '+S'), 'Missing Shift action ' + key.code);
}
assert.equal(course.filter(l => l.section === 'patterns' && l.stage === 'combination').length, 20);
assert.equal(course.filter(l => l.section === 'travel').length, 8);

const empty = KD.mergeProgress({}, {});
assert.equal(KD.nextCourseLesson(course, empty), 0);
assert.equal(KD.lessonUnlocked(course, 1, empty), false);
empty.learned[course[0].id] = true;
assert.equal(KD.nextCourseLesson(course, empty), 1);
assert.equal(KD.lessonUnlocked(course, 1, empty), true);
const legacy = KD.mergeProgress({ stars: { bumps: 4 }, tries: { bumps: [{ at: 1, acc: 96 }] } }, {});
assert.equal(KD.nextCourseLesson(course, legacy), course.findIndex(l => l.id === 'j-ra'));
assert.equal(legacy.stars.bumps, 4);
assert.equal(legacy.tries.bumps.length, 1);
const merged = KD.mergeProgress({ learned: { a: true }, placedKeys: { KeyF: true }, placedPairs: { 'KeyF>KeyD': true } },
  { learned: { b: true }, placedKeys: { KeyJ: true } });
assert(merged.learned.a && merged.learned.b && merged.placedKeys.KeyJ && merged.placedPairs['KeyF>KeyD']);

const goal = { min: 3, mid: 6, high: 10, acc: 90 };
assert.equal(KD.starsFor(100, 89, goal), 0, 'Speed cannot bypass accuracy');
assert.equal(KD.starsFor(2, 100, goal), 0, 'Accuracy alone cannot bypass the minimum speed');
assert.equal(KD.starsFor(3, 90, goal), 1);
assert.equal(KD.starsFor(10, 99, goal), 4);
assert.equal(KD.starsFor(10, 100, goal), 5);
assert.equal(KD.starsFor(15, 97, goal, 97), 5, 'Speed can compensate in the public performance calculation');
assert.equal(KD.performanceFor(10, 100, goal, 75), 75, 'Correcting a mistake must preserve its scoring cost');
assert.equal(KD.starsFor(100, 100, { ...goal, scoreFree: true }), 0);

const shifted = KD.stepsFromKruti('D')[0];
assert(KD.checkTechnique({ oppositeShift: true }, shifted, { ShiftLeft: true }));
assert.equal(KD.checkTechnique({ oppositeShift: true }, shifted, { ShiftRight: true }), '');
assert(KD.checkTechnique({ anchor: 'KeyJ' }, shifted, {}));
assert.equal(KD.checkTechnique({ anchor: 'KeyJ' }, shifted, { KeyJ: true }), '');

let mastery = { keys: {}, pairs: {} };
const step = { ...KD.stepsFromKruti('d')[0], ti: 0 };
for (let i = 0; i < 6; i++) mastery = KD.noteSkill(mastery, step, { id: 'KeyF', ti: 0 }, i >= 4, 700, i + 1);
const weak = KD.recentWeakness(mastery, ['KeyF', 'KeyD']);
assert(weak.some(row => row.id === 'KeyF>KeyD'), 'Wrong transitions must be recorded');
assert(!KD.recentWeakness(mastery, ['KeyF']).length, 'Do not recommend an untaught action');
const lesson = course.find(l => l.id === 'd-ka');
const repair = KD.buildRecovery(lesson, { mastery }, [{ word: 'कि' }]);
assert(repair && repair.tokens.some(t => t.h === 'कि'));
assert(repair.tokens.every(t => KD.allowedToken(t, lesson.allowed)));
assert.equal(repair.title.includes('D'), true);
for (let i = 10; i < 40; i++) mastery = KD.noteSkill(mastery, step, { id: 'KeyF', ti: 0 }, true, 150, i);
assert(!KD.recentWeakness(mastery, ['KeyF', 'KeyD']).length, 'Clean recent practice must retire an old weakness');
const copy = KD.mergeMastery(mastery, mastery);
assert.equal(copy.keys.KeyD.samples.length, 24, 'Sync must not double-count samples');
const last = copy.keys.KeyD.samples.at(-1);
assert.equal(last.ms, 150);
const afterPause = KD.noteSkill({}, step, null, true, 12000, 100);
assert.equal(afterPause.keys.KeyD.samples[0].ms, 0, 'Thinking pauses must not become slow key evidence');
console.log('Teaching checks passed: ' + course.length + ' lessons; all normal and Shift keys; progression, recovery, technique, and history.');

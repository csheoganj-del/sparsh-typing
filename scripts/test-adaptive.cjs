const assert = require('node:assert/strict');
for (const file of ['convert', 'keys', 'engine', 'lessons', 'words', 'passages', 'teaching', 'profile', 'curriculum', 'practice', 'adaptive']) require('../js/' + file);

const now = Date.UTC(2026, 9, 18, 12);
function fullStore() {
  const store = { stars: {}, learned: {}, placedKeys: {}, touch: { keys: {}, pairs: {} }, live: { past: [] }, practice40: { attempts: [] }, misses: {} };
  for (const lesson of KD.LESSONS) { store.stars[lesson.id] = 5; store.learned[lesson.id] = true; }
  return store;
}
function checks(store, speeds, accuracy = 99) {
  store.practice40.attempts = speeds.map((wpm, i) => ({ at: now - (speeds.length - i) * 3600000,
    ms: 120000, wpm, acc: accuracy, realAcc: accuracy, full: true, guided: false, signature: 'passage-' + i }));
  return store;
}
function profileRow(ms, correct = true, at = now) {
  return { ms, samples: Array.from({ length: 16 }, (_, i) => ({ at: at - 16 + i, ok: Array.isArray(correct) ? correct[i] : correct })) };
}

const stuck = checks(fullStore(), [32.8, 33.2, 33, 33.4, 33.1, 33]);
const plan = KD.adaptivePlan(stuck);
assert.equal(plan.plateau, true, 'Several comparable fresh checks should reveal a stable speed range');
assert(plan.baselineWpm >= 33 && plan.baselineWpm < 33.2);
assert.equal(plan.targetWpm, 34, 'A plateau gets a small next step rather than a 50 WPM demand');
assert.equal(plan.targetAccuracy, 98);
assert(plan.targets.length >= 4 && plan.targets.length <= 6);
assert.equal(KD.adaptivePlan(checks(fullStore(), [33, 33, 33, 33])).plateau, false, 'Four checks do not establish a plateau');
assert.equal(KD.adaptivePlan(checks(fullStore(), [29, 30, 32, 33, 35, 37])).plateau, false, 'A clear upward trend is not a plateau');
assert(KD.adaptivePlan(checks(fullStore(), [49, 49, 49, 49, 49])).targetWpm <= 50);

const clean = fullStore();
clean.profile = { keys: { KeyD: profileRow(300), KeyF: profileRow(300), KeyJ: profileRow(300), KeyK: profileRow(300) }, pairs: {} };
clean.misses.KeyD = 1000;
const cleanPlan = KD.adaptivePlan(clean);
assert(cleanPlan.retiredKeys.includes('KeyD'), 'Clean recent evidence retires a historical miss counter');
assert(!cleanPlan.targets.some(row => row.id === 'KeyD' && row.reason !== 'review'));
assert(!cleanPlan.targets.some(row => row.reason === 'accuracy' || row.reason === 'speed'), 'Equal clean key times must not invent a weakness');
const oldSlow = fullStore();
oldSlow.profile = { keys: { KeyD: profileRow(1000, false, now - 30 * 86400000), KeyF: profileRow(300), KeyJ: profileRow(300) }, pairs: {} };
oldSlow.misses.KeyD = 1000;
assert(!KD.adaptivePlan(oldSlow).targets.some(row => row.id === 'KeyD' && row.reason !== 'review'), 'Month-old observations cannot outweigh current practice');
const repair = KD.adaptiveRecovery(clean, () => 0);
assert(repair && Array.isArray(repair.tokens) && repair.tokens.length >= 12, 'Clean completed users still receive a valid word drill');
assert.equal(repair.title, 'Adaptive Hindi word practice');
assert.notEqual(repair.tokens.map(token => token.h).join(' '), 'रररररर');
repair.tokens.forEach(token => {
  assert(KD.allowedToken(token, repair.allowed));
  assert.equal(KD.safeToken(token.h).k, token.k);
});
clean.adaptive = { drills: [{ at: now, signature: repair.signature, words: repair.words }] };
const varied = KD.adaptiveRecovery(clean, () => 0);
assert.notEqual(varied.signature, repair.signature, 'Saving the previous drill must vary the next one even with deterministic random input');
clean.coach = { drill: ['काम', 'FAKE_WORD', '<script>', 'नया अनजान', 'क\u0000'] };
assert(KD.adaptiveRecovery(clean, () => 0).tokens.every(token => !/[A-Za-z<>\u0000]/.test(token.h)), 'Unsafe model suggestions cannot enter a drill');

const beginner = { stars: {}, learned: {}, placedKeys: { KeyJ: true, KeyD: true, KeyF: true, Space: true }, misses: { KeyW: 200 } };
const first = KD.adaptiveRecovery(beginner, () => 0);
assert(first && first.tokens.length);
assert(first.tokens.every(token => KD.allowedToken(token, first.allowed)), 'Beginner drills use learned physical actions only');
assert(!first.allowed.includes('KeyW'));
assert.equal(KD.adaptiveRecovery({ stars: {}, learned: {}, placedKeys: {} }), null, 'No keys learned means resume teaching instead of adding an unknown key');
const withoutSpace = KD.adaptiveRecovery({ placedKeys: { KeyJ: true }, stars: {}, learned: {} }, () => 0);
assert(withoutSpace && withoutSpace.tokens.length === 1, 'Do not add an untaught Space between groups');

const badAccuracy = checks(fullStore(), [33, 33, 33, 33, 33], 94);
assert.equal(KD.adaptivePlan(badAccuracy).focus, 'accuracy');
assert(KD.adaptivePlan(badAccuracy).targetWpm <= 33);
const repeats = fullStore();
repeats.live.past = Array.from({ length: 6 }, (_, i) => ({ at: now - i * 3600000, id: 'hist-' + i, pattern: 'history', ms: 30000,
  wpm: 33, realAcc: 99, sentenceIds: ['यह काम पूरा था।'], words: ['यह', 'काम', 'पूरा', 'था।'] }));
assert.equal(KD.adaptivePlan(repeats).plateau, false, 'Repeating one passage does not establish a fresh-text plateau');

const programStore = checks(fullStore(), [33, 33, 33, 33, 33]);
programStore.training = { startDate: '2026-10-18', goalWpm: 50, durationDays: 20 };
let program = KD.trainingProgram(programStore, now);
assert.equal(program.day, 1);
assert.equal(program.status, 'active');
assert.equal(program.endDate, '2026-11-06');
assert.equal(program.goalWpm, 50);
assert.equal(program.durationDays, 20);
assert.equal(program.baselineEstimated, false);
assert(program.totalMinutes >= 35 && program.totalMinutes <= 45);
assert(program.blocks.every(block => block.minutes >= 8 && block.minutes <= 10));
assert(program.nextTargetWpm <= program.baselineWpm + 2);
assert(program.burstEligible);
assert.equal(program.milestones.at(-1).targetWpm, 50);
assert.equal(program.milestones.at(-1).date, '2026-11-06');
assert(program.note.includes('not a prediction'));
assert.equal(KD.trainingProgram(badAccuracy, now).burstEligible, false);
assert(KD.trainingProgram(badAccuracy, now).nextTargetWpm <= 33, 'Poor first-try accuracy gates speed increases');

const fallback = KD.trainingProgram(fullStore(), now);
assert.equal(fallback.startDate, '2026-10-18');
assert.equal(fallback.baselineWpm, 33);
assert.equal(fallback.baselineEstimated, true);
assert.equal(fallback.baselineSource, 'estimate');
assert.equal(fallback.burstEligible, false, 'An estimated baseline does not authorize speed bursts');
const midnight = KD.trainingProgram(fullStore(), Date.UTC(2026, 9, 18, 18, 45));
assert.equal(midnight.currentDate, '2026-10-19', 'India date boundaries must not use the host timezone');
program = KD.trainingProgram(programStore, Date.UTC(2026, 9, 17, 12));
assert.equal(program.status, 'upcoming');
assert.equal(program.scheduledDay, 0);
assert.equal(program.day, 1);
assert.equal(program.burstEligible, false);
program = KD.trainingProgram(programStore, Date.UTC(2026, 9, 24, 12));
assert.equal(program.day, 7);
assert(program.lightDay && program.totalMinutes < 25);
program = KD.trainingProgram(programStore, Date.UTC(2026, 10, 6, 12));
assert.equal(program.day, 20);
assert.equal(program.status, 'active');
assert.equal(program.daysRemaining, 1);
program = KD.trainingProgram(programStore, Date.UTC(2026, 10, 7, 12));
assert.equal(program.day, 20);
assert.equal(program.scheduledDay, 21);
assert.equal(program.status, 'finished');
assert.equal(program.daysRemaining, 0);
assert.equal(program.burstEligible, false);

const activities = fullStore();
const at = now - 3600000;
activities.practice40.attempts.push({ at, ms: 120000, full: true, guided: false, wpm: 50, acc: 99, realAcc: 99 });
activities.log = [{ at, id: 'practice40', ms: 120000 }, { at: at + 1, id: 'hist-1', ms: 60000 },
  { at: at + 2, id: 'adaptive-drill', ms: 90000 }, { at: at + 3, id: 'exam-hi', ms: 600000 }];
activities.tries = { 'hist-1': [{ at: at + 1, ms: 60000 }] };
program = KD.trainingProgram(activities, now);
assert.equal(program.today.checks, 1);
assert.equal(program.today.fullChecks, 1);
assert.equal(program.today.checkMinutes, 2);
assert.equal(program.today.lessonMinutes, 1);
assert.equal(program.today.drillMinutes, 1.5);
assert.equal(program.today.examMinutes, 10);
assert.equal(program.today.recordedMinutes, 14.5, 'Duplicate sources must not inflate recorded minutes');
const goal = checks(fullStore(), [50, 51, 50]);
assert(KD.trainingProgram(goal, now).goalReached);
goal.practice40.attempts.at(-1).realAcc = 97;
assert(!KD.trainingProgram(goal, now).goalReached, 'Goal needs three clean full fresh checks');
goal.practice40.attempts.at(-1).realAcc = 99;
goal.practice40.attempts.at(-1).signature = goal.practice40.attempts[0].signature;
assert(!KD.trainingProgram(goal, now).goalReached, 'Replaying a saved passage cannot satisfy the three-passage goal');

console.log('Adaptive checks passed: recent plateaus, small accuracy-gated targets, stale weakness retirement, varied valid recovery, learned keys, 20-day India calendar, real activity, and three fresh 50 WPM checks.');

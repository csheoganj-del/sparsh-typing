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
const historyHeavy = fullStore();
historyHeavy.log = Array.from({ length: 40 }, (_, i) => ({ at: now - (80 - i) * 86400000, wpm: 20, acc: 100, ms: 60000, id: 'old-' + i }));
historyHeavy.live.past = [36, 38, 40, 37, 39, 38, 41, 37].map((wpm, i) => ({
  at: now - (8 - i) * 3600000, id: 'hist-' + i, pattern: 'history', ms: 50000, wpm, acc: 99, realAcc: 99,
  words: ['यह', 'काम', 'पूरा', 'था।'], sentenceIds: ['fresh-' + i]
}));
const heavyPlan = KD.adaptivePlan(historyHeavy);
assert.equal(heavyPlan.baselineWpm, 38, 'Recent lessons set the pace');
assert(KD.cumulativeSpeed(historyHeavy) < 25, 'The lifetime average still includes the slow early lessons');

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
assert.equal(program.milestones[0].targetWpm, 33);
assert.equal(program.milestones.at(-1).targetWpm, 41, 'Checkpoints rise 2 WPM at a time from the measured check');
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

assert.equal(KD.msToWpm(300), KD.keyWpm(120, 36000), 'Ring speed uses the same physical-key WPM as the rest of the app');
assert.equal(KD.IGNITION_CHASE_MS, 150000);
assert.equal(KD.IGNITION_TOTAL_MS, 240000);
const noHistory = KD.ignitionRead(fullStore(), now);
assert.equal(noHistory.cruise, 30);
assert.equal(noHistory.burst, null);
assert.equal(noHistory.lifted, false);
assert(noHistory.line.includes('two-minute check'));
assert(noHistory.floorMs < noHistory.paceMs && noHistory.paceMs < noHistory.ceilMs);

function pressSamples(ms) {
  return Array.from({ length: 8 }, (_, i) => ({ at: now - 8 + i, ok: true, ms }));
}
const burstStore = checks(fullStore(), [30, 30, 30, 30, 30, 30, 30, 30]);
burstStore.mastery = { keys: { KeyD: { samples: pressSamples(180) }, KeyF: { samples: pressSamples(180) }, KeyJ: { samples: pressSamples(180) }, KeyK: { samples: pressSamples(180) } }, pairs: {} };
const burstRead = KD.ignitionRead(burstStore, now);
assert(burstRead.burst > 60, 'The quick quarter of real presses is the finger speed');
assert(burstRead.tax > 30);
assert(burstRead.card.includes('pause'));
burstStore.mastery.keys.KeyD.samples = pressSamples(400);
burstStore.mastery.keys.KeyF.samples = pressSamples(400);
burstStore.mastery.keys.KeyJ.samples = pressSamples(400);
burstStore.mastery.keys.KeyK.samples = pressSamples(400);
assert.equal(KD.ignitionRead(burstStore, now).burst, null, 'Even presses at the recent pace are not described as hidden speed');

const liftStore = checks(fullStore(), [30, 30, 30, 30, 30, 30, 30, 30]);
liftStore.live.past = [{ id: 'ignition-keep', at: now - 1000, wpm: 40, ms: 40000, realAcc: 98, acc: 98, sentenceIds: ['ignition-keep:1'] }];
const lifted = KD.ignitionRead(liftStore, now);
assert.equal(KD.adaptivePlan(liftStore).baselineWpm, 30, 'One fast hold does not replace the recent median');
assert.equal(lifted.lifted, true);
assert(Math.abs(KD.msToWpm(lifted.paceMs) - 35) < 0.2, 'The next round starts between recent speed and the hold');
const staleHold = checks(fullStore(), [30, 30, 30, 30, 30, 30, 30, 30]);
staleHold.live.past = [{ id: 'ignition-keep', at: now - 13 * 3600000, wpm: 44, ms: 40000, realAcc: 99, sentenceIds: ['old'] }];
assert.equal(KD.ignitionRead(staleHold, now).lifted, false);
const eightHolds = fullStore();
eightHolds.live.past = Array.from({ length: 8 }, (_, i) => ({
  id: 'ignition-keep', at: now - (8 - i) * 1000, wpm: 42, ms: 40000, realAcc: 98, acc: 98, sentenceIds: ['ignition-keep:' + i]
}));
assert.equal(KD.adaptivePlan(eightHolds).baselineWpm, 42, 'Repeated unpaced holds are allowed to move recent speed');

function closeClean(state, start, keys, ms) {
  KD.ignitionEvent(state, { kind: 'open', now: start, ti: 0 });
  KD.ignitionEvent(state, { kind: 'close', now: start + ms, keys });
  return start + ms;
}
let ring = KD.ignitionStart({ paceMs: 400, floorMs: 250, ceilMs: 500, cruise: 30 });
let cursor = closeClean(ring, 0, 5, 5 * 400 - 30);
cursor = closeClean(ring, cursor, 5, 5 * ring.paceMs - 30);
assert(Math.abs(ring.paceMs - 376) < 0.001, 'Two clean on-time words shorten the budget by 6%');
assert.equal(ring.tightenings, 1);
ring = KD.ignitionStart({ paceMs: 400, floorMs: 250, ceilMs: 410, cruise: 30 });
KD.ignitionEvent(ring, { kind: 'open', now: 0, ti: 0 });
KD.ignitionEvent(ring, { kind: 'miss', now: 20 });
KD.ignitionEvent(ring, { kind: 'close', now: 500, keys: 5 });
assert.equal(ring.paceMs, 410, 'A miss lengthens the budget, and the slow cap still holds');
assert.equal(ring.tightenings, 0);
ring = KD.ignitionStart({ paceMs: 400, floorMs: 250, ceilMs: 500, cruise: 30 });
KD.ignitionEvent(ring, { kind: 'open', now: 0, ti: 0 });
KD.ignitionEvent(ring, { kind: 'close', now: 5 * 400 + 80, keys: 5 });
assert(Math.abs(ring.paceMs - 416) < 0.001);
assert.equal(ring.tightenings, 0, 'A late clean word does not count as a speed increase');
ring = KD.ignitionStart({ paceMs: 400, floorMs: 250, ceilMs: 500, cruise: 30 });
cursor = 0;
for (let i = 0; i < 40; i++) cursor = closeClean(ring, cursor, 5, 5 * ring.paceMs - 30);
assert(ring.paceMs >= 249.9 && ring.paceMs <= 250.1, 'The ring stops 18 WPM above the recent pace');

ring = KD.ignitionStart({ paceMs: 400, floorMs: 200, ceilMs: 500, cruise: 30 });
cursor = 0;
for (let i = 0; i < 4; i++) cursor = closeClean(ring, cursor, 5, 1000);
KD.ignitionEvent(ring, { kind: 'open', now: cursor, ti: 2 });
KD.ignitionEvent(ring, { kind: 'keep', now: cursor + 10 });
KD.ignitionEvent(ring, { kind: 'close', now: cursor + 900, keys: 5 });
assert.equal(ring.words.filter(word => word.phase === 'keep').length, 0, 'The word already open when the bar leaves does not count');
cursor += 900;
for (let i = 0; i < 24; i++) cursor = closeClean(ring, cursor, 5, 1500);
const held = KD.ignitionHeld(ring);
assert.equal(held.words, 24);
assert.equal(held.wpm, 40);
assert.equal(held.gain, 10);
assert.equal(held.save, true);
const slow = KD.ignitionStart({ paceMs: 400, floorMs: 200, ceilMs: 800, cruise: 30 });
cursor = 0;
KD.ignitionEvent(slow, { kind: 'keep', now: 0 });
for (let i = 0; i < 24; i++) cursor = closeClean(slow, cursor, 5, 4000);
assert.equal(KD.ignitionHeld(slow).save, false, 'A slower unpaced minute must not pull recent speed down');

const ringMinutes = fullStore();
ringMinutes.log = [{ at: now - 1000, id: 'ignition', ms: 240000, wpm: 36, acc: 99 }];
ringMinutes.live.past = [{ at: now - 999, id: 'ignition-keep', ms: 90000, wpm: 36, acc: 99, realAcc: 99, sentenceIds: ['ignition-keep:1'] }];
const ringDay = KD.trainingProgram(ringMinutes, now);
assert.equal(ringDay.today.recordedMinutes, 4, 'The saved hold must not be counted twice as practice minutes');
assert.equal(ringDay.today.lessonMinutes, 4);

const eyesRead = KD.eyesRead({});
assert.equal(eyesRead.cruise, 30);
assert.match(eyesRead.line, /two-minute check/);
assert.equal(KD.EYES_MARK_MS, 45000);
let eyes = KD.eyesStart({ cruise: 32 });
KD.eyesEvent(eyes, { kind: 'open', now: 0 });
KD.eyesEvent(eyes, { kind: 'close', now: 1000, ok: true, keys: 5 });
KD.eyesEvent(eyes, { kind: 'open', now: 1000 });
KD.eyesEvent(eyes, { kind: 'bare', now: 1100 });
KD.eyesEvent(eyes, { kind: 'close', now: 2000, ok: true, keys: 5 });
assert.equal(eyes.words.filter(word => word.phase === 'bare').length, 0, 'The word already open when the mark leaves does not count as unmarked');
function bareWord(state, cursor, ok, ms) {
  KD.eyesEvent(state, { kind: 'open', now: cursor });
  KD.eyesEvent(state, { kind: 'close', now: cursor + ms, ok: ok, keys: 5 });
  return cursor + ms;
}
let cursorEyes = 2000;
cursorEyes = bareWord(eyes, cursorEyes, false, 1200);
cursorEyes = bareWord(eyes, cursorEyes, false, 1200);
assert.equal(eyes.rescueNext, true, 'Two unmarked misses mark the next word');
KD.eyesEvent(eyes, { kind: 'open', now: cursorEyes });
assert.equal(eyes.wordRescue, true);
assert.equal(eyes.rescueNext, false, 'The rescue is spent on that next word');
KD.eyesEvent(eyes, { kind: 'close', now: cursorEyes + 1200, ok: true, keys: 5 });
assert.equal(eyes.words[eyes.words.length - 1].rescue, true);
cursorEyes += 1200;
for (let i = 0; i < 34; i++) cursorEyes = bareWord(eyes, cursorEyes, true, 1500);
const eyesHeld = KD.eyesHeld(eyes);
assert.equal(eyesHeld.words, 36);
assert.equal(eyesHeld.wpm, 40.4);
assert.equal(eyesHeld.save, true);
const slowEyes = KD.eyesStart({ cruise: 32 });
KD.eyesEvent(slowEyes, { kind: 'bare', now: 0 });
let slowCursor = 0;
for (let i = 0; i < 12; i++) slowCursor = bareWord(slowEyes, slowCursor, true, 4000);
assert.equal(KD.eyesHeld(slowEyes).save, false, 'A slower unmarked passage must not pull recent speed down');
const nearClean = KD.eyesStart({ cruise: 20 });
KD.eyesEvent(nearClean, { kind: 'bare', now: 0 });
let nearCursor = 0;
for (let i = 0; i < 15; i++) nearCursor = bareWord(nearClean, nearCursor, true, 3000);
nearCursor = bareWord(nearClean, nearCursor, false, 3000);
const nearHeld = KD.eyesHeld(nearClean);
assert.equal(Math.round(nearHeld.first), 94);
assert.equal(nearHeld.save, true, '94% on the result screen counts as 94% clean');
const underClean = KD.eyesStart({ cruise: 20 });
KD.eyesEvent(underClean, { kind: 'bare', now: 0 });
let underCursor = 0;
for (let i = 0; i < 14; i++) underCursor = bareWord(underClean, underCursor, true, 3000);
underCursor = bareWord(underClean, underCursor, false, 3000);
assert.equal(Math.round(KD.eyesHeld(underClean).first), 93);
assert.equal(KD.eyesHeld(underClean).save, false, '93% on the result screen does not count');
const eyesMinutes = fullStore();
eyesMinutes.log = [{ at: now - 1000, id: 'eyes', ms: 240000, wpm: 36, acc: 99 }];
eyesMinutes.live.past = [{ at: now - 999, id: 'eyes-keep', ms: 90000, wpm: 40, acc: 98, realAcc: 98, sentenceIds: ['eyes-keep:1'] }];
const eyesDay = KD.trainingProgram(eyesMinutes, now);
assert.equal(eyesDay.today.recordedMinutes, 4, 'The unmarked hold must not be counted twice as practice minutes');

console.log('Adaptive checks passed: recent plateaus, small accuracy-gated targets, stale weakness retirement, varied valid recovery, learned keys, 20-day India calendar, real activity, three fresh 50 WPM checks, the self-raising ring, and the unmarked exam passage.');

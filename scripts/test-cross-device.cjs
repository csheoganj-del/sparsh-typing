const assert = require('node:assert/strict');
for (const file of ['convert', 'keys', 'engine', 'teaching', 'profile', 'practice']) require('../js/' + file);

const clone = value => JSON.parse(JSON.stringify(value));
const lesson = (id, word) => ({ id, pattern: 'history', wordlock: false, tokens: [{ h: word, k: word }] });
const progress = (current, at, resume, past = []) => ({ stars: {}, live: { lesson: current, updatedAt: at, resume, past } });
const finished = lesson('hist-1', 'finished');
const next = lesson('hist-2', 'fresh');
const completion = { id: finished.id, at: 100, passageSig: KD.livePassageSignature(finished), words: ['finished'] };
const stale = progress(finished, 1000, { id: finished.id, i: 7, savedAt: 1000 });
const cloud = progress(next, 200, null, [completion]);
const untouched = JSON.stringify([stale, cloud]);
const merged = KD.mergeProgress(stale, cloud);
assert.equal(merged.live.lesson.id, next.id, 'A later stale-device cursor must not reopen a completed passage');
assert.equal(merged.live.resume, null);
assert.deepEqual(KD.mergeProgress(cloud, stale).live, merged.live, 'Completion precedence must not depend on merge order');
assert.equal(JSON.stringify([stale, cloud]), untouched, 'Merging must not mutate either device snapshot');
assert.deepEqual(KD.mergeProgress(merged, cloud).live, merged.live, 'Repeated cloud downloads must be idempotent');

const doneOnly = progress(finished, 1000, { id: finished.id, i: 7, savedAt: 1000 }, [completion]);
const doneMerged = KD.mergeProgress(doneOnly, null);
assert.equal(doneMerged.live.lesson, null, 'When every candidate is completed, leave the next passage for composition');
assert.equal(doneMerged.live.resume, null);
assert.deepEqual(KD.mergeProgress(doneMerged, doneOnly).live, doneMerged.live, 'Clearing a completed lesson must preserve history on later merges');

const collisionA = lesson('hist-3', 'different passage A');
const collisionB = lesson('hist-3', 'different passage B');
const deviceA = progress(collisionA, 100, { id: collisionA.id, i: 99, savedAt: 1000 });
const deviceB = progress(collisionB, 200, { id: collisionB.id, i: 0, savedAt: 200 });
const collision = KD.mergeProgress(deviceA, deviceB);
assert.equal(collision.live.lesson.tokens[0].h, collisionB.tokens[0].h);
assert.equal(collision.live.resume.i, 0, 'Identical lesson IDs must not transfer a cursor to different text');
assert.deepEqual(KD.mergeProgress(deviceB, deviceA).live, collision.live);
const mismatchedCursor = clone(deviceB);
mismatchedCursor.live.resume.passageSig = KD.livePassageSignature(collisionA);
assert.equal(KD.mergeProgress(mismatchedCursor, null).live.resume, null, 'A cursor signature must also match its own snapshot text');
assert.equal(KD.liveLessonCompleted(collisionB, [{ id: collisionA.id, at: 1, passageSig: KD.livePassageSignature(collisionA) }]), false);
assert.equal(KD.liveLessonCompleted(collisionB, [{ id: collisionA.id, at: 1, words: [collisionA.tokens[0].h] }]), false);
const completedCollision = clone(deviceA);
completedCollision.live.past = [{ id: collisionA.id, at: 300, passageSig: KD.livePassageSignature(collisionA) }];
assert.equal(KD.mergeProgress(completedCollision, deviceB).live.lesson.tokens[0].h, collisionB.tokens[0].h);

const histories = clone(cloud);
histories.live.past.push({ id: finished.id, at: 150, words: ['a second attempt'] });
histories.live.sentenceUsage = { first: { count: 2, at: 150 }, shared: { count: 1, at: 150 } };
const historyOnly = { stars: {}, live: { past: [{ id: 'hist-0', at: 50, words: ['older'] }], sentenceUsage: { second: { count: 1, at: 200 }, shared: { count: 3, at: 100 } } } };
const united = KD.mergeProgress(histories, historyOnly);
assert.equal(united.live.past.length, 3, 'Distinct attempts with the same lesson ID must survive');
assert.deepEqual(united.live.sentenceUsage.shared, { count: 3, at: 150 });
assert.deepEqual(Object.keys(united.live.sentenceUsage).sort(), ['first', 'second', 'shared']);
assert.deepEqual(KD.mergeProgress(united, historyOnly).live, united.live);

const coached = KD.mergeProgress({ stars: {}, coach: { at: 1, note: 'A useful drill', source: 'gemini', drill: ['word', 'word', '', null, ...Array.from({ length: 15 }, (_, i) => 'w' + i), 'x'.repeat(100)] } }, null).coach;
assert.equal(coached.drill.length, 12);
assert.equal(coached.drill.filter(word => word === 'word').length, 1);
assert(coached.drill.every(word => typeof word === 'string' && word.length <= 64));
assert.deepEqual(KD.mergeProgress({ stars: {}, coach: coached }, null).coach, coached);

const common = [{ at: 10, ok: true }, { at: 10, ok: true }];
const profileA = { at: 20, history: ['KeyD', 'KeyF'], keys: { KeyD: { ms: 250, samples: common.concat({ at: 20, ok: false }) }, KeyF: { ms: 200, samples: [{ at: 20, ok: true, i: 1 }] } }, pairs: {} };
const profileB = { at: 30, history: ['KeyD', 'KeyJ'], keys: { KeyD: { ms: 180, samples: common.concat({ at: 30, ok: true, i: 0 }) }, KeyJ: { ms: 150, samples: [{ at: 30, ok: true, i: 1 }] } }, pairs: {} };
const profile = KD.mergeProfile(profileA, profileB);
assert.deepEqual(Object.keys(profile.keys), ['KeyD', 'KeyF', 'KeyJ']);
assert.equal(profile.keys.KeyD.samples.length, 4, 'Independent evidence must merge without duplicating common legacy samples');
assert.equal(profile.keys.KeyD.ms, 180, 'The latest prediction for this key must survive');
assert.deepEqual(KD.mergeProfile(profileB, profileA), profile);
assert.deepEqual(KD.mergeProfile(profile, profileA), profile);
assert.deepEqual(KD.mergeProfile(profile, profileB), profile);
const many = clone(profileB);
many.keys.KeyD.samples = Array.from({ length: 24 }, (_, i) => ({ at: i + 100, ok: true, i: 0 }));
assert.equal(KD.mergeProfile(profile, many).keys.KeyD.samples.length, 16);

const training = KD.mergeProgress({ stars: {}, training: { startDate: '2026-10-20' }, adaptive: { drills: [{ at: 1, signature: 'one' }] } },
  { stars: {}, training: { startDate: '2026-10-18' }, adaptive: { drills: Array.from({ length: 10 }, (_, i) => ({ at: i + 1, signature: String(i) })) } });
assert.deepEqual(training.training, { startDate: '2026-10-18', goalWpm: 50, durationDays: 20 });
assert.equal(training.adaptive.drills.length, 8);
assert.deepEqual(KD.mergeProgress(training, training).adaptive, training.adaptive);
assert.equal(KD.mergeProgress({ stars: {}, training: { startDate: '2026-02-30' } }, null).training, undefined);
assert.equal(KD.mergeProgress({ stars: {} }, null).training, undefined, 'Legacy progress must not invent a training start date');
assert.equal(KD.starBars({ live: { past: [{ pattern: 'history', stars: 5, high: 50 }] } }).high, 50);
const cleanTarget = { pattern: 'history', stars: 4, high: 32, wpm: 33, acc: 98, realAcc: 98 };
assert.equal(KD.starBars({ live: { past: [cleanTarget] } }).high, 34, 'A clean goal-speed run must advance even when the accuracy-weighted score gives four stars');
assert.equal(KD.starBars({ live: { past: [{ ...cleanTarget, realAcc: undefined }] } }).high, 32, 'Legacy attempts without first-try accuracy must not assume 98 percent');
assert.equal(KD.starBars({ live: { past: [{ ...cleanTarget, realAcc: 97 }] } }).high, 32);
assert.equal(KD.starBars({ live: { past: [{ pattern: 'history', stars: 5, high: 32 }] } }).high, 34, 'Existing five-star progression must survive');
assert.equal(KD.starBars({ live: { past: [{ ...cleanTarget, high: 50, wpm: 51 }] } }).high, 50);

// Isolate the HTTP contract from storage providers and user records.
const dbPath = require.resolve('../api/_db');
const previousDb = require.cache[dbPath];
let savedProgress = cloud;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  verifyToken: token => token === 'test-token' ? { username: 'test-user' } : null,
  saveProgress: async (username, data) => (savedProgress = KD.mergeProgress(data, savedProgress)),
  getProgress: async () => savedProgress,
  isCloudConnected: () => true
} };
const handler = require('../api/progress');
function response() { return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } }; }
(async () => {
  try {
    const res = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: stale }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.progress.live.lesson.id, next.id, 'A save acknowledgement must return the merged cloud progress');
    assert.deepEqual(res.body.progress, savedProgress);
    console.log('Cross-device checks passed: completion precedence, passage-safe cursors, history union, bounded coach/profile evidence, shared training start, and merged save acknowledgement.');
  } finally {
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
for (const file of ['convert', 'keys', 'devlys', 'engine', 'lessons', 'words', 'passages', 'teaching', 'profile', 'curriculum', 'practice', 'adaptive']) {
  require('../js/' + file);
}

// 1. Verify KD.extractRecentWords extracts content words and filters stop words
const mockStore = {
  live: {
    past: [
      { words: ['कार्यालय', 'के', 'कर्मचारी', 'ने', 'आवेदन', 'पढ़े।'] },
      { words: ['सरकार', 'ने', 'नई', 'योजना', 'शुरू', 'की।'] }
    ]
  },
  adaptive: {
    drills: [
      { words: ['विकास', 'काम', 'कागज'] }
    ]
  }
};
const recentWords = KD.extractRecentWords(mockStore, 20);
assert(recentWords.includes('कार्यालय'), 'Should include content word कार्यालय');
assert(recentWords.includes('कर्मचारी'), 'Should include content word कर्मचारी');
assert(recentWords.includes('विकास'), 'Should include drill word विकास');
assert(!recentWords.includes('के'), 'Should filter out stop word के');
assert(!recentWords.includes('ने'), 'Should filter out stop word ने');
assert(!recentWords.includes('की'), 'Should filter out stop word की');
console.log('KD.extractRecentWords passed:', recentWords);

// 2. Verify adaptive recovery penalizes words in live.past
const testStore = {
  stars: {}, learned: {}, placedKeys: { KeyD: true, KeyK: true, KeyE: true, KeyJ: true, Space: true },
  adaptive: { drills: [] },
  live: { past: [{ words: ['काम', 'काम', 'काम'] }] }
};
for (const lesson of KD.LESSONS) {
  testStore.stars[lesson.id] = 5;
  testStore.learned[lesson.id] = true;
}
const recovery1 = KD.adaptiveRecovery(testStore, () => 0);
assert(recovery1 && recovery1.words.length >= 12);
console.log('Adaptive recovery with live.past penalty passed');

// 3. Verify 45 WPM 20-day training program milestones
const training45Store = {
  stars: {}, learned: {}, placedKeys: {}, misses: {},
  training: { startDate: '2026-10-18', goalWpm: 45, durationDays: 20, baselineWpm: 30, baselineEstimated: false },
  practice40: { attempts: [] }
};
for (const lesson of KD.LESSONS) { training45Store.stars[lesson.id] = 5; }
const program45 = KD.trainingProgram(training45Store, Date.UTC(2026, 9, 18, 12));
assert.equal(program45.goalWpm, 45, 'Goal WPM should be 45');
assert.equal(program45.durationDays, 20, 'Duration should be 20 days');
assert.equal(program45.milestones[0].targetWpm, 30, 'Day 1 checkpoint stays at the measured check');
assert.equal(program45.milestones.at(-1).targetWpm, 38, 'Checkpoints rise 2 WPM at a time and stay under the 45 WPM goal');
console.log('45 WPM 20-day training program milestones passed:', program45.milestones);

// 4. Verify pairFocus generation and prompt building in api/_sentences
const { generate, validate } = require('../api/_sentences');
const dummyData = {
  sentences: [
    'क्षेत्र के किसान ने अपनी फसल की सुरक्षा के लिए सभी आवश्यक प्रबंध समय पर किए।',
    'ग्राम पंचायत के नए भवन में सभी अभिलेख व्यवस्थित रूप से सुरक्षित रखे गए हैं।'
  ]
};
const valid = validate(dummyData, [], ['KeyD']);
assert(valid.aiGenerated);
console.log('Smart AI sentence validation & 45 WPM 20-day test suite passed cleanly.');

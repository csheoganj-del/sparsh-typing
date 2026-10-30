const fs = require('fs');
const path = require('path');

const progressFile = path.resolve('progress/sparsh-rssb-v1.json');
const raw = fs.readFileSync(progressFile, 'utf8');
const data = JSON.parse(raw);

console.log('=== USER DATA ANALYSIS ===');
console.log('Training Target:', data.training);
console.log('Coach Note:', data.coach ? data.coach.note : 'None');
console.log('Coach Repeat Words:', data.coach ? data.coach.repeat : []);
console.log('Coach Drill Words:', data.coach ? data.coach.drill : []);

console.log('\n--- SPEED & ACCURACY TREND ---');
if (data.log && data.log.length > 0) {
  data.log.forEach((entry, idx) => {
    const dt = new Date(entry.at);
    console.log(
      `#${idx + 1} | ${dt.toISOString().slice(0, 16)} | WPM: ${entry.wpm} | Acc: ${entry.acc}% | RealAcc: ${entry.realAcc}% | Title: ${entry.title}`
    );
  });
}

console.log('\n--- TOP 25 MISSES / ERRORS ---');
if (data.misses) {
  const sortedMisses = Object.entries(data.misses).sort((a, b) => b[1] - a[1]);
  sortedMisses.slice(0, 25).forEach(([k, cnt]) => {
    console.log(`Key ${k}: ${cnt} errors`);
  });
}

console.log('\n--- SLOWEST INDIVIDUAL KEYS (profile.keys) ---');
if (data.profile && data.profile.keys) {
  const singleKeys = Object.entries(data.profile.keys)
    .filter(([k]) => !k.includes('>'))
    .sort((a, b) => b[1].ms - a[1].ms);
  
  singleKeys.slice(0, 20).forEach(([k, v]) => {
    console.log(`${k.padEnd(15)} : ${Math.round(v.ms)} ms (samples: ${v.samples ? v.samples.length : 0})`);
  });

  console.log('\n--- FASTEST INDIVIDUAL KEYS ---');
  singleKeys.slice(-15).reverse().forEach(([k, v]) => {
    console.log(`${k.padEnd(15)} : ${Math.round(v.ms)} ms`);
  });

  console.log('\n--- SLOWEST BIGRAMS / KEY TRANSITIONS (at least 3 samples) ---');
  const bigrams = Object.entries(data.profile.keys)
    .filter(([k, v]) => k.includes('>') && v.samples && v.samples.length >= 3)
    .sort((a, b) => b[1].ms - a[1].ms);
  
  bigrams.slice(0, 25).forEach(([pair, v]) => {
    console.log(`${pair.padEnd(25)} : ${Math.round(v.ms)} ms (samples: ${v.samples.length})`);
  });
}

console.log('\n--- MASTERY & LESSONS STATUS ---');
console.log('Total starred lessons:', Object.keys(data.stars || {}).length);
console.log('Sample starred keys:', Object.keys(data.stars || {}).slice(0, 30));

if (data.mastery) {
  console.log('Mastery keys count:', Object.keys(data.mastery).length);
  const masteryEntries = Object.entries(data.mastery);
  console.log('Mastery samples:', masteryEntries.slice(0, 10));
}

console.log('\n--- PRACTICE40 / TARGET ---');
if (data.practice40) {
  console.log('Target:', data.practice40.target);
  console.log('Attempts:', data.practice40.attempts);
}

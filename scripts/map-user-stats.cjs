const fs = require('fs');

const officialKeys = JSON.parse(fs.readFileSync('scripts/devlys-official-keys.json', 'utf8'));
const keyMap = {};
officialKeys.rows.forEach(r => {
  const keyId = r.code + (r.shift ? '+S' : '');
  keyMap[keyId] = {
    hindi: r.official,
    raw: r.raw,
    code: r.code,
    shift: r.shift
  };
});

const progress = JSON.parse(fs.readFileSync('progress/sparsh-rssb-v1.json', 'utf8'));

console.log('=== HINDI ERROR BREAKDOWN (Top Misses) ===');
const misses = Object.entries(progress.misses || {}).sort((a, b) => b[1] - a[1]);
misses.slice(0, 30).forEach(([k, count]) => {
  const info = keyMap[k] || { hindi: k, raw: k };
  console.log(`${k.padEnd(12)} -> Hindi: '${info.hindi}' (raw: '${info.raw}') | Misses: ${count}`);
});

console.log('\n=== HINDI SLOWEST KEYS (profile.keys) ===');
const profileKeys = Object.entries(progress.profile.keys || {})
  .filter(([k]) => !k.includes('>'))
  .sort((a, b) => b[1].ms - a[1].ms);

profileKeys.slice(0, 25).forEach(([k, v]) => {
  const info = keyMap[k] || { hindi: k, raw: k };
  console.log(`${k.padEnd(14)} -> Hindi: '${info.hindi}' | Latency: ${Math.round(v.ms)}ms | Samples: ${v.samples ? v.samples.length : 0}`);
});

console.log('\n=== KEY PAIR BOTTLENECKS (profile.keys with >) ===');
const bigrams = Object.entries(progress.profile.keys || {})
  .filter(([k, v]) => k.includes('>') && v.samples && v.samples.length >= 3)
  .sort((a, b) => b[1].ms - a[1].ms);

bigrams.slice(0, 20).forEach(([pair, v]) => {
  const [k1, k2] = pair.split('>');
  const h1 = keyMap[k1] ? keyMap[k1].hindi : k1;
  const h2 = keyMap[k2] ? keyMap[k2].hindi : k2;
  console.log(`${pair.padEnd(24)} ('${h1}' -> '${h2}') : ${Math.round(v.ms)}ms (${v.samples.length} samples)`);
});

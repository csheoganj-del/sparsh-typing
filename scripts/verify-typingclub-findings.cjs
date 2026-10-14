// Research only. Inspect the public source map; never start the TypingClub app.
// Usage: node scripts/verify-typingclub-findings.cjs <downloaded-source-map>
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

async function main() {
  const map = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const index = map.sources.findIndex(name => name.endsWith('/js/typing/dynamic_typing.js') || name.endsWith('/legacy/dynamic_typing.ts'));
  assert(index >= 0, 'Dynamic lesson source missing');
  const source = stripTypeScriptTypes(map.sourcesContent[index]
    .replace(/^import api from 'lib\/api';\s*/, '')
    .replace('export async function', 'async function'));
  const pairs = ['ab', 'cd', 'ef', 'gh', 'ij', 'kl', 'mn', 'op', 'qr', 'st', 'uv', 'wx'];
  const stats = {};
  pairs.forEach((pair, i) => {
    stats[pair[1]] = { [pair[0]]: `${10 + i * 5}|1` };
  });
  const corpus = pairs.map(pair => [pair + 'y', 'z' + pair, pair + 'yy'].join(' ')).join(' ');
  const math = Object.create(Math);
  math.random = () => 0;
  let sourceCalls = 0;
  const sandbox = {
    Math: math,
    api: { getSubjectStats: resolve => { sourceCalls++; resolve([{ duals: stats }]); } },
    approuter: { stats: { getKeyboardStats: async () => { sourceCalls++; return { duals: stats }; } } },
    global: { profile: {} },
    fetch: () => { throw new Error('Network disabled in research verification'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(source + '\nthis.generate = generate_dynamic_lesson;', sandbox, { timeout: 1000 });
  const program = { subject_id: 'fixture', shared: { corpora: { fixture: corpus } } };
  async function generate(type) {
    const lesson = { activity: { dynamic_settings: { type, corpus: 'fixture' } } };
    const generated = await sandbox.generate(lesson, program);
    const text = typeof generated === 'string' ? generated : lesson.activity.text;
    if (typeof generated !== 'string') assert.equal(lesson.activity.dynamic_text_generated, true);
    return text.trim().split('\n').map(line => line.split(' '));
  }
  const progressive = await generate('progressive');
  assert.equal(progressive.length, 4, 'Select four qualifying weak pairs');
  progressive.forEach((line, i) => {
    assert.equal(line[0], pairs[i]);
    assert.equal(line[1], pairs[i]);
    assert.equal(line.length, 7);
    assert(line.slice(2, 4).every(fragment => fragment.length === 3));
    assert(line.slice(4).every(word => word.includes(pairs[i])));
  });
  const duals = await generate('duals');
  duals.forEach(line => { assert.equal(line.length, 6); assert.equal(line[0], line[2]); });
  const words = await generate('words');
  words.forEach(line => assert.equal(line.length, 4));

  // Accuracy affects the ranking: turn the last pair into the weakest pair.
  stats.x.w = '0|0.1';
  const reprioritized = await generate('progressive');
  assert.equal(reprioritized[0][0], 'wx');

  // Published small-history fallback uses glossary order rather than the ranked list.
  pairs.slice(5).forEach(pair => delete stats[pair[1]]);
  const sparse = await generate('progressive');
  assert.equal(sparse.length, 5);
  assert.deepEqual(sparse.map(line => line[0]), ['ab', 'by', 'za', 'yy', 'cd']);
  assert.equal(sourceCalls, 5);
  console.log('Verified public generator: score ranking, four-of-ten selection, progressive/duals/words output, and sparse-history fallback.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

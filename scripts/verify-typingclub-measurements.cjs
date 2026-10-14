// Research verification with a mocked clock and DOM; no application or network.
// Usage: node scripts/verify-typingclub-measurements.cjs <classic-app-source-map>
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const map = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
function sourceFor(suffix) {
  const index = map.sources.findIndex(name => name.endsWith(suffix));
  assert(index >= 0, 'Source missing: ' + suffix);
  return map.sourcesContent[index];
}
const utilSource = sourceFor('/typing/src/util.ts').replace(/export\s*\{[^}]+\};?\s*$/, '');
let coreSource = sourceFor('/typing/src/TypingCore.ts');
coreSource = coreSource.slice(coreSource.indexOf('const canUseKeyUpEvent'))
  .replace('export const AudioURLs', 'const AudioURLs')
  .replaceAll('import.meta.url', '"https://example.invalid/typing.js"')
  .replace(/export default TypingCore;?/, 'this.TypingCore = TypingCore;');
let gradingSource = sourceFor('/typing/src/scoring.ts');
gradingSource = gradingSource.slice(gradingSource.indexOf('function calculateRealAccuracy'))
  .replace(/export\s*\{[^}]+\};?\s*$/, 'this.grade = constructTypingResults;');

let clockMs = 100;
function events() {
  const handlers = new Map();
  return {
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
    off(name) { handlers.delete(name); },
    emit(name, data) { for (const fn of handlers.get(name) || []) fn(data); }
  };
}
const context = vm.createContext({
  URL, navigator: { platform: 'Win32', userAgent: 'Research fixture' },
  performance: { now: () => clockMs }, window: { focus: () => {} }, document: {}, mitt: events,
  getSpecialPunctuation: () => ({}), keycode: {},
  setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {}
});
vm.runInContext(stripTypeScriptTypes(utilSource) +
  '\nthis.util = { calc_wpm, calc_accuracy, getTime, check_if_input_needed, isIOS, isFirefox, isSafari, setTimeout: _setTimeout, setInterval: _setInterval };', context);
vm.runInContext(stripTypeScriptTypes(coreSource), context);
vm.runInContext(stripTypeScriptTypes(gradingSource), context);

function lesson(text, extra = {}) {
  clockMs = 100;
  const core = new context.TypingCore({ text, on_error: 'continue', profile_block_on_errors: 0,
    max_secs: 600, use_hand: 'both', no_input_mode: true, no_auto_end_lesson: true,
    no_beater: true, ...extra });
  core.goto_next_char();
  core.capturing = true; // Model an attached lesson without installing DOM listeners.
  return core;
}
function press(core, key, after = 100) { clockMs += after; core.record_keydown_time(key); }
const basic = lesson('abcd');
press(basic, 'a', 9000);
assert.equal(basic.stats.duration, 0, 'Time before first press is excluded');
press(basic, 'b', 100);
basic.pause();
clockMs += 5000;
basic.unpause();
press(basic, 'c', 100);
assert.equal(basic.stats.duration, 200, 'Explicit pause is subtracted');
assert.equal(basic.chars[2].dur, 100);

const idle = lesson('abcd');
press(idle, 'a');
clockMs += 10001;
idle.beat();
assert.equal(idle.paused, true, 'Ordinary lesson auto-pauses after ten idle seconds');
clockMs += 20000;
press(idle, 'b', 100);
assert.equal(idle.stats.duration, 10001, 'The pre-pause idle interval remains in raw timing');

const test = lesson('abcd', { is_test: true });
press(test, 'a');
clockMs += 10001;
test.beat();
assert.equal(test.paused, false, 'Timed tests keep running through idle time');

const corrected = lesson('abcd');
press(corrected, 'a');
press(corrected, 'x');
press(corrected, '<-');
press(corrected, 'b');
press(corrected, 'c');
press(corrected, 'd');
assert.equal(corrected.stats.valids, 4);
assert.equal(context.util.calc_accuracy(corrected.stats.valids, corrected.stats.total_chars), 100);
assert.equal(corrected.chars[1].real_valid, false, 'Correction does not erase the original mistake');
const grade = context.grade({ per_chr: corrected.chars, is_partial: 0 }, 96, 100, false, 96, 3, 80);
assert.equal(grade.attemptAttributes.real_accuracy, 75);
assert.equal(grade.performance, 75, 'Real accuracy affects performance even after correction');
assert.equal(context.util.calc_wpm(68, 20000), 41);
assert.equal(context.util.calc_wpm(60, 20000), 36);

console.log('Verified current engine: first-press timing, pause subtraction, ten-second idle pause, timed-test exception, corrected versus real accuracy, and scoring.');

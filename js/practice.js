/* Hindi practice toward 50 physical-key WPM. The practice40 storage key is retained. */
(function (root) {
  var KD = root.KD = root.KD || {};
  KD.PRACTICE_TARGET = 50;
  KD.mergePractice40 = function (a, b) {
    var bag = {};
    ((a && a.attempts) || []).concat((b && b.attempts) || []).forEach(function (r) {
      if (r && r.at && r.ms >= 120000 && Number.isFinite(r.wpm)) {
        var before = bag[r.at];
        bag[r.at] = Object.assign({}, before || {}, r);
        bag[r.at].sentenceIds = Array.from(new Set(((before && before.sentenceIds) || []).concat(r.sentenceIds || []))).filter(function (id) { return typeof id === 'string' && id.endsWith('।'); });
      }
    });
    var attempts = Object.keys(bag).map(function (k) { return bag[k]; }).sort(function (a, b) { return a.at - b.at; });
    // Storage-only consumers do not load the passage bank.
    var usage = {};
    [a, b].forEach(function (progress) {
      Object.keys(progress && progress.sentenceUsage || {}).forEach(function (id) {
        var row = progress.sentenceUsage[id];
        if (!row || typeof row !== 'object') return;
        var old = usage[id] || { count: 0, at: 0 };
        usage[id] = { count: Math.max(old.count, Number(row.count) || 0), at: Math.max(old.at, Number(row.at) || 0) };
      });
    });
    attempts.forEach(function (attempt) {
      if (!attempt.full) return;
      (attempt.sentenceIds || []).forEach(function (id) {
        var old = usage[id] || { count: 0, at: 0 };
        usage[id] = { count: old.count + (attempt.at > old.at ? 1 : 0), at: Math.max(old.at, attempt.at) };
      });
    });
    return { target: KD.PRACTICE_TARGET, attempts: attempts.slice(-120), sentenceUsage: usage };
  };
  KD.practice40State = function (store) {
    var allowed = Object.keys(store.placedKeys || {}).filter(function (k) { return store.placedKeys[k]; });
    KD.LESSONS.forEach(function (l) {
      if (store.unlockedAll || KD.lessonPassed(l, store)) (l.introduces || []).forEach(function (id) { if (allowed.indexOf(id) < 0) allowed.push(id); });
    });
    var seen = {}, bank = [];
    KD.LESSONS.forEach(function (l) {
      (l.tokens || []).concat(l.reviewPool || []).forEach(function (t) {
        if (!seen[t.k] && KD.allowedToken(t, allowed) && !KD.liveForm(t.k).wait && !/\s/.test(t.k)) { seen[t.k] = true; bank.push({ h: t.h, k: t.k }); }
      });
    });
    var words = bank.filter(function (t) { return t.k.length >= 2; });
    if (words.length >= 4) bank = words;
    var full = KD.hindiPassageActions().every(function (id) { return allowed.indexOf(id) >= 0; });
    var progress = KD.mergePractice40(store.practice40), attempts = progress.attempts, last = attempts[attempts.length - 1];
    var stable = attempts.slice(-3);
    var used = {}, fresh = stable.every(function (r) {
      if (!r.sentenceIds || !r.sentenceIds.length) return false;
      return r.sentenceIds.every(function (id) { if (used[id]) return false; used[id] = true; return true; });
    });
    return { allowed: allowed, bank: bank, full: full, last: last, attempts: attempts,
      sentenceUsage: progress.sentenceUsage, target: KD.PRACTICE_TARGET,
      canStart: allowed.indexOf('Space') >= 0 && bank.length >= 2,
      reached: stable.length === 3 && fresh && stable.every(function (r) { return r.full && !r.guided && r.wpm >= KD.PRACTICE_TARGET && r.acc >= 98 && r.realAcc >= 98; }),
      stage: !last ? 'Find your steady starting speed' : last.realAcc < 98 ? 'Accuracy first' : last.wpm < 20 ? 'Build smooth key combinations' : last.wpm < 30 ? 'Build a steady rhythm' : last.wpm < KD.PRACTICE_TARGET ? 'Build toward 50 WPM' : 'Repeat 50 WPM on fresh passages' };
  };
  KD.practice40Lesson = function (store, random) {
    var state = KD.practice40State(store), rng = random || Math.random;
    if (!state.canStart) return null;
    var tokens = [], selection = { sentenceIds: [], source: 'familiar-keys' };
    if (state.full) {
      selection = KD.selectHindiPassage({ count: 400, minActions: 2001, random: rng,
        sentenceUsage: KD.mergeSentenceUsage(state.sentenceUsage, store.live && store.live.sentenceUsage) });
      tokens = selection.tokens;
    }
    else {
      var keyCount = 0, previous = '';
      while (keyCount < 2001) {
        var choices = state.bank.filter(function (t) { return t.k !== previous; });
        if (!choices.length) choices = state.bank;
        var t = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
        tokens.push({ h: t.h, k: t.k }); keyCount += t.k.length + 1; previous = t.k;
      }
    }
    return { title: state.full ? 'Hindi passage · 2-minute speed check' : 'Familiar keys · 2-minute speed check',
      teach: 'Type steadily for two minutes. Backspace can repair a mistake. Aim for 98% first-try accuracy before pushing speed. The goal is 50 physical-key WPM (five correct key actions count as one word). ' + (state.full ? 'Unused sentences come first; the full sentence stays intact.' : 'Only keys you have learned appear here. This result does not measure full-keyboard Hindi speed.'),
      tokens: tokens, sentenceIds: selection.sentenceIds, source: selection.source, allowed: state.allowed, full: state.full };
  };
  KD.latestLessonRun = function (store) {
    var past = store && store.live && Array.isArray(store.live.past) ? store.live.past : [];
    for (var i = past.length - 1; i >= 0; i--) {
      var row = past[i];
      var wpm = row && Number(row.wpm);
      if (!row || row.pattern !== 'history' || !(wpm > 0) || !row.at) continue;
      return { at: row.at, wpm: wpm, acc: row.acc, id: row.id };
    }
    return null;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Hindi practice toward 40 physical-key WPM. No exam marks or selection forecast. */
(function (root) {
  var KD = root.KD = root.KD || {};
  KD.mergePractice40 = function (a, b) {
    var bag = {};
    ((a && a.attempts) || []).concat((b && b.attempts) || []).forEach(function (r) {
      if (r && r.at && r.ms >= 120000 && Number.isFinite(r.wpm)) bag[r.at] = r;
    });
    return { target: 40, attempts: Object.keys(bag).map(function (k) { return bag[k]; }).sort(function (a, b) { return a.at - b.at; }).slice(-120) };
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
    var full = KD.HI_SENTENCES.every(function (s) { return KD.allowedToken({ k: KD.unicodeToKruti(s.replace(/\s+/g, '')) }, allowed); });
    var attempts = KD.mergePractice40(store.practice40).attempts, last = attempts[attempts.length - 1];
    var stable = attempts.slice(-3);
    return { allowed: allowed, bank: bank, full: full, last: last, attempts: attempts,
      canStart: allowed.indexOf('Space') >= 0 && bank.length >= 2,
      reached: stable.length === 3 && stable.every(function (r) { return r.full && !r.guided && r.wpm >= 40 && r.acc >= 98 && r.realAcc >= 98; }),
      stage: !last ? 'Find your steady starting speed' : last.realAcc < 98 ? 'Accuracy first' : last.wpm < 20 ? 'Build smooth key combinations' : last.wpm < 30 ? 'Build a steady rhythm' : last.wpm < 40 ? 'Build toward 40 WPM' : 'Repeat 40 WPM on fresh passages' };
  };
  KD.practice40Lesson = function (store, random) {
    var state = KD.practice40State(store), rng = random || Math.random;
    if (!state.canStart) return null;
    var tokens = [];
    if (state.full) tokens = KD.buildHindiPassage(400);
    else {
      var keyCount = 0, previous = '';
      while (keyCount < 1801) {
        var choices = state.bank.filter(function (t) { return t.k !== previous; });
        if (!choices.length) choices = state.bank;
        var t = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
        tokens.push({ h: t.h, k: t.k }); keyCount += t.k.length + 1; previous = t.k;
      }
    }
    return { title: state.full ? 'Hindi passage · 2-minute speed check' : 'Familiar keys · 2-minute speed check',
      teach: 'Type steadily for two minutes. Backspace can repair a mistake. Aim for 98% first-try accuracy before pushing speed. The goal is 40 physical-key WPM (five correct key actions count as one word). ' + (state.full ? 'This is a fresh passage.' : 'Only keys you have learned appear here. This result does not measure full-keyboard Hindi speed.'),
      tokens: tokens, allowed: state.allowed, full: state.full };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

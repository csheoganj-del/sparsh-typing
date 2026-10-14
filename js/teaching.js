/* Hindi teaching rules adapted from verified public lesson-generation behavior.
   Physical Hindi actions and valid Devanagari fragments require local handling. */
(function (root) {
  var KD = root.KD;
  KD.actionId = function (step) { return step && step.code ? step.code + (step.shift ? '+S' : '') : ''; };
  KD.actionLabel = function (id) {
    var meta = KD.BY_CODE[String(id).replace(/\+S$/, '')];
    return meta ? (String(id).slice(-2) === '+S' ? 'Shift + ' : '') + meta.legend : id === 'Space' ? 'Space' : '';
  };
  KD.tokenActions = function (token) { return KD.stepsFromKruti(token.k).map(KD.actionId); };
  KD.allowedToken = function (token, allowed) {
    return KD.tokenActions(token).every(function (id) { return allowed.indexOf(id) >= 0; });
  };

  KD.lessonPassed = function (lesson, store) {
    if (!lesson) return false;
    store = store || {};
    if (lesson.scoreFree && ((store.learned || {})[lesson.id] || (lesson.parentId && (store.stars || {})[lesson.parentId] >= 1))) return true;
    if ((store.stars || {})[lesson.id] >= 1) return true;
    // Existing attempts keep their progression when the new teaching stages are inserted.
    if (lesson.parentId && (store.stars || {})[lesson.parentId] >= 1) return true;
    if (lesson.introduces && lesson.introduces.length) {
      return lesson.introduces.every(function (id) { return (store.placedKeys || {})[id]; });
    }
    if (lesson.required && lesson.required.length) return lesson.required.every(function (id) { return (store.placedKeys || {})[id]; }) &&
      (lesson.requiredPairs || []).every(function (id) { return (store.placedPairs || {})[id]; });
    return false;
  };
  KD.lessonUnlocked = function (lessons, index, store) {
    if (!lessons[index]) return false;
    if (store.unlockedAll || index === 0 || KD.lessonPassed(lessons[index], store)) return true;
    return KD.lessonPassed(lessons[index - 1], store);
  };
  KD.nextCourseLesson = function (lessons, store) {
    for (var i = 0; i < lessons.length; i++) if (!KD.lessonPassed(lessons[i], store) && KD.lessonUnlocked(lessons, i, store)) return i;
    return 0;
  };

  KD.checkTechnique = function (lesson, step, held) {
    if (lesson.anchor && !held[lesson.anchor]) return 'Hold ' + KD.actionLabel(lesson.anchor) + ' with the resting hand while the other hand types.';
    if (lesson.oppositeShift && step && step.shift) {
      var code = KD.shiftHand(step.finger) === 'left' ? 'ShiftLeft' : 'ShiftRight';
      var other = code === 'ShiftLeft' ? 'ShiftRight' : 'ShiftLeft';
      if (!held[code] || held[other]) return 'Hold the ' + (code === 'ShiftLeft' ? 'left' : 'right') + ' Shift with your little finger, then press ' + step.legend + '.';
    }
    return '';
  };

  function samples(row) { return row && Array.isArray(row.samples) ? row.samples : []; }
  KD.mergeMastery = function (a, b) {
    var out = { keys: {}, pairs: {} };
    ['keys', 'pairs'].forEach(function (kind) {
      var ids = Object.keys((a || {})[kind] || {}).concat(Object.keys((b || {})[kind] || {}));
      ids.forEach(function (id) {
        var seen = {};
        var combined = samples(a && a[kind] && a[kind][id]).concat(samples(b && b[kind] && b[kind][id])).filter(function (s) {
          if (!s || !Number.isFinite(s.at) || typeof s.ok !== 'boolean') return false;
          var key = s.at + ':' + s.ok + ':' + (s.ms || 0);
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        }).sort(function (x, y) { return x.at - y.at; }).slice(-24);
        out[kind][id] = { samples: combined };
      });
    });
    return out;
  };
  KD.noteSkill = function (mastery, step, previous, ok, dt, at) {
    mastery = mastery || { keys: {}, pairs: {} };
    mastery.keys = mastery.keys || {};
    mastery.pairs = mastery.pairs || {};
    var id = KD.actionId(step);
    if (!id || id === 'Space' || step.type === 'alt' || step.code === 'UNMAPPED') return mastery;
    var usable = ok && previous && dt >= 50 && dt <= 1600;
    function add(kind, key) {
      var list = samples(mastery[kind][key]).slice(-23);
      list.push({ at: at, ok: !!ok, ms: usable ? Math.round(dt) : 0 });
      mastery[kind][key] = { samples: list };
    }
    add('keys', id);
    if (previous && previous.id !== 'Space' && previous.ti === step.ti) add('pairs', previous.id + '>' + id);
    return mastery;
  };
  KD.skillSummary = function (row) {
    var list = samples(row);
    var correct = list.filter(function (s) { return s.ok; }).length;
    var timed = list.filter(function (s) { return s.ok && s.ms >= 50 && s.ms <= 1600; });
    return { n: list.length, accuracy: list.length ? correct / list.length * 100 : 100, errors: list.length - correct,
      timed: timed.length, avg: timed.length ? timed.reduce(function (sum, s) { return sum + s.ms; }, 0) / timed.length : 0 };
  };
  KD.recentWeakness = function (mastery, allowed) {
    var rows = [], times = [];
    Object.keys((mastery || {}).keys || {}).forEach(function (id) {
      if (allowed.indexOf(id) < 0) return;
      var s = KD.skillSummary(mastery.keys[id]);
      if (s.timed >= 4) times.push(s.avg);
    });
    times.sort(function (a, b) { return a - b; });
    var pace = times.length ? times[Math.floor(times.length / 2)] : 0;
    ['keys', 'pairs'].forEach(function (kind) {
      Object.keys((mastery || {})[kind] || {}).forEach(function (id) {
        if (!id.split('>').every(function (key) { return allowed.indexOf(key) >= 0; })) return;
        var s = KD.skillSummary(mastery[kind][id]);
        var slow = s.timed >= 4 && pace && s.avg / pace >= 1.35;
        if (s.n < 3 || (s.errors < 2 && !slow)) return;
        rows.push({ id: id, kind: kind === 'pairs' ? 'pair' : 'key', accuracy: s.accuracy, avg: s.avg,
          score: (s.errors / s.n * 10 + (slow ? Math.min(4, s.avg / pace) : 0)) * (kind === 'pairs' ? 1.15 : 1), reason: s.errors >= 2 ? 'accuracy' : 'speed' });
      });
    });
    return rows.sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
  };
  function contains(token, id) {
    var actions = KD.tokenActions(token), wanted = id.split('>');
    return actions.some(function (_, i) { return wanted.every(function (key, j) { return actions[i + j] === key; }); });
  }
  KD.progressiveReview = function (lesson, store, targetIds, random) {
    random = random || Math.random;
    var allowed = lesson.allowed || [];
    var seen = {}, glossary = {}, pool = (lesson.tokens || []).concat(lesson.reviewPool || []).filter(function (token) {
      if (seen[token.k] || !KD.allowedToken(token, allowed)) return false;
      seen[token.k] = true; return KD.tokenActions(token).length >= 2;
    });
    pool.forEach(function (token) {
      var actions = KD.tokenActions(token);
      for (var i = 1; i < actions.length; i++) {
        if (actions[i - 1] === 'Space' || actions[i] === 'Space') continue;
        var pair = actions[i - 1] + '>' + actions[i];
        var list = glossary[pair] || (glossary[pair] = []);
        if (list.indexOf(token) < 0) list.push(token);
      }
    });
    var pairs = Object.keys(glossary);
    if (!pairs.length) return null;
    pairs.forEach(function (id) {
      var words = glossary[id].filter(function (token) { var n = KD.tokenActions(token).length; return n > 2 && n < 12; });
      if (words.length) glossary[id] = words;
    });
    function summary(id) {
      var historic = store.profile && store.profile.pairs && store.profile.pairs[id];
      return historic ? KD.profileRow(historic) : KD.skillSummary(store.mastery && store.mastery.pairs && store.mastery.pairs[id]);
    }
    function score(id) {
      var s = summary(id);
      return s.n ? (s.avg ? Math.floor(12000 / s.avg) : 0) + 50 * s.accuracy / 100 : null;
    }
    var counts = pairs.map(function (id) { return glossary[id].length; });
    var max = Math.max.apply(null, counts), min = Math.min.apply(null, counts);
    var ranked = pairs.filter(function (id) { return score(id) != null; }).sort(function (a, b) {
      function weighted(id) { return score(id) / (1 + .2 * (max - glossary[id].length) / (max - min + 1)); }
      return weighted(a) - weighted(b) || a.localeCompare(b);
    });
    function pick(list) { var i = Math.min(list.length - 1, Math.floor(random() * list.length)); return list.length > 1 ? list.splice(i, 1)[0] : list[0]; }
    var selected;
    if (targetIds && targetIds.length) selected = pairs.filter(function (id) {
      return targetIds.some(function (target) { return id === target || id.split('>').indexOf(target) >= 0; });
    }).sort(function (a, b) { return (score(a) || 0) - (score(b) || 0); }).slice(0, 4);
    else if (ranked.length > 10) { selected = []; ranked = ranked.slice(0, 10); for (var r = 0; r < 4; r++) selected.push(pick(ranked)); }
    else selected = pairs.slice(0, 5);
    function wordScore(token) {
      var actions = KD.tokenActions(token), total = 0, n = 0;
      for (var i = 1; i < actions.length; i++) { var value = score(actions[i - 1] + '>' + actions[i]); if (value != null) { total += value; n++; } }
      return n ? total / n : Infinity;
    }
    function unit(raw, fallback) {
      var candidates = [raw, 'j' + raw, raw + 'j'];
      for (var i = 0; i < candidates.length; i++) {
        var k = candidates[i], h = KD.cleanUni(KD.krutiToUnicode(k));
        var token = { k: k, h: h };
        if (h && !/^[\u0900-\u0903\u093a-\u094d]/.test(h) && !/\u094d$/.test(h) && KD.allowedToken(token, allowed)) return token;
      }
      return { k: fallback.k, h: fallback.h };
    }
    var lines = [], tokens = [];
    selected.forEach(function (id, lineIndex) {
      var words = glossary[id].slice().sort(function (a, b) { return wordScore(a) - wordScore(b); }).slice(0, 6);
      var chosen = [pick(words), pick(words), pick(words)];
      var first = chosen[0], actions = KD.tokenActions(first), at = actions.findIndex(function (_, i) { return actions[i] + '>' + actions[i + 1] === id; });
      var pair = unit(first.k.slice(at, at + 2), first);
      var fragments = chosen.slice(0, 2).map(function (word) {
        var steps = KD.tokenActions(word), i = steps.findIndex(function (_, n) { return steps[n] + '>' + steps[n + 1] === id; });
        var start = i > 0 ? i - 1 : i;
        return unit(word.k.slice(start, start + 3), word);
      });
      var sequence = [pair, pair].concat(fragments, chosen);
      lines.push({ target: id, tokens: sequence });
      sequence.forEach(function (token) { tokens.push({ k: token.k, h: token.h, line: lineIndex }); });
    });
    return tokens.length ? { tokens: tokens, lines: lines, targets: selected } : null;
  };
  KD.buildRecovery = function (lesson, store, latestSlips) {
    var allowed = lesson.allowed || KD.buildSteps(lesson.tokens).filter(function (s) { return !s.space; }).map(KD.actionId);
    var pool = (lesson.tokens || []).concat(lesson.reviewPool || []).filter(function (token) { return KD.allowedToken(token, allowed); });
    var weak = KD.recentWeakness(store.mastery, allowed);
    var target = weak.find(function (row) { return pool.some(function (token) { return contains(token, row.id); }); });
    if (target) {
      var progressive = KD.progressiveReview(lesson, store, [target.id]);
      if (progressive) return { tokens: progressive.tokens, target: target, title: target.id.split('>').map(KD.actionLabel).join(' → '),
        teach: 'Practise the pair, then short fragments, then familiar words. Keep the presses steady and return to the lesson after this review.' };
    }
    var slipped = (latestSlips || []).map(function (sl) { return sl.word; });
    var focused = pool.filter(function (token) { return (target && contains(token, target.id)) || slipped.indexOf(token.h) >= 0; });
    var unique = {};
    focused = focused.filter(function (t) { if (unique[t.k]) return false; unique[t.k] = true; return true; }).sort(function (a, b) { return a.k.length - b.k.length; }).slice(0, 4);
    if (!focused.length) return null;
    var tokens = [];
    for (var i = 0; i < 12; i++) tokens.push(i % 3 === 2 && pool.length ? pool[i % pool.length] : focused[i % focused.length]);
    return { tokens: tokens, target: target || null, title: target ? target.id.split('>').map(KD.actionLabel).join(' → ') : focused[0].h,
      teach: (target && target.reason === 'speed' ? 'Keep an even rhythm. ' : 'Slow down and aim for clean presses. ') +
        'Practise the short combination first, then use it in familiar words. Return to the lesson after this short review.' };
  };
  KD.dynamicTokens = function (lesson, store) {
    var progressive = KD.progressiveReview(lesson, store);
    if (progressive) return progressive.tokens;
    var recovery = KD.buildRecovery(lesson, store, []);
    if (!recovery) return (lesson.tokens || []).slice();
    // Keep cumulative review as well as targeted practice; never add an unknown key.
    return recovery.tokens.slice(0, 8).concat((lesson.tokens || []).slice(0, 8));
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

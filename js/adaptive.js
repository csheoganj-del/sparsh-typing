/* Recent typing evidence drives the plan. Lifetime miss counters are historical,
   not proof that a key is still weak. These helpers do not mutate progress. */
(function (root) {
  var KD = root.KD = root.KD || {};

  function median(values) {
    var list = values.filter(function (n) { return Number.isFinite(n); }).sort(function (a, b) { return a - b; });
    if (!list.length) return 0;
    var middle = Math.floor(list.length / 2);
    return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  }
  function unique(list) { return list.filter(function (value, i) { return list.indexOf(value) === i; }); }
  function hash(text) {
    var value = 2166136261;
    for (var i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(36);
  }
  function learnedActions(store) {
    var allowed = Object.keys(store.placedKeys || {}).filter(function (id) { return store.placedKeys[id]; });
    (KD.LESSONS || []).forEach(function (lesson) {
      if (KD.lessonPassed(lesson, store)) (lesson.introduces || []).forEach(function (id) {
        if (allowed.indexOf(id) < 0) allowed.push(id);
      });
    });
    return allowed;
  }
  function actions(token) { return KD.tokenActions(token); }
  function contains(token, target) {
    var sequence = actions(token), wanted = target.split('>');
    return sequence.some(function (_, i) { return wanted.every(function (id, j) { return sequence[i + j] === id; }); });
  }

  // Words must round-trip through the physical layout and belong to the authored
  // vocabulary. A model's suggested word is never trusted as keyboard input.
  function vocabulary(store, allowed) {
    var bank = [], known = {};
    function add(word) {
      word = String(word || '').replace(/[।,!?;:"()]+$/g, '');
      if (!word || /\s/.test(word) || known[word]) return;
      var token = KD.safeToken(word);
      if (!token || !KD.allowedToken(token, allowed)) return;
      known[word] = token;
      bank.push(token);
    }
    Object.keys(KD.KEY_WORDS || {}).forEach(function (id) { KD.KEY_WORDS[id].forEach(add); });
    (KD.HI_SENTENCES || []).forEach(function (line) { String(line).split(/\s+/).forEach(add); });
    (KD.LESSONS || []).forEach(function (lesson) {
      if (lesson.section === 'words' || lesson.section === 'para' || /^w-/.test(lesson.id)) {
        (lesson.tokens || []).concat(lesson.bank || []).forEach(function (token) { add(token.h); });
      }
    });
    var suggested = {};
    ((store.coach || {}).drill || []).forEach(function (word) {
      if (typeof word !== 'string') return;
      var token = KD.safeToken(word.trim());
      if (token && known[token.h] && KD.allowedToken(token, allowed)) suggested[token.k] = true;
    });
    return { bank: bank, suggested: suggested };
  }

  function evidenceRow(row, kind) {
    var list = ((row || {}).samples || []).filter(function (sample) { return sample && typeof sample.ok === 'boolean'; }).slice(-24);
    var timed = list.filter(function (sample) { return sample.ok && sample.ms >= 50 && sample.ms <= 1600; });
    return {
      n: list.length,
      errors: list.filter(function (sample) { return !sample.ok; }).length,
      accuracy: list.length ? list.filter(function (sample) { return sample.ok; }).length / list.length * 100 : 100,
      avg: kind === 'profile' ? Number(row && row.ms) || 0 : timed.length ? timed.reduce(function (sum, sample) { return sum + sample.ms; }, 0) / timed.length : 0,
      timed: kind === 'profile' ? list.length : timed.length,
      at: list.reduce(function (latest, sample) { return Math.max(latest, Number(sample.at) || 0); }, 0)
    };
  }
  function recentSkills(store, allowed) {
    var skills = { keys: {}, pairs: {} }, pace = [], latest = 0;
    ['keys', 'pairs'].forEach(function (kind) {
      var ids = unique(Object.keys((store.profile || {})[kind] || {}).concat(Object.keys((store.mastery || {})[kind] || {})));
      ids.forEach(function (id) {
        if (!id.split('>').every(function (key) { return allowed.indexOf(key) >= 0 && KD.drillable(key); })) return;
        var predicted = evidenceRow(((store.profile || {})[kind] || {})[id], 'profile');
        var observed = evidenceRow(((store.mastery || {})[kind] || {})[id], 'mastery');
        var chosen = observed.n && observed.at >= predicted.at ? observed : predicted;
        if (!chosen.n) return;
        skills[kind][id] = chosen;
        latest = Math.max(latest, chosen.at);
      });
    });
    // An unvisited key from months ago cannot outrank current practice.
    var cutoff = latest - 14 * 24 * 60 * 60 * 1000;
    ['keys', 'pairs'].forEach(function (kind) {
      Object.keys(skills[kind]).forEach(function (id) {
        if (skills[kind][id].at < cutoff) delete skills[kind][id];
      });
    });
    Object.keys(skills.keys).forEach(function (id) {
      var row = skills.keys[id];
      if (row.n >= 4 && row.avg >= 50 && row.avg <= 1600) pace.push(row.avg);
    });
    return { keys: skills.keys, pairs: skills.pairs, pace: median(pace) };
  }

  function recentRuns(store) {
    var checks = [], lessons = [], seen = {};
    function add(row, kind) {
      if (!row || !row.at || !Number.isFinite(row.wpm) || !(row.wpm > 0) || row.guided || row.scoreFree) return;
      if (kind === 'check' && (!row.full || row.ms < 120000)) return;
      if (kind === 'lesson' && (row.pattern !== 'history' || (row.ms != null && row.ms < 15000))) return;
      var words = row.words || [], signature = (row.sentenceIds || []).join('|') || row.signature || words.join(' ');
      // Legacy lessons lack a duration. Require enough text to exclude tiny drills.
      if (kind === 'lesson' && row.ms == null && words.length < 12) return;
      var identity = kind + ':' + row.at;
      if (seen[identity]) return;
      seen[identity] = true;
      (kind === 'check' ? checks : lessons).push({
        at: row.at, wpm: Number(row.wpm), ms: row.ms,
        accuracy: Number.isFinite(row.realAcc) ? row.realAcc : null,
        signature: signature || (kind === 'check' ? 'fresh-check:' + row.at : ''),
        kind: kind
      });
    }
    ((store.practice40 || {}).attempts || []).forEach(function (row) { add(row, 'check'); });
    ((store.live || {}).past || []).forEach(function (row) { add(row, 'lesson'); });
    function fresh(rows) {
      var signatures = {};
      return rows.sort(function (a, b) { return b.at - a.at; }).filter(function (row) {
        if (row.signature && signatures[row.signature]) return false;
        if (row.signature) signatures[row.signature] = true;
        return true;
      }).slice(0, 8).reverse();
    }
    // A two-minute check and a short sentence are different measurements.
    return { rows: fresh(checks.length ? checks : lessons), kind: checks.length ? 'check' : 'lesson' };
  }

  KD.adaptivePlan = function (raw) {
    var store = raw || {}, allowed = learnedActions(store), skills = recentSkills(store, allowed);
    var candidates = [], retired = [], keyAccuracy = [], vocabularyData = vocabulary(store, allowed);
    ['keys', 'pairs'].forEach(function (kind) {
      Object.keys(skills[kind]).forEach(function (id) {
        var row = skills[kind][id], ratio = skills.pace && row.avg ? row.avg / skills.pace : 0;
        if (kind === 'keys' && row.n >= 4) keyAccuracy.push(row);
        var inaccurate = row.n >= 4 && (row.errors >= 2 || (row.n >= 8 && row.accuracy < 98));
        var slow = row.n >= 4 && row.timed >= 4 && row.avg <= 1600 && ratio >= 1.3;
        if (inaccurate || slow) candidates.push({ id: id, kind: kind === 'keys' ? 'key' : 'pair', reason: inaccurate ? 'accuracy' : 'speed',
          n: row.n, accuracy: row.accuracy, avg: row.avg,
          score: (100 - row.accuracy) / 5 + (slow ? Math.min(4, ratio) : 0) + (kind === 'pairs' ? 0.25 : 0) });
        else if (kind === 'keys' && row.n >= 8 && row.accuracy >= 98 && !slow && (store.misses || {})[id]) retired.push(id);
      });
    });
    candidates.sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
    var targets = candidates.slice(0, 6), selected = {};
    targets.forEach(function (target) { selected[target.id] = true; });
    // With no confirmed problem, rotate familiar combinations as review rather
    // than inventing a diagnosis or returning the learner to the first lesson.
    var pairs = {};
    vocabularyData.bank.forEach(function (token) {
      var ids = actions(token);
      for (var i = 1; i < ids.length; i++) {
        if (ids[i] === 'Space' || ids[i - 1] === 'Space') continue;
        var id = ids[i - 1] + '>' + ids[i];
        pairs[id] = (pairs[id] || 0) + 1;
      }
    });
    var recentDrills = ((store.adaptive || {}).drills || []);
    var lastSignature = recentDrills.length ? String((recentDrills[recentDrills.length - 1] || {}).signature || '') : '';
    var rotation = recentDrills.length * 7 + (lastSignature ? parseInt(hash(lastSignature), 36) : 0);
    var review = Object.keys(pairs).sort(function (a, b) { return pairs[b] - pairs[a] || a.localeCompare(b); });
    if (review.length) review = review.slice(rotation % review.length).concat(review.slice(0, rotation % review.length));
    review.sort(function (a, b) {
      return Number(a.split('>').some(function (id) { return retired.indexOf(id) >= 0; })) - Number(b.split('>').some(function (id) { return retired.indexOf(id) >= 0; }));
    });
    if (targets.length < 4) review.some(function (id) {
      if (!selected[id]) { selected[id] = true; targets.push({ id: id, kind: 'pair', reason: 'review', n: 0, accuracy: null, avg: 0 }); }
      return targets.length >= 4;
    });
    var runs = recentRuns(store), rows = runs.rows, speeds = rows.map(function (row) { return row.wpm; });
    var baseline = speeds.length ? median(speeds) : null;
    var accuracies = rows.map(function (row) { return row.accuracy; }).filter(function (value) { return value != null; });
    var sampleCount = keyAccuracy.reduce(function (sum, row) { return sum + row.n; }, 0);
    var firstTry = accuracies.length ? median(accuracies) : sampleCount ? keyAccuracy.reduce(function (sum, row) { return sum + row.n * row.accuracy; }, 0) / sampleCount : null;
    var comparable = rows.filter(function (row) { return !!row.signature; });
    var trend = comparable.length >= 5 ? median(comparable.slice(-3).map(function (row) { return row.wpm; })) - median(comparable.slice(0, 3).map(function (row) { return row.wpm; })) : 0;
    var spread = speeds.length ? Math.max.apply(null, speeds) - Math.min.apply(null, speeds) : 0;
    var accuracySpread = accuracies.length ? Math.max.apply(null, accuracies) - Math.min.apply(null, accuracies) : 0;
    var plateau = comparable.length >= 5 && spread <= Math.max(3, baseline * 0.1) && Math.abs(trend) <= 1 && accuracySpread <= 4;
    var focus = firstTry != null && firstTry < 98 ? 'accuracy' : candidates.length ? 'rhythm' : 'variety';
    var target = baseline == null ? null : Math.max(3, Math.min(50, focus === 'accuracy' ? Math.round(baseline * 0.97) : Math.floor(baseline + (plateau ? 1 : 2))));
    var measured = runs.kind === 'check' ? 'fresh two-minute checks' : 'fresh sentence runs';
    var note = baseline == null ? 'A fresh two-minute check will establish your starting speed. Practise familiar combinations with clean first presses.' :
      (plateau ? 'Your last ' + comparable.length + ' ' + measured + ' are near ' + Math.round(baseline) + ' WPM. ' : 'Recent ' + measured + ' are near ' + Math.round(baseline) + ' WPM. ') +
      (focus === 'accuracy' ? 'Aim for 98% first-try accuracy near ' + target + ' WPM before adding speed.' : 'Rotate combinations, then try ' + target + ' WPM with at least 98% first-try accuracy.');
    return { note: note, allowed: allowed, targets: targets, retiredKeys: retired,
      targetKeys: unique(targets.reduce(function (out, row) { return out.concat(row.id.split('>')); }, [])).slice(0, 6),
      targetPairs: targets.filter(function (row) { return row.kind === 'pair'; }).map(function (row) { return row.id; }).slice(0, 6),
      plateau: plateau, baselineWpm: baseline, targetWpm: target, targetAccuracy: 98, firstTryAccuracy: firstTry,
      comparableRuns: comparable.length, baselineSource: rows.length ? runs.kind : 'none', focus: focus };
  };

  KD.adaptiveRecovery = function (raw, random) {
    var store = raw || {}, plan = KD.adaptivePlan(store), allowed = plan.allowed, rng = random || Math.random;
    if (!allowed.length) return null;
    var data = vocabulary(store, allowed), bank = data.bank;
    var drills = (((store.adaptive || {}).drills) || []).slice(-8), signatures = {}, prior = {};
    drills.forEach(function (drill) {
      if (drill && drill.signature) signatures[drill.signature] = true;
      ((drill || {}).words || []).forEach(function (word) { prior[word] = (prior[word] || 0) + 1; });
    });
    var fragments = false;
    if (!bank.length) {
      fragments = true;
      var seen = {};
      (KD.LESSONS || []).forEach(function (lesson) {
        (lesson.tokens || []).forEach(function (token) {
          if (!seen[token.k] && KD.allowedToken(token, allowed) && KD.safeToken(token.h)) {
            seen[token.k] = true; bank.push({ k: token.k, h: token.h });
          }
        });
      });
    }
    if (!bank.length) return null;
    var targets = plan.targets.filter(function (target) { return bank.some(function (token) { return contains(token, target.id); }); });
    var tokens = [], signature = '';
    for (var attempt = 0; attempt < 8; attempt++) {
      tokens = [];
      var used = {}, offset = drills.length + attempt;
      var count = allowed.indexOf('Space') < 0 ? 1 : Math.min(24, Math.max(12, bank.length * 2));
      for (var i = 0; i < count; i++) {
        // Every fourth word broadens review beyond the current target.
        var target = targets.length && i % 4 !== 3 ? targets[(i + offset) % targets.length] : null;
        var choices = target ? bank.filter(function (token) { return contains(token, target.id); }) : bank.slice();
        if (!choices.length) choices = bank.slice();
        var previous = tokens.length ? tokens[tokens.length - 1].k : '';
        var alternative = choices.filter(function (token) { return token.k !== previous; });
        if (alternative.length) choices = alternative;
        choices = choices.map(function (token, index) { return { token: token, index: index,
          cost: (prior[token.h] || 0) * 3 + (used[token.k] || 0) * 8 + Math.max(0, actions(token).length - 12) +
            (data.suggested[token.k] ? -1 : 0) }; });
        choices.sort(function (a, b) { return a.cost - b.cost || a.index - b.index; });
        var bestCost = choices[0].cost;
        var varied = choices.filter(function (choice) { return choice.cost <= bestCost + 1; }).slice(0, 6);
        var pick = (Math.floor(rng() * varied.length) + offset + i) % varied.length;
        var token = varied[pick].token;
        tokens.push({ h: token.h, k: token.k }); used[token.k] = (used[token.k] || 0) + 1;
      }
      signature = 'drill-' + hash(tokens.map(function (token) { return token.k; }).join('|'));
      if (!signatures[signature]) break;
    }
    var labels = targets.slice(0, 3).map(function (target) { return target.id.split('>').map(KD.actionLabel).join(' → '); });
    return { title: fragments ? 'Familiar-key combinations' : 'Adaptive Hindi word practice',
      teach: fragments ? 'Practise known-key combinations until more letters are learned for Hindi word practice. Keep the presses steady.' :
        (labels.length ? 'Practise ' + labels.join(', ') + ' in varied familiar words. ' : 'Practise varied familiar words. ') +
        'Aim for clean first presses, then check your speed on a fresh passage.',
      tokens: tokens, allowed: allowed, targetKeys: plan.targetKeys, targetPairs: plan.targetPairs,
      signature: signature, words: tokens.map(function (token) { return token.h; }) };
  };

  function localDate(value) {
    var date = value instanceof Date ? value : new Date(value);
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    var result = {};
    parts.forEach(function (part) { result[part.type] = part.value; });
    return result.year + '-' + result.month + '-' + result.day;
  }
  function dayNumber(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
    var parts = date.split('-').map(Number), value = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    return new Date(value).toISOString().slice(0, 10) === date ? value / 86400000 : null;
  }
  function addDays(date, count) { return new Date((dayNumber(date) + count) * 86400000).toISOString().slice(0, 10); }
  function savedActivity(store) {
    var rows = [], seen = {};
    function add(row, id) {
      if (!row || !row.at || seen[row.at] || !(row.ms > 0)) return;
      seen[row.at] = true;
      id = id || row.id || '';
      rows.push({ at: row.at, ms: row.ms, kind: id === 'practice40' ? 'check' : /^exam-/.test(id) ? 'exam' :
        /^(adaptive|repair-|weak|coach)/.test(id) || row.adaptive ? 'drill' : 'lesson' });
    }
    ((store.practice40 || {}).attempts || []).forEach(function (row) { add(row, 'practice40'); });
    ((store.live || {}).past || []).forEach(function (row) { add(row); });
    Object.keys(store.tries || {}).forEach(function (id) { (store.tries[id] || []).forEach(function (row) { add(row, id); }); });
    (store.log || []).forEach(function (row) { add(row); });
    return rows;
  }

  KD.trainingProgram = function (raw, clock) {
    var store = raw || {}, now = clock == null ? Date.now() : Number(new Date(clock));
    if (!Number.isFinite(now)) now = Date.now();
    var today = localDate(now), training = store.training || {};
    var startDate = dayNumber(training.startDate) == null ? today : training.startDate;
    var duration = Math.max(1, Math.min(90, Math.round(Number(training.durationDays) || 20)));
    var goal = Math.max(3, Math.min(100, Number(training.goalWpm) || 50));
    var elapsed = dayNumber(today) - dayNumber(startDate), scheduledDay = elapsed + 1;
    var day = Math.max(1, Math.min(duration, scheduledDay));
    var status = scheduledDay < 1 ? 'upcoming' : scheduledDay > duration ? 'finished' : 'active';
    var plan = KD.adaptivePlan(store);
    var comparable = recentRuns(store), measuredBaseline = plan.baselineWpm;
    var savedBaseline = Number(training.baselineWpm);
    var baseline = Number.isFinite(savedBaseline) && savedBaseline > 0 ? savedBaseline : measuredBaseline != null ? measuredBaseline : 33;
    var estimated = Number.isFinite(savedBaseline) && savedBaseline > 0 ? !!training.baselineEstimated : measuredBaseline == null;
    var checks = ((store.practice40 || {}).attempts || []).filter(function (row) {
      return row && row.at && row.full && !row.guided && row.ms >= 120000 && row.wpm > 0;
    }).sort(function (a, b) { return a.at - b.at; });
    var checkSignatures = {};
    checks = checks.filter(function (row) {
      var signature = (row.sentenceIds || []).join('|') || row.signature || 'fresh-check:' + row.at;
      if (checkSignatures[signature]) return false;
      checkSignatures[signature] = true;
      return true;
    });
    var last = checks[checks.length - 1];
    var clean = !!(last && last.at <= now && last.at >= now - 7 * 86400000 && last.acc >= 98 && last.realAcc >= 98);
    var nextTarget = plan.targetWpm == null ? Math.round(baseline) : plan.targetWpm;
    var currentBaseline = measuredBaseline == null ? baseline : measuredBaseline;
    nextTarget = Math.max(3, Math.min(goal, Math.floor(currentBaseline + 2), nextTarget));
    if (!clean) nextTarget = Math.min(nextTarget, Math.max(3, Math.round(currentBaseline)));
    var light = day % 7 === 0;
    var phase = day <= 3 ? 'Establish clean rhythm' : day <= 7 ? 'Smooth common combinations' : day <= 12 ? 'Build sustained rhythm' :
      day <= 16 ? 'Transfer to new passages' : 'Repeat measured speed';
    if (light) phase = 'Light practice and recovery';
    if (status === 'finished') phase = 'Review your measured progress';
    var blocks = light ? [
      { title: 'Easy familiar words', minutes: 8, detail: 'Use a relaxed pace and consistent DevLys key mapping. Keep the first presses clean.' },
      { title: 'Read and transfer', minutes: 8, detail: 'Read a fresh passage and type comfortably. A speed check is optional today.' }
    ] : [
      { title: 'Accuracy and technique', minutes: 8, detail: 'Practise familiar words. Look at the text, use small relaxed movements, and keep your usual consistent fingering.' },
      { title: 'Targeted combinations', minutes: 8, detail: 'Rotate the recent difficult pairs through different Hindi words. Use the opposite Shift where appropriate.' },
      { title: 'Fresh passage and check', minutes: 8, detail: 'Complete one independent two-minute check without guides. Review first-try accuracy before another attempt.' },
      { title: 'Rhythm and transfer', minutes: 8, detail: clean ? 'If accuracy stays at 98% or above, try a relaxed 25-second rhythm burst, then return to normal pace on new text.' :
        'Stay near your comfortable pace. Add a short rhythm burst only after a fresh check reaches 98% first-try accuracy.' }
    ];
    var todayActivity = { checks: 0, fullChecks: 0, checkMinutes: 0, lessonMinutes: 0, drillMinutes: 0, examMinutes: 0, recordedMinutes: 0 };
    savedActivity(store).filter(function (row) { return localDate(row.at) === today; }).forEach(function (row) {
      var key = row.kind + 'Minutes';
      todayActivity[key] += row.ms / 60000;
      todayActivity.recordedMinutes += row.ms / 60000;
    });
    var seenChecks = {};
    ((store.practice40 || {}).attempts || []).forEach(function (row) {
      if (!row || seenChecks[row.at] || row.ms < 120000 || localDate(row.at) !== today) return;
      seenChecks[row.at] = true; todayActivity.checks++;
      if (row.full && !row.guided) todayActivity.fullChecks++;
    });
    Object.keys(todayActivity).forEach(function (key) { todayActivity[key] = Math.round(todayActivity[key] * 10) / 10; });
    var milestones = unique([1, Math.min(5, duration), Math.min(10, duration), Math.min(15, duration), duration]).map(function (checkpoint) {
      return { day: checkpoint, date: addDays(startDate, checkpoint - 1), targetWpm: Math.round(baseline + (goal - baseline) * checkpoint / duration), targetAccuracy: 98 };
    });
    var lastThree = checks.slice(-3);
    return { startDate: startDate, currentDate: today, endDate: addDays(startDate, duration - 1), durationDays: duration,
      day: day, scheduledDay: scheduledDay, status: status, daysRemaining: Math.max(0, duration - Math.max(0, elapsed)),
      phase: phase, lightDay: light, goalWpm: goal, targetAccuracy: 98, baselineWpm: baseline, baselineEstimated: estimated,
      baselineSource: Number.isFinite(savedBaseline) && savedBaseline > 0 ? (estimated ? 'estimate' : 'saved') : measuredBaseline == null ? 'estimate' : comparable.kind,
      nextTargetWpm: nextTarget, burstEligible: clean && !light && status === 'active', burstSeconds: 25,
      blocks: blocks, breakMinutes: 2, totalMinutes: blocks.reduce(function (sum, block) { return sum + block.minutes; }, 0) + (blocks.length - 1) * 2,
      today: todayActivity, milestones: milestones,
      goalReached: lastThree.length === 3 && lastThree.every(function (row) { return row.wpm >= goal && row.acc >= 98 && row.realAcc >= 98; }),
      qualifyingChecks: lastThree.filter(function (row) { return row.wpm >= goal && row.acc >= 98 && row.realAcc >= 98; }).length,
      note: 'The ' + duration + '-day calendar is a practice plan, not a prediction. Calendar targets are aspirational; your next speed target follows measured typing and accuracy. ' +
        (estimated ? 'The starting ' + Math.round(baseline) + ' WPM is an estimate until a fresh speed check is recorded.' : 'Lessons and short drills do not establish two-minute passage speed.') };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

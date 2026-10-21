(function (root) {
  var KD = root.KD = root.KD || {};

  KD.performanceFor = function (wpm, acc, lesson, realAcc) {
    wpm = Math.max(0, Math.min(200, Number(wpm) || 0));
    acc = Math.max(0, Math.min(100, Number(acc) || 0));
    realAcc = realAcc == null ? acc : Math.max(0, Math.min(100, Number(realAcc) || 0));
    if (lesson.scoreFree || acc < lesson.acc || wpm < lesson.min) return 0;
    return Math.min(200, acc * realAcc * wpm / (100 * Math.max(1, lesson.high || 1)));
  };
  KD.starsFor = function (wpm, acc, lesson, realAcc) {
    acc = acc || 0;
    wpm = wpm || 0;
    if (lesson.scoreFree) return 0;
    if (acc < lesson.acc || wpm < lesson.min) return 0;
    // The performance formula is public; equal 20-point star bands are our mapping.
    return Math.max(1, Math.min(5, Math.floor(KD.performanceFor(wpm, acc, lesson, realAcc) / 20)));
  };

  /* Recent clean speed. Short repair drills and guided repeats do not set the next bar. */
  KD.recentSpeeds = function (store) {
    store = store || {};
    var rows = [];
    var seen = {};
    function add(row, id) {
      if (!row || typeof row !== "object" || !row.at) return;
      var lessonId = id || row.id || "";
      if (/^repair-/.test(lessonId) || row.scoreFree || row.guided) return;
      var wpm = Number(row.wpm);
      if (!(wpm > 0)) return;
      var acc = row.acc == null ? row.realAcc : row.acc;
      if (acc != null && Number(acc) < 94) return;
      if (row.ms != null && Number(row.ms) < 8000) return;
      if (seen[row.at]) return;
      seen[row.at] = 1;
      rows.push({ at: row.at, wpm: wpm });
    }
    (store.log || []).forEach(function (row) { add(row, row && row.id); });
    var past = store.live && Array.isArray(store.live.past) ? store.live.past : [];
    past.forEach(function (row) { add(row, row && row.id); });
    var checks = store.practice40 && Array.isArray(store.practice40.attempts) ? store.practice40.attempts : [];
    checks.forEach(function (row) { add(row, "practice40"); });
    var tries = store.tries || {};
    Object.keys(tries).forEach(function (id) {
      (tries[id] || []).forEach(function (row) { add(row, id); });
    });
    rows.sort(function (a, b) { return a.at - b.at; });
    return rows.slice(-8).map(function (row) { return row.wpm; });
  };

  /* Cumulative speed across all completed typing runs.
     Calculates total words divided by total minutes across attempts so the
     speed reflects cumulative learning and updates with every practice. */
  KD.cumulativeSpeed = function (store) {
    if (!store) return null;
    var seen = {};
    var rows = [];
    function add(row, id) {
      if (!row || typeof row !== "object" || !row.at) return;
      var wpm = Number(row.wpm);
      if (!(wpm > 0)) return;
      if (row.scoreFree || row.guided) return;
      var lessonId = id || row.id || "";
      if (/^repair-/.test(lessonId)) return;
      if (seen[row.at]) return;
      seen[row.at] = 1;
      rows.push(row);
    }
    (store.log || []).forEach(function (r) { add(r, r && r.id); });
    var past = store.live && Array.isArray(store.live.past) ? store.live.past : [];
    past.forEach(function (r) { add(r, r && r.id); });
    var checks = store.practice40 && Array.isArray(store.practice40.attempts) ? store.practice40.attempts : [];
    checks.forEach(function (r) { add(r, "practice40"); });
    var tries = store.tries || {};
    Object.keys(tries).forEach(function (id) {
      (tries[id] || []).forEach(function (r) { add(r, id); });
    });
    if (!rows.length) return null;
    var totalWords = 0;
    var totalMinutes = 0;
    var wpmSum = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var wpm = Number(r.wpm);
      var ms = Number(r.ms);
      wpmSum += wpm;
      if (ms > 0) {
        var mins = ms / 60000;
        totalMinutes += mins;
        totalWords += wpm * mins;
      }
    }
    if (totalMinutes > 0 && totalWords > 0) {
      return Math.round((totalWords / totalMinutes) * 10) / 10;
    }
    return Math.round((wpmSum / rows.length) * 10) / 10;
  };

  /* Milliseconds to wait before the next cloud write. A paused store waits
     for hours. A failed write waits a minute. Ordinary saves wait a minute
     after the last success. */
  KD.CLOUD_PAUSE_MS = 6 * 60 * 60 * 1000;
  KD.cloudDelay = function (now, lastOk, failedAt, immediate, pausedUntil) {
    now = Number(now) || 0;
    lastOk = Number(lastOk) || 0;
    failedAt = Number(failedAt) || 0;
    pausedUntil = Number(pausedUntil) || 0;
    if (pausedUntil > now) return pausedUntil - now;
    if (failedAt && now - failedAt < 60000) return failedAt + 60000 - now;
    if (lastOk && now - lastOk < 60000) return immediate ? 0 : lastOk + 60000 - now;
    if (!lastOk && !immediate) return 1500;
    return 0;
  };

  /* The next speed line starts at recent speed, then rises by 2 WPM after
     a clean goal-speed run (or a legacy five-star run), up to the goal. */
  KD.starBars = function (store, base) {
    base = base || {};
    var floorMin = base.min == null ? 14 : base.min;
    var floorMid = base.mid == null ? 22 : base.mid;
    var floorHigh = base.high == null ? 32 : base.high;
    var cap = base.cap == null ? 50 : base.cap;
    var acc = base.acc == null ? 94 : base.acc;
    function pack(high) {
      high = Math.round(high);
      if (high > cap) high = cap;
      if (high < floorMin + 4) high = floorMin + 4;
      var min = high - 8;
      if (min < floorMin) min = floorMin;
      var mid = Math.round((min + high) / 2);
      if (mid <= min) mid = min + 1;
      if (mid >= high) mid = high - 1;
      if (min >= mid) min = Math.max(1, mid - 1);
      return { min: min, mid: mid, high: high, acc: acc };
    }
    var past = store && store.live && Array.isArray(store.live.past) ? store.live.past : [];
    var last = null;
    for (var i = past.length - 1; i >= 0; i--) {
      if (past[i] && past[i].pattern === "history" && past[i].high) { last = past[i]; break; }
    }
    if (last) {
      var cleanGoal = Number(last.wpm) >= Number(last.high) && Number(last.acc) >= 98 && Number(last.realAcc) >= 98;
      return pack((last.stars || 0) >= 5 || cleanGoal ? Number(last.high) + 2 : Number(last.high));
    }
    var speeds = KD.recentSpeeds(store);
    if (!speeds.length) return { min: floorMin, mid: floorMid, high: floorHigh, acc: acc };
    var ordered = speeds.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(ordered.length / 2);
    var median = ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
    return pack(median);
  };

  KD.keyWpm = function (keys, ms) {
    if (!ms || ms < 400) return 0;
    return (keys / 5) / (ms / 60000);
  };

  /* Per-lesson attempts. The tape is the playback. Caps keep localStorage small. */
  KD.pushAttempt = function (tries, id, attempt) {
    var book = tries && typeof tries === "object" && !Array.isArray(tries) ? tries : {};
    var list = Array.isArray(book[id]) ? book[id].slice() : [];
    var tape = [];
    var srcTape = attempt && attempt.tape ? attempt.tape : [];
    for (var i = 0; i < srcTape.length && tape.length < 240; i++) {
      var ev = srcTape[i];
      if (!ev) continue;
      tape.push({
        ok: ev.ok ? 1 : 0,
        t: ev.t || 0,
        si: ev.si == null ? -1 : ev.si,
        ti: ev.ti == null ? -1 : ev.ti,
        wi: ev.wi == null ? -1 : ev.wi
      });
    }
    var words = [];
    var srcWords = attempt && attempt.words ? attempt.words : [];
    for (var w = 0; w < srcWords.length && words.length < 80; w++) {
      if (srcWords[w]) words.push(String(srcWords[w]).slice(0, 32));
    }
    var slips = [];
    var srcSlips = attempt && attempt.slips ? attempt.slips : [];
    for (var s = 0; s < srcSlips.length && slips.length < 20; s++) {
      var sl = srcSlips[s];
      if (!sl) continue;
      slips.push({
        i: sl.i || 0,
        word: String(sl.word || ""),
        want: String(sl.want || ""),
        got: String(sl.got || "")
      });
    }
    list.push({
      at: attempt && attempt.at ? attempt.at : Date.now(),
      acc: attempt && attempt.acc ? attempt.acc : 0,
      realAcc: attempt && attempt.realAcc != null ? attempt.realAcc : null,
      wpm: attempt && attempt.wpm ? attempt.wpm : 0,
      stars: attempt && attempt.stars ? attempt.stars : 0,
      marks: !attempt || attempt.marks == null ? null : attempt.marks,
      ms: attempt && attempt.ms ? attempt.ms : 0,
      tape: tape,
      slips: slips,
      words: words
    });
    if (list.length > 8) list = list.slice(list.length - 8);
    book[id] = list;
    return book;
  };

  /* Playback tapes are the bulky part of a save. Keep them for the newest attempts only. */
  KD.slimTries = function (tries) {
    if (!tries || typeof tries !== "object" || Array.isArray(tries)) return {};
    var taped = [];
    Object.keys(tries).forEach(function (id) {
      (tries[id] || []).forEach(function (row) {
        if (row && Array.isArray(row.tape) && row.tape.length) taped.push(row);
      });
    });
    taped.sort(function (p, q) { return (q.at || 0) - (p.at || 0); });
    var keep = {};
    taped.slice(0, 12).forEach(function (row) { keep[row.at] = 1; });
    Object.keys(tries).forEach(function (id) {
      (tries[id] || []).forEach(function (row) {
        if (row && Array.isArray(row.tape) && row.tape.length && !keep[row.at]) delete row.tape;
      });
    });
    return tries;
  };

  KD.livePassageSignature = function (lesson) {
    if (!lesson || !Array.isArray(lesson.tokens) || !lesson.tokens.length) return "";
    return JSON.stringify([lesson.pattern || "", !!lesson.wordlock, lesson.tokens.map(function (token) {
      return [String(token && token.h || ""), String(token && token.k || "")];
    })]);
  };

  KD.liveLessonCompleted = function (lesson, past) {
    if (!lesson || !lesson.id) return false;
    var signature = KD.livePassageSignature(lesson);
    if (!signature) return false;
    return (Array.isArray(past) ? past : []).some(function (row) {
      if (!row || row.id !== lesson.id) return false;
      if (row.passageSig) return row.passageSig === signature;
      // Older saves kept only the first 24 display words, before full signatures.
      if (Array.isArray(row.words) && row.words.length) {
        return row.words.length <= lesson.tokens.length && row.words.every(function (word, index) {
          return word === lesson.tokens[index].h;
        });
      }
      return true;
    });
  };

  /* Union of two progress files. Stars stay at the better one. Nothing is dropped. */
  KD.mergeProgress = function (localStore, fileStore) {
    function copy(v) {
      if (v == null) return v;
      return JSON.parse(JSON.stringify(v));
    }
    function base(raw) {
      var s = raw && typeof raw === "object" && !Array.isArray(raw) ? copy(raw) : {};
      if (!s.stars || typeof s.stars !== "object" || Array.isArray(s.stars)) s.stars = {};
      if (!s.placed || typeof s.placed !== "object" || Array.isArray(s.placed)) s.placed = {};
      if (!s.learned || typeof s.learned !== "object" || Array.isArray(s.learned)) s.learned = {};
      if (!s.placedKeys || typeof s.placedKeys !== "object" || Array.isArray(s.placedKeys)) s.placedKeys = {};
      if (!s.placedPairs || typeof s.placedPairs !== "object" || Array.isArray(s.placedPairs)) s.placedPairs = {};
      if (!s.misses || typeof s.misses !== "object" || Array.isArray(s.misses)) s.misses = {};
      if (!s.settings || typeof s.settings !== "object" || Array.isArray(s.settings)) s.settings = { sound: true, hints: true };
      if (typeof s.settings.sound !== "boolean") s.settings.sound = true;
      if (typeof s.settings.hints !== "boolean") s.settings.hints = true;
      var textSize = parseInt(s.settings.textSize, 10);
      if (s.settings.textSize != null && !(textSize >= 18 && textSize <= 40)) delete s.settings.textSize;
      if (!s.touch || typeof s.touch !== "object" || Array.isArray(s.touch)) s.touch = { keys: {}, pairs: {}, rest: "" };
      if (!s.touch.keys || typeof s.touch.keys !== "object") s.touch.keys = {};
      if (!s.touch.pairs || typeof s.touch.pairs !== "object") s.touch.pairs = {};
      if (typeof s.touch.rest !== "string") s.touch.rest = "";
      if (!Array.isArray(s.log)) s.log = [];
      if (!s.tries || typeof s.tries !== "object" || Array.isArray(s.tries)) s.tries = {};
      if (!("bestHi" in s)) s.bestHi = null;
      if (!("bestEn" in s)) s.bestEn = null;
      return s;
    }
    function mergeMap(x, y) {
      var m = {};
      function take(src) {
        Object.keys(src || {}).forEach(function (id) {
          var row = src[id];
          if (!row || typeof row !== "object") return;
          if (!m[id] || (row.n || 0) > (m[id].n || 0)) m[id] = { n: row.n || 0, ms: row.ms || 0 };
        });
      }
      take(x);
      take(y);
      return m;
    }
    function better(x, y) {
      if (!y || y.marks == null) return x || null;
      if (!x || x.marks == null || y.marks > x.marks) return y;
      return x;
    }
    var a = base(localStore);
    var b = base(fileStore);
    var out = base(a);
    Object.keys(b).forEach(function (k) { if (!(k in out)) out[k] = b[k]; });
    Object.keys(b.stars).forEach(function (id) {
      out.stars[id] = Math.max(out.stars[id] || 0, b.stars[id] || 0);
    });
    Object.keys(b.placed).forEach(function (id) { if (b.placed[id]) out.placed[id] = true; });
    ['learned', 'placedKeys', 'placedPairs'].forEach(function (name) {
      Object.keys(b[name]).forEach(function (id) { if (b[name][id]) out[name][id] = true; });
    });
    if (KD.mergeMastery) out.mastery = KD.mergeMastery(a.mastery, b.mastery);
    if (KD.mergeProfile) out.profile = KD.mergeProfile(a.profile, b.profile);
    if (KD.mergePractice40) out.practice40 = KD.mergePractice40(a.practice40, b.practice40);
    function trainingDate(training) {
      var date = training && training.startDate;
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
      var parsed = new Date(date + "T00:00:00Z");
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
    }
    function chosenGoal(training) {
      var goal = Number(training && training.goalWpm);
      return goal === 45 || goal === 50 ? goal : 0;
    }
    function chosenBaseline(training) {
      var speed = Number(training && training.baselineWpm);
      if (!(speed > 0)) return null;
      return { wpm: speed, estimated: !!(training && training.baselineEstimated) };
    }
    var trainingDates = [trainingDate(a.training), trainingDate(b.training)].filter(Boolean).sort();
    if (trainingDates.length) {
      var baseline = chosenBaseline(a.training) || chosenBaseline(b.training);
      var otherBaseline = chosenBaseline(a.training) && chosenBaseline(b.training) ? chosenBaseline(b.training) : null;
      if (baseline && baseline.estimated && otherBaseline && !otherBaseline.estimated) baseline = otherBaseline;
      out.training = { startDate: trainingDates[0], goalWpm: chosenGoal(a.training) || chosenGoal(b.training) || 50, durationDays: 20 };
      if (baseline) {
        out.training.baselineWpm = baseline.wpm;
        out.training.baselineEstimated = baseline.estimated;
      }
    }
    else delete out.training;
    var drills = {};
    [a.adaptive, b.adaptive].forEach(function (adaptive) {
      (adaptive && Array.isArray(adaptive.drills) ? adaptive.drills : []).forEach(function (row) {
        if (!row || !Number.isFinite(row.at) || row.at <= 0 || typeof row.signature !== "string" || !row.signature) return;
        var key = row.at + ":" + row.signature;
        if (!drills[key] || JSON.stringify(row) < JSON.stringify(drills[key])) drills[key] = copy(row);
      });
    });
    if (a.adaptive || b.adaptive) {
      out.adaptive = Object.assign({}, b.adaptive || {}, a.adaptive || {});
      out.adaptive.drills = Object.keys(drills).map(function (key) { return drills[key]; }).sort(function (x, y) {
        return x.at - y.at || x.signature.localeCompare(y.signature);
      }).slice(-8);
    }
    Object.keys(b.misses).forEach(function (id) {
      out.misses[id] = Math.max(out.misses[id] || 0, b.misses[id] || 0);
    });
    out.bestHi = better(a.bestHi, b.bestHi);
    out.bestEn = better(a.bestEn, b.bestEn);
    out.touch = {
      keys: mergeMap(a.touch.keys, b.touch.keys),
      pairs: mergeMap(a.touch.pairs, b.touch.pairs),
      rest: a.touch.rest || b.touch.rest || ""
    };
    var seen = {};
    var logs = [];
    function addLog(row) {
      if (!row || typeof row !== "object") return;
      var key = (row.at || 0) + "|" + (row.id || "");
      if (seen[key]) return;
      seen[key] = 1;
      logs.push(row);
    }
    a.log.forEach(addLog);
    b.log.forEach(addLog);
    logs.sort(function (p, q) { return (p.at || 0) - (q.at || 0); });
    if (logs.length > 24) logs = logs.slice(logs.length - 24);
    out.log = logs;
    var ids = {};
    Object.keys(a.tries).forEach(function (id) { ids[id] = 1; });
    Object.keys(b.tries).forEach(function (id) { ids[id] = 1; });
    var tries = {};
    Object.keys(ids).forEach(function (id) {
      var bag = {};
      var list = [];
      function addTry(row) {
        if (!row || typeof row !== "object" || !row.at) return;
        if (bag[row.at]) {
          if (row.tape && row.tape.length && !(bag[row.at].tape && bag[row.at].tape.length)) {
            list[list.indexOf(bag[row.at])] = row;
            bag[row.at] = row;
          }
          return;
        }
        bag[row.at] = row;
        list.push(row);
      }
      (Array.isArray(a.tries[id]) ? a.tries[id] : []).forEach(addTry);
      (Array.isArray(b.tries[id]) ? b.tries[id] : []).forEach(addTry);
      list.sort(function (p, q) { return (p.at || 0) - (q.at || 0); });
      if (list.length > 8) list = list.slice(list.length - 8);
      tries[id] = list;
    });
    out.tries = KD.slimTries(tries);
    function coachOf(v) {
      if (!v || typeof v !== "object" || Array.isArray(v) || !v.note) return null;
      var repeat = [];
      if (Array.isArray(v.repeat)) {
        v.repeat.forEach(function (w) {
          if (typeof w === "string" && w) repeat.push(w.slice(0, 32));
        });
      }
      var drill = [];
      (Array.isArray(v.drill) ? v.drill : []).forEach(function (word) {
        if (typeof word !== "string") return;
        word = word.trim().slice(0, 64);
        if (word && drill.indexOf(word) < 0 && drill.length < 12) drill.push(word);
      });
      return {
        at: v.at || 0,
        note: String(v.note).slice(0, 280),
        repeat: repeat.slice(0, 8),
        drill: drill,
        source: v.source === "grok" || v.source === "gemini" ? v.source : "fingers"
      };
    }
    var coachA = coachOf(a.coach);
    var coachB = coachOf(b.coach);
    out.coach = !coachB ? coachA : (!coachA || (coachB.at || 0) >= (coachA.at || 0) ? coachB : coachA);
    function copyLive(v) {
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      return JSON.parse(JSON.stringify(v));
    }
    var liveA = copyLive(a.live);
    var liveB = copyLive(b.live);
    var live = liveA || liveB;
    if (liveA || liveB) {
      var seenLive = {};
      var pastLive = [];
      function addPast(list) {
        (Array.isArray(list) ? list : []).forEach(function (row) {
          if (!row || !row.id) return;
          var identity = row.id + ':' + (row.at || 0) + ':' + (row.passageSig || JSON.stringify(row.words || []));
          if (seenLive[identity]) return;
          seenLive[identity] = 1;
          pastLive.push(row);
        });
      }
      addPast(liveA && liveA.past);
      addPast(liveB && liveB.past);
      pastLive.sort(function (p, q) { return (p.at || 0) - (q.at || 0); });
      function hasLesson(src) { return !!(src && KD.livePassageSignature(src.lesson)); }
      function unfinished(src) { return hasLesson(src) && !KD.liveLessonCompleted(src.lesson, pastLive); }
      // A cursor saved later on another device cannot reopen a finished passage.
      var candidates = [liveA, liveB].filter(unfinished);
      candidates.sort(function (x, y) {
        return (Number(y.updatedAt) || 0) - (Number(x.updatedAt) || 0) ||
          ((y.past || []).length - (x.past || []).length) ||
          KD.livePassageSignature(x.lesson).localeCompare(KD.livePassageSignature(y.lesson)) ||
          String(x.lesson.id || "").localeCompare(String(y.lesson.id || ""));
      });
      live = copyLive(candidates[0] || live);
      if (!candidates.length && hasLesson(live)) live.lesson = null;
      live.past = pastLive.slice(-40);
      var usage = {};
      [liveA, liveB].forEach(function (src) {
        Object.keys(src && src.sentenceUsage || {}).forEach(function (line) {
          var row = src.sentenceUsage[line];
          if (!row || typeof row !== "object") return;
          var old = usage[line] || { count: 0, at: 0 };
          usage[line] = { count: Math.max(old.count, Number(row.count) || 0), at: Math.max(old.at, Number(row.at) || 0) };
        });
      });
      live.sentenceUsage = usage;
      var lessonId = live.lesson && live.lesson.id;
      var passageSig = KD.livePassageSignature(live.lesson);
      var completed = KD.liveLessonCompleted(live.lesson, pastLive);
      live.resume = null;
      function takeResume(src) {
        var r = src && src.resume;
        if (completed || !r || r.id !== lessonId || !passageSig || KD.livePassageSignature(src.lesson) !== passageSig ||
            (r.passageSig && r.passageSig !== passageSig)) return;
        var score = (r.i || 0) + (r.wi || 0) * 1000;
        var have = live.resume ? (live.resume.i || 0) + (live.resume.wi || 0) * 1000 : -1;
        var saved = Number(r.savedAt) || 0, currentSaved = live.resume && Number(live.resume.savedAt) || 0;
        if (saved || currentSaved) {
          if (saved > currentSaved || (saved === currentSaved && score > have)) live.resume = JSON.parse(JSON.stringify(r));
          return;
        }
        if (score >= have) live.resume = r;
      }
      takeResume(liveA);
      takeResume(liveB);
    }
    out.live = live;
    var localPlayed = Object.keys(a.stars).length > 0 || a.log.length > 0 || Object.keys(a.tries).length > 0;
    function textSizeOf(s) {
      var n = parseInt(s && s.settings && s.settings.textSize, 10);
      return n >= 18 && n <= 40 ? n : 0;
    }
    var picked = localPlayed ? a : b;
    var other = localPlayed ? b : a;
    out.settings = { sound: picked.settings.sound, hints: picked.settings.hints };
    ["keyboard", "hands", "metrics", "blockErrors"].forEach(function (name) {
      if (typeof picked.settings[name] === "boolean") out.settings[name] = picked.settings[name];
      else if (typeof other.settings[name] === "boolean") out.settings[name] = other.settings[name];
    });
    var textSize = textSizeOf(picked) || textSizeOf(other);
    if (textSize) out.settings.textSize = textSize;
    return out;
  };

  KD.hindiMarks = function (correctWords) {
    return Math.min(25, correctWords * 0.0625);
  };

  KD.englishMarks = function (correctWords) {
    return Math.min(25, correctWords * 0.05);
  };

  KD.buildSteps = function (tokens) {
    var steps = [];
    tokens.forEach(function (tok, ti) {
      if (ti > 0) {
        steps.push({ type: "key", code: "Space", shift: false, ch: " ", finger: "th", legend: "Space", ti: -1, space: true });
      }
      KD.stepsFromKruti(tok.k).forEach(function (st) {
        var copy = {};
        for (var p in st) copy[p] = st[p];
        copy.ti = ti;
        steps.push(copy);
      });
    });
    return steps;
  };

  /* A pause, or the first key after a mistake, is not a slow finger. */
  KD.noteTap = function (touch, prev, id, dt) {
    if (!touch || typeof touch !== "object" || Array.isArray(touch)) touch = { keys: {}, pairs: {}, rest: "" };
    if (!touch.keys) touch.keys = {};
    if (!touch.pairs) touch.pairs = {};
    if (typeof touch.rest !== "string") touch.rest = touch.rest ? String(touch.rest) : "";
    if (!id) return { touch: touch, prev: prev || null };
    var usable = prev && prev.id && typeof dt === "number" && dt >= 50 && dt <= 1600;
    if (usable) {
      var key = touch.keys[id] || { n: 0, ms: 0 };
      key.n += 1;
      key.ms += dt;
      touch.keys[id] = key;
      var pid = prev.id + ">" + id;
      var pair = touch.pairs[pid] || { n: 0, ms: 0 };
      pair.n += 1;
      pair.ms += dt;
      touch.pairs[pid] = pair;
    }
    return { touch: touch, prev: { id: id } };
  };

  KD.drillable = function (id) {
    if (!id || id === "Space" || id === "alt" || id === "UNMAPPED") return false;
    if (id.indexOf("alt:") === 0 || id.indexOf("UNMAPPED") === 0) return false;
    if (id.indexOf(">") >= 0) {
      var parts = id.split(">");
      return parts.length === 2 && KD.drillable(parts[0]) && KD.drillable(parts[1]);
    }
    return true;
  };

  function touchRows(map, pace, minN) {
    var rows = [];
    Object.keys(map || {}).forEach(function (id) {
      if (!KD.drillable(id)) return;
      var s = map[id];
      if (!s || !s.n || s.n < minN) return;
      var avg = s.ms / s.n;
      rows.push({ id: id, n: s.n, avg: avg, ratio: pace ? avg / pace : 1 });
    });
    rows.sort(function (a, b) { return b.avg - a.avg; });
    return rows;
  }

  KD.coachBoard = function (touch) {
    var keys = (touch && touch.keys) || {};
    var pairs = (touch && touch.pairs) || {};
    var n = 0;
    var ms = 0;
    Object.keys(keys).forEach(function (id) {
      if (!KD.drillable(id)) return;
      n += keys[id].n || 0;
      ms += keys[id].ms || 0;
    });
    var pace = n ? ms / n : 0;
    var keyRows = touchRows(keys, pace, 4);
    var pairRows = touchRows(pairs, pace, 3);
    function slow(rows) {
      return rows.filter(function (r) { return pace && r.ratio >= 1.35; }).slice(0, 5);
    }
    function fast(rows) {
      return rows.filter(function (r) { return pace && r.ratio <= 0.75; }).sort(function (a, b) { return a.avg - b.avg; }).slice(0, 5);
    }
    return {
      pace: pace,
      known: n,
      slowKeys: slow(keyRows),
      fastKeys: fast(keyRows),
      slowPairs: slow(pairRows),
      fastPairs: fast(pairRows)
    };
  };

  KD.planCoach = function (touch, misses, rest) {
    if (rest) return null;
    var board = KD.coachBoard(touch);
    var best = null;
    function consider(row, kind, minN) {
      if (!row || row.n < minN || !(row.ratio >= 1.35)) return;
      if (!best || row.ratio > best.ratio) {
        best = { kind: kind, id: row.id, avg: row.avg, ratio: row.ratio, n: row.n };
      }
    }
    (board.slowKeys || []).forEach(function (row) { consider(row, "key", 8); });
    (board.slowPairs || []).forEach(function (row) { consider(row, "pair", 5); });
    if (best) return best;
    var worst = null;
    Object.keys(misses || {}).forEach(function (code) {
      if (!KD.drillable(code)) return;
      var count = misses[code] || 0;
      if (count < 6) return;
      if (!worst || count > worst.n) worst = { kind: "key", id: code, avg: 0, n: count, fromMiss: true };
    });
    return worst;
  };

  /* Repeat the words whose keys this person is slow or wrong on. */
  KD.weightTokens = function (tokens, touch, misses, focus) {
    if (!tokens || !tokens.length) return [];
    var board = KD.coachBoard(touch || {});
    var slow = {};
    (board.slowKeys || []).forEach(function (r) { slow[r.id] = r.ratio || 1; });
    (board.slowPairs || []).forEach(function (r) { slow[r.id] = (r.ratio || 1) * 1.4; });
    var focusMap = {};
    (focus || []).forEach(function (w) { if (w) focusMap[w] = 1; });
    function tapId(st) {
      if (!st || st.type === "alt" || !st.code || st.code === "UNMAPPED" || st.code === "Space") return "";
      return st.shift ? st.code + "+S" : st.code;
    }
    function score(tok) {
      var s = 1;
      if (tok && focusMap[tok.h]) s += 8;
      var steps = KD.stepsFromKruti(tok && tok.k ? tok.k : "");
      var prev = "";
      for (var i = 0; i < steps.length; i++) {
        var id = tapId(steps[i]);
        if (!id) continue;
        if (misses && misses[id]) s += Math.min(misses[id], 8) * 0.35;
        if (slow[id]) s += slow[id];
        if (prev && slow[prev + ">" + id]) s += slow[prev + ">" + id];
        prev = id;
      }
      return s;
    }
    var ranked = tokens.map(function (t, i) { return { t: t, s: score(t), i: i }; });
    ranked.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    var reps = ranked.map(function (row, n) {
      return { t: row.t, left: n < 3 ? 3 : n < 7 ? 2 : 1 };
    });
    var out = [];
    var guard = 0;
    while (out.length < 24 && guard < 400) {
      guard++;
      var moved = false;
      for (var r = 0; r < reps.length; r++) {
        if (!reps[r].left) continue;
        out.push(reps[r].t);
        reps[r].left--;
        moved = true;
        if (out.length >= 24) break;
      }
      if (!moved) break;
    }
    return out;
  };

  KD.KEY_WORDS = {
    "KeyA+S": ["है।", "था।", "थी।", "थे।", "गया।", "किया।", "होगा।", "रहा।", "दिया।", "आया।", "बड़ा।"],
    "KeyA": ["में", "हैं", "नहीं", "गए", "संसार", "रंग", "संत", "गंगा"],
    "KeyS+S": ["है", "हैं", "मैं", "ऐसे", "कैसे", "वैसे", "मैदान", "पैसा", "बैठक", "तैयार", "सैनिक"],
    "KeyS": ["के", "से", "ने", "थे", "गए", "ऐसे", "रहते", "जाते", "करते", "होते", "खेलते", "देखते"],
    "KeyD+S": ["क्या", "क्यों", "क्योंकि", "वाक्य", "क्या?"],
    "KeyD": ["का", "के", "की", "को", "कर", "काम", "कल", "कभी", "कुछ", "कम", "कारण"],
    "KeyF+S": ["था", "थी", "थे", "साथ", "हाथ", "कथा", "स्थान", "तथा"],
    "KeyF": ["कि", "किया", "दिया", "लिया", "दिन", "सिर", "कवि", "चित्र", "शिक्षा", "विचार"],
    "KeyG+S": ["भला", "भाई", "भारत", "भाग", "भूमि", "भाव", "भोजन", "सभी", "अभ्यास"],
    "KeyG": ["है", "होगा", "हुआ", "ही", "हम", "हर", "हाथ", "हवा", "शहर"],
    "KeyH": ["की", "थी", "रही", "पानी", "गाड़ी", "नदी", "सही", "गली", "पूरी", "भारी", "जाती"],
    "KeyJ": ["रहा", "और", "पर", "रात", "राम", "रोग", "रोज", "रंग", "सरकार", "घर", "कर"],
    "KeyK": ["का", "गया", "किया", "रहा", "था", "होगा", "पूरा", "आया", "बड़ा", "चला"],
    "KeyL": ["से", "सब", "समय", "साथ", "साल", "साफ", "सेवा", "सुख", "सच", "सरकार", "सोच"],
    "Semicolon": ["यह", "वह", "या", "यदि", "योजना", "योग्य", "यात्री", "नया", "दया", "समय", "नियम"],
    "Quote": ["शाम", "शिक्षा", "देश", "आशा", "शब्द", "शान्ति", "शुरू", "शासक"],
    "KeyE": ["में", "मैं", "माता", "मित्र", "मन", "मार्ग", "मेला", "मौसम", "मकान"],
    "KeyR": ["तो", "तीन", "तार", "तेज", "तुरंत", "ताल", "तीर", "तैयार", "तरह", "तक", "ताजा"],
    "KeyT": ["जो", "जल", "जीवन", "जनता", "जगह", "जाना", "जीभ", "जवाब", "जमीन"],
    "KeyU": ["पर", "पानी", "पत्र", "पूरा", "पास", "पिता", "पुत्र", "पहले", "पाठ", "प्रकार"],
    "KeyI": ["बात", "बच्चे", "बड़ा", "बंद", "बार", "बहुत", "बाल", "बिना", "बिजली", "बैठक"],
    "KeyO": ["दिया", "दिन", "दो", "दुकान", "दर्द", "दान", "द्वार", "दवा", "दौड़", "देश"],
    "KeyP": ["चला", "चार", "चित्र", "चोट", "चाल", "चीज", "चमक", "चाहिए", "चर्चा"],
    "KeyW": ["खाना", "खेल", "खेत", "खुला", "खास", "खड़ा", "खोज", "खबर", "खतरा"],
    "KeyQ": ["फल", "फूल", "फिर", "फसल", "फाइल", "फर्क", "फैसला"],
    "KeyX": ["गया", "गए", "गांव", "गीत", "गुण", "गति", "गरीब", "गंभीर", "गुलाब"],
    "KeyC": ["धन", "धर्म", "धूप", "धारा", "धोबी", "धूल", "धीमे"],
    "KeyV": ["ने", "नहीं", "नाम", "नदी", "नया", "नीचे", "नेता", "नौकरी", "नियम", "नंबर"],
    "KeyB": ["वह", "वर्ष", "वाहन", "विचार", "विधि", "वर्ग", "विवरण", "विवाद"],
    "KeyN": ["लिया", "लोग", "लागू", "लेकिन", "लाभ", "लड़का", "लाल", "लेख", "लंबा"],
    "Backslash": ["क्या?", "करें?", "कौन?", "कब?", "क्यों?", "कैसे?"],
    "BracketRight": ["नाम,", "सूची,", "क्रम,", "दिनांक,", "स्थान,"]
  };

  KD.wordsForWeakness = function (id, count) {
    count = count || 16;
    var list = [];
    if (KD.KEY_WORDS[id]) list = list.concat(KD.KEY_WORDS[id]);
    if (String(id).indexOf(">") >= 0) {
      var parts = String(id).split(">");
      if (KD.KEY_WORDS[parts[0]]) list = list.concat(KD.KEY_WORDS[parts[0]]);
      if (KD.KEY_WORDS[parts[1]]) list = list.concat(KD.KEY_WORDS[parts[1]]);
    }
    var cleanCode = String(id).replace("+S", "");
    if (!list.length && KD.KEY_WORDS[cleanCode]) list = list.concat(KD.KEY_WORDS[cleanCode]);
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length && out.length < count; i++) {
      var w = list[i];
      if (seen[w]) continue;
      seen[w] = true;
      var tok = KD.safeToken(w);
      if (tok) out.push(tok);
    }
    return out;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

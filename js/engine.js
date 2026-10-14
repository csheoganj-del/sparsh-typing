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

  /* The next five-star line. It starts at recent speed, then rises by 2 WPM
     after a five-star history lesson, and it stops at the passage goal. */
  KD.starBars = function (store, base) {
    base = base || {};
    var floorMin = base.min == null ? 14 : base.min;
    var floorMid = base.mid == null ? 22 : base.mid;
    var floorHigh = base.high == null ? 32 : base.high;
    var cap = base.cap == null ? 40 : base.cap;
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
    if (last) return pack((last.stars || 0) >= 5 ? last.high + 2 : last.high);
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
    out.tries = tries;
    function coachOf(v) {
      if (!v || typeof v !== "object" || Array.isArray(v) || !v.note) return null;
      var repeat = [];
      if (Array.isArray(v.repeat)) {
        v.repeat.forEach(function (w) {
          if (typeof w === "string" && w) repeat.push(w.slice(0, 32));
        });
      }
      return {
        at: v.at || 0,
        note: String(v.note).slice(0, 280),
        repeat: repeat.slice(0, 8),
        source: v.source === "grok" || v.source === "gemini" ? v.source : "fingers"
      };
    }
    var coachA = coachOf(a.coach);
    var coachB = coachOf(b.coach);
    out.coach = !coachB ? coachA : (!coachA || (coachB.at || 0) >= (coachA.at || 0) ? coachB : coachA);
    function copyLive(v) {
      if (!v || typeof v !== "object" || !v.lesson || !Array.isArray(v.lesson.tokens) || !v.lesson.tokens.length) return null;
      return JSON.parse(JSON.stringify(v));
    }
    var liveA = copyLive(a.live);
    var liveB = copyLive(b.live);
    var live = null;
    if (liveA && liveB) live = (liveB.past || []).length > (liveA.past || []).length ? liveB : liveA;
    else live = liveA || liveB;
    if (live) {
      var seenLive = {};
      var pastLive = [];
      function addPast(list) {
        (list || []).forEach(function (row) {
          if (!row || !row.id || seenLive[row.id]) return;
          seenLive[row.id] = 1;
          pastLive.push(row);
        });
      }
      addPast(liveA && liveA.past);
      addPast(liveB && liveB.past);
      pastLive.sort(function (p, q) { return (p.at || 0) - (q.at || 0); });
      live.past = pastLive.slice(-40);
      var lessonId = live.lesson && live.lesson.id;
      if (!live.resume || live.resume.id !== lessonId) live.resume = null;
      function takeResume(src) {
        var r = src && src.resume;
        if (!r || r.id !== lessonId) return;
        var score = (r.i || 0) + (r.wi || 0) * 1000;
        var have = live.resume ? (live.resume.i || 0) + (live.resume.wi || 0) * 1000 : -1;
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

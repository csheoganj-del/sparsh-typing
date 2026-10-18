/* After the key path: common words, then the endings that close almost every
   Hindi sentence, then a fresh paragraph. One chapter opens at a time. */
(function (root) {
  var KD = root.KD = root.KD || {};

  KD.safeToken = function (h) {
    if (!h || typeof h !== "string" || h.length > 32) return null;
    var k = KD.unicodeToKruti(h);
    if (!k) return null;
    if (KD.cleanUni(KD.krutiToUnicode(k)) !== KD.cleanUni(h)) return null;
    var steps = KD.stepsFromKruti(k);
    for (var i = 0; i < steps.length; i++) {
      if (!steps[i] || steps[i].type === "alt" || steps[i].code === "UNMAPPED") return null;
    }
    return { k: k, h: h };
  };

  function must(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var tok = KD.safeToken(list[i]);
      if (!tok) throw new Error("Word has no finger keys: " + list[i]);
      out.push(tok);
    }
    return out;
  }

  function lesson(spec) {
    spec.min = spec.min || 14;
    spec.mid = spec.mid || 22;
    spec.high = spec.high || 32;
    spec.acc = spec.acc || 94;
    spec.hints = spec.hints || "hindi";
    spec.tokens = spec.bank ? spec.bank.slice() : [];
    return spec;
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  KD.lineTokens = function (lines) {
    var out = [];
    lines.forEach(function (line) {
      line.forEach(function (h) {
        var tok = KD.safeToken(h);
        if (tok) out.push(tok);
      });
    });
    return out;
  };

  KD.freshLines = function (lines, take) {
    var picked = shuffle(lines).slice(0, take);
    var out = [];
    picked.forEach(function (line) {
      line.forEach(function (h) {
        var tok = KD.safeToken(h);
        if (tok) out.push(tok);
      });
    });
    return out;
  };

  var flow = [
    ["यह", "काम", "पूरा", "था।"],
    ["पत्र", "का", "उत्तर", "देना", "था।"],
    ["बैठक", "आज", "थी।"],
    ["बच्चे", "वहां", "खेल", "रहे", "थे।"],
    ["योजना", "लागू", "की", "गई", "है।"],
    ["उसने", "सही", "जवाब", "दिया।"],
    ["काम", "समय", "पर", "हुआ", "है।"],
    ["लोगों", "को", "जानकारी", "देनी", "है।"],
    ["वह", "कल", "आया", "था।"],
    ["रिपोर्ट", "तैयार", "थी।"]
  ];

  var any = [
    ["किसान", "ने", "खेत", "में", "पानी", "दिया।"],
    ["कार्यालय", "आज", "बंद", "था।"],
    ["नया", "नियम", "कल", "से", "लागू", "है।"],
    ["उसे", "पुरस्कार", "मिला", "था।"],
    ["माता", "घर", "पर", "थी।"],
    ["स्वास्थ्य", "केंद्र", "खुला", "है।"],
    ["कृपया", "यह", "पत्र", "पढ़ें।"],
    ["सड़क", "पर", "वाहन", "धीमे", "थे।"],
    ["वर्ष", "के", "अंत", "में", "रिपोर्ट", "देनी", "थी।"],
    ["प्रधान", "ने", "बैठक", "बुलाई", "है।"],
    ["कर्मचारी", "समय", "पर", "पहुंचे", "थे।"],
    ["आदेश", "कल", "जारी", "हुआ", "था।"]
  ];

  function flat(lines) {
    var seen = {};
    var out = [];
    lines.forEach(function (line) {
      line.forEach(function (h) {
        if (seen[h]) return;
        seen[h] = 1;
        out.push(h);
      });
    });
    return must(out);
  }

  var steps = [];

  steps.push(lesson({
    id: "w-common",
    stage: "word",
    section: "words",
    title: "Most common words",
    skill: "w-common",
    finger: "whichever finger the word asks for",
    teach: "Almost every exam sentence stands on these: का, के, की, को, में, और, है. A word that is slow or wrong for you comes up more often in this lesson.",
    bank: must(["का", "के", "की", "को", "से", "में", "पर", "ने", "और", "यह", "वह", "भी", "तो", "ही", "जो", "एक", "नहीं"])
  }));

  steps.push(lesson({
    id: "w-paa",
    stage: "word",
    section: "words",
    title: "Long ā (ा)",
    skill: "w-paa",
    finger: "right middle, K",
    newKey: "KeyK",
    teach: "The vertical stroke is K. का, गया, किया, था — half of Hindi ends on this line. The ा mark is typed at the end. The short-i mark is typed first.",
    bank: must(["का", "गया", "किया", "दिया", "लिया", "हुआ", "रहा", "था", "होगा", "पूरा", "आया", "पड़ा", "बड़ा", "चला"])
  }));

  steps.push(lesson({
    id: "w-hai",
    stage: "end",
    section: "ending",
    title: "है and हैं",
    skill: "w-hai",
    finger: "ह, then the ै mark",
    teach: "है is the most common ending. है is ह then Shift+S. In हैं the bindu is the last stroke, on A. Practice stopping the sentence here.",
    bank: must(["है", "हैं", "मैं", "गए", "नहीं", "ऐसे", "कैसे", "वैसे", "है", "हैं"])
  }));

  steps.push(lesson({
    id: "w-tha",
    stage: "end",
    section: "ending",
    title: "था, थी, थे",
    skill: "w-tha",
    finger: "ा, ी, and े",
    teach: "था ends on the vertical stroke. थी ends on long ī. थे ends on े. रहता, जाता, करता, होता show up in almost every paragraph. The finger should hit them without a pause.",
    bank: must(["था", "थी", "थे", "रहता", "रहती", "रहते", "जाता", "जाती", "जाते", "करता", "करती", "करते", "होता", "होती", "होते"])
  }));

  steps.push(lesson({
    id: "w-close",
    stage: "end",
    section: "ending",
    title: "Endings and the danda",
    skill: "w-close",
    finger: "the word, then left little on Shift+A",
    newKey: "KeyA",
    teach: "A sentence ends with the word and then । at once. The danda is Shift+A, left little, right Shift. है। था। थी। थे। किया। Space comes after the danda.",
    bank: must(["है।", "हैं।", "था।", "थी।", "थे।", "गया।", "किया।", "होगा।", "दिया।", "रहा।", "रही।", "हुए।"])
  }));

  steps.push(lesson({
    id: "w-marks",
    stage: "end",
    section: "ending",
    title: "Question, comma, digits",
    skill: "w-marks",
    finger: "marks use a finger too",
    teach: "The question mark is backslash. The comma is ]. Digits are the number row without Shift. A date and a year still take a danda after them.",
    bank: must(["क्या?", "करें?", "नाम,", "पता।", "दिनांक", "12।", "वर्ष", "2024।", "सूची,", "क्रम।"])
  }));

  steps.push(lesson({
    id: "p-flow",
    stage: "para",
    section: "para",
    title: "Short sentences",
    skill: "p-flow",
    finger: "whole hand",
    wordlock: true,
    teach: "The master sentence is on top. You type below. These sentences stay the same every time. After you start, no new word is added. Space locks the word. Do not hesitate on है। था। थी। थे।",
    bank: flat(flow),
    fresh: function () { return KD.lineTokens(flow); },
    hints: "hindi",
    min: 16,
    mid: 24,
    high: 34
  }));

  steps.push(lesson({
    id: "p-any",
    stage: "para",
    section: "para",
    title: "Any paragraph",
    skill: "p-any",
    finger: "no key light",
    wordlock: true,
    teach: "The real setup. Paragraph on top, typing below. The key light is off. Sentence order changes when you start. After that, not one new word is added.",
    bank: flat(any),
    fresh: function () { return KD.freshLines(any, 8); },
    hints: "none",
    min: 18,
    mid: 26,
    high: 36
  }));

  KD.LESSONS = KD.LESSONS.concat(steps);
  KD.SECTIONS = KD.SECTIONS.concat([
    { id: "words", title: "Words", blurb: "The most common words, then the long-ā stroke." },
    { id: "ending", title: "Sentence endings", blurb: "है, था थी थे, the danda, the question mark." },
    { id: "para", title: "Any paragraph", blurb: "Master on top, typing below. A new order each start." }
  ]);

  /* One new target, frozen when the lesson starts. A pattern is mastered only
     when its latest attempt has 3 stars and no slip. The next lesson mixes
     that target with words from every earlier lesson. A character is drilled
     alone before any word may contain it. */
  var PATTERNS = [
    { id: "common", title: "Common words", words: ["का", "के", "की", "को", "से", "में", "पर", "ने", "और", "यह", "वह", "भी", "तो", "ही", "जो", "एक", "नहीं"] },
    { id: "paa", title: "Long ā (ा)", words: ["का", "गया", "किया", "दिया", "लिया", "हुआ", "रहा", "था", "होगा", "पूरा", "आया", "पड़ा", "बड़ा", "चला"] },
    { id: "hai", title: "है and हैं", words: ["है", "हैं", "मैं", "गए", "नहीं", "ऐसे", "कैसे", "वैसे"] },
    { id: "tha", title: "था, थी, थे", words: ["था", "थी", "थे", "रहता", "रहती", "रहते", "जाता", "जाती", "जाते", "करता", "करती", "करते", "होता", "होती", "होते"] },
    { id: "sym-danda", title: "Danda ।", ch: "।" },
    { id: "close", title: "। in words", uses: "।", words: ["है।", "हैं।", "था।", "थी।", "थे।", "गया।", "किया।", "होगा।", "दिया।", "रहा।", "रही।", "पता।"] },
    { id: "sym-q", title: "Question ?", ch: "?" },
    { id: "sym-q-use", title: "? in words", uses: "?", words: ["क्या?", "करें?"] },
    { id: "sym-comma", title: "Comma ,", ch: "," },
    { id: "sym-comma-use", title: ", in words", uses: ",", words: ["नाम,", "सूची,"] },
    { id: "sym-stop", title: "Full stop .", ch: "." },
    { id: "sym-stop-use", title: ". in words", uses: ".", words: ["का.", "है.", "था."] },
    { id: "sym-hyphen", title: "Hyphen -", ch: "-" },
    { id: "sym-hyphen-use", title: "- in words", uses: "-", words: ["का-के", "माता-पिता"] },
    { id: "num-4", title: "Digit 4", ch: "4" },
    { id: "num-4-use", title: "4 in words", uses: "4", words: ["4।", "44।", "4,"] },
    { id: "num-5", title: "Digit 5", ch: "5" },
    { id: "num-5-use", title: "5 in words", uses: "5", words: ["5।", "45।", "54।"] },
    { id: "num-6", title: "Digit 6", ch: "6" },
    { id: "num-6-use", title: "6 in words", uses: "6", words: ["6।", "56।", "46।"] },
    { id: "num-7", title: "Digit 7", ch: "7" },
    { id: "num-7-use", title: "7 in words", uses: "7", words: ["7।", "67।", "47।"] },
    { id: "num-3", title: "Digit 3", ch: "3" },
    { id: "num-3-use", title: "3 in words", uses: "3", words: ["3।", "43।", "34।"] },
    { id: "num-8", title: "Digit 8", ch: "8" },
    { id: "num-8-use", title: "8 in words", uses: "8", words: ["8।", "48।", "84।"] },
    { id: "num-2", title: "Digit 2", ch: "2" },
    { id: "num-2-use", title: "2 in words", uses: "2", words: ["2।", "24।", "42।"] },
    { id: "num-9", title: "Digit 9", ch: "9" },
    { id: "num-9-use", title: "9 in words", uses: "9", words: ["9।", "49।", "94।"] },
    { id: "num-1", title: "Digit 1", ch: "1" },
    { id: "num-1-use", title: "1 in words", uses: "1", words: ["1।", "12।", "14।"] },
    { id: "num-0", title: "Digit 0", ch: "0" },
    { id: "num-0-use", title: "0 in words", uses: "0", words: ["0।", "10।", "20।", "2024।"] },
    { id: "markwords", title: "Marks in words", words: ["क्या?", "करें?", "नाम,", "पता।", "दिनांक", "12।", "वर्ष", "2024।"] },
    { id: "lines", title: "Sentences", lines: flow }
  ];

  function patternById(id) {
    for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i].id === id) return PATTERNS[i];
    return null;
  }

  function pastOf(store) {
    return store && store.live && Array.isArray(store.live.past) ? store.live.past : [];
  }

  function rowClean(row, past) {
    if (!row || (row.stars || 0) < 3) return false;
    if (!row.slips || !row.slips.length) return true;
    if (past && Array.isArray(past)) {
      var attempts = 0;
      for (var i = 0; i < past.length; i++) {
        if (past[i] && past[i].pattern === row.pattern) attempts++;
      }
      if (attempts >= 2) {
        var pat = patternById(row.pattern);
        var targetCh = pat && pat.ch ? pat.ch : "";
        var targetUses = pat && pat.uses ? pat.uses : "";
        var hitTarget = false;
        for (var s = 0; s < row.slips.length; s++) {
          var slip = row.slips[s];
          if (targetCh && slip === targetCh) hitTarget = true;
          if (targetUses && slip && slip.indexOf(targetUses) >= 0) hitTarget = true;
        }
        if (!hitTarget) return true;
      }
    }
    return false;
  }

  function patternCleared(store, pattern) {
    if (!pattern) return false;
    var past = pastOf(store);
    for (var i = past.length - 1; i >= 0; i--) {
      if (past[i].pattern === pattern.id) return rowClean(past[i], past);
    }
    return false;
  }

  function onTrack(pattern) {
    return !!(pattern && (pattern.ch || pattern.uses || pattern.id === "markwords" || pattern.id === "lines"));
  }

  function reachedTrack(store) {
    var past = pastOf(store);
    for (var i = 0; i < past.length; i++) {
      if (past[i].pattern === "marks" || onTrack(patternById(past[i].pattern))) return true;
    }
    return false;
  }

  function choosePattern(store) {
    var past = pastOf(store);
    var last = past.length ? past[past.length - 1] : null;
    var lastPat = last ? patternById(last.pattern) : null;
    if (lastPat && !rowClean(last, past)) return lastPat;
    if (reachedTrack(store) || (last && last.pattern === "marks")) {
      for (var d = 0; d < PATTERNS.length; d++) {
        if (!onTrack(PATTERNS[d])) continue;
        if (!patternCleared(store, PATTERNS[d])) return PATTERNS[d];
      }
      return patternById("lines");
    }
    for (var n = 0; n < PATTERNS.length; n++) {
      if (!patternCleared(store, PATTERNS[n])) return PATTERNS[n];
    }
    return PATTERNS[PATTERNS.length - 1];
  }

  function tok(h) {
    return KD.safeToken(h);
  }

  function visited(store, id) {
    var past = pastOf(store);
    for (var i = 0; i < past.length; i++) if (past[i].pattern === id) return true;
    return false;
  }

  function closedSpecials(store, except) {
    var closed = "";
    for (var i = 0; i < PATTERNS.length; i++) {
      var ch = PATTERNS[i].ch;
      if (!ch) continue;
      if (except && except.indexOf(ch) >= 0) continue;
      if (!patternCleared(store, PATTERNS[i])) closed += ch;
    }
    return closed;
  }

  function exceptOf(pattern) {
    return pattern && pattern.uses ? pattern.uses : "";
  }

  function wordOk(h, closed) {
    if (!h || h === "Space") return false;
    for (var i = 0; i < h.length; i++) {
      if (closed.indexOf(h.charAt(i)) >= 0) return false;
    }
    return true;
  }

  function listsFor(store, pattern) {
    var lists = [];
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i];
      if (p.id === pattern.id) break;
      if (!p.words || !p.words.length) continue;
      if (!patternCleared(store, p) && !visited(store, p.id)) continue;
      lists.push(p.words);
    }
    var chars = [];
    for (var c = 0; c < PATTERNS.length; c++) {
      var item = PATTERNS[c];
      if (item.id === pattern.id) break;
      if (item.ch && patternCleared(store, item)) chars.push(item.ch);
    }
    if (chars.length) lists.push(chars);
    return lists;
  }

  function collectSlips(store) {
    var past = pastOf(store);
    var out = [];
    var seen = {};
    for (var i = past.length - 1; i >= 0; i--) {
      var slips = past[i].slips || [];
      for (var s = 0; s < slips.length; s++) {
        var w = slips[s];
        if (!w || w === "Space" || seen[w]) continue;
        seen[w] = 1;
        out.push(w);
      }
    }
    return out;
  }

  function pushNew(seq, seen, h) {
    if (!h || seen[h]) return false;
    var t = tok(h);
    if (!t) return false;
    seen[h] = 1;
    seq.push(t);
    return true;
  }

  function addAllowed(seq, seen, words, closed, limit, maxAdd) {
    var added = 0;
    for (var i = 0; i < words.length && seq.length < limit && added < maxAdd; i++) {
      if (!wordOk(words[i], closed)) continue;
      if (pushNew(seq, seen, words[i])) added++;
    }
  }

  function fillLists(seq, seen, lists, closed, cap) {
    var i = 0;
    var guard = 0;
    while (seq.length < cap && guard < 80) {
      var pending = false;
      for (var L = 0; L < lists.length; L++) {
        var words = lists[L];
        if (i >= words.length) continue;
        pending = true;
        if (seq.length >= cap) break;
        if (!wordOk(words[i], closed)) continue;
        pushNew(seq, seen, words[i]);
      }
      if (!pending) break;
      i++;
      guard++;
    }
  }

  function charLesson(pattern, store) {
    var cap = 16;
    var seq = [];
    var seen = {};
    var closed = closedSpecials(store, "");
    var lists = listsFor(store, pattern);
    var lead = lists.length ? 4 : 6;
    var t = tok(pattern.ch);
    for (var n = 0; n < lead; n++) if (t) seq.push(t);
    var reserve = Math.min(lists.length, 8);
    if (lead + reserve > cap) reserve = Math.max(0, cap - lead);
    var room = cap - reserve;
    addAllowed(seq, seen, collectSlips(store), closed, room, 3);
    fillLists(seq, seen, lists, closed, cap);
    var coach = store && store.coach && Array.isArray(store.coach.repeat) ? store.coach.repeat : [];
    addAllowed(seq, seen, coach, closed, cap, 4);
    var onlyCh = true;
    for (var i = 0; i < seq.length; i++) if (seq[i].h !== pattern.ch) onlyCh = false;
    if (onlyCh && t) while (seq.length < 12) seq.push(t);
    return seq;
  }

  function wordLesson(pattern, store) {
    var cap = 18;
    var seq = [];
    var seen = {};
    var closed = closedSpecials(store, exceptOf(pattern));
    var slips = collectSlips(store);
    addAllowed(seq, seen, slips, closed, cap, 4);
    (pattern.words || []).forEach(function (h) {
      if (seq.length >= cap || !wordOk(h, closed)) return;
      pushNew(seq, seen, h);
    });
    var coach = store && store.coach && Array.isArray(store.coach.repeat) ? store.coach.repeat : [];
    addAllowed(seq, seen, coach, closed, cap, 4);
    fillLists(seq, seen, listsFor(store, pattern), closed, cap);
    if (slips[0] && seq.length < cap && wordOk(slips[0], closed)) {
      var extra = tok(slips[0]);
      if (extra) seq.push(extra);
    }
    return seq;
  }

  function lineLesson(store) {
    var past = pastOf(store);
    var last = past.length ? past[past.length - 1] : null;
    var slips = {};
    if (last) (last.slips || []).forEach(function (w) { slips[w] = 1; });
    var done = 0;
    past.forEach(function (row) {
      if (row.pattern === "lines" && (row.stars || 0) >= 3) done++;
    });
    var start = (done * 2) % flow.length;
    var lines = flow.slice(start).concat(flow.slice(0, start));
    lines.sort(function (a, b) {
      function sc(line) {
        var s = 0;
        line.forEach(function (w) { if (slips[w]) s += 5; });
        return s;
      }
      return sc(b) - sc(a);
    });
    var out = [];
    lines.slice(0, 4).forEach(function (line) {
      line.forEach(function (h) {
        var t = tok(h);
        if (t) out.push(t);
      });
    });
    return out;
  }

  function liveCopy(store, pattern) {
    var past = pastOf(store);
    var last = past.length ? past[past.length - 1] : null;
    var n = past.length + 1;
    var linked = listsFor(store, pattern).length > 0;
    var link = linked ? " Words from every earlier lesson are in this list." : "";
    var why = [];
    if (!last) why.push("First lesson. These words come back in every later lesson.");
    else if (last.pattern === pattern.id && !rowClean(last)) {
      var slips = last.slips || [];
      var named = "";
      for (var i = 0; i < slips.length; i++) {
        if (slips[i] && slips[i] !== "Space") { named = slips[i]; break; }
      }
      var bits = [];
      if (named) bits.push(named + " was missed");
      if (slips.indexOf("Space") >= 0) bits.push("Space was missed");
      if (!bits.length) bits.push("It is not clean yet");
      why.push("Same lesson. " + bits.join(". ") + "." + (link || " It stays until a clean run."));
    } else if (pattern.ch) why.push("One new key." + (link || " The next key waits until this one is clean."));
    else if (pattern.uses) why.push("This key now sits inside words." + (link || " The next key waits."));
    else why.push("Last lesson was clean." + (link || " The next target is open."));
    return {
      title: "Lesson " + n + " · " + pattern.title,
      teach: "This list is frozen. It mixes the new target with words from your earlier lessons. Nothing new is added while you type.",
      why: why,
      finger: "From your last result"
    };
  }

  function lastHistory(store) {
    var past = pastOf(store);
    for (var i = past.length - 1; i >= 0; i--) {
      if (past[i] && past[i].pattern === "history") return past[i];
    }
    return null;
  }

  function slipText(sl) {
    if (!sl) return "";
    if (typeof sl === "string") return sl;
    return sl.word || sl.want || "";
  }

  function historyBank() {
    var seen = {};
    var bank = [];
    (KD.LESSONS || []).forEach(function (lesson) {
      (lesson.tokens || []).concat(lesson.bank || []).concat(lesson.reviewPool || []).forEach(function (tok) {
        if (!tok || !tok.h || !tok.k || seen[tok.h]) return;
        var steps = KD.stepsFromKruti(tok.k);
        for (var i = 0; i < steps.length; i++) {
          if (!steps[i] || steps[i].type === "alt" || steps[i].code === "UNMAPPED") return;
        }
        seen[tok.h] = 1;
        bank.push({ h: tok.h, k: tok.k });
      });
    });
    return bank;
  }

  function tokenFor(h, bank) {
    if (!h || h === "Space") return null;
    for (var i = 0; i < bank.length; i++) if (bank[i].h === h) return bank[i];
    return KD.safeToken(h);
  }

  KD.courseComplete = function (store) {
    if (typeof KD.lessonPassed !== "function") return false;
    var lessons = KD.LESSONS || [];
    if (!lessons.length) return false;
    for (var i = 0; i < lessons.length; i++) {
      if (!KD.lessonPassed(lessons[i], store || {})) return false;
    }
    return true;
  };

  KD.weakKeyNames = function (store) {
    store = store || {};
    if (KD.adaptivePlan) {
      return (KD.adaptivePlan(store).targetKeys || []).slice(0, 3).map(function (id) { return KD.actionLabel(id); }).filter(Boolean);
    }
    var misses = store.misses || {};
    var names = [];
    if ((misses.Space || 0) >= 10) names.push("Space");
    var rows = [];
    Object.keys(misses).forEach(function (id) {
      if (!KD.drillable(id) || !(misses[id] > 0)) return;
      rows.push({ id: id, n: misses[id] });
    });
    rows.sort(function (a, b) { return b.n - a.n; });
    rows.slice(0, 3).forEach(function (row) {
      var label = typeof KD.actionLabel === "function" ? KD.actionLabel(row.id) : "";
      if (label && names.indexOf(label) < 0) names.push(label);
    });
    return names.slice(0, 3);
  };

  function keyId(step) {
    if (!step || step.type === "alt" || !step.code || step.code === "UNMAPPED" || step.code === "Space") return "";
    return step.code + (step.shift ? "+S" : "");
  }

  function targetKeyIds(store) {
    if (KD.adaptivePlan) return (KD.adaptivePlan(store || {}).targetKeys || []).slice(0, 6);
    var misses = (store && store.misses) || {};
    var rows = [];
    Object.keys(misses).forEach(function (id) {
      if (!KD.drillable(id) || !(misses[id] >= 2)) return;
      rows.push({ id: id, n: misses[id] });
    });
    rows.sort(function (a, b) { return b.n - a.n; });
    var ids = [];
    rows.slice(0, 4).forEach(function (row) { ids.push(row.id); });
    if (ids.length < 2 && KD.coachBoard) {
      var slow = KD.coachBoard(store && store.touch).slowKeys || [];
      slow.forEach(function (row) {
        if (row && row.id && ids.indexOf(row.id) < 0 && ids.length < 4) ids.push(row.id);
      });
    }
    return ids;
  }

  /* Real exam lines only: short clerical sentences, then the passage bank. */
  var cachedExamText = null, cachedExamLines = [];
  function examLines() {
    var text = (KD.HI_SENTENCES || []).join('\n');
    if (text === cachedExamText) return cachedExamLines;
    var lines = [];
    var seen = {};
    function add(words, passage) {
      var line = [];
      for (var i = 0; i < words.length; i++) {
        var tok = KD.safeToken(words[i]);
        if (!tok) return;
        line.push(tok);
      }
      if (line.length < 3) return;
      var sig = line.map(function (t) { return t.h; }).join(" ");
      if (seen[sig]) return;
      seen[sig] = 1;
      lines.push({ line: line, passage: passage ? 1 : 0 });
    }
    flow.forEach(function (words) { add(words, 0); });
    any.forEach(function (words) { add(words, 0); });
    (KD.HI_SENTENCES || []).forEach(function (sentence) {
      add(String(sentence).split(/\s+/).filter(Boolean), 1);
    });
    cachedExamText = text;
    cachedExamLines = lines;
    return lines;
  }

  function lineScore(line, ids) {
    var hit = 0;
    var covered = {};
    line.forEach(function (tok) {
      KD.stepsFromKruti(tok.k).forEach(function (step) {
        var id = keyId(step);
        if (!id || ids.indexOf(id) < 0) return;
        hit++;
        covered[id] = 1;
      });
    });
    return { hit: hit, covered: Object.keys(covered).length };
  }

  function sentenceUsage(live) {
    var usage = JSON.parse(JSON.stringify(live && live.sentenceUsage || {}));
    (live && live.past || []).forEach(function (row) {
      if (row.pattern !== 'history') return;
      var lines = row.sentenceIds || ((row.words || []).join(' ').match(/[^।]+।/g) || []).map(function (s) { return s.trim(); });
      lines.forEach(function (line) { if (!usage[line]) usage[line] = { count: 1, at: row.at || 0 }; });
    });
    return usage;
  }
  KD.recordSentenceUsage = function (live, lesson, at) {
    var usage = sentenceUsage(live);
    (lesson.sentenceIds || []).forEach(function (line) {
      var before = usage[line] || { count: 0, at: 0 };
      usage[line] = { count: before.count + 1, at: at };
    });
    live.sentenceUsage = usage;
  };

  function historyTokens(store, bank, random) {
    var usage = sentenceUsage(store.live);
    var practice = KD.mergePractice40 ? KD.mergePractice40(store.practice40) : store.practice40;
    if (KD.mergeSentenceUsage) usage = KD.mergeSentenceUsage(usage, practice && practice.sentenceUsage);
    var rng = random || Math.random;
    var ids = targetKeyIds(store);
    var ranked = examLines().map(function (row, index) {
      var score = lineScore(row.line, ids);
      var length = row.line.length;
      var limit = row.passage ? 16 : 12;
      var fit = length >= 4 && length <= limit ? 1 : 0;
      var sig = row.line.map(function (t) { return t.h; }).join(' ');
      var used = usage[sig] || { count: 0, at: 0 };
      return { line: row.line, sig: sig, used: used.count, at: used.at, passage: row.passage, tie: rng(), index: index, hit: score.hit, covered: score.covered, fit: fit, length: length };
    });
    ranked.sort(function (a, b) {
      return (a.used - b.used) || (a.at - b.at) || (b.covered - a.covered) || (b.passage - a.passage) || (b.fit - a.fit) || (b.hit - a.hit) || (a.tie - b.tie) || (a.index - b.index);
    });
    var seq = [];
    var sentenceIds = [];
    var used = {};
    for (var i = 0; i < ranked.length && sentenceIds.length < 2; i++) {
      var line = ranked[i].line;
      var sig = line.map(function (t) { return t.h; }).join(" ");
      if (used[sig]) continue;
      if (seq.length && seq.length + line.length > 40) continue;
      used[sig] = 1;
      sentenceIds.push(sig);
      line.forEach(function (tok) { seq.push({ h: tok.h, k: tok.k }); });
    }
    if (!seq.length && ranked.length) {
      ranked[0].line.forEach(function (tok) { seq.push({ h: tok.h, k: tok.k }); });
    }
    return { tokens: seq, sentenceIds: sentenceIds };
  }

  KD.historyLesson = function (store, random) {
    store = store || {};
    var bank = historyBank();
    var cap = KD.PRACTICE_TARGET || 50;
    var bars = KD.starBars(store, { min: 14, mid: 22, high: 32, cap: cap, acc: 94 });
    var names = KD.weakKeyNames(store);
    var selection = historyTokens(store, bank, random);
    var tokens = selection.tokens;
    var past = pastOf(store);
    var count = 0;
    past.concat(store.live && store.live.lesson ? [store.live.lesson] : []).forEach(function (row) {
      var match = row && /^hist-(\d+)$/.exec(row.id || '');
      if (match) count = Math.max(count, Number(match[1]));
    });
    var last = lastHistory(store);
    var who = names.length ? names.join(", ") : "the keys from your last lessons";
    return {
      id: "hist-" + (count + 1),
      pattern: "history",
      layer: "history",
      title: "Exam sentence · " + (names[0] || "your keys") + " · " + bars.high + " WPM",
      teach: "A Hindi sentence exercise using varied practice text, with extra attention to " + who + ". The words stay in sentence order. Unused sentences come first. Pass at " + bars.min + " WPM and " + bars.acc + "% accuracy. Practice goal: " + bars.high + " WPM with 98% first-try accuracy. Stars also account for accuracy. " +
        "Completing the sentence gives you a new sentence. Reaching the goal with 98% accuracy on both measures raises the next bar by 2 WPM, up to " + cap + "." +
        " Nothing new is added while you type.",
      why: ["Hindi practice sentences with no repeats until the sentence pool is used. Practice goal: " + bars.high + " WPM with 98% first-try accuracy."],
      tokens: tokens,
      sentenceIds: selection.sentenceIds,
      source: 'practice-pool',
      words: tokens.map(function (t) { return t.h; }),
      wordlock: false,
      hints: "hindi",
      acc: bars.acc,
      min: bars.min,
      mid: bars.mid,
      high: bars.high,
      finger: "Pass " + bars.min + " · five stars at " + bars.high
    };
  };

  function ladderCleared(store) {
    return patternCleared(store, patternById("lines"));
  }

  KD.liveLabels = function (store) {
    store = store || {};
    var lesson = store.live && store.live.lesson;
    if (!lesson) return null;
    var pattern = patternById(lesson.pattern);
    if (!pattern) return { title: lesson.title, teach: lesson.teach, why: lesson.why, finger: lesson.finger };
    return liveCopy(store, pattern);
  };

  KD.composeLive = function (store, random) {
    store = store || {};
    if (KD.courseComplete(store) || ladderCleared(store)) return KD.historyLesson(store, random);
    var past = pastOf(store);
    var pattern = choosePattern(store);
    var tokens = pattern.lines ? lineLesson(store) : (pattern.ch ? charLesson(pattern, store) : wordLesson(pattern, store));
    var copy = liveCopy(store, pattern);
    return {
      id: "live-" + (past.length + 1),
      pattern: pattern.id,
      layer: pattern.id,
      title: copy.title,
      teach: copy.teach,
      why: copy.why,
      tokens: tokens,
      wordlock: pattern.id === "lines",
      hints: "hindi",
      acc: 94,
      min: pattern.id === "lines" ? 16 : 14,
      mid: 22,
      high: 32,
      finger: copy.finger
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

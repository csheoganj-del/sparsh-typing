(function (root) {
  var KD = root.KD;
  var STORE = "sparsh-rssb-v1";
  var app = document.getElementById("app");
  var screen = "home";
  var session = null;
  var tick = null;
  var audio = null;
  var focusIndex = -1;
  var playState = null;
  var playTimer = null;

  var folderSave = false;
  var booting = true;
  var saveQueue = Promise.resolve();
  var currentUser = localStorage.getItem("sparsh_username") || "kalpesh";
  var authToken = localStorage.getItem("sparsh_auth_token") || null;
  var showAuthModal = false;
  var authTab = "login";
  function loadLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || "null");
      if (raw && raw.stars) return raw;
    } catch (e) {}
    return { stars: {}, placed: {}, misses: {}, settings: { sound: true, hints: true }, bestHi: null, bestEn: null };
  }
  var store = KD.mergeProgress(loadLocal(), null);
  function captureResume() {
    if (!session || !session.live || !session.lesson || !store.live) return;
    if (session.phase === "done") return;
    var step = session.steps && session.steps[session.i];
    var at = "";
    if (session.kind === "lock") at = (session.words[session.wi] && session.words[session.wi].h) || "";
    else if (step && step.ti != null && session.tokens[step.ti]) at = session.tokens[step.ti].h || "";
    var elapsedMs = session.t0 ? Math.max(0, Math.round(performance.now() - session.t0)) : 0;
    store.live.resume = {
      id: session.lesson.id,
      phase: session.phase === "run" ? "run" : "intro",
      i: session.i || 0,
      wi: session.wi || 0,
      typed: session.typed || "",
      marks: (session.marks || []).slice(),
      correct: session.correct || 0,
      errors: session.errors || 0,
      elapsed: elapsedMs,
      at: at,
      slips: (session.slips || []).slice(0, 20),
      tape: (session.tape || []).slice(0, 240),
      wrong: (session.wrong || []).slice(0, 24),
      typedWords: session.typedWords || []
    };
  }
  function save() {
    captureResume();
    var body = JSON.stringify(store);
    try { localStorage.setItem(STORE, body); } catch (e) {}
    if (!folderSave) return;
    var headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = "Bearer " + authToken;
    saveQueue = saveQueue.then(function () {
      return fetch("/api/progress", {
        method: "POST",
        headers: headers,
        body: body
      });
    }).catch(function () {});
  }
  function progressWork(s) {
    if (!s) return false;
    if (s.stars && Object.keys(s.stars).length) return true;
    if (s.log && s.log.length) return true;
    if (s.tries && Object.keys(s.tries).length) return true;
    if (s.bestHi || s.bestEn) return true;
    return false;
  }
  function adoptFile(text) {
    folderSave = true;
    var fileStore = null;
    if (text && text !== "null") {
      try { fileStore = JSON.parse(text); } catch (e) {}
    }
    var before = JSON.stringify(store);
    if (fileStore && fileStore.stars) store = KD.mergeProgress(store, fileStore);
    var after = JSON.stringify(store);
    var fileShaped = fileStore && fileStore.stars ? JSON.stringify(KD.mergeProgress(fileStore, null)) : "";
    if (after !== before || (fileShaped !== after && progressWork(store))) save();
  }

  var MATRA_PAIR = {
    f: "fj", k: "dk", s: "ds", S: "dS", h: "dh", a: "da", q: "dq", w: "dw",
    z: "dz", "`": "d`", Z: "jZ", "~": "d~", "+": "M+", W: "kW"
  };

  function chOf(id) {
    if (!id || id === "Space" || String(id).indexOf("alt:") === 0) return "";
    var shift = String(id).slice(-2) === "+S";
    var code = shift ? String(id).slice(0, -2) : String(id);
    var meta = KD.BY_CODE[code];
    if (!meta) return "";
    return shift ? (meta.shifted || "") : (meta.normal || "");
  }
  function keySeq(id) {
    var ch = chOf(id);
    if (!ch) return "";
    if (MATRA_PAIR[ch]) return MATRA_PAIR[ch];
    return ch + ch;
  }
  function pairSeq(id) {
    var parts = String(id).split(">");
    if (parts.length !== 2) return "";
    var a = chOf(parts[0]);
    var b = chOf(parts[1]);
    if (!a || !b) return "";
    var options = [a + b];
    if (MATRA_PAIR[a]) options.push(MATRA_PAIR[a] + b);
    if (MATRA_PAIR[b]) options.push(a + MATRA_PAIR[b]);
    if (MATRA_PAIR[a] || MATRA_PAIR[b]) options.push((MATRA_PAIR[a] || a) + (MATRA_PAIR[b] || b));
    for (var i = 0; i < options.length; i++) {
      if (KD.preview(options[i])) return options[i];
    }
    var solo = keySeq(parts[0]) || keySeq(parts[1]);
    return KD.preview(solo) ? solo : "";
  }
  function faceOfId(id) {
    if (!id) return "";
    if (String(id).indexOf(">") >= 0) {
      var seq = pairSeq(id);
      var shown = seq ? KD.preview(seq) : "";
      if (shown) return shown;
      var parts = String(id).split(">");
      return (faceOfId(parts[0]) || "") + (faceOfId(parts[1]) || "");
    }
    var ch = chOf(id);
    if (ch && KD.keyFace(ch)) return KD.keyFace(ch);
    var shift = String(id).slice(-2) === "+S";
    var code = shift ? String(id).slice(0, -2) : String(id);
    var meta = KD.BY_CODE[code];
    return meta ? meta.legend : "";
  }
  function coachLabel(plan) {
    var face = faceOfId(plan.id) || "key";
    if (plan.fromMiss) return "⚡ AI Drill: Often missed · " + face;
    if (plan.kind === "pair") return "⚡ AI Sprint: " + face + " (" + Math.round(plan.avg || 0) + "ms)";
    return "⚡ AI Sprint: " + face + " (" + Math.round(plan.avg || 0) + "ms)";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function starStr(n) {
    var s = "";
    for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "☆";
    return s;
  }
  function cleared(lesson) {
    if ((store.stars[lesson.id] || 0) >= 3) return true;
    return !!(store.placed && store.placed[lesson.skill]);
  }
  function lessonStage(lesson) {
    return lesson && lesson.stage ? lesson.stage : "key";
  }
  function stageCleared(stage) {
    var any = false;
    for (var i = 0; i < KD.LESSONS.length; i++) {
      if (lessonStage(KD.LESSONS[i]) !== stage) continue;
      any = true;
      if (!cleared(KD.LESSONS[i])) return false;
    }
    return any;
  }
  function prevInStage(index) {
    var stage = lessonStage(KD.LESSONS[index]);
    for (var i = index - 1; i >= 0; i--) {
      if (lessonStage(KD.LESSONS[i]) === stage) return KD.LESSONS[i];
    }
    return null;
  }
  function unlocked(index) {
    var lesson = KD.LESSONS[index];
    if (!lesson) return false;
    if (store.unlockedAll) return true;
    if (index === 0) return true;
    var prev = KD.LESSONS[index - 1];
    if (!prev) return true;
    if ((store.stars[prev.id] || 0) >= 1) return true;
    if (cleared(prev)) return true;
    var attempts = attemptsFor(prev.id);
    if (attempts.length && (attempts[attempts.length - 1].acc >= 80 || attempts[attempts.length - 1].stars >= 1)) return true;
    var stage = lessonStage(lesson);
    if (stage === "word" || stage === "end" || stage === "para") {
      var prevSt = prevInStage(index);
      if (prevSt) return (store.stars[prevSt.id] || 0) >= 1 || cleared(prevSt);
      return true;
    }
    return false;
  }
  function nextLessonIndex() {
    for (var i = 0; i < KD.LESSONS.length; i++) {
      var l = KD.LESSONS[i];
      if ((store.stars[l.id] || 0) < 3 && unlocked(i)) return i;
    }
    for (var j = 0; j < KD.LESSONS.length; j++) {
      if ((store.stars[KD.LESSONS[j].id] || 0) < 1) return j;
    }
    return 0;
  }
  function lessonIndex(id) {
    for (var i = 0; i < KD.LESSONS.length; i++) if (KD.LESSONS[i].id === id) return i;
    return -1;
  }
  function fingerNote() {
    var board = KD.coachBoard(store.touch);
    var bits = [];
    if (board.slowKeys && board.slowKeys[0]) bits.push((faceOfId(board.slowKeys[0].id) || "key") + " is slow");
    if (board.slowPairs && board.slowPairs[0]) bits.push((faceOfId(board.slowPairs[0].id) || "pair") + " sticks");
    var worst = null;
    Object.keys(store.misses || {}).forEach(function (code) {
      if (!KD.drillable(code)) return;
      var n = store.misses[code] || 0;
      if (n < 3) return;
      if (!worst || n > worst.n) worst = { code: code, n: n };
    });
    if (worst) bits.push((faceOfId(worst.code) || "key") + " is missed");
    if (!bits.length) return "Finger times start with the next typing. A pause while you think is not a slow key. Next up: है, the long-ā stroke, था थी थे.";
    return "The fingers are learning: " + bits.join(". ") + ". The next lesson repeats them inside common endings — है, long ā, था, थी, थे.";
  }
  function showTitle(title) {
    var t = String(title || "");
    if (!t) return "Practice";
    if (t === "सबसे आम शब्द") return "Most common words";
    t = t.replace(/^पाठ\s+(\d+)\s*·\s*/, "Lesson $1 · ");
    t = t.replace("आम शब्द", "Common words");
    t = t.replace("खड़ी पाई", "Long ā (ा)");
    t = t.replace("है और हैं", "है and हैं");
    t = t.replace("था थी थे", "था, थी, थे");
    return t;
  }
  function localRepeat() {
    var ni = nextLessonIndex();
    if (ni < 0) return [];
    var src = KD.LESSONS[ni];
    var bank = src.bank || src.tokens || [];
    if (!bank.length || !KD.weightTokens) return [];
    var ranked = KD.weightTokens(bank, store.touch, store.misses, []);
    var seen = {};
    var out = [];
    ranked.forEach(function (t) {
      if (!t || !t.h || seen[t.h] || out.length >= 4) return;
      seen[t.h] = 1;
      out.push(t.h);
    });
    return out;
  }
  function fingerProfile() {
    var board = KD.coachBoard(store.touch);
    function rows(list) {
      return (list || []).slice(0, 5).map(function (r) {
        return { face: faceOfId(r.id) || "", ms: Math.round(r.avg || 0), n: r.n || 0 };
      }).filter(function (r) { return r.face; });
    }
    var slips = [];
    Object.keys(store.tries || {}).forEach(function (id) {
      (store.tries[id] || []).forEach(function (row) {
        (row.slips || []).forEach(function (sl) {
          if (sl && sl.word) slips.push({ word: String(sl.word).slice(0, 24), got: String(sl.got || "").slice(0, 24) });
        });
      });
    });
    var misses = [];
    Object.keys(store.misses || {}).forEach(function (code) {
      if (!KD.drillable(code)) return;
      misses.push({ face: faceOfId(code) || "", n: store.misses[code] || 0 });
    });
    misses.sort(function (a, b) { return b.n - a.n; });
    var ni = nextLessonIndex();
    var lesson = ni >= 0 ? KD.LESSONS[ni] : null;
    var bank = [];
    if (lesson) (lesson.bank || lesson.tokens || []).forEach(function (t) { if (t && t.h) bank.push(t.h); });
    return {
      paceMs: Math.round(board.pace || 0),
      slowKeys: rows(board.slowKeys),
      slowPairs: rows(board.slowPairs),
      misses: misses.filter(function (m) { return m.face && m.n >= 3; }).slice(0, 6),
      slips: slips.slice(-12),
      chapter: lesson ? lesson.title : "",
      bank: bank.slice(0, 48)
    };
  }
  function askCoach() {
    var local = { at: Date.now(), note: fingerNote(), repeat: localRepeat(), source: "fingers" };
    store.coach = store.coach || local;
    var profile = fingerProfile();
    fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    }).then(function (r) { return r.json(); }).then(function (plan) {
      if (!plan || !plan.note) return;
      var allow = {};
      (profile.bank || []).forEach(function (w) { allow[w] = 1; });
      var repeat = [];
      (plan.repeat || []).forEach(function (w) { if (allow[w]) repeat.push(w); });
      store.coach = {
        at: Date.now(),
        note: String(plan.note).slice(0, 320),
        drill: (plan.drill && plan.drill.length) ? plan.drill : (store.coach && store.coach.drill),
        repeat: repeat.length ? repeat.slice(0, 8) : local.repeat,
        source: plan.source === "gemini" ? "gemini" : "fingers"
      };
      save();
      if (!session && (screen === "home" || screen === "result")) draw();
    }).catch(function () {});
  }

  function beep(ok) {
    if (!store.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      var t = audio.currentTime;
      var dur = ok ? 0.028 : 0.055;
      var n = Math.floor(audio.sampleRate * dur);
      var buffer = audio.createBuffer(1, n, audio.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < n; i++) {
        var env = Math.pow(1 - i / n, ok ? 4 : 2);
        data[i] = (Math.random() * 2 - 1) * env;
      }
      var src = audio.createBufferSource();
      src.buffer = buffer;
      var filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = ok ? 2100 : 320;
      filter.Q.value = ok ? 0.6 : 0.4;
      var g = audio.createGain();
      g.gain.value = ok ? 0.45 : 0.32;
      src.connect(filter);
      filter.connect(g);
      g.connect(audio.destination);
      src.start(t);
      var body = audio.createOscillator();
      var bg = audio.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime(ok ? 180 : 72, t);
      body.frequency.exponentialRampToValueAtTime(48, t + dur);
      bg.gain.setValueAtTime(ok ? 0.06 : 0.1, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + dur);
      body.connect(bg);
      bg.connect(audio.destination);
      body.start(t);
      body.stop(t + dur);
    } catch (e) {}
  }

  function stopTick() {
    if (tick) clearInterval(tick);
    tick = null;
  }

  function stopPlayback() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
  }
  function go(name) {
    stopTick();
    stopPlayback();
    playState = null;
    if (session && session.live && session.phase !== "done") save();
    session = null;
    screen = name;
    draw();
  }

  function authModalHTML() {
    return (
      '<div class="auth-overlay">' +
      '<div class="card auth-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div class="kicker">Live Cloud Access · Anywhere</div>' +
      '<button class="btn ghost" data-act="close-auth" style="font-size:18px;padding:2px 8px;">✕</button>' +
      '</div>' +
      '<h2 style="margin:6px 0 4px;">' + (authTab === "login" ? "Sign In to Your Account" : "Create New Account") + '</h2>' +
      '<p class="muted small" style="margin:0 0 12px;">Access your 57 levels, real-time WPM, and AI weakness drills from any computer or phone.</p>' +
      '<div class="auth-tabs">' +
      '<button class="btn tab' + (authTab === "login" ? " active" : "") + '" data-auth-tab="login">Sign In</button>' +
      '<button class="btn tab' + (authTab === "register" ? " active" : "") + '" data-auth-tab="register">New Account</button>' +
      '</div>' +
      '<form id="auth-form" style="margin-top:14px;" onsubmit="return false;">' +
      '<div style="margin-bottom:10px;">' +
      '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Username</label>' +
      '<input type="text" id="auth-user" value="' + esc(currentUser || "kalpesh") + '" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;" placeholder="Username" required>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Password</label>' +
      '<input type="password" id="auth-pass" value="kalpesh123" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;" placeholder="Password" required>' +
      '</div>' +
      '<div id="auth-err" style="color:var(--bad);font-size:13px;margin-bottom:10px;display:none;"></div>' +
      '<button type="button" class="btn saffron" id="auth-submit" style="width:100%;padding:11px;font-weight:600;font-size:14px;">' + (authTab === "login" ? "Sign In & Sync Cloud History" : "Create Account & Start Sync") + '</button>' +
      '<p style="font-size:11px;color:var(--muted);margin-top:10px;text-align:center;">Default Kalpesh account: <b>kalpesh</b> / <b>kalpesh123</b></p>' +
      '</form>' +
      '</div></div>'
    );
  }

  function bar(extra) {
    var userPill = authToken
      ? '<span class="auth-pill" title="Live Cloud Sync Active"><span style="width:8px;height:8px;border-radius:50%;background:var(--good);display:inline-block;"></span> 👤 ' + esc(currentUser) + '</span>' +
        '<button class="btn ghost" style="font-size:12px;padding:6px 10px;" data-act="logout">Logout</button>'
      : '<button class="btn saffron" style="font-size:12px;padding:6px 14px;" data-act="open-auth">🔑 Cloud Login</button>';

    var backupBtn = '<button class="btn ghost" style="font-size:12px;padding:6px 10px;" data-act="export-json" title="Download backup file">💾 Backup</button>';

    return (
      '<header class="bar"><div class="brand"><b>SPARSH</b><span>Kruti Dev / DevLys · RSSB Hindi speed</span></div>' +
      '<div class="bar-actions">' +
      (extra || "") +
      userPill +
      backupBtn +
      '<button class="btn ghost" data-go="home">Home</button>' +
      '<button class="btn ghost" data-go="path">Lessons</button>' +
      '<button class="btn ghost" data-go="record">Record</button>' +
      '<button class="btn ghost" data-go="chart">Key chart</button>' +
      "</div></header>" +
      (showAuthModal ? authModalHTML() : "")
    );
  }

  function draw() {
    document.body.classList.toggle("fit", screen === "run");
    if (screen === "home") app.innerHTML = bar() + homeHTML();
    else if (screen === "path") app.innerHTML = bar() + pathHTML();
    else if (screen === "record") app.innerHTML = bar() + recordHTML();
    else if (screen === "chart") app.innerHTML = bar() + chartHTML();
    else if (screen === "run") paintShell();
    else if (screen === "lesson") app.innerHTML = bar() + lessonHTML();
    else if (screen === "result") app.innerHTML = bar() + resultHTML();
    bindStatic();
  }

  function lessonSig(lesson) {
    if (!lesson || !lesson.tokens || !lesson.tokens.length) return "";
    var hs = [];
    for (var i = 0; i < lesson.tokens.length; i++) hs.push(lesson.tokens[i].h || "");
    return (lesson.pattern || "") + "\n" + hs.join("\n");
  }
  function ensureLive() {
    if (!store.live) store.live = { past: [] };
    if (!Array.isArray(store.live.past)) store.live.past = [];
    var lesson = store.live.lesson;
    if (lesson && lesson.tokens && lesson.tokens.length && resumeMid(liveResume())) return;
    var next = KD.composeLive(store);
    if (lessonSig(lesson) === lessonSig(next)) return;
    store.live.resume = null;
    store.live.lesson = next;
    if (!booting) save();
  }
  function liveResume() {
    var src = store.live && store.live.lesson;
    var resume = store.live && store.live.resume;
    if (!src || !resume || resume.id !== src.id) return null;
    return resume;
  }
  function resumeMid(resume) {
    if (!resume) return false;
    return (resume.i || 0) > 0 || (resume.wi || 0) > 0 || (resume.marks && resume.marks.length > 0);
  }
  function pathSectionsHTML() {
    var html = "";
    var currentNi = nextLessonIndex();
    KD.SECTIONS.forEach(function (sec) {
      var lessons = KD.LESSONS.map(function (l, i) { return { l: l, i: i }; }).filter(function (x) { return x.l.section === sec.id; });
      if (!lessons.length) return;
      html += '<section class="sec"><div class="sec-h"><h2>' + esc(sec.title) + '</h2><span class="muted">' + esc(sec.blurb) + "</span></div><div class=\"nodes\">";
      lessons.forEach(function (x) {
        var st = store.stars[x.l.id] || 0;
        var open = unlocked(x.i);
        var cls = "node" + (open ? "" : " lock") + (cleared(x.l) ? " done" : "") + (currentNi === x.i ? " now" : "");
        var hist = attemptsFor(x.l.id);
        var last = hist.length ? hist[hist.length - 1] : null;
        html += '<button class="' + cls + '" data-lesson="' + x.i + '"' + (open ? "" : " disabled") + ">" +
          '<span class="node-n">' + (x.i + 1) + "</span>" +
          (open ? "" : '<span class="lock-mark">Locked</span>') +
          "<b>" + esc(x.l.title) + "</b><em>" + starStr(st) + "</em>" +
          (last ? '<span class="node-score">' + Math.round(last.acc || 0) + "% · " + fmt(last.wpm || 0) + " WPM</span>" : "") +
          "</button>";
      });
      html += "</div></section>";
    });
    return html;
  }

  function homeHTML() {
    var plan = KD.planCoach(store.touch, store.misses, store.touch.rest);
    var ni = nextLessonIndex();
    var cur = (ni >= 0 && KD.LESSONS[ni]) ? KD.LESSONS[ni] : KD.LESSONS[0];
    var curStars = store.stars[cur.id] || 0;
    var board = KD.coachBoard(store.touch);
    var pace = Math.round(board.pace || 0);
    var slowestPair = board.slowPairs && board.slowPairs[0] ? (faceOfId(board.slowPairs[0].id) + " (" + Math.round(board.slowPairs[0].avg) + "ms)") : null;
    var slowestKey = board.slowKeys && board.slowKeys[0] ? (faceOfId(board.slowKeys[0].id) + " (" + Math.round(board.slowKeys[0].avg) + "ms)") : null;
    var topMisses = Object.keys(store.misses || {})
      .filter(function (c) { return (store.misses[c] || 0) >= 3 && KD.drillable(c); })
      .sort(function (a, b) { return store.misses[b] - store.misses[a]; })
      .slice(0, 3)
      .map(function (c) { return faceOfId(c) + " (" + store.misses[c] + ")"; })
      .join(", ");

    return (
      '<div class="wrap">' +
      '<div class="card" style="margin-bottom:20px;border-left:5px solid var(--saffron);">' +
      '<div class="kicker">TypingClub Hindi · Remington GAIL / DevLys 010 · RSSB Target: 40+ WPM</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin:8px 0 10px;">' +
      '<div>' +
      '<h1 style="margin:2px 0 6px;">Level ' + (ni + 1) + ' · ' + esc(cur.title) + '</h1>' +
      '<p style="margin:0 0 6px;color:var(--muted);font-size:15px;">' + esc(cur.teach || "Build muscle memory key by key.") + '</p>' +
      '<span style="font-size:13px;font-weight:600;color:var(--saffron-deep);">Target finger: ' + esc(cur.finger || "Home position") + '</span>' +
      '</div>' +
      '<div style="text-align:right;">' +
      '<span style="display:inline-block;padding:4px 12px;border-radius:12px;background:var(--paper-2);font-weight:600;font-size:14px;letter-spacing:1px;color:var(--mark);">' + starStr(curStars) + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="row-btns">' +
      '<button class="btn primary" data-act="start-current" style="font-size:15px;font-weight:600;padding:12px 22px;">▶ Start Level ' + (ni + 1) + '</button>' +
      (plan ? '<button class="btn saffron" data-act="coach" style="font-size:14px;padding:12px 18px;">⚡ ' + esc(coachLabel(plan)) + '</button>' : '') +
      '<button class="btn saffron" data-act="exam-hi">🎯 Hindi Exam (10 min)</button>' +
      '<button class="btn" data-act="exam-en">English Exam (10 min)</button>' +
      '<button class="btn" data-act="weak">Weak Keys Drill</button>' +
      '<button class="btn ghost" data-act="toggle-unlock">' + (store.unlockedAll ? "🔒 Sequential Path" : "🔓 Unlock All Levels") + '</button>' +
      '</div></div>' +

      '<div class="card" style="margin-bottom:24px;background:linear-gradient(135deg, rgba(255,250,243,1) 0%, rgba(247,242,232,0.95) 100%);border:2px solid var(--saffron);box-shadow:0 8px 24px rgba(196,81,18,0.1);padding:18px 22px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:var(--good);display:inline-block;"></span>' +
      '<span class="kicker" style="color:var(--saffron-deep);font-size:12px;">🤖 Active AI Typing Tutor & Adaptive Coach</span>' +
      '</div>' +
      '<span style="font-size:11px;background:var(--paper-2);padding:3px 10px;border-radius:12px;font-weight:600;color:var(--muted);">' +
      ((store.coach && store.coach.source === "gemini") ? "✨ Gemini 2.5 Active" : "Adaptive Reflex Engine") +
      '</span>' +
      '</div>' +
      '<p style="margin:4px 0 12px;font-size:14px;color:var(--ink);font-weight:500;line-height:1.5;">' +
      esc((store.coach && store.coach.note) ? store.coach.note : fingerNote()) +
      '</p>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--ink);">' +
      (slowestKey ? '<span style="background:#fff;border:1px solid var(--line);padding:5px 10px;border-radius:8px;"><b>Slow key:</b> <span style="color:var(--bad);font-weight:700;">' + esc(slowestKey) + '</span></span>' : '') +
      (slowestPair ? '<span style="background:#fff;border:1px solid var(--line);padding:5px 10px;border-radius:8px;"><b>Sticking pair:</b> <span style="color:var(--saffron);font-weight:700;">' + esc(slowestPair) + '</span></span>' : '') +
      (topMisses ? '<span style="background:#fff;border:1px solid var(--line);padding:5px 10px;border-radius:8px;"><b>Misses:</b> <span style="color:var(--saffron-deep);font-weight:700;">' + esc(topMisses) + '</span></span>' : '') +
      '<span style="background:#fff;border:1px solid var(--line);padding:5px 10px;border-radius:8px;"><b>Pace:</b> ' + (pace ? pace + 'ms/stroke' : 'Evaluating...') + '</span>' +
      '</div>' +
      '<button class="btn saffron" data-act="start-ai-drill" style="font-size:13px;font-weight:700;padding:9px 18px;display:flex;align-items:center;gap:6px;">' +
      '⚡ Start Custom AI Drill' +
      '</button>' +
      '</div></div>' +

      '<div class="kicker" style="margin-bottom:8px;">TypingClub Hindi Course Map · 57 Levels</div>' +
      pathSectionsHTML() +
      '</div>'
    );
  }

  function pathHTML() {
    return (
      '<div class="wrap">' +
      '<div class="kicker">Curriculum</div>' +
      '<h1>All 57 Levels</h1>' +
      pathSectionsHTML() +
      '</div>'
    );
  }

  function recordHTML() {
    var board = KD.coachBoard(store.touch);
    var lessons = "";
    var kept = 0;
    KD.LESSONS.forEach(function (lesson) {
      var stars = store.stars[lesson.id] || 0;
      var viaPlace = !!(store.placed && store.placed[lesson.skill]);
      if (!stars && !viaPlace) return;
      kept++;
      lessons += "<tr><td>" + esc(lesson.title) + "</td><td>" + (stars ? starStr(stars) : "Placement") + "</td></tr>";
    });
    var log = store.log.slice().reverse().map(function (row) {
      var bits = esc(showTitle(row.title));
      if (row.id === "coach") bits += " · drill, stars unchanged";
      else if (row.stars) bits += " · " + starStr(row.stars);
      if (row.marks != null) bits += " · " + fmt(row.marks) + "/25";
      else bits += " · " + Math.round(row.acc || 0) + "%";
      if (row.wpm) bits += " · " + fmt(row.wpm) + " WPM";
      return "<li>" + bits + "</li>";
    }).join("");
    var pace = "";
    pace += paceBlock("Slow keys", board.slowKeys);
    pace += paceBlock("Fast keys", board.fastKeys);
    pace += paceBlock("Slow pairs", board.slowPairs);
    pace += paceBlock("Fast pairs", board.fastPairs);
    if (!pace) {
      pace = "<p>No speed record yet. The next correct typing stores every key and every pair. A pause while you think is not counted.</p>";
    }
    var missed = "";
    Object.keys(store.misses).forEach(function (code) {
      if ((store.misses[code] || 0) < 1) return;
      missed += "<li>" + esc(faceOfId(code) || code) + " · " + store.misses[code] + " times</li>";
    });
    return '<div class="wrap narrow"><div class="card"><div class="kicker">History</div><h2>Your record</h2>' +
      "<h3>Finished lessons · " + kept + "</h3>" +
      (lessons ? '<table class="mark"><tr><th>Lesson</th><th>Stars</th></tr>' + lessons + "</table>" : "<p>No stars yet.</p>") +
      "<h3>Keys and pairs</h3>" + pace +
      (missed ? "<h3>Missed keys</h3><ul class=\"points\">" + missed + "</ul>" : "") +
      "<h3>Recent sessions</h3>" +
      (log ? "<ul class=\"points\">" + log + "</ul>" : "<p>A finished session will show up here.</p>") +
      '<p class="small muted">Best Hindi ' + (store.bestHi ? fmt(store.bestHi.marks) : "—") + " / 25. English " + (store.bestEn ? fmt(store.bestEn.marks) : "—") + " / 25.</p>" +
      "</div></div>";
  }
  function paceBlock(label, rows) {
    if (!rows || !rows.length) return "";
    return "<p><b>" + label + "</b> · " + rows.map(function (row) {
      var word = row.ratio >= 1.35 ? "slow" : (row.ratio <= 0.75 ? "fast" : "steady");
      return esc(faceOfId(row.id) || "key") + " " + word;
    }).join(" · ") + "</p>";
  }

  function chartHTML() {
    var board = keyboardHTML(null);
    return '<div class="wrap"><div class="card"><div class="kicker">Kruti Dev 010 / DevLys 010</div><h2>The key you press is the letter you get</h2>' +
      '<p class="muted">The large letter is unshifted. The corner is the Shift form. F and J have bumps. A half letter is that consonant with Shift. ख थ ध भ श ष घ ण need the half form, then K for the vertical stroke. The number row is digits. Its Shift forms: 1 !, 2 /, 3 रु, 4 +, 5 ः (the key shows कः so a circle does not appear), 6 ‘, 7 -, 8 ’, 9 ;, 0 द्ध. Minus is the English full stop. Shift+minus is ऋ. रू is Shift+semicolon. Shift+Y is half ल, not रू. क्र is d then z. फ्र is Shift+Q then z. The exam forbids Alt and Control. The chandrabindu has no key, so it is not in the lessons.</p>' +
      board + "</div></div>";
  }

  function keyboardHTML(next) {
    var rows = KD.ROWS.map(function (row) {
      return '<div class="krow">' + row.map(function (k) { return keyHTML(k, next); }).join("") + "</div>";
    }).join("");
    var shiftLeftOn = next && next.shift && KD.shiftHand(next.finger) === "left";
    var shiftRightOn = next && next.shift && KD.shiftHand(next.finger) === "right";
    var spaceOn = next && next.code === "Space";
    rows += '<div class="krow">' +
      shiftHTML("ShiftLeft", "Left Shift", shiftLeftOn) +
      '<div class="key space' + (spaceOn ? " next" : "") + '"><div class="hi space-label">Space</div></div>' +
      shiftHTML("ShiftRight", "Right Shift", shiftRightOn) +
      "</div>";
    return '<div class="board">' + rows + "</div>";
  }
  function shiftHTML(code, label, on) {
    var quiet = session && session.hand ? " quiet" : "";
    return '<div class="key wide' + (on ? " next" : "") + quiet + '"><div class="en">' + code.replace("Shift", "") + '</div><div class="hi" style="font-size:11px;font-family:var(--sans)">' + label + "</div></div>";
  }
  function keyHTML(k, next) {
    var on = next && next.type !== "alt" && next.code === k.code;
    var showShift = on ? !!next.shift : false;
    var bigRaw = showShift ? k.shifted : k.normal;
    var smallRaw = showShift ? k.normal : k.shifted;
    var big = KD.keyFace(bigRaw);
    var small = KD.keyFace(smallRaw);
    var quiet = session && session.hand && KD.handOf(k.code) && KD.handOf(k.code) !== session.hand && !on;
    var cls = "key" + (k.home ? " home" : "") + (on ? " next" : "") + (quiet ? " quiet" : "");
    var hue = KD.FINGERS[k.finger].hue;
    var style = on ? ' style="outline-color:' + hue + '"' : "";
    return '<div class="' + cls + '"' + style + '><div class="en">' + esc(k.legend) + "</div>" +
      '<div class="hi">' + esc(big) + "</div>" +
      (k.bump && !showShift ? '<div class="bump-dot" style="margin-top:-6px"></div>' : "") +
      '<div class="altg">' + esc(small) + "</div></div>";
  }

  function handsHTML(fingerId, shiftSide) {
    var order = ["lp", "lr", "lm", "li", "ri", "rm", "rr", "rp"];
    return '<div class="hands">' + order.map(function (id, n) {
      var f = KD.FINGERS[id];
      var on = id === fingerId || (shiftSide && ((shiftSide === "left" && id === "lp") || (shiftSide === "right" && id === "rp")));
      var quiet = session && session.hand && f.hand !== session.hand && !on;
      var gap = n === 4 ? '<div class="gap-finger"></div>' : "";
      return gap + '<div class="hand-finger' + (on ? " on" : "") + (quiet ? " quiet" : "") + '"' + (on ? ' style="background:' + f.hue + '"' : "") + ">" + esc(f.short) + "<br>" + esc(f.name.split(" ")[1] || f.name) + "</div>";
    }).join("") + "</div>";
  }

  function plainLesson(src) {
    var lesson = {};
    ["id", "title", "teach", "finger", "newKey", "acc", "min", "mid", "high", "hints", "section", "stage", "skill", "wordlock", "hand"].forEach(function (k) {
      if (src[k] != null) lesson[k] = src[k];
    });
    return lesson;
  }
  function weakInBank(bank) {
    var board = KD.coachBoard(store.touch || {});
    var slow = {};
    (board.slowKeys || []).forEach(function (r) { slow[r.id] = 1; });
    (board.slowPairs || []).forEach(function (r) { slow[r.id] = 1; });
    var focus = {};
    ((store.coach && store.coach.repeat) || []).forEach(function (w) { focus[w] = 1; });
    var slipped = {};
    Object.keys(store.tries || {}).forEach(function (id) {
      (store.tries[id] || []).forEach(function (row) {
        (row.slips || []).forEach(function (sl) {
          var w = sl && (sl.word || sl.want);
          if (w) slipped[w] = 1;
        });
      });
    });
    var out = [];
    var seen = {};
    function add(h) {
      if (!h || seen[h] || out.length >= 3) return;
      for (var i = 0; i < bank.length; i++) {
        if (bank[i].h === h) {
          seen[h] = 1;
          out.push(bank[i]);
          return;
        }
      }
    }
    bank.forEach(function (tok) { if (slipped[tok.h] || focus[tok.h]) add(tok.h); });
    bank.forEach(function (tok) {
      var steps = KD.stepsFromKruti(tok.k || "");
      var prev = "";
      for (var i = 0; i < steps.length; i++) {
        var st = steps[i];
        if (!st || st.type === "alt" || !st.code || st.code === "UNMAPPED") continue;
        var id = st.shift ? st.code + "+S" : st.code;
        if (slow[id] || (store.misses && (store.misses[id] || 0) >= 3) || (prev && slow[prev + ">" + id])) add(tok.h);
        prev = id;
      }
    });
    return out;
  }
  function tokensFor(src) {
    if (src.fresh) return { tokens: src.fresh(), extra: [] };
    var bank = (src.bank || src.tokens || []).slice();
    var stage = src.stage || "key";
    if (stage === "word" || stage === "end") {
      var extra = weakInBank(bank);
      return { tokens: bank.concat(extra), extra: extra };
    }
    return { tokens: bank, extra: [] };
  }
  function startLesson(index) {
    var src = KD.LESSONS[index];
    if (!src || !unlocked(index)) return;
    stopTick();
    stopPlayback();
    playState = null;
    var lesson = plainLesson(src);
    var built = tokensFor(src);
    var tokens = built.tokens;
    var names = (built.extra || []).map(function (t) { return t.h; });
    var fixedLine = names.length
      ? "Same words. Repeated at the end: " + names.join(" · ")
      : "The words in this lesson stay fixed. Nothing new is added while you type.";
    lesson.tokens = tokens;
    var steps = KD.buildSteps(tokens);
    session = {
      kind: lesson.wordlock ? "lock" : "exact",
      phase: "intro",
      lesson: lesson,
      index: index,
      tokens: tokens,
      steps: steps,
      i: 0,
      words: tokens.map(function (t) { return { h: t.h, k: t.k, lang: "hi" }; }),
      wi: 0,
      typed: "",
      marks: [],
      wrong: [],
      tape: [],
      slips: [],
      typedWords: [],
      extra: 0,
      fixedLine: fixedLine,
      correct: 0,
      errors: 0,
      t0: null,
      limit: null,
      anchor: null,
      hand: lesson.hand || "",
      handWarn: false,
      holding: true,
      showFix: true,
      hints: lesson.hints,
      lang: "hi",
      exam: null,
      altDown: false,
      altBuf: "",
      caps: false,
      layoutWarn: false,
      lastFix: "",
      lastTap: null,
      tapN: 0
    };
    screen = "run";
    paintShell();
  }
  function startLive(mode) {
    ensureLive();
    var src = store.live.lesson;
    var labels = KD.liveLabels(store);
    if (mode === "restart") store.live.resume = null;
    stopTick();
    stopPlayback();
    playState = null;
    var tokens = (src.tokens || []).map(function (t) { return { k: t.k, h: t.h }; });
    var lesson = {
      id: src.id,
      title: labels ? labels.title : src.title,
      teach: labels ? labels.teach : src.teach,
      finger: (labels && labels.finger) || src.finger || "From your last result",
      acc: src.acc || 94,
      min: src.min || 14,
      mid: src.mid || 22,
      high: src.high || 32,
      hints: src.hints || "hindi",
      wordlock: !!src.wordlock,
      stage: "live",
      pattern: src.pattern,
      tokens: tokens
    };
    var steps = KD.buildSteps(tokens);
    var resume = mode === "restart" ? null : liveResume();
    var doneAlready = resume && (
      (lesson.wordlock && (resume.wi || 0) >= tokens.length) ||
      (!lesson.wordlock && (resume.i || 0) >= steps.length)
    );
    if (doneAlready) {
      store.live.resume = null;
      resume = null;
    }
    var phase = resume && resume.phase === "run" ? "run" : "intro";
    var i = resume ? (resume.i || 0) : 0;
    var wi = resume ? (resume.wi || 0) : 0;
    if (i < 0) i = 0;
    if (i > steps.length) i = steps.length;
    if (wi < 0) wi = 0;
    if (wi > tokens.length) wi = tokens.length;
    session = {
      kind: lesson.wordlock ? "lock" : "exact",
      phase: phase,
      lesson: lesson,
      index: -1,
      live: true,
      tokens: tokens,
      steps: steps,
      i: i,
      words: tokens.map(function (t) { return { h: t.h, k: t.k, lang: "hi" }; }),
      wi: wi,
      typed: resume ? (resume.typed || "") : "",
      marks: resume && Array.isArray(resume.marks) ? resume.marks.slice() : [],
      wrong: resume && Array.isArray(resume.wrong) ? resume.wrong.slice() : [],
      tape: resume && Array.isArray(resume.tape) ? resume.tape.slice() : [],
      slips: resume && Array.isArray(resume.slips) ? resume.slips.slice() : [],
      typedWords: resume && Array.isArray(resume.typedWords) ? resume.typedWords.slice() : [],
      extra: 0,
      fixedLine: "",
      correct: resume ? (resume.correct || 0) : 0,
      errors: resume ? (resume.errors || 0) : 0,
      t0: phase === "run" && resume && resume.elapsed ? performance.now() - resume.elapsed : null,
      limit: null,
      anchor: null,
      hand: "",
      handWarn: false,
      holding: true,
      showFix: true,
      hints: lesson.hints,
      lang: "hi",
      exam: null,
      altDown: false,
      altBuf: "",
      caps: false,
      layoutWarn: false,
      lastFix: "",
      lastTap: null,
      tapN: 0
    };
    screen = "run";
    paintShell();
    if (mode === "restart") save();
  }

  function startLock(opts) {
    session = {
      kind: "lock",
      phase: "intro",
      lesson: {
        id: opts.id,
        title: opts.title,
        teach: opts.teach,
        finger: opts.finger || "whole hand",
        acc: 96,
        min: 18,
        mid: 28,
        high: 40,
        hints: opts.hints || "hindi",
        stage: opts.id === "para" ? "para" : ""
      },
      index: -1,
      tokens: [],
      steps: [],
      i: 0,
      words: opts.words,
      wi: 0,
      typed: "",
      marks: [],
      wrong: [],
      correct: 0,
      errors: 0,
      t0: null,
      limit: opts.limit || null,
      anchor: null,
      holding: true,
      showFix: opts.showFix !== false,
      hints: opts.hints || "none",
      lang: opts.lang || "hi",
      exam: opts.exam || null,
      placement: !!opts.placement,
      altDown: false,
      altBuf: "",
      caps: false,
      layoutWarn: false,
      lastFix: "",
      lastTap: null,
      tapN: 0
    };
    screen = "run";
    paintShell();
  }

  function drillSize() {
    var n = parseInt(store.settings && store.settings.textSize, 10);
    if (!(n >= 18 && n <= 40)) n = 24;
    return n;
  }
  function paintShell() {
    if (!session) return;
    document.body.classList.add("fit");
    app.innerHTML = bar('<span class="check"><input id="snd" type="checkbox"' + (store.settings.sound ? " checked" : "") + "> Sound</span>" +
      '<label class="size">Text <input id="text-size" type="range" min="18" max="40" value="' + drillSize() + '"></label>') +
      '<div class="wrap narrow"><div id="run"></div></div>';
    var snd = document.getElementById("snd");
    if (snd) snd.addEventListener("change", function () { store.settings.sound = snd.checked; save(); });
    var size = document.getElementById("text-size");
    if (size) {
      size.oninput = function () {
        var n = parseInt(size.value, 10);
        if (!(n >= 18 && n <= 40)) return;
        store.settings.textSize = n;
        var stage = document.querySelector(".stage");
        if (stage) stage.style.setProperty("--drill", n + "px");
        placeCaret();
      };
      size.onchange = function () { save(); };
    }
    bindStatic();
    paint();
    if (session.phase === "run") ensureTick();
  }

  function elapsed() {
    if (!session || !session.t0) return 0;
    return performance.now() - session.t0;
  }
  function remain() {
    if (!session || !session.limit || !session.t0) return session && session.limit ? session.limit : null;
    return Math.max(0, session.limit - elapsed());
  }
  function clock(ms) {
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function currentStep() {
    if (!session || session.kind !== "exact") return null;
    return session.steps[session.i] || null;
  }
  function nextLockStep() {
    if (!session || session.kind !== "lock") return null;
    var word = session.words[session.wi];
    if (!word) return null;
    if (session.typed && word.k.indexOf(session.typed) !== 0) return null;
    var rest = word.k.slice(session.typed.length);
    if (!rest) return { code: "Space", shift: false, finger: "th", type: "key" };
    var st = KD.stepsFromKruti(rest.charAt(0))[0];
    return st || null;
  }

  function paint() {
    var run = document.getElementById("run");
    if (!run || !session) return;
    if (session.phase === "intro") {
      run.innerHTML = introHTML();
      var b = document.getElementById("start-run");
      if (b) b.onclick = beginRun;
      placeCaret();
      return;
    }
    var quietKeys = session.hints === "none" && (session.exam || (session.lesson && session.lesson.stage === "para"));
    var next = session.kind === "exact" ? currentStep() : (quietKeys ? null : nextLockStep());
    if (quietKeys) next = null;
    var acc = accuracy();
    var wpm = KD.keyWpm(session.kind === "exact" ? session.correct : typedKeys(), elapsed());
    var timeBit = session.limit
      ? '<div><b>' + clock(session.t0 ? remain() : session.limit) + "</b><span>Left</span></div>"
      : '<div><b>' + clock(elapsed()) + "</b><span>Time</span></div>";
    var liveMarks = "";
    if (session.kind === "lock") {
      var okw = session.marks.filter(function (m) { return m === "ok"; }).length;
      if (session.exam) {
        var mk = session.lang === "en" ? KD.englishMarks(okw) : KD.hindiMarks(okw);
        liveMarks = '<div><b>' + fmt(mk) + "</b><span>Marks / 25</span></div>";
      } else {
        liveMarks = '<div><b>' + okw + "</b><span>Correct words</span></div>";
      }
    }
    var banners = "";
    if (session.caps) banners += '<div class="banner bad">Turn Caps Lock off. In Kruti, Shift makes a half letter. Caps Lock breaks the hand habit.</div>';
    if (session.layoutWarn) banners += '<div class="banner bad">Set the Windows keyboard to English (US). Kruti Dev is not a Hindi keyboard.</div>';
    if (session.hand && session.phase === "run") {
      if (session.handWarn) {
        banners += '<div class="banner bad">' + (session.hand === "left"
          ? "That key is the right hand. In this drill the right hand stays home. Do not hold J."
          : "That key is the left hand. In this drill the left hand stays home. Do not hold F.") + "</div>";
      } else {
        banners += '<div class="banner">' + (session.hand === "left"
          ? "Right hand stays quiet on home. Only the left hand types."
          : "Left hand stays quiet on home. Only the right hand types.") + "</div>";
      }
    }
    var body = session.kind === "exact" ? exactHTML() : lockHTML();
    var pad = "";
    if (next && next.type === "alt") pad = numpadHTML(next.num);
    run.innerHTML =
      '<div class="run-top"><div><div class="kicker">' + esc(session.lesson.title) + "</div>" +
      (session.live ? liveNote() : "") +
      "</div>" +
      '<div class="meters">' + timeBit +
      '<div><b>' + fmt(wpm) + "</b><span>Key WPM</span></div>" +
      '<div><b>' + Math.round(acc) + "%</b><span>Accuracy</span></div>" +
      liveMarks + "</div></div>" +
      banners +
      '<div class="stage" style="--drill:' + drillSize() + 'px">' + body + "</div>" +
      keyboardHTML(session.hints === "none" && session.exam ? null : next) +
      pad;
    bindPad();
    var cur = document.querySelector(".box.now, .word.now");
    var wordMark = session.wi;
    if (session.kind === "exact") {
      var stNow = currentStep();
      wordMark = stNow && stNow.ti >= 0 ? stNow.ti : session.i;
    }
    if (cur && wordMark !== session._scrolled) {
      session._scrolled = wordMark;
      cur.scrollIntoView({ block: "nearest" });
    }
    placeCaret();
  }

  function accuracy() {
    if (session.kind === "exact") {
      var d = session.correct + session.errors;
      return d ? (session.correct / d) * 100 : 100;
    }
    if (!session.marks.length) return 100;
    var ok = session.marks.filter(function (m) { return m === "ok"; }).length;
    return (ok / session.marks.length) * 100;
  }
  function typedKeys() {
    var n = 0;
    session.marks.forEach(function (m, i) { n += session.words[i].k.length + 1; });
    n += session.typed.length;
    return n;
  }

  function liveNote() {
    return "";
  }
  function introHTML() {
    var L = session.lesson;
    var preview = session.kind === "exact" ? exactHTML() : lockHTML();
    var quietKeys = session.hints === "none" && (session.exam || (session.lesson && session.lesson.stage === "para"));
    var first = quietKeys ? null : (session.kind === "exact" ? (session.steps[0] || null) : nextLockStep());
    var face = "";
    if (L.newKey && KD.BY_CODE[L.newKey]) {
      var keyMeta = KD.BY_CODE[L.newKey];
      face = KD.keyFace(keyMeta.normal) || KD.keyFace(keyMeta.shifted) || "";
    }
    return '<div class="card"><div class="fit-head"><div class="fit-title"><h2>' +
      (face ? '<span class="fit-glyph">' + esc(face) + "</span>" : "") +
      esc(L.title) + "</h2>" +
      liveNote() +
      '</div><button class="btn primary" id="start-run">Start typing</button></div>' +
      '<div class="stage" style="--drill:' + drillSize() + 'px">' + preview + "</div>" +
      keyboardHTML(first) +
      "</div>";
  }

  function formedHTML() {
    var live = KD.liveForm(session.typed);
    var html = esc(live.text || "");
    if (live.wait) html += '<span class="wait">mark</span>';
    return html || " ";
  }

  function krutiSoFar(ti) {
    var out = "";
    var steps = session.steps || [];
    var limit = session.i;
    for (var s = 0; s < limit && s < steps.length; s++) {
      var st = steps[s];
      if (!st || st.ti !== ti || st.space) continue;
      if (st.ch) out += st.ch;
    }
    return out;
  }
  function boxHTML(state, target, formed, flash, wait) {
    var cls = "box " + (state === "wait" ? "ahead" : state) + (flash && state === "now" ? " miss" : "");
    if (state !== "now") return '<span class="' + cls + '">' + esc(target) + "</span>";
    var at = 0;
    if (formed && target.indexOf(formed) === 0) at = formed.length;
    if (at === (target || "").length && at > 0) cls += " typed";
    var pill = wait ? '<span class="wait">mark</span>' : "";
    return '<span class="' + cls + '">' +
      pill +
      '<span class="ink">' + esc(target) + "</span>" +
      '<span class="over" aria-hidden="true">' + esc(target) + "</span>" +
      '<span class="caret" data-at="' + at + '"></span></span>';
  }
  function placeCaret() {
    var box = document.querySelector(".box.now");
    if (!box) return;
    var caret = box.querySelector(".caret");
    var ink = box.querySelector(".ink");
    var over = box.querySelector(".over");
    var node = ink && ink.firstChild;
    if (!caret || !node || node.nodeType !== 3) return;
    var text = node.textContent || "";
    var at = parseInt(caret.getAttribute("data-at"), 10);
    if (isNaN(at) || at < 0) at = 0;
    if (at > text.length) at = text.length;
    /* A DOM range returns the whole Devanagari cluster, so ी is measured
       as the extra width of the typed prefix instead of as its own box. */
    var probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0;pointer-events:none;";
    box.appendChild(probe);
    function widthOf(s) {
      probe.textContent = s || "";
      return probe.getBoundingClientRect().width;
    }
    function isMark(i) {
      var cp = text.charCodeAt(i);
      return (cp >= 0x0900 && cp <= 0x0903) || cp === 0x093c ||
        (cp >= 0x093e && cp <= 0x094d) || (cp >= 0x0951 && cp <= 0x0957) ||
        cp === 0x0962 || cp === 0x0963;
    }
    var inkRect = ink.getBoundingClientRect();
    var origin = inkRect.left - box.getBoundingClientRect().left;
    var fullW = widthOf(text);
    var scale = fullW > 0.5 ? inkRect.width / fullW : 1;
    var green = 0;
    var left = 0;
    var width = 12;
    if (at >= text.length) {
      left = fullW;
      width = Math.max(fullW * 0.08, 10);
      green = fullW;
    } else {
      var prevW = widthOf(text.slice(0, at));
      var nextW = widthOf(text.slice(0, at + 1));
      var grow = nextW - prevW;
      var cp = text.charCodeAt(at);
      var prebase = cp === 0x093f || cp === 0x094e;
      if (prebase || (grow < 1.5 && isMark(at))) {
        var syl = at;
        while (syl > 0 && isMark(syl - 1)) syl--;
        var before = widthOf(text.slice(0, syl));
        green = before;
        left = before;
        width = prebase ? Math.max(grow, 6) : Math.max(prevW - before, 8);
      } else {
        green = prevW;
        left = prevW;
        width = Math.max(grow, 4);
      }
    }
    if (over && at < text.length) {
      over.style.left = origin + "px";
      over.style.width = Math.max(0, green * scale) + "px";
    }
    caret.style.left = Math.max(0, origin + left * scale) + "px";
    caret.style.width = Math.max(4, width * scale) + "px";
    probe.remove();
  }
  function exactHTML() {
    var stepAt = session.steps[session.i];
    var flash = session.flash && (performance.now() - session.flash < 220);
    var spaceAfter = -1;
    if (stepAt && stepAt.space) {
      for (var b = session.i - 1; b >= 0; b--) {
        if (session.steps[b] && session.steps[b].ti >= 0) {
          spaceAfter = session.steps[b].ti;
          break;
        }
      }
    }
    var html = '<div class="line">';
    session.tokens.forEach(function (tok, index) {
      var past = true;
      for (var s = session.i; s < session.steps.length; s++) {
        if (session.steps[s].ti === index) { past = false; break; }
      }
      var cur = stepAt && stepAt.ti === index;
      var state = "wait";
      if (cur || index === spaceAfter) state = "now";
      else if (past) state = "done";
      var formed = "";
      var wait = false;
      if (state === "now") {
        var k = krutiSoFar(index);
        if (k) {
          var live = KD.liveForm(k);
          var text = live.text || "";
          if (text && (tok.h || "").indexOf(text) === 0) {
            formed = text;
            wait = !!live.wait;
          }
        }
      }
      html += boxHTML(state, tok.h || "·", formed, flash, wait);
    });
    return html + "</div>";
  }
  function lockHTML() {
    if (session.exam || (session.lesson && session.lesson.stage === "para")) return mockHTML();
    var flash = session.flash && (performance.now() - session.flash < 220);
    var html = '<div class="line' + (session.lang === "en" ? " en" : "") + '">';
    session.words.forEach(function (w, i) {
      var state = "wait";
      if (i < session.wi) state = session.marks[i] === "ok" ? "done" : "bad";
      if (i === session.wi) state = "now";
      var formed = "";
      var wait = false;
      if (state === "now" && session.typed) {
        if (session.lang === "en") formed = session.typed;
        else {
          var live = KD.liveForm(session.typed);
          var text = live.text || "";
          var onPath = (w.k || "").indexOf(session.typed) === 0;
          if (text && w.h.indexOf(text) === 0) {
            formed = text;
            wait = !!live.wait;
          } else if (!onPath && text) {
            formed = text;
          }
        }
      }
      html += boxHTML(state, w.h, formed, flash, wait);
    });
    html += "</div>";
    if (session.showFix && session.lastFix) html += '<div class="fix">' + esc(session.lastFix) + "</div>";
    return html;
  }
  function mockHTML() {
    var exam = !!session.exam;
    var cls = session.lang === "en" ? " en" : "";
    var master = "";
    session.words.forEach(function (w, i) {
      var c = "";
      if (i === session.wi) c = "now";
      else if (!exam && i < session.wi) c = session.marks[i] === "ok" ? "ok" : "bad";
      master += '<span class="word ' + c + '">' + esc(w.h) + "</span> ";
    });
    var typed = "";
    var snaps = session.typedWords || [];
    for (var i = 0; i < session.wi; i++) {
      var snap = snaps[i];
      var text = snap ? snap.text : session.words[i].h;
      typed += '<span class="word ' + (session.marks[i] === "ok" ? "ok" : "bad") + '">' + esc(text) + "</span> ";
    }
    var cur = session.lang === "en" ? esc(session.typed || "") : formedHTML();
    typed += '<span class="word now">' + cur + "</span>";
    return '<div class="mock"><div class="mock-pane"><div class="mock-k">Master</div><div class="passage' + cls + '">' + master + "</div></div>" +
      '<div class="mock-pane"><div class="mock-k">Type</div><div class="typed-line' + cls + '">' + typed + "</div></div>" +
      (session.showFix && session.lastFix ? '<div class="fix">' + esc(session.lastFix) + "</div>" : "") +
      "</div>";
  }

  function numpadHTML(num) {
    var digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    return '<div class="numpad"><button class="alt-hold' + (session.altDown ? " on" : "") + '" id="alt-hold">Hold Alt</button>' +
      '<div class="pad">' + digits.map(function (d) { return '<button data-digit="' + d + '">' + d + "</button>"; }).join("") +
      '<button id="alt-go">Release</button></div>' +
      '<div><div class="kicker">Number pad</div><b>' + esc(session.altBuf || "····") + "</b><div class=\"small muted\">Needed Alt+" + esc(num) + "<br>The exam forbids Alt. This character has no finger key.</div></div></div>";
  }
  function bindPad() {
    var hold = document.getElementById("alt-hold");
    var go = document.getElementById("alt-go");
    if (hold) hold.onclick = function () { session.altDown = true; session.altBuf = ""; paint(); };
    if (go) go.onclick = function () { finishAlt(); };
    Array.prototype.forEach.call(document.querySelectorAll("[data-digit]"), function (b) {
      b.onclick = function () {
        if (!session.altDown) session.altDown = true;
        session.altBuf += b.getAttribute("data-digit");
        paint();
      };
    });
  }

  function beginRun() {
    session.phase = "run";
    session.holding = true;
    paint();
    ensureTick();
    if (session.live) save();
  }
  function ensureTick() {
    stopTick();
    tick = setInterval(function () {
      if (!session || session.phase !== "run") return;
      if (session.limit && session.t0 && remain() <= 0) finish();
      else paint();
    }, 400);
  }

  function tapIdOf(step) {
    if (!step) return "";
    if (step.space || step.code === "Space") return "Space";
    if (step.type === "alt") return "alt:" + parseInt(step.num, 10);
    if (!step.code || step.code === "UNMAPPED") return "";
    return step.shift ? step.code + "+S" : step.code;
  }
  function rememberTap(step) {
    var id = tapIdOf(step);
    if (!id || !session) return;
    var now = performance.now();
    var prev = session.lastTap;
    var dt = prev ? now - prev.t : 0;
    var noted = KD.noteTap(store.touch, prev, id, dt);
    store.touch = noted.touch;
    session.lastTap = { id: id, t: now };
    session.tapN = (session.tapN || 0) + 1;
    if (session.tapN % 12 === 0) save();
  }
  function forgetTiming() {
    if (session) session.lastTap = null;
  }

  function armFlash() {
    if (!session) return;
    session.flash = performance.now();
    setTimeout(function () {
      if (!session || session.phase !== "run") return;
      if (session.flash && performance.now() - session.flash >= 200) paint();
    }, 230);
  }
  function miss(code, info) {
    session.errors++;
    forgetTiming();
    pushTape(false, info || null);
    if (code) store.misses[code] = (store.misses[code] || 0) + 1;
    beep(false);
    save();
    armFlash();
    paint();
  }
  function advance() {
    session.handWarn = false;
    var stepNow = currentStep();
    pushTape(true, {
      si: session.i,
      ti: stepNow && stepNow.ti != null ? stepNow.ti : -1,
      wi: -1
    });
    rememberTap(stepNow);
    session.correct++;
    if (!session.t0) session.t0 = performance.now();
    session.i++;
    beep(true);
    if (session.i >= session.steps.length) finish();
    else {
      paint();
      if (session.live) save();
    }
  }
  function finishAlt() {
    var step = currentStep();
    var got = parseInt(session.altBuf, 10);
    var want = step && step.type === "alt" ? parseInt(step.num, 10) : NaN;
    session.altDown = false;
    var buf = session.altBuf;
    session.altBuf = "";
    if (!buf) { paint(); return; }
    if (session.kind === "exact") {
      if (got === want) advance();
      else {
        miss(step ? step.code : "alt", {
          si: session.i,
          ti: step && step.ti != null ? step.ti : -1,
          wi: -1,
          word: wordAtStep(step),
          want: step && step.type === "alt" ? "Alt+" + step.num : faceOfStep(step),
          got: buf || ""
        });
        paint();
      }
    } else {
      if (!isNaN(got)) {
        var chAlt = String.fromCharCode(got);
        var wordAlt = session.words[session.wi];
        var expectAlt = wordAlt && wordAlt.k.indexOf(session.typed) === 0 ? wordAlt.k.charAt(session.typed.length) : "";
        if (expectAlt && chAlt === expectAlt) rememberTap({ type: "alt", num: String(got) });
        else forgetTiming();
        session.typed += chAlt;
      }
      if (!session.t0) session.t0 = performance.now();
      paint();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { go("home"); return; }
    if (screen === "result" || screen === "lesson") {
      if (e.key === "Enter") {
        var pri = document.querySelector(".row-btns .btn.primary");
        if (pri) {
          e.preventDefault();
          pri.click();
          return;
        }
      }
    }
    if (!session || screen !== "run") return;
    if (session.phase === "intro") {
      if (e.key === "Enter" || e.code === "Space") {
        e.preventDefault();
        beginRun();
        return;
      }
      var step0 = currentStep();
      if (step0 && e.code === step0.code && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        beginRun();
        if (session.kind === "exact") exactKey(e);
        return;
      }
      return;
    }
    if (e.repeat && e.key !== "Backspace") return;
    if (e.getModifierState && e.getModifierState("CapsLock") && e.key !== "CapsLock") {
      session.caps = true;
      e.preventDefault();
      paint();
      return;
    }
    session.caps = false;
    if (e.code && e.code.indexOf("Key") === 0 && e.key && e.key.length === 1 && "abcdefghijklmnopqrstuvwxyz".indexOf(e.key.toLowerCase()) < 0) {
      session.layoutWarn = true;
    }
    if (session.kind === "exact") exactKey(e);
    else lockKey(e);
  }
  function exactKey(e) {
    if (e.key === "Alt") {
      session.altDown = true;
      session.altBuf = "";
      e.preventDefault();
      return;
    }
    if (session.altDown && e.code && e.code.indexOf("Numpad") === 0) {
      session.altBuf += e.code.replace("Numpad", "");
      e.preventDefault();
      paint();
      return;
    }
    if (e.key === "Shift" || e.key === "Control" || e.key === "Meta" || e.key === "Tab") return;
    var step = currentStep();
    if (!step) return;
    e.preventDefault();
    if (step.type === "alt") {
      miss("alt", {
        si: session.i,
        ti: step.ti != null ? step.ti : -1,
        wi: -1,
        word: wordAtStep(step),
        want: "Alt+" + (step.num || ""),
        got: ""
      });
      return;
    }
    if (session.hand && e.code && e.code !== "Space") {
      var pressed = KD.handOf(e.code);
      if (pressed && pressed !== session.hand) {
        session.handWarn = true;
        miss(step.code, {
          si: session.i,
          ti: step.ti != null ? step.ti : -1,
          wi: -1,
          word: wordAtStep(step),
          want: faceOfStep(step),
          got: faceOfEvent(e)
        });
        paint();
        return;
      }
    }
    session.handWarn = false;
    if (e.code === step.code && !!e.shiftKey === !!step.shift) advance();
    else miss(step.code, {
      si: session.i,
      ti: step.ti != null ? step.ti : -1,
      wi: -1,
      word: wordAtStep(step),
      want: faceOfStep(step),
      got: faceOfEvent(e)
    });
  }

  function lockKey(e) {
    if (e.key === "Alt") {
      session.altDown = true;
      session.altBuf = "";
      e.preventDefault();
      return;
    }
    if (session.altDown && e.code && e.code.indexOf("Numpad") === 0) {
      session.altBuf += e.code.replace("Numpad", "");
      e.preventDefault();
      paint();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      if (session.typed.length) session.typed = session.typed.slice(0, -1);
      forgetTiming();
      paint();
      return;
    }
    if (e.code === "Space" || e.key === " " || e.code === "Enter" || e.key === "Enter") {
      e.preventDefault();
      commitWord();
      return;
    }
    if (e.key === "Shift" || e.key === "Control" || e.key === "Meta" || e.key === "Tab") return;
    var ch = KD.legacyFromEvent(e);
    if (ch == null) return;
    e.preventDefault();
    if (!session.t0) session.t0 = performance.now();
    var word = session.words[session.wi];
    var expect = word && word.k.indexOf(session.typed) === 0 ? word.k.charAt(session.typed.length) : "";
    if (expect && ch === expect) {
      rememberTap(KD.stepsFromKruti(expect)[0]);
      beep(true);
    } else {
      if (expect && ch !== expect) {
        var st = KD.stepsFromKruti(expect)[0];
        if (st && st.code) store.misses[st.code] = (store.misses[st.code] || 0) + 1;
        session.errors++;
        beep(false);
        armFlash();
      } else beep(true);
      forgetTiming();
    }
    session.typed += ch;
    if (session.typed.length > 48) session.typed = session.typed.slice(0, 48);
    paint();
  }

  document.addEventListener("keyup", function (e) {
    if (!session) return;
    if (e.key === "Alt" && session.altDown) {
      e.preventDefault();
      finishAlt();
    }
  });
  document.addEventListener("keydown", onKeyDown);

  function commitWord() {
    var word = session.words[session.wi];
    if (!word) return;
    if (!session.t0) session.t0 = performance.now();
    var ok;
    if (session.lang === "en") ok = session.typed === word.h;
    else ok = KD.cleanUni(KD.krutiToUnicode(session.typed)) === KD.cleanUni(word.h);
    session.marks.push(ok ? "ok" : "bad");
    var got = "";
    if (!session.typedWords) session.typedWords = [];
    if (!ok) {
      got = session.lang === "en" ? (session.typed || "—") : (KD.preview(session.typed) || "—");
      session.wrong.push({ want: word.h, got: got });
      session.typedWords[session.wi] = { text: got || "—", ok: false };
      pushTape(false, { si: -1, ti: -1, wi: session.wi, word: word.h, want: word.h, got: got });
    } else {
      session.typedWords[session.wi] = { text: word.h, ok: true };
      pushTape(true, { si: -1, ti: -1, wi: session.wi });
    }
    if (!ok) {
      session.lastFix = session.showFix ? ("Locked. Wanted " + word.h + " · you typed " + got) : "";
      beep(false);
    } else {
      session.lastFix = "";
      beep(true);
      rememberTap({ code: "Space", shift: false, space: true });
    }
    if (!ok) forgetTiming();
    session.typed = "";
    session.wi++;
    if (session.wi >= session.words.length) finish();
    else {
      paint();
      if (session.live) save();
    }
  }

  function finish() {
    stopTick();
    session.phase = "done";
    var ms = elapsed();
    if (session.placement) applyPlacement();
    if (session.kind === "exact") {
      var acc = accuracy();
      var wpm = KD.keyWpm(session.correct, ms);
      var stars = KD.starsFor(wpm, acc, session.lesson);
      if (session.lesson.id && session.index >= 0) {
        store.stars[session.lesson.id] = Math.max(store.stars[session.lesson.id] || 0, stars);
      }
      session.result = { kind: "exact", acc: acc, wpm: wpm, stars: stars, ms: ms };
    } else {
      var okw = session.marks.filter(function (m) { return m === "ok"; }).length;
      var badw = session.marks.length - okw;
      var marks = session.lang === "en" ? KD.englishMarks(okw) : KD.hindiMarks(okw);
      var minutes = Math.max(ms / 60000, 1 / 60);
      var wordRate = okw / minutes;
      var keyRate = KD.keyWpm(typedKeys(), ms);
      session.result = {
        kind: "lock",
        correct: okw,
        wrong: badw,
        total: session.words.length,
        done: session.marks.length,
        marks: marks,
        wordRate: wordRate,
        wpm: keyRate,
        ms: ms,
        acc: session.marks.length ? (okw / session.marks.length) * 100 : 0
      };
      if (session.exam && session.lang === "hi") {
        if (!store.bestHi || marks > store.bestHi.marks) store.bestHi = { marks: marks, correct: okw, at: Date.now() };
      }
      if (session.exam && session.lang === "en") {
        if (!store.bestEn || marks > store.bestEn.marks) store.bestEn = { marks: marks, correct: okw, at: Date.now() };
      }
      if (session.index >= 0 && session.lesson && session.lesson.acc) {
        var stars2 = KD.starsFor(keyRate, session.result.acc, session.lesson);
        if (session.marks.length === session.words.length) {
          store.stars[session.lesson.id] = Math.max(store.stars[session.lesson.id] || 0, stars2);
          session.result.stars = stars2;
        } else session.result.stars = 0;
      }
    }
    if (session.index >= 0) store.touch.rest = "";
    else if (session.lesson && session.lesson.id === "coach") store.touch.rest = session.coachId || "coach";
    var at = Date.now();
    if (session.live && session.lesson && session.result && session.result.stars == null) {
      var liveStars = KD.starsFor(session.result.wpm, session.result.acc, session.lesson);
      if (session.kind === "lock" && session.marks.length !== session.words.length) liveStars = 0;
      session.result.stars = liveStars;
    }
    if (session.index >= 0 && session.lesson && session.lesson.id) {
      store.tries = KD.pushAttempt(store.tries, session.lesson.id, {
        at: at,
        acc: Math.round((session.result && session.result.acc) || 0),
        wpm: Math.round(((session.result && session.result.wpm) || 0) * 10) / 10,
        stars: session.result ? (session.result.stars || 0) : 0,
        marks: session.result && session.result.marks != null ? Math.round(session.result.marks * 10) / 10 : null,
        ms: ms,
        tape: session.tape || [],
        slips: session.slips || [],
        words: (session.tokens || []).map(function (t) { return t.h; })
      });
      askCoach();
      focusIndex = session.index;
      var saved = attemptsFor(session.lesson.id);
      var lastN = saved.length - 1;
      playState = lastN >= 0 && saved[lastN].tape && saved[lastN].tape.length
        ? { n: lastN, i: saved[lastN].tape.length, on: false }
        : null;
    }
    store.log.push({
      at: at,
      id: session.lesson ? session.lesson.id : "",
      title: session.lesson ? session.lesson.title : "",
      index: session.index,
      acc: Math.round((session.result && session.result.acc) || 0),
      wpm: Math.round(((session.result && session.result.wpm) || 0) * 10) / 10,
      stars: (session.index >= 0 || session.live) && session.result ? (session.result.stars || 0) : 0,
      marks: session.result && session.result.marks != null ? Math.round(session.result.marks * 10) / 10 : null
    });
    if (store.log.length > 24) store.log = store.log.slice(store.log.length - 24);
    if (session.live && session.lesson && store.live && store.live.lesson) {
      store.live.resume = null;
      store.stars[session.lesson.id] = Math.max(store.stars[session.lesson.id] || 0, session.result.stars || 0);
      var slips = [];
      (session.slips || []).forEach(function (sl) {
        var w = sl && (sl.word || sl.want);
        if (w && slips.indexOf(w) < 0) slips.push(w);
      });
      store.live.past = store.live.past || [];
      store.live.past.push({
        id: session.lesson.id,
        pattern: session.lesson.pattern || store.live.lesson.pattern,
        stars: session.result.stars || 0,
        acc: Math.round(session.result.acc || 0),
        wpm: Math.round((session.result.wpm || 0) * 10) / 10,
        slips: slips.slice(0, 12),
        at: at
      });
      if (store.live.past.length > 40) store.live.past = store.live.past.slice(-40);
      store.tries = KD.pushAttempt(store.tries, session.lesson.id, {
        at: at,
        acc: Math.round(session.result.acc || 0),
        wpm: Math.round((session.result.wpm || 0) * 10) / 10,
        stars: session.result.stars || 0,
        marks: null,
        ms: ms,
        tape: session.tape || [],
        slips: session.slips || [],
        words: (session.tokens || []).map(function (t) { return t.h; })
      });
      store.live.lesson = KD.composeLive(store);
      askCoach();
    }
    save();
    screen = session.index >= 0 && session.lesson && session.lesson.id ? "lesson" : "result";
    session.phase = "done";
    draw();
  }

  function applyPlacement() {
    var by = {};
    session.words.forEach(function (w, i) {
      if (i >= session.marks.length || !w.skill) return;
      by[w.skill] = by[w.skill] || { ok: 0, bad: 0 };
      by[w.skill][session.marks[i] === "ok" ? "ok" : "bad"]++;
    });
    store.placed = store.placed || {};
    Object.keys(by).forEach(function (skill) {
      if (by[skill].bad === 0 && by[skill].ok >= 2) store.placed[skill] = true;
      else store.placed[skill] = false;
    });
    session.placeReport = by;
  }

  function attemptsFor(id) {
    var list = [];
    var seen = {};
    var book = store.tries && Array.isArray(store.tries[id]) ? store.tries[id] : [];
    book.forEach(function (row) {
      if (!row) return;
      list.push(row);
      if (row.at) seen[row.at] = true;
    });
    (store.log || []).forEach(function (row) {
      if (!row || row.id !== id || seen[row.at]) return;
      list.push(row);
    });
    list.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    return list;
  }
  function ago(at) {
    if (!at) return "—";
    var d = Date.now() - at;
    if (d < 60000) return "now";
    var mins = Math.floor(d / 60000);
    if (d < 3600000) return mins + " minute" + (mins === 1 ? "" : "s") + " ago";
    var hours = Math.floor(d / 3600000);
    if (d < 86400000) return hours + " hour" + (hours === 1 ? "" : "s") + " ago";
    if (d < 172800000) return "yesterday";
    var days = Math.floor(d / 86400000);
    if (d < 86400000 * 14) return days + " day" + (days === 1 ? "" : "s") + " ago";
    var dt = new Date(at);
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return dt.getDate() + " " + months[dt.getMonth()] + " " + dt.getFullYear();
  }
  function dur(ms) {
    if (!ms) return "—";
    var s = Math.round(ms / 1000);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function faceOfStep(step) {
    if (!step) return "";
    if (step.type === "alt") return "Alt+" + String(step.num || "");
    if (step.space || step.code === "Space") return "Space";
    var face = step.ch ? KD.keyFace(step.ch) : "";
    return face || step.legend || "";
  }
  function faceOfEvent(e) {
    if (!e) return "";
    var ch = KD.legacyFromEvent(e);
    if (ch) {
      var face = KD.keyFace(ch);
      if (face) return face;
    }
    var meta = KD.BY_CODE[e.code];
    return meta ? meta.legend : "";
  }
  function wordAtStep(step) {
    if (!step || step.ti == null || step.ti < 0 || !session || !session.tokens[step.ti]) return "";
    return session.tokens[step.ti].h || "";
  }
  function pushTape(ok, info) {
    if (!session || (session.index < 0 && !session.live)) return;
    if (!session.tape) session.tape = [];
    if (session.tape.length >= 240) return;
    var ev = {
      ok: ok ? 1 : 0,
      t: Math.round(elapsed()),
      si: info && info.si != null ? info.si : -1,
      ti: info && info.ti != null ? info.ti : -1,
      wi: info && info.wi != null ? info.wi : -1
    };
    session.tape.push(ev);
    if (!ok && info) {
      if (!session.slips) session.slips = [];
      if (session.slips.length >= 20) return;
      session.slips.push({
        i: session.tape.length - 1,
        word: info.word || "",
        want: info.want || "",
        got: info.got || ""
      });
    }
  }
  function latestPlayable(rows) {
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i].tape && rows[i].tape.length) return i;
    }
    return -1;
  }
  function runningStats(tape, n) {
    var cut = (tape || []).slice(0, n);
    var ok = 0;
    cut.forEach(function (ev) { if (ev.ok) ok++; });
    var t = cut.length ? cut[cut.length - 1].t : 0;
    return {
      acc: cut.length ? Math.round((ok / cut.length) * 100) : 100,
      wpm: KD.keyWpm(ok, t)
    };
  }
  function playTokens(lesson, attempt) {
    if (attempt && attempt.words && attempt.words.length) {
      return attempt.words.map(function (h) {
        var safe = KD.safeToken ? KD.safeToken(h) : null;
        return safe || { h: h, k: "" };
      });
    }
    return (lesson && lesson.tokens) ? lesson.tokens : [];
  }
  function wordColors(lesson, attempt, applied) {
    var tokens = playTokens(lesson, attempt);
    var state = [];
    for (var n = 0; n < tokens.length; n++) state.push("wait");
    var tape = attempt && attempt.tape ? attempt.tape : [];
    var limit = applied == null ? tape.length : applied;
    for (var i = 0; i < limit && i < tape.length; i++) {
      var ev = tape[i];
      var idx = ev.ti >= 0 ? ev.ti : ev.wi;
      if (idx < 0 || idx >= state.length) continue;
      if (!ev.ok) state[idx] = "bad";
      else if (state[idx] !== "bad") state[idx] = "ok";
    }
    return state;
  }
  function chartBlock(rows) {
    if (!rows.length) return "";
    var max = 1;
    rows.forEach(function (r) { if ((r.wpm || 0) > max) max = r.wpm; });
    var bars = rows.map(function (r) {
      var h = Math.max(2, Math.round(((r.wpm || 0) / max) * 100));
      return '<div class="speed-col"><div class="speed-track"><div class="speed-fill" style="height:' + h + '%"></div></div><span>' + Math.round(r.wpm || 0) + "</span></div>";
    }).join("");
    var w = 320;
    var hgt = 90;
    var pad = 10;
    var pts = rows.map(function (r, i) {
      var x = rows.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (rows.length - 1);
      var y = hgt - pad - ((r.acc || 0) / 100) * (hgt - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    var dots = rows.map(function (r, i) {
      var x = rows.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (rows.length - 1);
      var y = hgt - pad - ((r.acc || 0) / 100) * (hgt - pad * 2);
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5"></circle>';
    }).join("");
    return '<div class="charts"><div class="chart-card"><h3>Speed</h3><div class="speed-chart">' + bars + "</div></div>" +
      '<div class="chart-card"><h3>Accuracy</h3><svg class="chart-svg" viewBox="0 0 ' + w + " " + hgt + '"><polyline points="' + pts + '"></polyline>' + dots + "</svg></div></div>";
  }
  function slipList(slips) {
    if (!slips || !slips.length) return "<p class=\"small muted\">No miss was saved for this attempt.</p>";
    return '<ul class="wrong-list">' + slips.map(function (sl) {
      var bits = "";
      if (sl.word) bits += "Word <b class=\"h\">" + esc(sl.word) + "</b> · ";
      bits += "Wanted <b class=\"h\">" + esc(sl.want || "—") + "</b> · you typed <b class=\"h got\">" + esc(sl.got || "—") + "</b>";
      return "<li>" + bits + "</li>";
    }).join("") + "</ul>";
  }
  function wordPace(lesson, attempt, applied) {
    var tokens = playTokens(lesson, attempt);
    var tape = attempt && attempt.tape ? attempt.tape : [];
    var limit = applied == null ? tape.length : applied;
    var pace = [];
    var prev = 0;
    for (var n = 0; n < tokens.length; n++) {
      var evs = [];
      for (var i = 0; i < limit && i < tape.length; i++) {
        var ev = tape[i];
        var idx = ev.ti >= 0 ? ev.ti : ev.wi;
        if (idx === n) evs.push(ev);
      }
      if (!evs.length) { pace.push(""); continue; }
      var end = evs[evs.length - 1].t || 0;
      var keys = 0;
      evs.forEach(function (ev) { if (ev.ok) keys++; });
      var span = end - prev;
      if (keys && span >= 80) pace.push(String(Math.round((keys / 5) / (span / 60000))));
      else pace.push("");
      if (end > prev) prev = end;
    }
    return pace;
  }
  function dialHTML(label, value, p, plain) {
    var pct = plain ? 0 : Math.max(0, Math.min(100, p || 0));
    return '<div class="dial"><div class="dial-ring' + (plain ? " plain" : "") + '" style="--p:' + pct.toFixed(1) + '"><span>' + value + '</span></div><div class="dial-label">' + label + "</div></div>";
  }
  function playerInnerHTML() {
    var lesson = KD.LESSONS[focusIndex];
    if (!lesson || !playState) return "";
    var rows = attemptsFor(lesson.id);
    var att = rows[playState.n];
    if (!att) return "";
    var tape = att.tape || [];
    if (!tape.length) return '<p class="small muted">This older attempt has no playback. The next one will play here.</p>';
    var applied = Math.max(0, Math.min(playState.i, tape.length));
    var colors = wordColors(lesson, att, applied);
    var pace = wordPace(lesson, att, applied);
    var cur = applied < tape.length ? tape[applied] : null;
    var nowIdx = cur ? (cur.ti >= 0 ? cur.ti : cur.wi) : -1;
    var shownTokens = playTokens(lesson, att);
    var words = shownTokens.map(function (tok, i) {
      var cls = colors[i] + (i === nowIdx ? " now" : "");
      return '<span class="play-word ' + cls + '"><i>' + (pace[i] ? esc(pace[i]) : "") + "</i>" + esc(tok.h || "·") + "</span>";
    }).join("");
    var steps = KD.buildSteps(shownTokens);
    var next = cur && cur.si >= 0 ? steps[cur.si] : null;
    var run = runningStats(tape, applied);
    var liveSlip = null;
    if (cur && !cur.ok && att.slips) {
      for (var s = 0; s < att.slips.length; s++) if (att.slips[s].i === applied) liveSlip = att.slips[s];
    }
    var keys = cur ? keyboardHTML(next) : "";
    return '<div class="player"><div class="kicker">Playback</div>' +
      '<div class="play-line">' + words + "</div>" +
      (liveSlip ? '<div class="fix">Wanted ' + esc(liveSlip.want || "—") + " · you typed " + esc(liveSlip.got || "—") + "</div>" : "") +
      '<div class="meters"><div><b>' + fmt(run.wpm) + '</b><span>Speed</span></div><div><b>' + run.acc + '%</b><span>Accuracy</span></div><div><b>' + dur(applied ? tape[applied - 1].t : 0) + "</b><span>Time</span></div></div>" +
      '<div class="row-btns">' +
      (playState.on ? '<button class="btn" data-act="pause">Pause</button>' : '<button class="btn primary" data-act="replay">▶ Play</button>') +
      "</div>" + keys +
      (applied >= tape.length ? slipList(att.slips) : "") +
      "</div>";
  }
  function paintPlayer() {
    var box = document.getElementById("player");
    if (!box) return;
    box.innerHTML = playerInnerHTML();
    bindActs(box);
  }
  function startPlayback(n) {
    var lesson = KD.LESSONS[focusIndex];
    if (!lesson) return;
    var att = attemptsFor(lesson.id)[n];
    if (!att || !att.tape || !att.tape.length) return;
    stopPlayback();
    playState = { n: n, i: 0, on: true };
    paintPlayer();
    playTimer = setInterval(function () {
      if (!playState || !playState.on) return;
      var lessonNow = KD.LESSONS[focusIndex];
      var attNow = lessonNow ? attemptsFor(lessonNow.id)[playState.n] : null;
      if (!attNow || !attNow.tape) { stopPlayback(); return; }
      playState.i++;
      if (playState.i >= attNow.tape.length) {
        playState.i = attNow.tape.length;
        playState.on = false;
        stopPlayback();
      }
      paintPlayer();
    }, 260);
  }
  function lessonHTML() {
    var lesson = KD.LESSONS[focusIndex];
    if (!lesson) return '<div class="wrap"><div class="card">Lesson not found.</div></div>';
    var rows = attemptsFor(lesson.id);
    var stars = store.stars[lesson.id] || 0;
    var shown = rows.length > 12 ? rows.slice(rows.length - 12) : rows;
    var cards = shown.slice().reverse().map(function (r) {
      var n = rows.indexOf(r);
      var play = r.tape && r.tape.length
        ? '<button class="btn play-btn" data-act="play" data-try="' + n + '">▶</button>'
        : '<span class="small muted">Old</span>';
      return '<div class="attempt"><div class="when">' + esc(ago(r.at)) + "</div>" +
        '<div class="small-stars">' + starStr(r.stars || 0) + "</div>" +
        "<div><b>" + fmt(r.wpm || 0) + "</b><span>WPM</span></div>" +
        "<div><b>" + Math.round(r.acc || 0) + "%</b><span>Accuracy</span></div>" +
        "<div><b>" + dur(r.ms) + "</b><span>Time</span></div>" + play + "</div>";
    }).join("");
    var just = session && session.result && session.index === focusIndex && session.phase === "done";
    var focus = playState && rows[playState.n] ? rows[playState.n] : (rows.length ? rows[rows.length - 1] : null);
    var dials = "";
    if (focus) {
      var cap = lesson.high || 40;
      dials = '<div class="dials">' +
        dialHTML("Accuracy", Math.round(focus.acc || 0) + "%", focus.acc || 0, false) +
        dialHTML("Time", dur(focus.ms), 0, true) +
        dialHTML("Speed", fmt(focus.wpm || 0), Math.min(100, ((focus.wpm || 0) / cap) * 100), false) +
        "</div>";
    }
    var headline = just
      ? "<h2>" + ((stars >= 1 || (rows.length && rows[rows.length - 1].acc >= 80)) ? "Level Passed!" : "Stay on this lesson.") + "</h2>"
      : "<h2>" + esc(lesson.title) + "</h2>";
    var next = ((stars >= 1 || (rows.length && rows[rows.length - 1].acc >= 80)) && unlocked(focusIndex + 1))
      ? '<button class="btn primary" data-act="next">Next Level ▶</button>' : "";
    var headRow = cards
      ? '<div class="attempt head"><div>When</div><div>Stars</div><div>Speed</div><div>Accuracy</div><div>Time</div><div></div></div>'
      : "";
    return '<div class="wrap narrow"><div class="card">' +
      '<div class="kicker">' + (just ? esc(lesson.title) : "Attempts on this lesson") + "</div>" +
      headline +
      '<div class="stars">' + starStr(stars) + "</div>" +
      dials +
      chartBlock(shown) +
      '<div id="player">' + playerInnerHTML() + "</div>" +
      (cards ? "<h3>Earlier attempts</h3>" + headRow + cards : "<p>No attempt is saved for this lesson yet. Play it once and the score stays here.</p>") +
      '<div class="row-btns"><button class="btn saffron" data-act="practice">Practice again</button>' + next +
      '<button class="btn ghost" data-go="home">Course Map</button></div></div></div>';
  }
  function openLesson(index) {
    var lesson = KD.LESSONS[index];
    if (!lesson || !unlocked(index)) return;
    startLesson(index);
  }

  function aiCoachDiagnosisHTML() {
    var board = KD.coachBoard(store.touch);
    var pace = Math.round(board.pace || 0);
    var slowKey = board.slowKeys && board.slowKeys[0];
    var slowPair = board.slowPairs && board.slowPairs[0];
    var worstMiss = null;
    Object.keys(store.misses || {}).forEach(function (c) {
      if (!KD.drillable(c)) return;
      var cnt = store.misses[c] || 0;
      if (cnt >= 2 && (!worstMiss || cnt > worstMiss.n)) worstMiss = { c: c, n: cnt };
    });

    var note = (store.coach && store.coach.note) ? store.coach.note : fingerNote();
    var drillWords = (store.coach && store.coach.drill && store.coach.drill.length) ? store.coach.drill : null;
    var drillCount = drillWords ? drillWords.length : 8;

    var badges = [];
    if (slowKey) {
      badges.push('<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;">' +
        '<span style="color:var(--muted);display:block;font-size:11px;text-transform:uppercase;font-weight:600;">Slowest Key</span>' +
        '<b style="font-size:16px;color:var(--bad);">' + esc(faceOfId(slowKey.id)) + '</b> <span style="font-size:12px;color:var(--muted);">' + Math.round(slowKey.avg) + 'ms</span>' +
        '</div>');
    }
    if (slowPair) {
      badges.push('<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;">' +
        '<span style="color:var(--muted);display:block;font-size:11px;text-transform:uppercase;font-weight:600;">Sticking Transition</span>' +
        '<b style="font-size:16px;color:var(--saffron);">' + esc(faceOfId(slowPair.id)) + '</b> <span style="font-size:12px;color:var(--muted);">' + Math.round(slowPair.avg) + 'ms</span>' +
        '</div>');
    }
    if (worstMiss) {
      badges.push('<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;">' +
        '<span style="color:var(--muted);display:block;font-size:11px;text-transform:uppercase;font-weight:600;">Frequent Miss</span>' +
        '<b style="font-size:16px;color:var(--saffron-deep);">' + esc(faceOfId(worstMiss.c)) + '</b> <span style="font-size:12px;color:var(--muted);">' + worstMiss.n + ' slips</span>' +
        '</div>');
    }

    return (
      '<div class="card" style="margin-top:20px;background:linear-gradient(135deg, rgba(255,250,243,1) 0%, rgba(247,242,232,0.95) 100%);border:2px solid var(--saffron);box-shadow:0 12px 30px rgba(196,81,18,0.12);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
      '<span class="kicker" style="color:var(--saffron-deep);font-size:12px;display:flex;align-items:center;gap:6px;">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:var(--saffron);display:inline-block;"></span>' +
      '🤖 AI Typing Doctor Diagnosis' +
      '</span>' +
      '<span style="font-size:11px;background:var(--paper-2);padding:2px 8px;border-radius:12px;font-weight:600;color:var(--muted);">' +
      ((store.coach && store.coach.source === "gemini") ? "✨ Gemini 2.5 Active" : "Adaptive Reflex Engine") +
      '</span>' +
      '</div>' +
      '<p style="margin:6px 0 12px;font-size:14px;line-height:1.5;color:var(--ink);font-weight:500;">' + esc(note) + '</p>' +
      (badges.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px;margin-bottom:14px;">' + badges.join("") + '</div>' : '') +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
      '<button class="btn saffron" data-act="start-ai-drill" style="font-size:14px;font-weight:700;padding:11px 20px;display:flex;align-items:center;gap:6px;">' +
      '⚡ Start AI Adaptive Recovery Drill (' + drillCount + ' target words)' +
      '</button>' +
      '</div>' +
      '</div>'
    );
  }

  function startAIDrill() {
    var board = KD.coachBoard(store.touch);
    var plan = KD.planCoach(store.touch, store.misses, "");
    if (!plan && board.slowKeys && board.slowKeys[0]) {
      plan = { kind: "key", id: board.slowKeys[0].id, avg: board.slowKeys[0].avg, ratio: 1.4 };
    }
    if (!plan && board.slowPairs && board.slowPairs[0]) {
      plan = { kind: "pair", id: board.slowPairs[0].id, avg: board.slowPairs[0].avg, ratio: 1.4 };
    }
    if (!plan) {
      var worstCode = null;
      var maxMiss = 0;
      Object.keys(store.misses || {}).forEach(function (c) {
        if (!KD.drillable(c)) return;
        var n = store.misses[c] || 0;
        if (n > maxMiss) { maxMiss = n; worstCode = c; }
      });
      if (worstCode) plan = { kind: "key", id: worstCode, avg: 0, fromMiss: true };
    }
    if (!plan) {
      plan = { kind: "key", id: "d", avg: 300 };
    }
    startCoach(plan);
  }

  function resultHTML() {
    if (!session || !session.result) return '<div class="wrap"><div class="card">No result.</div></div>';
    if (session.live && store.live && store.live.lesson) {
      var rLive = session.result;
      var next = store.live.lesson;
      var labels = KD.liveLabels(store);
      var words = (next.tokens || []).map(function (t) { return esc(t.h); }).join(" ");
      return '<div class="wrap narrow"><div class="card"><div class="kicker">Lesson done</div>' +
        '<div class="stars">' + starStr(rLive.stars || 0) + "</div>" +
        "<h2>" + Math.round(rLive.acc || 0) + "% · " + fmt(rLive.wpm || 0) + " WPM</h2>" +
        '<div class="kicker">' + esc(labels ? labels.title : next.title) + "</div>" +
        '<p class="live-words">' + words + "</p>" +
        '<div class="row-btns"><button class="btn primary" data-act="live">Next lesson</button></div></div>' +
        aiCoachDiagnosisHTML() +
        '</div>';
    }
    var r = session.result;
    if (session.lesson && session.lesson.id === "coach") {
      return '<div class="wrap narrow"><div class="card"><div class="kicker">From your speed</div>' +
        "<h2>" + esc(session.lesson.title) + "</h2>" +
        '<div class="stats"><div class="stat"><b>' + Math.round(r.acc) + '%</b><span>Accuracy</span></div>' +
        '<div class="stat"><b>' + fmt(r.wpm) + "</b><span>Key WPM</span></div></div>" +
        '<div class="row-btns"><button class="btn" data-act="retry">Drill again</button>' +
        '<button class="btn primary" data-act="start-current">Continue Next Level</button></div></div>' +
        aiCoachDiagnosisHTML() +
        '</div>';
    }
    if (session.placement) return placementResult(r);
    if (r.kind === "exact") {
      var openNext = (r.stars >= 1 || r.acc >= 80) && session.index >= 0 && unlocked(session.index + 1);
      return '<div class="wrap narrow"><div class="card"><div class="kicker">' + esc(session.lesson.title) + "</div>" +
        '<div class="stars">' + starStr(r.stars) + "</div>" +
        "<h2>" + ((r.stars >= 1 || r.acc >= 80) ? "Level Passed!" : "Try Again for 1+ Stars") + "</h2>" +
        '<div class="stats"><div class="stat"><b>' + Math.round(r.acc) + '%</b><span>Accuracy · pass ' + session.lesson.acc + '%</span></div>' +
        '<div class="stat"><b>' + fmt(r.wpm) + '</b><span>Key WPM · ' + session.lesson.min + " for 3 stars</span></div></div>" +
        '<div class="row-btns">' +
        '<button class="btn" data-act="retry">Again</button>' +
        (openNext ? '<button class="btn primary" data-act="next">Next Level ▶</button>' : "") +
        '<button class="btn ghost" data-go="home">Course Map</button></div></div>' +
        aiCoachDiagnosisHTML() +
        '</div>';
    }
    if (!session.exam) {
      var starsP = r.stars || 0;
      var per = session.lang === "en" ? 0.05 : 0.0625;
      var projected = Math.min(25, r.wordRate * 10 * per);
      return '<div class="wrap narrow"><div class="card"><div class="kicker">' + esc(session.lesson.title) + "</div>" +
        '<div class="stars">' + starStr(starsP) + "</div>" +
        "<h2>" + r.correct + " correct · " + r.wrong + " locked wrong</h2>" +
        '<div class="stats"><div class="stat"><b>' + fmt(r.wordRate) + '</b><span>Correct words / min</span></div>' +
        '<div class="stat"><b>' + fmt(projected) + '</b><span>Projected 10-minute marks / 25</span></div></div>' +
        '<div class="row-btns"><button class="btn" data-act="retry">Again</button>' +
        (((starsP >= 1 || r.acc >= 80) && unlocked(session.index + 1)) ? '<button class="btn primary" data-act="next">Next Level ▶</button>' : "") +
        '<button class="btn ghost" data-go="home">Course Map</button></div></div>' +
        aiCoachDiagnosisHTML() +
        '</div>';
    }
    var qualify = r.marks + 0.0001 >= 9;
    var full = r.marks + 0.0001 >= 25;
    var need = session.lang === "en" ? "500 correct words = 25. 180 = 9." : "400 correct words = 25. 144 = 9.";
    var list = session.wrong.slice(0, 24).map(function (w) {
      return "<li>" + esc(w.want) + " · you typed " + esc(w.got) + "</li>";
    }).join("");
    return '<div class="wrap narrow"><div class="card"><div class="kicker">' + esc(session.lesson.title) + "</div>" +
      "<h2>" + fmt(r.marks) + " / 25</h2>" +
      "<p>" + (full ? "Full marks. Repeat this accuracy inside the time." : qualify ? "The qualifying line is crossed. 25/25 needs every word correct." : "Under 9. Failing this paper can cost the marks of the other three papers. Confirm that rule on the current RSSB notice.") + "</p>" +
      '<div class="stats">' +
      '<div class="stat"><b>' + r.correct + "</b><span>Correct words</span></div>" +
      '<div class="stat"><b>' + r.wrong + "</b><span>Wrong locks</span></div>" +
      '<div class="stat"><b>' + fmt(r.wordRate) + "</b><span>Correct words / min</span></div>" +
      '<div class="stat"><b>' + fmt(r.wpm) + "</b><span>Key WPM</span></div></div>" +
      '<p class="small muted">' + need + " A wrong word is not subtracted. It is simply not counted. After Space you cannot fix it.</p>" +
      (list ? '<h3>Words that fell</h3><ul class="wrong-list">' + list + "</ul>" : "") +
      '<div class="row-btns"><button class="btn primary" data-act="retry">Again</button><button class="btn" data-go="path">Back to lessons</button></div></div></div>';
  }

  function placementResult(r) {
    var rows = "";
    var report = session.placeReport || {};
    Object.keys(report).forEach(function (skill) {
      var s = report[skill];
      var pass = s.bad === 0 && s.ok >= 2;
      rows += "<tr><td>" + esc(skill) + "</td><td>" + s.ok + " correct · " + s.bad + " wrong</td><td>" + (pass ? "Opened" : "Lesson still waiting") + "</td></tr>";
    });
    return '<div class="wrap narrow"><div class="card"><div class="kicker">Placement</div><h2>Start where the fingers are already clean.</h2>' +
      "<p>A skill opens only when both of its words are clean. If कि, को, a half letter, or reph slipped, that lesson is the real work, even at 25 WPM.</p>" +
      "<table class=\"mark\"><tr><th>Skill</th><th>Result</th><th></th></tr>" + rows + "</table>" +
      '<div class="row-btns"><button class="btn primary" data-act="continue">Start there</button></div></div></div>';
  }

  function bindStatic() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-go]"), function (b) {
      b.onclick = function () { go(b.getAttribute("data-go")); };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lesson]"), function (b) {
      b.onclick = function () { openLesson(parseInt(b.getAttribute("data-lesson"), 10)); };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-auth-tab]"), function (b) {
      b.onclick = function () {
        authTab = b.getAttribute("data-auth-tab");
        draw();
      };
    });
    var authSubmit = document.getElementById("auth-submit");
    if (authSubmit) {
      authSubmit.onclick = handleAuthSubmit;
    }
    bindActs(document);
  }

  function handleAuthSubmit() {
    var u = (document.getElementById("auth-user") ? document.getElementById("auth-user").value : "").trim();
    var p = (document.getElementById("auth-pass") ? document.getElementById("auth-pass").value : "").trim();
    var errEl = document.getElementById("auth-err");
    if (!u || !p) {
      if (errEl) { errEl.textContent = "Please enter both username and password."; errEl.style.display = "block"; }
      return;
    }
    var ep = authTab === "register" ? "/api/auth/register" : "/api/auth/login";
    fetch(ep, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p })
    }).then(function (r) {
      return r.json().then(function (data) { return { status: r.status, ok: r.ok, data: data }; });
    }).then(function (res) {
      if (!res.ok) {
        if (errEl) { errEl.textContent = res.data.error || "Authentication failed."; errEl.style.display = "block"; }
        return;
      }
      authToken = res.data.token;
      currentUser = res.data.username;
      localStorage.setItem("sparsh_auth_token", authToken);
      localStorage.setItem("sparsh_username", currentUser);
      showAuthModal = false;
      fetch("/api/progress", {
        headers: { "Authorization": "Bearer " + authToken, "Cache-Control": "no-store" }
      }).then(function (r) { return r.json(); }).then(function (cloudStore) {
        if (cloudStore && cloudStore.stars) adoptFile(JSON.stringify(cloudStore));
        draw();
      }).catch(function () { draw(); });
    }).catch(function () {
      if (errEl) { errEl.textContent = "Network error. Please try again."; errEl.style.display = "block"; }
    });
  }

  function exportBackup() {
    var blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sparsh-backup-" + (currentUser || "kalpesh") + "-" + (new Date().toISOString().slice(0, 10)) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function bindActs(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-act]"), function (b) {
      b.onclick = function () {
        var name = b.getAttribute("data-act");
        if (name === "play") startPlayback(parseInt(b.getAttribute("data-try"), 10));
        else if (name === "pause") {
          stopPlayback();
          if (playState) playState.on = false;
          paintPlayer();
        } else if (name === "replay") startPlayback(playState ? playState.n : 0);
        else act(name);
      };
    });
  }

  function act(name) {
    if (name === "open-auth") {
      showAuthModal = true;
      draw();
      return;
    }
    if (name === "close-auth") {
      showAuthModal = false;
      draw();
      return;
    }
    if (name === "logout") {
      authToken = null;
      localStorage.removeItem("sparsh_auth_token");
      draw();
      return;
    }
    if (name === "export-json") {
      exportBackup();
      return;
    }
    if (name === "live-restart") {
      startLive("restart");
      return;
    }
    if (name === "continue" || name === "live") {
      startLive();
      return;
    }
    if (name === "coach") {
      var plan = KD.planCoach(store.touch, store.misses, store.touch.rest);
      if (plan) startCoach(plan);
      else act("continue");
      return;
    }
    if (name === "start-ai-drill") {
      startAIDrill();
      return;
    }
    if (name === "placement") {
      var words = [];
      KD.PLACEMENT_WORDS.forEach(function (w) {
        words.push({ h: w.h, k: KD.unicodeToKruti(w.h), skill: w.skill, lang: "hi" });
      });
      words = words.concat(words.map(function (w) { return { h: w.h, k: w.k, skill: w.skill, lang: "hi" }; }));
      startLock({
        id: "placement",
        title: "Placement · 90 seconds",
        teach: "Type the words that appear, with word-lock. Space locks the word. 90 seconds. A skill's lessons open when both of its words are clean.",
        words: words,
        limit: 90000,
        hints: "hindi",
        showFix: true,
        placement: true,
        finger: "As in the exam"
      });
      return;
    }
    if (name === "exam-hi") startExam("hi");
    if (name === "exam-en") startExam("en");
    if (name === "para") {
      startLock({
        id: "para",
        title: "Unseen paragraph",
        teach: "The sentences join in a new order each time. This will not become a paragraph you can memorize. Space locks. A miss shows at once here. In the exam it does not.",
        words: KD.buildHindiPassage(80),
        hints: "hindi",
        showFix: true,
        finger: "Read, then the fingers"
      });
      return;
    }
    if (name === "start-current") {
      var ni = nextLessonIndex();
      if (ni >= 0) startLesson(ni);
      return;
    }
    if (name === "toggle-unlock") {
      store.unlockedAll = !store.unlockedAll;
      save();
      draw();
      return;
    }
    if (name === "weak") startWeak();
    if (name === "practice") {
      if (focusIndex >= 0) startLesson(focusIndex);
      return;
    }
    if (name === "retry") {
      if (session && session.exam) startExam(session.lang);
      else if (session && session.placement) act("placement");
      else if (session && session.index >= 0) startLesson(session.index);
      else if (session && session.lesson && session.lesson.id === "coach" && session.coachPlan) startCoach(session.coachPlan);
      else if (session && session.lesson && session.lesson.id === "para") act("para");
      else if (session && session.lesson && session.lesson.id === "weak") startWeak();
      else go("home");
      return;
    }
    if (name === "next") {
      var from = session && session.index >= 0 ? session.index : focusIndex;
      if (from >= 0 && from < KD.LESSONS.length - 1) startLesson(from + 1);
      else go("home");
      return;
    }
  }

  function startExam(lang) {
    var hi = lang !== "en";
    startLock({
      id: hi ? "exam-hi" : "exam-en",
      title: hi ? "RSSB Hindi speed · 10 min" : "RSSB English speed · 10 min",
      teach: hi
        ? "An unseen passage of about 400 words. Each correct word is 0.0625 marks. Space locks the word and you cannot go back. The key light is off, as in the exam. Keep the keyboard on English (US). Under 9, this paper fails. Confirm 9/25 on the current RSSB notice."
        : "500 words. Each correct word is 0.05 marks. Space locks the word. Capitals and full stops count. No key light. 180 correct words is the qualifying 9.",
      words: hi ? KD.buildHindiPassage(400) : KD.buildEnglishPassage(500),
      limit: 600000,
      hints: "none",
      showFix: false,
      lang: hi ? "hi" : "en",
      exam: true,
      finger: hi ? "DevLys / Kruti" : "QWERTY"
    });
  }

  function startWeak() {
    var pairs = Object.keys(store.misses).map(function (code) { return { code: code, n: store.misses[code] }; });
    pairs.sort(function (a, b) { return b.n - a.n; });
    pairs = pairs.slice(0, 4);
    if (!pairs.length) {
      app.innerHTML = bar() + '<div class="wrap narrow"><div class="card"><h2>No weak key is recorded yet.</h2><p>Play a lesson. Every miss is recorded, and this button then drills those keys.</p><button class="btn primary" data-act="start-current">Start the lesson</button></div></div>';
      bindStatic();
      return;
    }
    var tokens = [];
    pairs.forEach(function (p) {
      var wList = KD.wordsForWeakness ? KD.wordsForWeakness(p.code, 4) : [];
      if (wList && wList.length) {
        wList.forEach(function (tok) { tokens.push(tok); });
      } else {
        var kk = keySeq(p.code);
        if (kk && KD.preview(kk)) tokens.push({ k: kk, h: KD.preview(kk) });
      }
    });
    if (!tokens.length) {
      pairs.forEach(function (p) {
        var kk = keySeq(p.code);
        if (kk && KD.preview(kk)) {
          tokens.push({ k: kk, h: KD.preview(kk) });
          tokens.push({ k: "j", h: "र" });
        }
      });
    }
    var lessonIndexFake = -1;
    session = {
      kind: "exact",
      phase: "intro",
      lesson: {
        id: "weak",
        title: "Weak keys",
        teach: "These keys were missed most in earlier lessons. Three times each, with र between them. Do not speed up until they are clean.",
        finger: "The finger that keeps missing",
        newKey: pairs[0].code,
        acc: 96,
        min: 12,
        mid: 20,
        high: 30,
        hints: "keys"
      },
      index: lessonIndexFake,
      tokens: tokens,
      steps: KD.buildSteps(tokens),
      i: 0,
      words: [],
      wi: 0,
      typed: "",
      marks: [],
      wrong: [],
      correct: 0,
      errors: 0,
      t0: null,
      limit: null,
      anchor: null,
      holding: true,
      showFix: true,
      hints: "keys",
      lang: "hi",
      exam: null,
      altDown: false,
      altBuf: "",
      caps: false,
      layoutWarn: false,
      lastFix: "",
      lastTap: null,
      tapN: 0
    };
    screen = "run";
    paintShell();
  }

  function startCoach(plan) {
    var seq = plan.kind === "pair" ? pairSeq(plan.id) : keySeq(plan.id);
    var face = (seq && KD.preview(seq)) || faceOfId(plan.id);
    if (!seq || !face) {
      act("continue");
      return;
    }
    var wordList = (store.coach && store.coach.drill && store.coach.drill.length)
      ? store.coach.drill.map(function (w) { return { h: w, k: KD.unicodeToKruti(w) }; })
      : (KD.wordsForWeakness ? KD.wordsForWeakness(plan.id, 16) : []);
    var tokens = [];
    if (wordList && wordList.length >= 4) {
      tokens.push({ k: seq, h: face });
      tokens.push({ k: seq, h: face });
      wordList.forEach(function (tok) { tokens.push(tok); });
      tokens.push({ k: seq, h: face });
      wordList.slice(0, 4).forEach(function (tok) { tokens.push(tok); });
    } else {
      for (var r = 0; r < 14; r++) {
        tokens.push({ k: seq, h: face });
        tokens.push({ k: "j", h: "र" });
      }
    }
    var code = plan.kind === "pair" ? plan.id.split(">")[0] : plan.id;
    if (code.slice(-2) === "+S") code = code.slice(0, -2);
    var meta = KD.BY_CODE[code];
    var finger = meta && KD.FINGERS[meta.finger] ? KD.FINGERS[meta.finger].name : "The target finger";
    var latency = plan.avg ? Math.round(plan.avg) + "ms" : "high latency";
    var teach = (store.coach && store.coach.note)
      ? ("🤖 AI Diagnosis: " + store.coach.note)
      : (plan.fromMiss
        ? "AI Diagnosis: " + face + " was missed often. Typing it inside high-frequency exam words to build automatic muscle memory."
        : (plan.kind === "pair"
          ? "AI Diagnosis: You take " + latency + " on this letter transition. Type each word in one fluid breath to cut micro-hesitations."
          : "AI Diagnosis: Your response time on " + face + " is " + latency + " (lagging behind home row). Practice these words to build sub-300ms reflex."));
    session = {
      kind: "exact",
      phase: "intro",
      lesson: {
        id: "coach",
        title: coachLabel(plan),
        teach: teach,
        finger: finger,
        newKey: plan.kind === "key" ? code : "",
        acc: 94,
        min: 12,
        mid: 20,
        high: 30,
        hints: "keys"
      },
      index: -1,
      coachPlan: plan,
      coachId: plan.id,
      tokens: tokens,
      steps: KD.buildSteps(tokens),
      i: 0,
      words: [],
      wi: 0,
      typed: "",
      marks: [],
      wrong: [],
      correct: 0,
      errors: 0,
      t0: null,
      limit: null,
      anchor: null,
      holding: true,
      showFix: true,
      hints: "keys",
      lang: "hi",
      exam: null,
      altDown: false,
      altBuf: "",
      caps: false,
      layoutWarn: false,
      lastFix: "",
      lastTap: null,
      tapN: 0
    };
    screen = "run";
    paintShell();
  }

  if (!KD.legacyFromEvent) {
    KD.legacyFromEvent = function (e) {
      if (e.code === "Space") return " ";
      var meta = KD.BY_CODE[e.code];
      if (!meta) return null;
      return e.shiftKey ? meta.shifted : meta.normal;
    };
  }

  window.addEventListener("beforeunload", function () {
    if (session && session.live && session.phase !== "done") save();
  });

  (function boot() {
    var shown = false;
    function show() {
      if (shown) {
        if (!session) draw();
        else if (session.live && store.live && store.live.lesson && session.lesson && session.lesson.id !== store.live.lesson.id) {
          session = null;
          if (resumeMid(liveResume())) startLive();
          else draw();
        }
        return;
      }
      shown = true;
      booting = false;
      if (resumeMid(liveResume())) startLive();
      else draw();
    }
    var timer = setTimeout(show, 1000);
    var headers = { "Cache-Control": "no-store" };
    if (authToken) headers["Authorization"] = "Bearer " + authToken;
    if (authToken) {
      fetch("/api/auth/me", { headers: { "Authorization": "Bearer " + authToken } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.authenticated) {
            currentUser = data.username;
            localStorage.setItem("sparsh_username", currentUser);
          } else {
            authToken = null;
            localStorage.removeItem("sparsh_auth_token");
          }
          if (!session) draw();
        }).catch(function () {});
    }
    fetch("/api/progress", { headers: headers, cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("no file");
      return r.text();
    }).then(function (text) {
      clearTimeout(timer);
      adoptFile(text);
      show();
    }).catch(function () {
      clearTimeout(timer);
      folderSave = false;
      show();
    });
  })();
})(typeof globalThis !== "undefined" ? globalThis : this);

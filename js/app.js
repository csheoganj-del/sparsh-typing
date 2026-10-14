(function (root) {
  var KD = root.KD;
  var GUEST_STORE = "sparsh-rssb-v1";
  var STORE = GUEST_STORE;
  var app = document.getElementById("app");
  var screen = "home";
  var session = null;
  var tick = null;
  var audio = null;
  var focusIndex = -1;
  var playState = null;
  var playTimer = null;
  var heldKeys = {};
  var skillStamp = Date.now();

  function icon(name) {
    var paths = {
      menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
      settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
      lock: '<rect x="6" y="10" width="12" height="11" rx="1"/><path d="M8 10V7a4 4 0 018 0v3"/>',
      check: '<path d="M5 12l4 4L19 6"/>',
      target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12l8-8M16 4h4v4"/>',
      speed: '<path d="M3 17a9 9 0 0118 0M12 17l5-8"/><circle cx="12" cy="17" r="1"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
      keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h2m3 0h2m3 0h2M5 13h2m3 0h2m3 0h2M7 16h10"/>'
      ,restart: '<path d="M20 8a8 8 0 10.5 7M20 3v6h-6"/>'
      ,hand: '<path d="M8 13V5a2 2 0 014 0v6-8a2 2 0 014 0v8-6a2 2 0 014 0v8-3a2 2 0 014 0v8c0 4-3 6-7 6h-2c-2 0-4-1-5-3l-5-7a2 2 0 013-3l4 3" transform="translate(-2 -1) scale(.95)"/>'
      ,sound: '<path d="M11 4L6 8H3v8h3l5 4V4M15 8a6 6 0 010 8M18 5a10 10 0 010 14"/>'
    };
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.keyboard) + '</svg>';
  }

  var folderSave = false;
  var booting = true;
  var saveQueue = Promise.resolve();
  var currentUser = localStorage.getItem("sparsh_username") || "kalpesh";
  var authToken = localStorage.getItem("sparsh_auth_token") || null;
  if (authToken) STORE = GUEST_STORE + "-account-" + currentUser;
  var cloudSyncText = authToken ? "Connecting to cloud…" : "Saved on this device";
  var pendingCloud = null, saveTimer = null, lastCloudSave = 0;
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
    var elapsedMs = session.t0 ? Math.max(0, Math.round(elapsed())) : 0;
    store.live.resume = {
      id: session.lesson.id,
      phase: session.phase === "run" ? "run" : "intro",
      i: session.i || 0,
      wi: session.wi || 0,
      typed: session.typed || "",
      marks: (session.marks || []).slice(),
      correct: session.correct || 0,
      errors: session.errors || 0,
      badTokens: session.badTokens || {},
      measurements: session.measurements || null,
      elapsed: elapsedMs,
      at: at,
      slips: (session.slips || []).slice(0, 20),
      tape: (session.tape || []).slice(0, 240),
      wrong: (session.wrong || []).slice(0, 24),
      typedWords: session.typedWords || []
    };
  }
  function syncStatus(text) {
    cloudSyncText = text;
    var label = document.getElementById('cloud-status');
    if (label && label.textContent !== text) label.textContent = text;
  }
  function cloudStatusHTML() { return '<span id="cloud-status" class="cloud-status" role="status">' + esc(cloudSyncText) + '</span>'; }
  function flushCloud() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!pendingCloud || !folderSave) return saveQueue;
    var snapshot = pendingCloud; pendingCloud = null;
    syncStatus('Saving to cloud…');
    saveQueue = saveQueue.then(function () {
      var headers = { 'Content-Type':'application/json' };
      if (snapshot.token) headers.Authorization = 'Bearer ' + snapshot.token;
      return fetch('/api/progress', {method:'POST',headers:headers,body:snapshot.body}).then(function (r) {
        if (!r.ok) throw new Error(r.status === 401 ? 'Sign in again to sync' : 'Cloud save pending · retrying');
        return r.json();
      }).then(function (data) {
        lastCloudSave = Date.now();
        if (authToken === snapshot.token && data.progress) {
          store = KD.mergeProgress(store, data.progress);
          localStorage.setItem(STORE, JSON.stringify(store));
        }
        if (authToken === snapshot.token) syncStatus(pendingCloud ? 'Saved on this device · cloud save pending' : data.cloud ? 'Saved to cloud' : 'Saved in this folder');
      }).catch(function (error) {
        if (authToken === snapshot.token) {
          if (!pendingCloud) pendingCloud = snapshot;
          syncStatus(error.message);
          saveTimer = setTimeout(flushCloud,60000);
        }
      });
    });
    return saveQueue;
  }
  function save(immediate) {
    captureResume();
    var body = JSON.stringify(store);
    try { localStorage.setItem(STORE, body); } catch (e) {}
    if (!folderSave) { syncStatus(authToken ? 'Saved on this device · cloud unavailable' : 'Saved on this device · sign in to sync'); return; }
    pendingCloud = {body:body,token:authToken};
    if (!authToken || immediate === true || Date.now()-lastCloudSave >= 60000) return flushCloud();
    syncStatus('Saved on this device · cloud save pending');
    if (!saveTimer) saveTimer = setTimeout(function () { saveTimer = null; flushCloud(); },Math.max(1000,60000-(Date.now()-lastCloudSave)));
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
    return KD.lessonPassed(lesson, store);
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
    return KD.lessonUnlocked(KD.LESSONS, index, store);
  }
  function nextLessonIndex() {
    return KD.nextCourseLesson(KD.LESSONS, store);
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
      headers: Object.assign({ "Content-Type": "application/json" }, authToken ? {Authorization:"Bearer " + authToken} : {}),
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
      if (ok) {
        var dur = 0.038;
        var osc = audio.createOscillator();
        var g = audio.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(2400, t);
        osc.frequency.exponentialRampToValueAtTime(700, t + dur);
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g);
        g.connect(audio.destination);
        osc.start(t);
        osc.stop(t + dur);

        var sub = audio.createOscillator();
        var sg = audio.createGain();
        sub.type = "sine";
        sub.frequency.setValueAtTime(280, t);
        sub.frequency.exponentialRampToValueAtTime(60, t + dur);
        sg.gain.setValueAtTime(0.12, t);
        sg.gain.exponentialRampToValueAtTime(0.001, t + dur);
        sub.connect(sg);
        sg.connect(audio.destination);
        sub.start(t);
        sub.stop(t + dur);
      } else {
        var dur2 = 0.09;
        var errOsc = audio.createOscillator();
        var eg = audio.createGain();
        errOsc.type = "sawtooth";
        errOsc.frequency.setValueAtTime(150, t);
        errOsc.frequency.exponentialRampToValueAtTime(50, t + dur2);
        eg.gain.setValueAtTime(0.25, t);
        eg.gain.exponentialRampToValueAtTime(0.001, t + dur2);
        errOsc.connect(eg);
        eg.connect(audio.destination);
        errOsc.start(t);
        errOsc.stop(t + dur2);
      }
    } catch (e) {}
  }

  function soundFanfare(stars) {
    if (!store.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      var t = audio.currentTime;
      var notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach(function (freq, i) {
        var osc = audio.createOscillator();
        var g = audio.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        g.gain.setValueAtTime(0.18, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.38);
        osc.connect(g);
        g.connect(audio.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.39);
      });
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
      '<p class="muted small" style="margin:0 0 12px;">Access your ' + KD.LESSONS.length + ' lessons and saved practice history from any computer or phone.</p>' +
      '<div class="auth-tabs">' +
      '<button class="btn tab' + (authTab === "login" ? " active" : "") + '" data-auth-tab="login">Sign In</button>' +
      '<button class="btn tab' + (authTab === "register" ? " active" : "") + '" data-auth-tab="register">New Account</button>' +
      '</div>' +
      '<form id="auth-form" style="margin-top:14px;" onsubmit="return false;">' +
      '<div style="margin-bottom:10px;">' +
      '<label for="auth-user" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Username</label>' +
      '<input type="text" autocomplete="username" id="auth-user" value="' + esc(currentUser || "kalpesh") + '" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;" placeholder="Username" required>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
      '<label for="auth-pass" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Password</label>' +
      '<input type="password" autocomplete="current-password" id="auth-pass" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;" placeholder="Password" required>' +
      '</div>' +
      '<div id="auth-err" style="color:var(--bad);font-size:13px;margin-bottom:10px;display:none;"></div>' +
      '<button type="button" class="btn saffron" id="auth-submit" style="width:100%;padding:11px;font-weight:600;font-size:14px;">' + (authTab === "login" ? "Sign In & Sync Cloud History" : "Create Account & Start Sync") + '</button>' +
      '<p class="small muted">Your login keeps your practice history private. New passwords need at least 10 characters.</p>' +
      '</form>' +
      '</div></div>'
    );
  }

  function totalStars() {
    var sum = 0;
    if (store && store.stars) {
      Object.keys(store.stars).forEach(function (k) {
        sum += (store.stars[k] || 0);
      });
    }
    return sum;
  }

  function bar(extra) {
    return '<a class="skip-link" href="#main-content">Jump to Main Content</a>' +
      '<header class="bar"><div class="bar-inner">' +
      '<button class="tc-brand" data-go="home" aria-label="Hindi typing home"><span class="tc-logo-badge">TypingClub<span class="tc-lang-tag">Hindi</span></span></button>' +
      '<nav class="main-nav" aria-label="Main menu">' +
      '<button class="nav-link' + (screen === 'home' || screen === 'path' ? ' active' : '') + '" data-go="home">Home</button>' +
      '<button class="nav-link' + (screen === 'record' ? ' active' : '') + '" data-go="record">Stats</button>' +
      '<button class="nav-link' + (screen === 'badges' ? ' active' : '') + '" data-go="badges">Badges</button>' +
      '<details class="nav-dropdown"><summary>Hindi Touch Typing <span>▾</span></summary><div class="nav-popover">' +
      '<button data-go="home">Hindi course</button><button data-go="chart">Keyboard chart</button>' +
      '<button data-act="exam-hi">Hindi exam · 10 minutes</button><button data-act="exam-en">English exam · 10 minutes</button>' +
      '<button data-act="weak">Weak keys practice</button><button data-act="start-ai-drill">Personalized practice</button>' +
      '<button data-act="toggle-unlock">' + (store.unlockedAll ? 'Use sequential lessons' : 'Allow all lessons') + '</button></div></details></nav>' +
      '<nav class="account-nav" aria-label="Account menu">' + cloudStatusHTML() + '<span class="nav-language h" lang="hi">हिन्दी</span>' +
      '<button class="nav-link" data-act="export-json" title="Download your progress backup">Save Progress</button>' +
      (authToken ? '<span class="nav-user">' + esc(currentUser) + '</span><button class="nav-link" data-act="logout">Log out</button>' : '<button class="nav-link" data-act="open-auth">Login</button>') +
      '</nav>' + (extra || '') + '</div></header>' + (showAuthModal ? authModalHTML() : '');
  }

  function draw() {
    document.body.classList.toggle("fit", screen === "run");
    document.body.classList.toggle("course-map", screen === "home" || screen === "path");
    if (screen === "home") app.innerHTML = bar() + homeHTML();
    else if (screen === "path") app.innerHTML = bar() + pathHTML();
    else if (screen === "record") app.innerHTML = bar() + recordHTML();
    else if (screen === "chart") app.innerHTML = bar() + chartHTML();
    else if (screen === "badges") app.innerHTML = bar() + badgesHTML();
    else if (screen === "run") paintShell();
    else if (screen === "lesson") app.innerHTML = bar() + lessonHTML();
    else if (screen === "result") app.innerHTML = bar() + resultHTML();
    bindStatic();
    if (screen !== 'run' && !showAuthModal) window.scrollTo(0, 0);
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
    var resume = liveResume();
    var history = KD.courseComplete && KD.courseComplete(store);
    if (history && lesson && lesson.pattern === "history" && lesson.tokens && lesson.tokens.length && resumeMid(resume)) return;
    if (!history && lesson && lesson.tokens && lesson.tokens.length && resumeMid(resume)) return;
    var next = KD.composeLive(store);
    if (lessonSig(lesson) === lessonSig(next) && lesson && next && lesson.min === next.min && lesson.mid === next.mid && lesson.high === next.high) return;
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
  function lessonGlyph(l) {
    if (!l) return "";
    if (l.introduces && l.introduces.length === 1) {
      var action = l.introduces[0];
      if (action === 'Space') return '␣';
      var introduced = KD.BY_CODE[action.replace(/\+S$/, '')];
      if (introduced) return KD.keyFace(action.slice(-2) === '+S' ? introduced.shifted : introduced.normal);
    }
    var t = (l.title || "").toLowerCase();
    if (l.stage === "word" || l.section === "words" || t.indexOf("words") >= 0) return "शब्द";
    if (l.section === "ending" || l.section === "para" || t.indexOf("sentence") >= 0 || t.indexOf("paragraph") >= 0) return "वाक्य";
    if (t.indexOf("left hand") >= 0) return "बायाँ";
    if (t.indexOf("right hand") >= 0) return "दायाँ";
    if (t.indexOf("half") >= 0) return "आधा";
    if (t.indexOf("bindu") >= 0) return "ं";
    if (t.indexOf("reach") >= 0) return "पहुँच";
    if (l.newKey && KD.BY_CODE && KD.BY_CODE[l.newKey]) {
      var norm = KD.BY_CODE[l.newKey].normal;
      var face = KD.keyFace ? KD.keyFace(norm) : "";
      if (face) return face;
    }
    var m = (l.title || "").match(/[\u0900-\u097F]+/);
    if (m) return m[0];
    if (l.tokens && l.tokens.length) return l.tokens[0].h;
    return "अभ्यास";
  }

  function courseProgress() {
    var complete = KD.LESSONS.filter(function (lesson) { return cleared(lesson); }).length;
    return { complete: complete, percent: Math.round(complete / KD.LESSONS.length * 100), stars: KD.LESSONS.reduce(function (sum, lesson) { return sum + (store.stars[lesson.id] || 0); }, 0) };
  }

  function pathSectionsHTML() {
    var html = '';
    var currentNi = nextLessonIndex();
    var previousSection = '';
    KD.LESSONS.forEach(function (l, index) {
        var x = { l: l, i: index };
        if (l.section !== previousSection) {
          if (previousSection) html += '</div></section>';
          var sec = KD.SECTIONS.find(function (s) { return s.id === l.section; }) || { title: 'Review', blurb: 'Practise familiar combinations.' };
          html += '<section class="course-section"><div class="course-section-head"><h2>' + esc(sec.title) + '</h2><p>' + esc(sec.blurb) + '</p></div><div class="nodes">';
          previousSection = l.section;
        }
        var st = store.stars[x.l.id] || 0;
        var open = unlocked(x.i);
        var cls = 'node' + (open ? '' : ' lock') + (cleared(x.l) ? ' done' : '') + (currentNi === x.i ? ' now' : '');
        var glyph = lessonGlyph(x.l);
        var status = x.l.scoreFree ? (cleared(x.l) ? ' Learned.' : ' Key introduction.') : ' ' + st + ' of 5 stars.';
        html += '<button class="' + cls + '" data-lesson="' + x.i + '" aria-label="Lesson ' + (x.i + 1) + ', ' + esc(x.l.title) + '.' + status + (open ? '' : ' Locked.') + '"' + (open ? '' : ' disabled') + (currentNi === x.i ? ' aria-current="step"' : '') + '>' +
          '<span class="tc-tile-head"><span class="tc-tile-num">' + (x.i + 1) + '</span>' + (!open ? '<span class="tc-tile-lock">' + icon('lock') + '</span>' : cleared(x.l) ? '<span class="tc-tile-check">' + icon('check') + '</span>' : '') + '</span>' +
          '<span class="tc-tile-body"><span class="tc-tile-glyph h" lang="hi">' + esc(glyph) + '</span>' + (x.l.scoreFree ? '<span class="tile-type">' + (cleared(x.l) ? 'Learned' : 'Introduction') + '</span>' : st ? '<span class="tc-tile-stars">' + starStr(st) + '</span>' : '') + '</span>' +
          '<span class="tc-tile-name" title="' + esc(x.l.title) + '">' + esc(x.l.title) + '</span></button>';
    });
    if (previousSection) html += '</div></section>';
    return html;
  }

  function historyOffer() {
    if (!KD.courseComplete || !KD.courseComplete(store) || !KD.starBars) return null;
    return { bars: KD.starBars(store, { min: 14, mid: 22, high: 32, cap: 40 }), names: KD.weakKeyNames ? KD.weakKeyNames(store) : [] };
  }

  function homeHTML() {
    var progress = courseProgress();
    var offer = historyOffer();
    return '<main id="main-content" class="wrap course-wrap" tabindex="-1">' +
      '<div class="course-summary"><span><b>' + progress.percent + '%</b> progress</span><span>' + progress.stars + ' stars</span><span>' + progress.complete + ' / ' + KD.LESSONS.length + ' lessons</span>' +
      '<button class="course-continue" data-act="start-current">' + (offer ? 'Next lesson &rsaquo;' : 'Continue lesson &rsaquo;') + '</button></div>' +
      '<div class="course-tools"><span class="course-name">Hindi Touch Typing <small>RSSB · DevLys 010 · Standard keyboard · All ' + KD.LESSONS.length + ' lessons</small></span><button class="btn" data-act="jump-current">Jump to current lesson</button>' +
      '<button class="btn" data-act="placement">' + icon('target') + ' Placement Test</button></div>' +
      practice40HTML() + pathSectionsHTML() +
      '<div class="course-bottom"><span>All ' + KD.LESSONS.length + ' lessons</span><button class="btn" data-act="jump-current">Jump to current lesson</button></div></main>';
  }

  function practice40HTML() {
    var state = KD.practice40State(store), last = state.last;
    var today = new Date().toLocaleDateString('en-IN');
    var todayChecks = state.attempts.filter(function (r) { return new Date(r.at).toLocaleDateString('en-IN') === today; }).length;
    var offer = historyOffer();
    var learn = offer
      ? 'The next lesson is an exam sentence formed with ' + (offer.names.length ? offer.names.join(', ') : 'the keys you miss') + '. Pass at ' + offer.bars.min + ' WPM. Five stars at ' + offer.bars.high + ' WPM. A five-star run raises that bar by 2, up to 40.'
      : 'Continue the course. Learn one key, then combinations and words.';
    return '<section class="practice40" aria-label="Hindi practice to 40 WPM"><div class="practice40-head"><div><span class="kicker">Your practice goal</span><h2>Hindi · 40 WPM</h2><p>' + esc(state.reached ? '40 WPM repeated on three fresh passages with at least 98% first-try accuracy.' : state.stage) + '</p></div><div class="practice40-speed"><b>' + (last ? fmt(last.wpm) : '—') + '</b><span>latest two-minute WPM</span></div></div>' +
      '<div class="practice40-routine"><div><b>1. Learn · 15–20 min</b><p>' + esc(learn) + '</p><button class="btn" data-act="start-current">' + (offer ? 'Start next lesson' : 'Continue learning') + '</button></div>' +
      '<div><b>2. Repair · 10 min</b><p>Repeat difficult pairs slowly. Keep accuracy before increasing speed.</p><button class="btn" data-act="practice40-weak">Practise weak combinations</button></div>' +
      '<div><b>3. Check · 2 min</b><p>' + (state.canStart ? state.full ? 'Fresh Hindi passages. Repeat without keyboard or hand guides.' : 'Use familiar keys. Full passages unlock when their keys are learned.' : 'Learn the first keys and Space before checking speed.') + '</p><button class="btn primary" data-act="practice40-check"' + (state.canStart ? '' : ' disabled') + '>Check my speed</button></div></div>' +
      '<p class="small muted">' + todayChecks + ' speed checks today · ' + (last ? Math.round(last.realAcc) + '% first-try accuracy in your last check · ' : '') + 'Goal: three fresh passage checks at 40 WPM and 98% accuracy. Short key drills do not count as passage speed.</p>' +
      (state.attempts.length ? '<details><summary>Recent speed checks</summary><table class="practice40-history"><thead><tr><th>Date</th><th>Practice</th><th>WPM</th><th>First try</th></tr></thead><tbody>' + state.attempts.slice(-7).reverse().map(function (r) { return '<tr><td>' + esc(new Date(r.at).toLocaleDateString('en-IN')) + '</td><td>' + (r.full ? 'Passage' : 'Familiar keys') + (r.guided ? ' · guided' : '') + '</td><td>' + fmt(r.wpm) + '</td><td>' + Math.round(r.realAcc) + '%</td></tr>'; }).join('') + '</tbody></table></details>' : '') + '</section>';
  }
  function startPractice40() {
    var practice = KD.practice40Lesson(store);
    if (!practice) { startLesson(nextLessonIndex()); return; }
    startLesson(nextLessonIndex(), practice);
    session.index = -1; session.recoveryFor = null;
    session.lesson.id = 'practice40'; session.lesson.title = practice.title;
    session.lesson.teach = practice.teach; session.lesson.stage = 'practice';
    session.lesson.scoreFree = false; session.lesson.acc = 98;
    session.lesson.min = 0; session.lesson.mid = 30; session.lesson.high = 40;
    session.lesson.oppositeShift = false; session.lesson.hand = ''; session.hand = ''; session.anchor = null;
    session.limit = 120000; session.practice40 = { full: practice.full, guided: false };
    session.hints = practice.full ? 'none' : 'hindi';
    paintShell();
  }
  function practice40Result(r) {
    var timed = r.ms >= 120000;
    var goal = timed && session.practice40.full && !session.practice40.guided && r.wpm >= 40 && r.realAcc >= 98 && r.acc >= 98;
    var state = KD.practice40State(store);
    return '<main id="main-content" class="wrap narrow result-page"><section class="card result-card"><div class="kicker">Hindi · 40 WPM practice</div><h1>' + (goal ? '40 WPM with clean typing' : r.realAcc < 98 ? 'Build accuracy first' : 'Keep building your rhythm') + '</h1>' +
      '<div class="dials">' + dialHTML('Correct key WPM', fmt(r.wpm), Math.min(100, r.wpm / 40 * 100), false) + dialHTML('First-try accuracy', Math.round(r.realAcc) + '%', r.realAcc, false) + dialHTML('Time', dur(r.ms), 0, true) + '</div>' +
      '<p>' + (session.practice40.full ? 'Fresh Hindi passage' : 'Familiar-key practice; full Hindi passage speed is not measured yet') + (session.practice40.guided ? ' · guidance used.' : '.') + '</p><p>' + (!timed ? 'Finish a full two-minute check to save a speed result.' : state.reached ? 'You have repeated the goal on three fresh passages. Keep practising new text.' : 'Repeat the goal on three fresh passages with at least 98% first-try accuracy. Correcting mistakes helps final accuracy, but does not erase first-try mistakes.') + '</p>' +
      '<div class="row-btns"><button class="btn primary" data-act="practice40-weak">Practise weak combinations</button><button class="btn" data-act="practice40-check">New speed check</button><button class="btn ghost" data-go="home">Practice plan</button></div></section></main>';
  }
  function pathHTML() { return homeHTML(); }

  function badgesHTML() {
    var progress = courseProgress();
    var best = (store.log || []).reduce(function (n, attempt) { return Math.max(n, attempt.wpm || 0); }, 0);
    var perfect = KD.LESSONS.filter(function (lesson) { return (store.stars[lesson.id] || 0) === 5; }).length;
    var badges = [
      { title: 'First Steps', note: 'Complete your first lesson', earned: progress.complete >= 1, mark: '1' },
      { title: 'Getting Started', note: 'Complete 10 lessons', earned: progress.complete >= 10, mark: '10' },
      { title: 'Five Star Typist', note: 'Earn five stars on a lesson', earned: perfect >= 1, mark: '★' },
      { title: 'Star Collector', note: 'Earn 50 course stars', earned: progress.stars >= 50, mark: '50' },
      { title: 'Picking Up Speed', note: 'Reach 30 WPM in an attempt', earned: best >= 30, mark: '30' },
      { title: 'Hindi Typist', note: 'Complete the Hindi course', earned: progress.complete === KD.LESSONS.length, mark: 'अ' }
    ];
    return '<main id="main-content" class="wrap" tabindex="-1"><div class="card"><h1>Badges</h1><p class="muted">Keep practicing to earn each achievement.</p><div class="badge-grid">' + badges.map(function (badge) {
      return '<div class="achievement' + (badge.earned ? ' earned' : '') + '"><span class="achievement-medal">' + badge.mark + '</span><h3>' + badge.title + '</h3><p>' + badge.note + '</p><span class="small">' + (badge.earned ? 'Earned' : 'Keep practicing') + '</span></div>';
    }).join('') + '</div></div></main>';
  }

  function recordHTML() {
    var seen = {};
    var attempts = [];
    var learningMs = 0;
    Object.keys(store.tries || {}).forEach(function (id) {
      var lesson = KD.LESSONS.find(function (l) { return l.id === id; });
      (store.tries[id] || []).forEach(function (row) {
        if (seen[row.at]) return;
        seen[row.at] = true;
        if (lesson && lesson.scoreFree) learningMs += row.ms || 0;
        else attempts.push(row);
      });
    });
    attempts.sort(function (a, b) { return a.at - b.at; });
    var recent = attempts.slice(-12);
    var speed = recent.length ? recent.reduce(function (sum, row) { return sum + (row.wpm || 0); }, 0) / recent.length : 0;
    var profileSpeed = KD.profileSpeed(store.profile);
    if (profileSpeed) speed = profileSpeed;
    var acc = recent.length ? recent.reduce(function (sum, row) { return sum + (row.acc || 0); }, 0) / recent.length : 0;
    var seconds = attempts.reduce(function (sum, row) { return sum + (row.ms || 0); }, 0);
    var covered = {};
    Object.keys(store.touch.keys || {}).forEach(function (id) { var code = id.replace(/\+S$/, ''); if (KD.BY_CODE[code]) covered[code] = true; });
    var coverage = Math.round(Object.keys(covered).length / Object.keys(KD.BY_CODE).length * 100);
    coverage = Math.min(100, coverage);
    var log = (store.log || []).slice().reverse().map(function (row) {
      var lesson = KD.LESSONS.find(function (l) { return l.id === row.id; });
      var guided = row.scoreFree || (lesson && lesson.scoreFree) || /^repair-/.test(row.id || '');
      return '<tr><td>' + esc(showTitle(row.title)) + '</td><td>' + esc(ago(row.at)) + '</td><td>' + (guided ? '—' : fmt(row.wpm || 0)) + '</td><td>' + Math.round(row.acc || 0) + '%</td><td class="small-stars">' + (guided ? 'Practice' : starStr(row.stars || 0)) + '</td></tr>';
    }).join('');
    var fingers = Object.keys(KD.FINGERS).map(function (id) {
      var total = 0, n = 0;
      Object.keys((store.mastery || {}).keys || {}).forEach(function (keyId) {
        var code = keyId.replace(/\+S$/, '');
        var meta = KD.BY_CODE[code];
        if (meta && meta.finger === id) {
          var summary = KD.skillSummary(store.mastery.keys[keyId]);
          total += summary.avg * summary.timed;
          n += summary.timed;
        }
      });
      var wpm = n && total ? 12000 / (total / n) : 0;
      return '<div class="finger-stat"><span>' + esc(KD.FINGERS[id].name) + '</span><div class="stat-track"><i style="width:' + Math.min(100, wpm) + '%"></i></div><b>' + (n >= 4 ? fmt(wpm) + ' WPM' : '—') + '</b></div>';
    }).join('');
    return '<main id="main-content" class="wrap narrow stats-page" tabindex="-1"><section class="card"><h3>Speed</h3><div class="overall-speed"><span>' + (profileSpeed ? 'Profile speed' : 'Recent speed') + '</span><div class="stat-track"><i style="width:' + Math.min(100, speed) + '%"></i></div><b>' + fmt(speed) + ' WPM</b></div>' +
      '<h3>Accuracy &amp; Coverage</h3><div class="dials">' + dialHTML('Accuracy', recent.length ? Math.round(acc) + '%' : '—', acc, false) + dialHTML('Coverage', coverage + '%', coverage, false) + '</div>' +
      '<div class="practice-time"><span>Recorded typing practice</span><b>' + dur(seconds) + '</b></div><div class="practice-time"><span>Learning new keys</span><b>' + dur(learningMs) + '</b></div></section>' +
      '<section class="card"><h2>Progress Overview</h2><p class="small muted">Your latest recorded attempts.</p>' + (recent.length ? chartBlock(recent) : '<p class="empty-state">Complete a lesson to see your progress.</p>') + '</section>' +
      '<section class="card"><h2>Finger Mastery</h2><p class="small muted">Speed of correct keystrokes, with thinking pauses excluded.</p><div class="finger-stats">' + fingers + '</div></section>' +
      masteryHTML() +
      '<section class="card"><h2>Recent Practice</h2>' + (log ? '<div class="table-scroll"><table class="mark"><thead><tr><th>Lesson</th><th>When</th><th>WPM</th><th>Accuracy</th><th>Stars</th></tr></thead><tbody>' + log + '</tbody></table></div>' : '<p class="empty-state">Your completed lessons will appear here.</p>') +
      '<details class="practice-details"><summary>Keys to practice</summary><p>' +
        (KD.recentWeakness(store.mastery, Object.keys((store.mastery || {}).keys || {})).slice(0, 8).map(function (row) {
          return esc(row.id.split('>').map(KD.actionLabel).join(' → ')) + ' · ' + (row.reason === 'accuracy' ? 'accuracy' : 'speed');
        }).join(' · ') || 'No repeated difficulty in your recent presses.') +
        '</p><button class="btn" data-act="weak">Practice weak keys</button></details></section></main>';
  }
  function masteryHTML() {
    var mastery = store.mastery || { keys: {}, pairs: {} };
    function rows(kind) {
      return Object.keys(mastery[kind] || {}).map(function (id) { return { id: id, summary: KD.skillSummary(mastery[kind][id]) }; })
        .filter(function (row) { return row.summary.n && row.id.split('>').every(function (id) { return KD.actionLabel(id); }); })
        .sort(function (a, b) { return a.summary.accuracy - b.summary.accuracy || b.summary.n - a.summary.n; }).slice(0, kind === 'keys' ? 96 : 12)
        .map(function (row) { var s = row.summary; return '<tr><td>' + esc(row.id.split('>').map(KD.actionLabel).join(' → ')) + '</td><td>' + Math.round(s.accuracy) + '%</td><td>' +
          (s.timed >= 4 ? fmt(12000 / s.avg) + ' WPM' : '—') + '</td><td>' + s.n + '</td></tr>'; }).join('');
    }
    var keys = rows('keys'), pairs = rows('pairs');
    if (!keys) return '<section class="card"><h2>Keyboard Mastery</h2><p class="empty-state">Practise a lesson to start measuring individual keys and combinations.</p></section>';
    function table(body) { return '<div class="table-scroll"><table class="mark"><thead><tr><th>Key or combination</th><th>Accuracy</th><th>Speed</th><th>Presses</th></tr></thead><tbody>' + body + '</tbody></table></div>'; }
    return '<section class="card"><h2>Keyboard Mastery</h2><p class="small muted">Your last 24 presses per key. Mistakes count even when you correct them. Speed appears after enough timed presses.</p>' + table(keys) +
      (pairs ? '<details class="practice-details"><summary>Combination mastery</summary>' + table(pairs) + '</details>' : '') + '</section>';
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
    function modifier(label, wide) { return '<div class="key modifier' + (wide ? ' wide' : '') + '"><span class="modifier-label">' + label + '</span></div>'; }
    var rows = KD.ROWS.map(function (row, index) {
      var html = row.map(function (k) { return keyHTML(k, next); }).join('');
      if (index === 0) html += modifier('backspace', true);
      if (index === 1) html = modifier('tab', true) + html;
      if (index === 2) html = modifier('caps lock', true) + html + modifier('enter', true);
      if (index === 3) html = shiftHTML('ShiftLeft', 'shift', next && next.shift && KD.shiftHand(next.finger) === 'left') + html + shiftHTML('ShiftRight', 'shift', next && next.shift && KD.shiftHand(next.finger) === 'right');
      return '<div class="krow">' + html + '</div>';
    }).join('');
    rows += '<div class="krow">' + modifier('control', true) + modifier('alt', true) +
      '<div class="key space' + (next && next.code === 'Space' ? ' next' : '') + '"><div class="hi space-label">space</div></div>' + modifier('alt', true) + modifier('control', true) + '</div>';
    return '<div class="board" aria-label="Standard English US keyboard with DevLys 010 output">' + rows + '</div><p class="keyboard-legend">Top labels: symbols printed on your keyboard. Centre: DevLys 010 output. Shift + 2 (@) types /.</p>';
  }
  function shiftHTML(code, label, on) {
    var quiet = session && session.hand ? " quiet" : "";
    var finger = code === "ShiftLeft" ? "lp" : "rp";
    return '<div class="key wide' + (on ? " next" : "") + quiet + '" data-finger="' + finger + '"><div class="en">' + code.replace("Shift", "") + '</div><div class="hi" style="font-size:11px;font-family:var(--sans)">' + label + "</div></div>";
  }
  function keyHTML(k, next) {
    var on = next && next.type !== "alt" && next.code === k.code;
    var showShift = on ? !!next.shift : false;
    var bigRaw = showShift ? k.shifted : k.normal;
    var smallRaw = showShift ? k.normal : k.shifted;
    var big = KD.devlysKeyFace(bigRaw);
    var small = KD.devlysKeyFace(smallRaw);
    var printedShift = /^[A-Z]$/.test(k.shifted) ? '' : k.shifted;
    var quiet = session && session.hand && KD.handOf(k.code) && KD.handOf(k.code) !== session.hand && !on;
    var cls = "key" + (k.home ? " home" : "") + (on ? " next" : "") + (quiet ? " quiet" : "");
    var hue = KD.FINGERS[k.finger] ? KD.FINGERS[k.finger].hue : "#3b82f6";
    var style = on ? ' style="border-color:' + hue + ';outline:3px solid ' + hue + ';box-shadow:0 0 16px ' + hue + ';"' : "";
    return '<div class="' + cls + '" data-finger="' + esc(k.finger) + '"' + style + '><div class="en">' + esc(k.legend) + "</div>" +
      (printedShift ? '<span class="printed-shift' + (showShift ? ' active' : '') + '" aria-label="Printed Shift symbol ' + esc(printedShift) + '">' + esc(printedShift) + '</span>' : '') +
      '<div class="hi devlys" aria-label="' + esc(KD.keyFace(bigRaw)) + '">' + esc(big) + "</div>" +
      (k.bump && !showShift ? '<div class="bump-dot" style="margin-top:-6px"></div>' : "") +
      '<div class="altg devlys" aria-label="' + esc(KD.keyFace(smallRaw)) + '">' + esc(small) + "</div></div>";
  }

  function handsSVG(next) {
    var handPath = 'M26 254 C24 210 26 170 37 139 L63 88 C72 73 87 78 80 93 L61 132 L101 63 C109 46 129 53 119 70 L86 139 L143 60 C155 43 177 58 165 78 L119 156 L189 72 C200 56 224 70 211 91 L157 180 L183 163 C203 148 225 165 208 184 L188 209 C178 230 159 239 151 254';
    var fingers = {
      lp: 'M37 139 L63 88 C72 73 87 78 80 93 L61 132',
      lr: 'M61 132 L101 63 C109 46 129 53 119 70 L86 139',
      lm: 'M86 139 L143 60 C155 43 177 58 165 78 L119 156',
      li: 'M119 156 L189 72 C200 56 224 70 211 91 L157 180',
      th: 'M157 180 L183 163 C203 148 225 165 208 184 L188 209'
    };
    function hand(right) {
      var finger = next && next.finger;
      if (right && finger && finger.charAt(0) === 'r') finger = 'l' + finger.charAt(1);
      var active = next && (next.finger === 'th' || (right ? next.finger.charAt(0) === 'r' : next.finger.charAt(0) === 'l'));
      var shifting = next && next.shift && KD.shiftHand(next.finger) === (right ? 'right' : 'left');
      return '<svg class="tc-hand-svg" viewBox="0 0 300 260" aria-label="' + (right ? 'Right' : 'Left') + ' hand guide"><g' + (right ? ' transform="translate(300 0) scale(-1 1)"' : '') + '>' +
        '<path d="' + handPath + '" fill="#eeeeee" fill-opacity=".55" stroke="#a5a5a5" stroke-width="3" stroke-linecap="round"/>' +
        (active && fingers[finger] ? '<path d="' + fingers[finger] + '" fill="none" stroke="#548ed0" stroke-width="4" stroke-linecap="round"/>' : '') +
        (shifting ? '<path d="' + fingers.lp + '" fill="none" stroke="#548ed0" stroke-width="4"/>' : '') + '</g></svg>';
    }
    return '<div class="tc-hands-wrapper"><div class="tc-hands-flex">' + hand(false) + hand(true) + '</div></div>';
  }

  function progressBarHTML() {
    if (!session) return "";
    var pct = 0;
    if (session.kind === "exact") {
      var total = session.steps ? session.steps.length : 1;
      pct = Math.min(100, Math.round(((session.i || 0) / total) * 100));
    } else {
      var totalWords = session.words ? session.words.length : 1;
      pct = Math.min(100, Math.round(((session.wi || 0) / totalWords) * 100));
    }
    return (
      '<div class="tc-progress-wrap">' +
      '<div class="tc-progress-bar"><div class="tc-progress-fill" style="width:' + pct + '%;"></div></div>' +
      '<span class="tc-progress-text">' + pct + '%</span>' +
      '</div>'
    );
  }

  function hintKeyPromptHTML(next) {
    if (!next || (session && session.hints === "none" && session.exam)) return "";
    var f = KD.FINGERS[next.finger] || KD.FINGERS.th;
    var hue = f ? f.hue : "#3b82f6";
    var fName = f ? f.name : "Finger";
    var glyph = next.ch || (next.type === "alt" ? ("Alt+" + next.num) : "");
    if (!glyph && next.code) {
      var meta = KD.BY_CODE[next.code];
      glyph = next.shift ? (meta && meta.shifted) : (meta && meta.normal);
    }
    if (session.lang !== "en") glyph = next.space ? "" : KD.devlysKeyFace(glyph);
    var keyDisplay = next.legend || next.code || "";
    if (keyDisplay === "Space") keyDisplay = "Spacebar";
    if (next.shift) keyDisplay = "Shift + " + keyDisplay;

    return (
      '<div class="tc-hint-card">' +
      (glyph ? '<span class="tc-hint-char' + (session.lang !== "en" ? ' devlys' : '') + '">' + esc(glyph) + '</span>' : '') +
      '<span class="tc-hint-badge" style="background:' + hue + ';">' + esc(keyDisplay) + '</span>' +
      '<span class="tc-hint-finger">' + esc(fName) + '</span>' +
      '</div>'
    );
  }

  function starFanfareHTML(stars) {
    var count = Math.max(0, Math.min(5, Math.round(stars || 0)));
    var html = '<div class="tc-stars-fanfare">';
    for (var i = 1; i <= 5; i++) {
      var earned = i <= count;
      html += '<span class="tc-star' + (earned ? ' earned' : '') + '" style="animation-delay:' + (i * 120) + 'ms;">★</span>';
    }
    return html + '</div>';
  }

  function plainLesson(src) {
    var lesson = {};
    ["id", "title", "teach", "finger", "newKey", "acc", "min", "mid", "high", "hints", "section", "stage", "skill", "wordlock", "hand", "anchor", "oppositeShift", "scoreFree", "introduces", "allowed", "reviewPool", "dynamic"].forEach(function (k) {
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
    // Numbered lessons use their authored text on every visit. Adaptive
    // recovery and fresh speed checks have separate, explicit entry points.
    return { tokens: (src.tokens || src.bank || []).map(function (token) {
      return Object.assign({}, token);
    }), extra: [] };
  }
  function startLesson(index, recovery) {
    var src = KD.LESSONS[index];
    if (!src || !unlocked(index)) return;
    stopTick();
    stopPlayback();
    playState = null;
    var lesson = plainLesson(src);
    var built = recovery ? { tokens: recovery.tokens, extra: [] } : tokensFor(src);
    if (recovery) {
      lesson.id = 'repair-' + src.id;
      lesson.title = 'Practise ' + recovery.title;
      lesson.teach = recovery.teach;
      lesson.stage = 'recovery';
      lesson.scoreFree = true;
      lesson.wordlock = false;
      lesson.oppositeShift = true;
    }
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
    session.anchor = lesson.anchor || null;
    if (recovery) { session.recoveryFor = index; session.index = -1; }
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
      badTokens: resume && resume.badTokens ? resume.badTokens : {},
      measurements: resume && resume.measurements || null,
      measuredElapsed: resume && resume.elapsed || 0,
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
    if (!(n >= 18 && n <= 40)) n = 32;
    return n;
  }
  function paintShell() {
    if (!session) return;
    document.body.classList.add("fit");
    document.body.classList.remove("course-map");
    app.innerHTML = '<header class="practice-bar"><button class="icon-button" ' + (session.practice40 ? 'data-go="home" aria-label="Leave speed check" title="Leave speed check"' : 'data-act="lesson-menu" aria-label="Lesson menu" title="Lesson menu (Esc)"') + '>' + icon('menu') + '</button>' +
      '<span class="practice-title">' + (session.index >= 0 ? 'Lesson ' + (session.index + 1) + ' · ' : '') + esc(session.lesson.title) + '</span>' +
      '<div class="practice-tools"><button class="icon-button" data-act="retry" aria-label="Restart the lesson" title="Restart the lesson">' + icon('restart') + '</button>' +
      '<button class="icon-button" data-act="toggle-keyboard" aria-label="Keyboard guide" aria-pressed="' + (store.settings.keyboard !== false) + '" title="Keyboard guide">' + icon('keyboard') + '</button>' +
      '<button class="icon-button" data-act="toggle-hands" aria-label="Hand guide" aria-pressed="' + (store.settings.hands !== false) + '" title="Hand guide">' + icon('hand') + '</button>' +
      '<button class="icon-button" data-act="toggle-sound" aria-label="Typing sounds" aria-pressed="' + !!store.settings.sound + '" title="Typing sounds">' + icon('sound') + '</button>' +
      '<details class="practice-settings"><summary class="icon-button" aria-label="Typing settings" title="Typing settings">' + icon('settings') + '</summary><div class="settings-panel">' +
      '<h3>Typing settings</h3><label><input id="snd" type="checkbox"' + (store.settings.sound ? ' checked' : '') + '> Typing sounds</label>' +
      '<label><input id="show-keyboard" type="checkbox"' + (store.settings.keyboard !== false ? ' checked' : '') + '> On-screen keyboard</label>' +
      '<label><input id="show-hands" type="checkbox"' + (store.settings.hands !== false ? ' checked' : '') + '> Hand guidance</label>' +
      '<label><input id="show-metrics" type="checkbox"' + (store.settings.metrics !== false ? ' checked' : '') + '> Show live WPM and accuracy</label>' +
      '<label><input id="block-errors" type="checkbox"' + (store.settings.blockErrors === true ? ' checked' : '') + '> Block on errors</label>' +
      '<label class="size">Text size <input id="text-size" type="range" min="18" max="40" value="' + drillSize() + '"></label>' +
      '<p class="small muted">RSSB · DevLys 010 · Standard keyboard</p></div></details></div>' + cloudStatusHTML() + '<span class="practice-user">' + (authToken ? esc(currentUser) : 'Hindi') + '</span></header>' +
      lessonNavigationHTML() +
      '<main id="main-content" class="wrap narrow practice-wrap" tabindex="-1"><div id="run"></div></main>';
    var snd = document.getElementById("snd");
    if (snd) snd.addEventListener("change", function () {
      store.settings.sound = snd.checked;
      document.querySelector('[data-act="toggle-sound"]').setAttribute('aria-pressed', String(snd.checked));
      save();
    });
    ['keyboard', 'hands', 'metrics'].forEach(function (setting) {
      document.getElementById('show-' + setting).onchange = function (event) {
        store.settings[setting] = event.target.checked;
        if (session.practice40 && !session.practice40.full && session.phase === "run" && event.target.checked && (setting === "keyboard" || setting === "hands")) session.practice40.guided = true;
        var toggle = document.querySelector('[data-act="toggle-' + setting + '"]');
        if (toggle) toggle.setAttribute('aria-pressed', String(event.target.checked));
        save();
        paint();
      };
    });
    document.getElementById('block-errors').onchange = function (event) { store.settings.blockErrors = event.target.checked; save(); };
    var settingsMenu = document.querySelector('.practice-settings');
    settingsMenu.addEventListener('toggle', function () {
      if (!settingsMenu.open) settingsMenu.querySelector('summary').blur();
    });
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

  function lessonNavigationHTML() {
    if (!session || session.practice40 || session.exam || session.placement) return '';
    var index = session.recoveryFor != null ? session.recoveryFor : session.index;
    if (!(index >= 0 && index < KD.LESSONS.length)) return '';
    var previous = index > 0 && unlocked(index - 1);
    var next = index < KD.LESSONS.length - 1 && unlocked(index + 1);
    return '<nav class="lesson-step-nav" aria-label="Lesson navigation"><button data-act="previous-lesson"' + (previous ? '' : ' disabled') + '>← Previous lesson</button><span>Lesson ' + (index + 1) + ' of ' + KD.LESSONS.length + '</span><button data-act="next-lesson"' + (next ? '' : ' disabled') + ' title="' + (!next && index < KD.LESSONS.length - 1 ? 'Complete this lesson to unlock the next lesson' : 'Next lesson') + '">Next lesson →</button></nav>';
  }

  function moveCourseLesson(direction) {
    if (!session || session.practice40 || session.exam || session.placement) return;
    var index = session.recoveryFor != null ? session.recoveryFor : session.index;
    if (!(index >= 0)) return;
    var target = index + direction;
    if (target < 0 || target >= KD.LESSONS.length || !unlocked(target)) return;
    heldKeys = {};
    startLesson(target);
  }

  function elapsed() {
    if (!session || !session.t0) return 0;
    return (session.paused ? session.pausedAt : performance.now()) - session.t0;
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
    var oldStage = run.querySelector(".stage");
    var stageScroll = oldStage ? oldStage.scrollTop : 0;
    if (session.paused) {
      run.innerHTML = '<section class="pause-screen"><h1>Lesson paused</h1><p class="muted">Take a breath. Continue when you’re ready.</p><button class="btn saffron" data-act="resume-run">Resume typing</button><div class="row-btns"><button class="btn" data-act="retry">Restart lesson</button><button class="btn" data-go="home">Lesson map</button></div><p class="small muted">Press Enter or Esc to resume</p></section>';
      bindStatic();
      return;
    }
    if (session.phase === "intro") {
      run.innerHTML = introHTML();
      var b = document.getElementById("start-run");
      if (b) b.onclick = beginRun;
      placeCaret();
      return;
    }
    var quietKeys = !!(session.practice40 && session.practice40.full) || (session.hints === "none" && (session.exam || (session.lesson && session.lesson.stage === "para")));
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
          ? "Use only left-hand keys while the right index holds J."
          : "Use only right-hand keys while the left index holds F.") + "</div>";
      } else {
        banners += '<div class="banner">' + (session.hand === "left"
          ? "Hold J with your right index. Only the left hand types."
          : "Hold F with your left index. Only the right hand types.") + "</div>";
      }
    }
    if (session.techniqueWarn) banners += '<div class="banner">' + esc(session.techniqueWarn) + '</div>';
    var body = session.kind === "exact" ? exactHTML() : lockHTML();
    var pad = "";
    if (next && next.type === "alt") pad = numpadHTML(next.num);
    run.innerHTML =
      progressBarHTML() +
      '<div class="run-top"><div><div class="kicker">' + esc(session.lesson.title) + "</div>" +
      (session.live ? liveNote() : "") +
      "</div>" +
      '<div class="meters' + (store.settings.metrics === false || session.lesson.scoreFree ? ' hidden' : '') + '">' + timeBit +
      '<div><b>' + fmt(wpm) + "</b><span>Key WPM</span></div>" +
      '<div><b>' + Math.round(acc) + "%</b><span>Accuracy</span></div>" +
      liveMarks + "</div></div>" +
      banners +
      teachingSequenceHTML(next) +
      '<div class="stage" style="--drill:' + drillSize() + 'px">' + body + "</div>" +
      hintKeyPromptHTML(next) +
      guidanceHTML(session.hints === "none" && session.exam ? null : next) +
      pad;
    bindPad();
    var stage = run.querySelector(".stage");
    if (stage) stage.scrollTop = stageScroll;
    var cur = document.querySelector(".box.now, .word.now");
    var wordMark = session.wi;
    if (session.kind === "exact") {
      var stNow = currentStep();
      wordMark = stNow && stNow.ti >= 0 ? stNow.ti : session.i;
    }
    if (cur && wordMark !== session._scrolled) {
      session._scrolled = wordMark;
      if (stage && stage.contains(cur)) {
        var stageRect = stage.getBoundingClientRect();
        var curRect = cur.getBoundingClientRect();
        if (curRect.top < stageRect.top) stage.scrollTop += curRect.top - stageRect.top;
        else if (curRect.bottom > stageRect.top + stage.clientHeight) stage.scrollTop += curRect.bottom - stageRect.top - stage.clientHeight;
      }
    }
    placeCaret();
  }

  function accuracy() {
    if (session.kind === "exact") {
      if (session.measurements) return KD.measurementSummary(session.measurements).acc;
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
    var quietKeys = !!(session.practice40 && session.practice40.full) || (session.hints === "none" && (session.exam || (session.lesson && session.lesson.stage === "para")));
    var first = quietKeys ? null : (session.kind === "exact" ? (session.steps[0] || null) : nextLockStep());
    return '<div class="lesson-ready"><p>' + esc(L.teach || 'Keep your fingers on the home row. Follow the highlighted key.') + '</p><p>Keep your computer’s keyboard input on English (US). The practice text uses DevLys 010.</p>' +
      '<button class="start-typing" id="start-run">Start Typing <span>Press Enter</span></button></div>' +
      teachingSequenceHTML(first) +
      '<div class="stage" style="--drill:' + drillSize() + 'px">' + preview + "</div>" +
      hintKeyPromptHTML(first) +
      guidanceHTML(first);
  }

  function teachingSequenceHTML(next) {
    if (['introduction', 'combination', 'recovery', 'review'].indexOf(session.lesson.stage) < 0) return '';
    if (!next || next.space) return '<div class="teaching-sequence sequence-placeholder" aria-hidden="true"></div>';
    var token = session.tokens[next.ti];
    if (!token) return '';
    var steps = KD.stepsFromKruti(token.k);
    var current = session.steps.slice(0, session.i).filter(function (step) { return step.ti === next.ti; }).length;
    return '<div class="teaching-sequence" aria-label="Key order for ' + esc(token.h) + '"><span class="h devlys" aria-label="' + esc(token.h) + '">' + esc(token.k) + '</span><span class="sequence-keys">' +
      steps.map(function (step, i) { return (i ? '<span class="sequence-arrow">→</span>' : '') + '<kbd' + (i === current ? ' class="current"' : '') + '>' + esc(KD.actionLabel(KD.actionId(step))) + '</kbd>'; }).join('') + '</span></div>';
  }

  function guidanceHTML(next) {
    if (session && session.practice40 && session.practice40.full) return "";
    if (store.settings.keyboard === false) return store.settings.hands === false ? '' : handsSVG(next);
    return '<div class="keyboard-guide">' + keyboardHTML(next) + (store.settings.hands === false ? '' : handsSVG(next)) + '</div>';
  }

  function togglePause() {
    if (!session || screen !== 'run' || session.practice40) return;
    if (!session.paused) {
      session.paused = true;
      session.pausedAt = performance.now();
      session.altDown = false;
      session.altBuf = '';
      stopTick();
    } else {
      if (session.t0) session.t0 += performance.now() - session.pausedAt;
      session.paused = false;
      session.autoPause = false;
      session.lastActivityAt = performance.now();
      session.lastTap = null;
      if (session.phase === 'run') ensureTick();
    }
    paint();
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
  function boxHTML(state, target, formed, flash, wait, legacy, typedLegacy) {
    var label = target;
    var isLegacy = legacy != null && session.lang !== "en";
    if (isLegacy) { target = legacy; formed = typedLegacy || ""; }
    var cls = "box " + (state === "wait" ? "ahead" : state) + (flash && state === "now" ? " miss" : "");
    if (isLegacy) cls += " devlys";
    var a11y = ' aria-label="' + esc(label) + '"';
    if (state !== "now") return '<span class="' + cls + '"' + a11y + '>' + esc(target) + "</span>";
    var at = 0;
    if (formed && target.indexOf(formed) === 0) at = formed.length;
    if (at === (target || "").length && at > 0) cls += " typed";
    var pill = wait ? '<span class="wait">मात्रा</span>' : "";
    return '<span class="' + cls + '"' + a11y + '>' +
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
      if (past && session.badTokens && session.badTokens[index]) state = "bad";
      if (index && tok.line != null && tok.line !== session.tokens[index - 1].line) html += '<span class="line-break" aria-hidden="true"></span>';
      html += boxHTML(state, tok.h || "·", formed, flash || !!(cur && session.badTokens && session.badTokens[index]), wait, tok.k, krutiSoFar(index));
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
      html += boxHTML(state, w.h, formed, flash, wait, w.k, session.typed);
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
      master += '<span class="word ' + c + (session.lang === 'en' ? '' : ' devlys') + '" aria-label="' + esc(w.h) + '">' + esc(session.lang === 'en' ? w.h : w.k) + "</span> ";
    });
    var typed = "";
    var snaps = session.typedWords || [];
    for (var i = 0; i < session.wi; i++) {
      var snap = snaps[i];
      var text = snap ? snap.text : session.words[i].h;
      typed += '<span class="word ' + (session.marks[i] === "ok" ? "ok" : "bad") + (session.lang === 'en' ? '' : ' devlys') + '">' + esc(session.lang === 'en' ? text : (snap && snap.raw != null ? snap.raw : session.words[i].k)) + "</span> ";
    }
    var cur = esc(session.typed || "");
    typed += '<span class="word now' + (session.lang === 'en' ? '' : ' devlys') + '">' + cur + "</span>";
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
    if (session.practice40) { session.practice40.guided = !session.practice40.full; session.t0 = performance.now(); }
    session.holding = true;
    paint();
    ensureTick();
    if (session.live) save();
  }
  function ensureTick() {
    stopTick();
    tick = setInterval(function () {
      if (!session || session.phase !== "run") return;
      if (!session.exam && !session.practice40 && session.lastActivityAt && performance.now() - session.lastActivityAt > 10000) {
        togglePause(); session.autoPause = true; return;
      }
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
    session.lastTap = { id: id, t: now, ti: step.ti };
    session.tapN = (session.tapN || 0) + 1;
    if (session.tapN % 12 === 0) save();
  }
  function recordSkill(step, ok) {
    if (!step || !session) return;
    var now = performance.now(), prev = session.lastTap;
    skillStamp = Math.max(Date.now(), skillStamp + 1);
    store.mastery = KD.noteSkill(store.mastery, step, prev, ok, prev ? now - prev.t : 0, skillStamp);
    recordPosition(step, ok, false);
  }
  function recordPosition(step, ok, erase) {
    if (!session || session.kind !== 'exact' || !step) return;
    var currentElapsed = elapsed();
    var delay = session.measuredElapsed == null ? 0 : Math.max(0, currentElapsed - session.measuredElapsed);
    session.measurements = KD.measurePosition(session.measurements, session.i, step, ok, delay, erase);
    session.measuredElapsed = currentElapsed;
    session.lastActivityAt = performance.now();
  }
  function refreshTokenErrors(ti) {
    session.badTokens = session.badTokens || {};
    var rows = session.measurements && session.measurements.positions || [];
    session.badTokens[ti] = rows.some(function (row) { return row && row.ti === ti && row.visited && !row.valid; });
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
    var expected = currentStep();
    recordSkill(expected, false);
    forgetTiming();
    pushTape(false, info || null);
    var missedId = expected && expected.code === code ? KD.actionId(expected) : code;
    if (missedId) store.misses[missedId] = (store.misses[missedId] || 0) + 1;
    beep(false);
    save();
    armFlash();
    paint();
  }
  function advance() {
    session.handWarn = false;
    var stepNow = currentStep();
    recordSkill(stepNow, true);
    if (stepNow) refreshTokenErrors(stepNow.ti);
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
    if (e.code) heldKeys[e.code] = true;
    if (e.key === 'Escape') {
      if (showAuthModal) { act('close-auth'); return; }
      var settings = document.querySelector('.practice-settings[open]');
      if (settings) { settings.open = false; return; }
      if (screen === 'run') { e.preventDefault(); togglePause(); return; }
      go('home'); return;
    }
    if (e.target.closest && e.target.closest('input, textarea, select, summary, .settings-panel, .auth-overlay')) return;
    if (session && session.paused) {
      if (e.key === 'Enter') { e.preventDefault(); togglePause(); }
      else if (session.autoPause && (e.key.length === 1 || e.key === 'Backspace')) togglePause();
      else return;
      if (e.key === 'Enter') return;
    }
    if (session && session.practice40 && session.phase === "run" && session.t0 && remain() <= 0) { e.preventDefault(); finish(); return; }
    if (session && screen === 'run' && session.lang !== 'en' && document.body.classList.contains('devlys-loading')) { e.preventDefault(); return; }
    if (session && screen === 'run' && (e.altKey || e.key === 'Alt' || e.ctrlKey || e.metaKey)) { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey) return;
    if (session && screen === 'run' && (e.code === session.anchor || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
      session.techniqueWarn = '';
      if (e.code === session.anchor) e.preventDefault();
      paint();
      return;
    }
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
    var technique = KD.checkTechnique(session.lesson, step, heldKeys);
    if (technique) { session.techniqueWarn = technique; paint(); return; }
    session.techniqueWarn = '';
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
    if (e.key === 'Backspace') {
      if (session.i > 0) {
        var previousPosition = session.measurements && session.measurements.positions[session.i - 1];
        if (previousPosition && previousPosition.valid) session.correct = Math.max(0, session.correct - 1);
        recordPosition(step, false, true);
        session.i--;
        refreshTokenErrors(session.steps[session.i].ti);
        forgetTiming(); paint();
      }
      return;
    }
    if (e.code === step.code && !!e.shiftKey === !!step.shift) advance();
    else {
      if (!session.t0) session.t0 = performance.now();
      miss(step.code, {
      si: session.i,
      ti: step.ti != null ? step.ti : -1,
      wi: -1,
      word: wordAtStep(step),
      want: faceOfStep(step),
      got: faceOfEvent(e)
      });
      if (store.settings.blockErrors !== true && !session.lesson.scoreFree) {
        if (step.ti != null) refreshTokenErrors(step.ti);
        session.i++;
        if (session.i >= session.steps.length) finish();
        else { paint(); if (session.live) save(); }
      }
    }
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
      var correctStep = KD.stepsFromKruti(expect)[0];
      correctStep.ti = session.wi;
      recordSkill(correctStep, true);
      rememberTap(correctStep);
      beep(true);
    } else {
      if (expect && ch !== expect) {
        var st = KD.stepsFromKruti(expect)[0];
        if (st && st.code) {
          st.ti = session.wi;
          recordSkill(st, false);
          var missed = KD.actionId(st);
          store.misses[missed] = (store.misses[missed] || 0) + 1;
        }
        session.wordMistakes = session.wordMistakes || {};
        session.wordMistakes[session.wi] = true;
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
    delete heldKeys[e.code];
    if (!session) return;
    if (screen === 'run' && e.code === session.anchor && !session.paused) {
      session.techniqueWarn = KD.checkTechnique(session.lesson, currentStep(), heldKeys);
      paint();
    }
    if (e.key === "Alt" && session.altDown) {
      e.preventDefault();
      finishAlt();
    }
  });
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener('blur', function () {
    heldKeys = {};
    if (session && screen === 'run' && session.phase === 'run' && !session.paused) togglePause();
  });

  function commitWord() {
    var word = session.words[session.wi];
    if (!word) return;
    if (!session.t0) session.t0 = performance.now();
    var ok;
    if (session.lang === "en") ok = session.typed === word.h;
    else ok = KD.examWordCorrect(session.typed, word.k);
    session.marks.push(ok ? "ok" : "bad");
    var got = "";
    if (!session.typedWords) session.typedWords = [];
    if (!ok) {
      got = session.lang === "en" ? (session.typed || "—") : (KD.preview(session.typed) || "—");
      session.wrong.push({ want: word.h, got: got });
      session.typedWords[session.wi] = { text: got || "—", raw: session.typed, ok: false };
      pushTape(false, { si: -1, ti: -1, wi: session.wi, word: word.h, want: word.h, got: got });
    } else {
      session.typedWords[session.wi] = { text: word.h, raw: session.typed, ok: true };
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
    var ms = session.practice40 ? Math.min(session.limit, elapsed()) : elapsed();
    if (session.placement) applyPlacement();
    if (session.kind === "exact") {
      var acc = accuracy();
      var measuredWpm = KD.keyWpm(session.correct, ms);
      var wpm = Math.min(200, session.practice40 ? measuredWpm : Math.round(measuredWpm));
      var realAcc = session.measurements ? KD.measurementSummary(session.measurements).realAcc : acc;
      var stars = KD.starsFor(wpm, acc, session.lesson, realAcc);
      if (session.lesson.scoreFree && session.index >= 0) store.learned[session.lesson.id] = true;
      if (!session.lesson.scoreFree && session.lesson.id && session.index >= 0) {
        store.stars[session.lesson.id] = Math.max(store.stars[session.lesson.id] || 0, stars);
      }
      session.result = { kind: "exact", acc: acc, realAcc: realAcc, wpm: wpm, stars: stars, ms: ms };
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
    if (session.practice40 && ms >= 120000) {
      store.practice40 = KD.mergePractice40(store.practice40, { attempts: [{ at: at, ms: ms, wpm: session.result.wpm, acc: session.result.acc, realAcc: session.result.realAcc, full: session.practice40.full, guided: session.practice40.guided }] });
    }
    if (session.measurements && !session.exam) store.profile = KD.updateProfile(store.profile, session.measurements, at);
    if (session.index >= 0 && !session.lesson.scoreFree) session.recovery = KD.buildRecovery(KD.LESSONS[session.index], store, session.slips || []);
    if (session.live && session.lesson && session.result && session.result.stars == null) {
      var liveStars = KD.starsFor(session.result.wpm, session.result.acc, session.lesson);
      if (session.kind === "lock" && session.marks.length !== session.words.length) liveStars = 0;
      session.result.stars = liveStars;
    }
    if (session.index >= 0 && session.lesson && session.lesson.id) {
      store.tries = KD.pushAttempt(store.tries, session.lesson.id, {
        at: at,
        acc: Math.round((session.result && session.result.acc) || 0),
        realAcc: session.result && session.result.realAcc != null ? session.result.realAcc : null,
        wpm: Math.round(((session.result && session.result.wpm) || 0) * 10) / 10,
        stars: session.result ? (session.result.stars || 0) : 0,
        marks: session.result && session.result.marks != null ? Math.round(session.result.marks * 10) / 10 : null,
        ms: ms,
        tape: session.tape || [],
        slips: session.slips || [],
        words: (session.tokens || []).map(function (t) { return t.h; })
      });
      if (!session.lesson.scoreFree) askCoach();
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
      scoreFree: !!(session.lesson && session.lesson.scoreFree),
      acc: Math.round((session.result && session.result.acc) || 0),
      realAcc: session.result && session.result.realAcc != null ? session.result.realAcc : null,
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
        min: session.lesson.min || 0,
        mid: session.lesson.mid || 0,
        high: session.lesson.high || 0,
        words: (session.tokens || []).map(function (t) { return t.h; }).slice(0, 24),
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
    save(true);
    screen = "result";
    session.phase = "done";
    if (session.result && session.result.stars) {
      soundFanfare(session.result.stars);
    } else {
      soundFanfare(1);
    }
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
    store.placedKeys = store.placedKeys || {};
    store.placedPairs = store.placedPairs || {};
    var keyEvidence = {};
    var pairEvidence = {};
    session.words.forEach(function (word, i) {
      var clean = session.marks[i] === 'ok' && !(session.wordMistakes || {})[i];
      var previous = '';
      KD.stepsFromKruti(word.k).forEach(function (step) {
        var id = KD.actionId(step);
        keyEvidence[id] = keyEvidence[id] || { clean: 0, bad: 0 };
        keyEvidence[id][clean ? 'clean' : 'bad']++;
        if (previous) {
          var pair = previous + '>' + id;
          pairEvidence[pair] = pairEvidence[pair] || { clean: 0, bad: 0 };
          pairEvidence[pair][clean ? 'clean' : 'bad']++;
        }
        previous = id;
      });
    });
    Object.keys(keyEvidence).forEach(function (id) {
      if (!keyEvidence[id].bad && keyEvidence[id].clean >= 2) store.placedKeys[id] = true;
    });
    Object.keys(pairEvidence).forEach(function (id) { if (!pairEvidence[id].bad && pairEvidence[id].clean >= 2) store.placedPairs[id] = true; });
    if (session.marks.filter(function (mark) { return mark === 'ok'; }).length >= 2) store.placedKeys.Space = true;
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

  function startAIDrill() { startWeak(); }

  function resultHTML() {
    if (!session || !session.result) return '<div class="wrap"><div class="card">No result.</div></div>';
    var r = session.result;
    if (session.placement) return placementResult(r);
    if (session.practice40Weak) return '<main id="main-content" class="wrap narrow result-page"><section class="card result-card"><div class="kicker">Hindi practice</div><h1>Combination practice complete</h1><p>Take this steady rhythm into your next speed check. These short drills build accuracy; they do not count as passage speed.</p><div class="row-btns"><button class="btn primary" data-act="practice40-check">Check my speed</button><button class="btn" data-act="practice40-weak">More combination practice</button><button class="btn ghost" data-go="home">Practice plan</button></div></section></main>';
    if (session.lesson.scoreFree) {
      var recovery = session.recoveryFor != null;
      return '<main id="main-content" class="wrap narrow result-page" tabindex="-1"><section class="card result-card"><div class="result-lesson">' + esc(session.lesson.title) + '</div><h1>' +
        (recovery ? 'Ready to try again' : 'Key learned') + '</h1><p>' + (recovery ? 'Take that steady rhythm back into the lesson.' : 'You practised the new key. Next, use it in short combinations.') +
        '</p><div class="row-btns"><button class="btn primary" data-act="' + (recovery ? 'return-course' : 'next') + '">' + (recovery ? 'Return to lesson' : 'Continue') +
        '</button><button class="btn" data-act="retry">Practise again</button><button class="btn ghost" data-go="home">Lesson Map</button></div><p class="small muted">No speed goal or stars for this guided practice. Press Enter to continue.</p></section></main>';
    }
    if (session.practice40) return practice40Result(r);
    if (!session.exam) {
      var stars = r.stars || 0;
      var nextAction = session.live ? 'live' : stars === 0 ? (session.recovery ? 'repair' : 'retry') : (session.index >= 0 && unlocked(session.index + 1) ? 'next' : 'retry');
      var rows = session.lesson.id ? attemptsFor(session.lesson.id).slice(-8) : [];
      return '<main id="main-content" class="wrap narrow result-page" tabindex="-1"><section class="card result-card"><div class="result-lesson">' + (session.index >= 0 ? 'Lesson ' + (session.index + 1) + ' · ' : '') + esc(session.lesson.title) + '</div>' +
        '<h1>' + (stars >= 3 ? 'Well done!' : stars >= 1 ? 'Lesson passed' : 'Let’s practice again') + '</h1>' + starFanfareHTML(stars) +
        '<div class="dials">' + dialHTML('Accuracy', Math.round(r.acc || 0) + '%', r.acc || 0, false) + dialHTML('Time', dur(r.ms), 0, true) + dialHTML('Speed', fmt(r.wpm || 0), Math.min(100, (r.wpm || 0) / (session.lesson.high || 40) * 100), false) + '</div>' +
        '<p class="small muted">' + Math.round(r.realAcc == null ? r.acc : r.realAcc) + '% first-try accuracy. Pass: ' + (session.lesson.acc || 94) + '% accuracy and ' + (session.lesson.min || 3) + ' WPM. Goal speed: ' + (session.lesson.high || 40) + ' WPM.</p>' +
        (session.recovery ? '<p class="practice-feedback">Practise ' + esc(session.recovery.title) + ' in a short review.</p>' : '') +
        '<div class="row-btns"><button class="btn primary" data-act="' + nextAction + '">' + (nextAction === 'repair' ? 'Practise ' + esc(session.recovery.title) : nextAction === 'retry' ? 'Practice Again' : 'Continue') + '</button>' +
        (session.recovery && nextAction !== 'repair' ? '<button class="btn" data-act="repair">Practise difficult keys</button>' : '') + '<button class="btn" data-act="retry">Restart</button><button class="btn ghost" data-go="home">Lesson Map</button></div><p class="small muted">Press Enter to continue</p></section>' +
        (rows.length > 1 ? '<section class="card"><h3>Your progress on this lesson</h3>' + chartBlock(rows) + '</section>' : '') +
        (session.index >= 0 ? '<button class="history-link" data-act="lesson-history">View attempts &amp; playback</button>' : '') + '</main>';
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
    var p = (document.getElementById("auth-pass") ? document.getElementById("auth-pass").value : "");
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
      STORE = GUEST_STORE + "-account-" + currentUser;
      store = KD.mergeProgress(loadLocal(), null);
      pendingCloud = null; folderSave = false; lastCloudSave = Date.now();
      syncStatus("Loading your cloud progress…");
      showAuthModal = false;
      fetch("/api/progress", {
        headers: { "Authorization": "Bearer " + authToken, "Cache-Control": "no-store" }
      }).then(function (r) { if (!r.ok) throw new Error("Cloud unavailable"); return r.json(); }).then(function (cloudStore) {
        if (cloudStore && cloudStore.stars) adoptFile(JSON.stringify(cloudStore));
        syncStatus("Saved to cloud");
        draw();
      }).catch(function () { syncStatus("Saved on this device · cloud unavailable"); draw(); });
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
    if (name === 'jump-current') {
      var tile = document.querySelector('[data-lesson="' + nextLessonIndex() + '"]');
      if (tile) { tile.scrollIntoView({ block: 'center', behavior: 'smooth' }); tile.focus({ preventScroll: true }); }
      return;
    }
    if (name === 'previous-lesson') { moveCourseLesson(-1); return; }
    if (name === 'next-lesson') { moveCourseLesson(1); return; }
    if (name === 'practice40-check') { startPractice40(); return; }
    if (name === 'practice40-weak') {
      var current = nextLessonIndex(), state = KD.practice40State(store);
      if (!state.canStart) { startLesson(current); return; }
      var src = { title: 'Familiar combinations', tokens: state.bank, reviewPool: state.bank, allowed: state.allowed };
      var recovery = KD.buildRecovery(src, store, session && session.slips || []) || { title: 'familiar combinations', teach: 'Keep a smooth rhythm. Practise these known pairs and words slowly before increasing speed.', tokens: KD.progressiveReview(src, store) };
      if (!recovery.tokens.length) { startLesson(current); return; }
      startLesson(current, recovery); session.index = -1; session.recoveryFor = null; session.practice40Weak = true; session.lesson.allowed = state.allowed; session.lesson.anchor = null; session.anchor = null; session.hand = ''; session.lesson.hand = ''; paintShell(); return;
    }
    if (name === 'repair') { if (session && session.recovery && session.index >= 0) startLesson(session.index, session.recovery); return; }
    if (name === 'return-course') { if (session && session.recoveryFor != null) startLesson(session.recoveryFor); return; }
    if (name === 'lesson-history') { screen = 'lesson'; draw(); return; }
    if (name === 'lesson-menu' || name === 'resume-run') { togglePause(); return; }
    if (name === 'toggle-keyboard' || name === 'toggle-hands' || name === 'toggle-sound') {
      var setting = name.slice(7);
      if (session && session.practice40 && !session.practice40.full && session.phase === "run" && (setting === "keyboard" || setting === "hands")) session.practice40.guided = true;
      store.settings[setting] = setting === 'sound' ? !store.settings.sound : store.settings[setting] === false;
      save();
      paintShell();
      return;
    }
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
      save(true);
      saveQueue.then(function () {
        authToken = null; pendingCloud = null; folderSave = false;
        clearTimeout(saveTimer); saveTimer = null;
        localStorage.removeItem("sparsh_auth_token");
        STORE = GUEST_STORE; store = KD.mergeProgress(loadLocal(), null);
        syncStatus('Saved on this device · sign in to sync');
        session = null; screen = 'home'; stopTick(); draw();
      });
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
      startWeak();
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
      if (KD.courseComplete && KD.courseComplete(store)) { startLive(); return; }
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
      if (session && session.practice40Weak) { act("practice40-weak"); return; }
      if (session && session.recoveryFor != null) { var index = session.recoveryFor; startLesson(index, KD.buildRecovery(KD.LESSONS[index], store, [])); }
      else if (session && session.practice40) startPractice40();
      else if (session && session.exam) startExam(session.lang);
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
    var current = nextLessonIndex();
    var recovery = KD.buildRecovery(KD.LESSONS[current], store, []);
    startLesson(current, recovery);
  }

  function startCoach() { startWeak(); }

  if (!KD.legacyFromEvent) {
    KD.legacyFromEvent = function (e) {
      if (e.code === "Space") return " ";
      var meta = KD.BY_CODE[e.code];
      if (!meta) return null;
      return e.shiftKey ? meta.shifted : meta.normal;
    };
  }

  function refreshCloud() {
    if (!authToken || !folderSave || screen === 'run') return;
    var token = authToken;
    flushCloud().then(function () {
      return fetch('/api/progress',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    }).then(function(r){if (!r.ok) throw new Error('Cloud unavailable'); return r.json();}).then(function(data){
      if (authToken !== token || !data.stars) return;
      store = KD.mergeProgress(store, data); localStorage.setItem(STORE, JSON.stringify(store));
      if (!pendingCloud) syncStatus('Saved to cloud');
      draw();
    }).catch(function(){syncStatus('Saved on this device · cloud unavailable');});
  }
  window.addEventListener('focus', refreshCloud);
  window.addEventListener('online', function(){if (pendingCloud) flushCloud();else refreshCloud();});
  window.addEventListener('pagehide', function () {
    if (!authToken || !folderSave) return;
    captureResume();
    var body = JSON.stringify(store);
    localStorage.setItem(STORE, body);
    if (pendingCloud && body.length < 60000) fetch('/api/progress',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:body,keepalive:true}).catch(function(){});
  });
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
            pendingCloud = null; folderSave = false; clearTimeout(saveTimer); saveTimer = null;
            STORE = GUEST_STORE; store = KD.mergeProgress(loadLocal(), null);
            syncStatus("Sign in to sync across devices");
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
      syncStatus(authToken ? "Saved to cloud" : "Saved in this folder");
      show();
    }).catch(function () {
      clearTimeout(timer);
      folderSave = false;
      show();
    });
  })();
  document.fonts.load('24px "RSSB DevLys 010"').then(function (fonts) {
    if (!fonts.length) throw new Error('DevLys font unavailable');
    document.body.classList.remove('devlys-loading');
    if (session && screen === 'run') paint();
  }).catch(function () { document.body.classList.add('devlys-error'); });
})(typeof globalThis !== "undefined" ? globalThis : this);

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
  var sentenceJobs = {};
  var cloudReadJob = null;
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
  var pendingCloud = null, saveTimer = null, lastCloudSave = 0, cloudFailedAt = 0, cloudPausedUntil = 0, cloudBusy = false;
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
  function ensureTraining() {
    if (!store.training && KD.trainingProgram) {
      var program = KD.trainingProgram(store);
      store.training = { startDate: program.startDate, goalWpm: 50, durationDays: 20, baselineWpm: 33, baselineEstimated: true };
    }
    if (store.training && store.training.baselineEstimated && store.practice40) {
      var first = (store.practice40.attempts || []).find(function (r) { return r.full && !r.guided && r.ms >= 120000 && r.wpm > 0; });
      if (first) { store.training.baselineWpm = first.wpm; store.training.baselineEstimated = false; }
    }
  }
  ensureTraining();
  function captureResume() {
    if (!session || !session.live || !session.lesson || !store.live) return;
    if (session.phase === "done") return;
    if (!store.live.lesson || store.live.lesson.id !== session.lesson.id) return;
    if (KD.livePassageSignature(store.live.lesson) !== KD.livePassageSignature(session.lesson)) return;
    if (KD.liveLessonCompleted(session.lesson, store.live.past)) return;
    var step = session.steps && session.steps[session.i];
    var at = "";
    if (session.kind === "lock") at = (session.words[session.wi] && session.words[session.wi].h) || "";
    else if (step && step.ti != null && session.tokens[step.ti]) at = session.tokens[step.ti].h || "";
    var elapsedMs = session.t0 ? Math.max(0, Math.round(elapsed())) : 0;
    store.live.resume = {
      id: session.lesson.id,
      passageSig: KD.livePassageSignature(session.lesson),
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
    store.live.updatedAt = Math.max(Date.now(), (store.live.updatedAt || 0) + 1);
    store.live.resume.savedAt = store.live.updatedAt;
  }
  function syncStatus(text) {
    cloudSyncText = text;
    var label = document.getElementById('cloud-status');
    if (label && label.textContent !== text) label.textContent = text;
  }
  function cloudStatusHTML() { return '<span id="cloud-status" class="cloud-status" role="status">' + esc(cloudSyncText) + '</span>'; }
  function noteCloudPause(error) {
    if (!error || error.code !== 'storage_paused') return false;
    cloudPausedUntil = Date.now() + KD.CLOUD_PAUSE_MS;
    syncStatus('Saved on this device · cloud storage paused');
    return true;
  }
  function queueCloud(immediate) {
    if (!pendingCloud || !authToken || cloudBusy) return saveQueue;
    var delay = KD.cloudDelay(Date.now(), lastCloudSave, cloudFailedAt, immediate === true, cloudPausedUntil);
    if (delay > 0) {
      if (!saveTimer) saveTimer = setTimeout(function () { saveTimer = null; flushCloud(); }, delay);
      return saveQueue;
    }
    return flushCloud();
  }
  function flushCloud() {
    clearTimeout(saveTimer); saveTimer = null;
    if (cloudPausedUntil && Date.now() < cloudPausedUntil) {
      syncStatus('Saved on this device · cloud storage paused');
      return saveQueue;
    }
    if (!pendingCloud || !folderSave || !authToken || cloudBusy) return saveQueue;
    if (typingActive()) {
      // The reply is merged into the whole store; never do that mid-lesson.
      saveTimer = setTimeout(function () { saveTimer = null; flushCloud(); }, 5000);
      return saveQueue;
    }
    cloudBusy = true;
    var snapshot = pendingCloud; pendingCloud = null;
    var failedAuth = false;
    syncStatus('Saving to cloud…');
    saveQueue = saveQueue.then(function () {
      var headers = { 'Content-Type':'application/json', Authorization:'Bearer ' + snapshot.token };
      return fetch('/api/progress', {method:'POST',headers:headers,body:snapshot.body}).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) {
            failedAuth = r.status === 401;
            var err = new Error(data && data.code === 'storage_paused' ? 'Saved on this device · cloud storage paused' : (failedAuth ? 'Sign in again to sync' : 'Cloud save pending · retrying'));
            err.code = data && data.code || '';
            throw err;
          }
          return data;
        });
      }).then(function (data) {
        cloudFailedAt = 0;
        cloudPausedUntil = 0;
        lastCloudSave = Date.now();
        if (authToken === snapshot.token && data.progress && !typingActive()) {
          store = KD.mergeProgress(store, data.progress);
          try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) {}
        }
        if (authToken === snapshot.token) syncStatus(pendingCloud ? 'Saved on this device · cloud save pending' : data.cloud ? 'Saved to cloud' : 'Saved in this folder');
      }).catch(function (error) {
        cloudFailedAt = Date.now();
        if (authToken === snapshot.token) {
          if (!pendingCloud) pendingCloud = snapshot;
          if (!noteCloudPause(error)) syncStatus(error.message || 'Cloud save pending · retrying');
        }
      }).then(function () {
        cloudBusy = false;
        if (pendingCloud && authToken && !failedAuth) queueCloud(pendingCloud.immediate);
      });
    });
    return saveQueue;
  }
  var saveSoonTimer = null;
  var saveSoonSince = 0;
  var lastKeyAt = 0;
  /* True while the learner is actively typing a lesson. */
  function typingActive() {
    return !!(session && screen === "run" && session.phase === "run" && !session.paused);
  }
  /* save() stringifies the whole progress store into localStorage (and queues a
     cloud write). Doing that in the middle of a burst froze the page for a few
     frames, so the next keys appeared late. Wait for a short pause in typing
     (at most 30 s), then write when the browser is idle. */
  function saveSoon() {
    if (saveSoonTimer) return;
    if (!saveSoonSince) saveSoonSince = performance.now();
    saveSoonTimer = setTimeout(function () {
      saveSoonTimer = null;
      if (!(session && screen === "run" && session.phase !== "done")) { saveSoonSince = 0; return; }
      if (typingActive() && performance.now() - lastKeyAt < 1500 && performance.now() - saveSoonSince < 30000) { saveSoon(); return; }
      var run = function () {
        saveSoonSince = 0;
        if (session && screen === "run" && session.phase !== "done") save();
      };
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 1000 });
      else run();
    }, 700);
  }
  function save(immediate) {
    if (saveSoonTimer) { clearTimeout(saveSoonTimer); saveSoonTimer = null; }
    saveSoonSince = 0;
    ensureTraining();
    captureResume();
    if (KD.slimTries) store.tries = KD.slimTries(store.tries);
    var body = JSON.stringify(store);
    try { localStorage.setItem(STORE, body); } catch (e) {}
    if (!folderSave) { syncStatus(authToken ? 'Saved on this device · cloud unavailable' : 'Saved on this device · sign in to sync'); return; }
    if (!authToken) { syncStatus('Saved on this device · sign in to sync'); return; }
    pendingCloud = {body:body,token:authToken,immediate:immediate === true || !!(pendingCloud && pendingCloud.immediate)};
    syncStatus(cloudPausedUntil && Date.now() < cloudPausedUntil ? 'Saved on this device · cloud storage paused' : 'Saved on this device · cloud save pending');
    return queueCloud(immediate);
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
    if (KD.adaptivePlan) return KD.adaptivePlan(store).note;
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
    if (KD.adaptiveRecovery) {
      var recovery = KD.adaptiveRecovery(store);
      if (recovery) return recovery.tokens.map(function (t) { return t.h; }).filter(function (h, i, all) { return all.indexOf(h) === i; }).slice(0, 8);
    }
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
    var training = KD.adaptivePlan(store);
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
    var recovery = KD.adaptiveRecovery(store);
    if (recovery) recovery.tokens.forEach(function (t) { if (t && t.h && bank.indexOf(t.h) < 0) bank.push(t.h); });
    if (lesson && !KD.courseComplete(store)) (lesson.bank || lesson.tokens || []).forEach(function (t) { if (t && t.h && bank.indexOf(t.h) < 0) bank.push(t.h); });
    var program = KD.trainingProgram ? KD.trainingProgram(store) : null;
    var goalWpm = (store.training && store.training.goalWpm) || (program && program.goalWpm) || 45;
    return {
      training: { goalWpm: goalWpm, baselineWpm: training.baselineWpm, targetWpm: training.targetWpm, firstTryAccuracy: training.firstTryAccuracy, plateau: training.plateau, baselineSource: training.baselineSource },
      targetKeys: training.targetKeys,
      targetPairs: training.targetPairs,
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
    store.coach = Object.assign({}, store.coach || {}, local);
    var coachToken = authToken, coachUser = currentUser;
    var profile = fingerProfile();
    fetch("/api/coach", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, authToken ? {Authorization:"Bearer " + authToken} : {}),
      body: JSON.stringify(profile)
    }).then(function (r) { return r.json(); }).then(function (plan) {
      if (coachToken !== authToken || coachUser !== currentUser) return;
      if (!plan || !plan.note) return;
      var allow = {};
      (profile.bank || []).forEach(function (w) { allow[w] = 1; });
      var repeat = [];
      (plan.repeat || []).forEach(function (w) { if (allow[w]) repeat.push(w); });
      store.coach = {
        at: Date.now(),
        note: String(plan.note).slice(0, 320),
        drill: Array.isArray(plan.drill) ? plan.drill.filter(function (w) { return typeof w === 'string' && w.length <= 40 && KD.safeToken(w); }).slice(0, 12) : [],
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
  function beepLater(ok) {
    if (!store.settings.sound) return;
    setTimeout(function () { beep(ok); }, 0);
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
      '<button data-act="exam-hi">Hindi exam · 10 minutes</button>' +
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
    if (screen !== "run") {
      document.body.classList.remove("exam-mode");
      document.body.classList.remove("mock-mode");
    }
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
    var completed = KD.liveLessonCompleted(lesson, store.live.past);
    if (completed) { store.live.resume = null; resume = null; }
    if (resume && lesson && lesson.tokens && (lesson.wordlock
        ? (resume.wi || 0) >= lesson.tokens.length
        : (resume.i || 0) >= KD.buildSteps(lesson.tokens).length)) {
      store.live.resume = null;
      resume = null;
    }
    var history = KD.courseComplete && KD.courseComplete(store);
    if (history && lesson && lesson.pattern === "history" && lesson.tokens && lesson.tokens.length &&
        !completed) return;
    if (!history && !completed && lesson && lesson.tokens && lesson.tokens.length && resumeMid(resume)) return;
    var next = KD.composeLive(store);
    if (!completed && lessonSig(lesson) === lessonSig(next) && lesson && next && lesson.min === next.min && lesson.mid === next.mid && lesson.high === next.high) return;
    store.live.resume = null;
    store.live.lesson = next;
    store.live.updatedAt = Math.max(Date.now(), (store.live.updatedAt || 0) + 1);
    if (!booting) save();
  }
  function liveResume() {
    var src = store.live && store.live.lesson;
    var resume = store.live && store.live.resume;
    if (!src || !resume || resume.id !== src.id) return null;
    if (resume.passageSig && resume.passageSig !== KD.livePassageSignature(src)) return null;
    if (KD.liveLessonCompleted(src, store.live.past)) return null;
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
    return { bars: KD.starBars(store, { min: 14, mid: 22, high: 32, cap: 50 }), names: KD.weakKeyNames ? KD.weakKeyNames(store) : [] };
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
    var program = KD.trainingProgram(store), plan = KD.adaptivePlan(store);
    var offer = historyOffer();
    var learn = offer
      ? 'Use new Hindi sentences to carry your combinations into normal reading. Your next practice pace is ' + program.nextTargetWpm + ' WPM with 98% first-try accuracy.'
      : 'Continue the course. Learn one key, then combinations and words.';
    var fullChecks = (state.attempts || []).filter(function (row) { return row && row.full && !row.guided && row.ms >= 120000 && row.wpm > 0; });
    var lastFull = fullChecks.length ? fullChecks[fullChecks.length - 1] : null;
    var shownWpm = lastFull ? lastFull.wpm : null;
    var shownLabel = lastFull ? '2-minute check' : 'no full check yet';
    var goalWpm = program.goalWpm || 50;
    var weakNames = offer && offer.names && offer.names.length ? offer.names.join(', ') : 'your recent misses';
    return '<section class="practice40" aria-label="Hindi practice to ' + goalWpm + ' WPM"><div class="practice40-head"><div><span class="kicker">Day ' + program.day + ' of 20 · ' + esc(program.phase) + '</span><h2>Hindi · ' + goalWpm + ' WPM</h2><p>' + esc(state.reached ? goalWpm + ' WPM repeated on three fresh passages with at least 98% first-try accuracy.' : plan.note) + '</p><div class="goal-picker"><button class="btn tiny' + (goalWpm === 45 ? ' primary' : ' ghost') + '" data-act="set-goal-45">45 WPM goal</button><button class="btn tiny' + (goalWpm === 50 ? ' primary' : ' ghost') + '" data-act="set-goal-50">50 WPM goal</button></div></div><div class="practice40-speed"><b>' + (shownWpm != null ? fmt(shownWpm) : '—') + '</b><span>' + shownLabel + '</span></div></div>' +
      '<p class="training-goal">Next practice pace: <b>' + program.nextTargetWpm + ' WPM</b> · 98% first-try accuracy · Practice window ends ' + esc(program.endDate) + '</p>' +
      '<div class="practice40-routine"><div><b>1. Learn and transfer</b><p>' + esc(learn) + '</p><button class="btn" data-act="start-current">' + (offer ? 'New sentence practice' : 'Continue learning') + '</button>' + (offer ? '<button class="btn" data-act="new-ai-sentence">New AI sentences</button>' : '') + '</div>' +
      '<div><b>2. Practise your combinations</b><p>Recent errors choose the drill, with extra attention to ' + esc(weakNames) + '. A wrong Space locks the word on the exam.</p><button class="btn" data-act="practice40-weak">Practise weak combinations</button><button class="btn" data-act="para">Word-lock transfer</button>' + (program.burstEligible ? '<button class="btn" data-act="rhythm-burst">25-second rhythm burst</button>' : '') + '</div>' +
      '<div><b>3. Speed Check · 2 min</b><p>' + (state.canStart ? state.full ? 'Fresh Hindi passages. Repeat without keyboard or hand guides.' : 'Use familiar keys. Full passages unlock when their keys are learned.' : 'Learn the first keys and Space before checking speed.') + '</p><button class="btn primary" data-act="practice40-check"' + (state.canStart ? '' : ' disabled') + '>Check my speed</button></div>' +
      '<div><b>4. RSSB Exam Simulation</b><p>Real exam scenario: 400 words on Rajasthan geography, culture & ecology. DevLys 010. Space locks word. 25 Marks (Cutoff: 9/25).</p><button class="btn primary" data-act="exam-hi">10-Min Full Exam</button><button class="btn ghost" data-act="exam-hi-5min">5-Min Mini Exam</button>' + (store.bestHi ? '<p class="small muted" style="margin-top:6px;">Best: <b>' + fmt(store.bestHi.marks) + ' / 25 Marks</b> (' + store.bestHi.correct + ' correct)</p>' : '') + '</div></div>' +
      '<p class="small muted">' + program.today.fullChecks + ' full passage checks today · ' + program.today.recordedMinutes + ' recorded practice minutes. Goal: three fresh passage checks at ' + goalWpm + ' WPM and 98% accuracy. Lesson runs and short bursts do not replace that two-minute check.</p>' +
      '<details class="training-plan" open><summary>Your daily routine · about ' + program.totalMinutes + ' minutes including breaks</summary><div class="training-blocks">' + program.blocks.map(function (block) { return '<div><b>' + esc(block.title) + ' · ' + block.minutes + ' min</b><p>' + esc(block.detail) + '</p></div>'; }).join('') + '</div><p class="small muted">Take a two-minute break between blocks. You can split the blocks between morning and evening. Keep the same DevLys keyboard mapping when you switch devices.</p></details>' +
      '<details class="training-plan"><summary>Your 20-day checkpoints</summary><p class="small muted">' + esc(program.note) + '</p><div class="training-checkpoints">' + program.milestones.map(function (m) { return '<span>Day ' + m.day + '<b>' + m.targetWpm + ' WPM</b><small>' + esc(m.date) + '</small></span>'; }).join('') + '</div><p class="small muted">Stable finger-to-key mapping, preparing the next keystroke, and small hand movements guide the technique practice. <a href="https://userinterfaces.aalto.fi/how-we-type/" target="_blank" rel="noopener">Typing research</a>. The exact daily routine is a practice plan, not a proven deadline for reaching ' + goalWpm + ' WPM.</p></details>' +
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
    var checkGoal = (store.training && (store.training.goalWpm === 45 || store.training.goalWpm === 50)) ? store.training.goalWpm : 50;
    session.lesson.min = 0; session.lesson.mid = Math.max(30, checkGoal - 10); session.lesson.high = checkGoal;
    session.lesson.oppositeShift = false; session.lesson.hand = ''; session.hand = ''; session.anchor = null;
    session.limit = 120000; session.practice40 = { full: practice.full, guided: false, sentenceIds: practice.sentenceIds || [], source: practice.source };
    session.hints = practice.full ? 'none' : 'hindi';
    paintShell();
  }
  function practice40Result(r) {
    var program = KD.trainingProgram ? KD.trainingProgram(store) : { goalWpm: 50 };
    var targetGoal = (store.training && store.training.goalWpm) || program.goalWpm || 50;
    var timed = r.ms >= 120000;
    var goal = timed && session.practice40.full && !session.practice40.guided && r.wpm >= targetGoal && r.realAcc >= 98 && r.acc >= 98;
    var state = KD.practice40State(store);
    return '<main id="main-content" class="wrap narrow result-page"><section class="card result-card"><div class="kicker">Hindi · ' + targetGoal + ' WPM practice</div><h1>' + (goal ? targetGoal + ' WPM with clean typing' : r.realAcc < 98 ? 'Build accuracy first' : 'Keep building your rhythm') + '</h1>' +
      '<div class="dials">' + dialHTML('Correct key WPM', fmt(r.wpm), Math.min(100, r.wpm / targetGoal * 100), false) + dialHTML('First-try accuracy', Math.round(r.realAcc) + '%', r.realAcc, false) + dialHTML('Time', dur(r.ms), 0, true) + '</div>' +
      '<p>' + (session.practice40.full ? 'Fresh Hindi passage' : 'Familiar-key practice; full Hindi passage speed is not measured yet') + (session.practice40.guided ? ' · guidance used.' : '.') + '</p><p>' + (!timed ? 'Finish a full two-minute check to save a speed result.' : state.reached ? 'You have repeated the goal on three fresh passages. Keep practising new text.' : 'Repeat the goal on three fresh passages with at least 98% first-try accuracy. Correcting mistakes helps final accuracy, but does not erase first-try mistakes.') + '</p>' +
      '<div class="row-btns"><button class="btn primary" data-act="practice40-weak">Practise weak combinations</button><button class="btn" data-act="para">Word-lock transfer</button><button class="btn" data-act="practice40-check">New speed check</button><button class="btn" data-act="exam-hi">10-minute Hindi exam</button><button class="btn ghost" data-go="home">Practice plan</button></div></section></main>';
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
      '<div class="key space' + (next && next.code === 'Space' ? ' next' : '') + '" data-code="Space"><div class="hi space-label">space</div></div>' + modifier('alt', true) + modifier('control', true) + '</div>';
    return '<div class="board" aria-label="Standard English US keyboard with DevLys 010 output">' + rows + '</div><p class="keyboard-legend">Top labels: symbols printed on your keyboard. Centre: DevLys 010 output. Shift + 2 (@) types /.</p>';
  }
  function shiftHTML(code, label, on) {
    var quiet = session && session.hand ? " quiet" : "";
    var finger = code === "ShiftLeft" ? "lp" : "rp";
    return '<div class="key wide' + (on ? " next" : "") + quiet + '" data-code="' + code + '" data-finger="' + finger + '"><div class="en">' + code.replace("Shift", "") + '</div><div class="hi" style="font-size:11px;font-family:var(--sans)">' + label + "</div></div>";
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
    return '<div class="' + cls + '" data-code="' + k.code + '" data-finger="' + esc(k.finger) + '"' + style + '><div class="en">' + esc(k.legend) + "</div>" +
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
  function aiDetail(error) {
    var reason = error && error.reason || '';
    if (/HTTP 429|HTTP 503/.test(reason)) return 'AI is busy right now. Retry in a minute.';
    if (/HTTP 404|HTTP 403/.test(reason)) return 'The AI model is unavailable.';
    if (/validation failed/.test(reason)) return 'The AI text did not pass the typing check.';
    if (/not configured/.test(reason)) return 'AI is not configured on the server.';
    return '';
  }
  function requestAISentence(lesson) {
    if (!lesson || lesson.pattern !== 'history' || lesson.aiGenerated || liveResume()) return Promise.resolve(false);
    if (sentenceJobs[lesson.id]) return sentenceJobs[lesson.id];
    if (!authToken) { lesson.aiState = 'unavailable'; lesson.source = 'practice-fallback'; return Promise.resolve(false); }
    var token = authToken, id = lesson.id;
    var passageSig = KD.livePassageSignature ? KD.livePassageSignature(lesson) : '';
    var board = KD.coachBoard(store.touch || {});
    var plan = KD.adaptivePlan ? KD.adaptivePlan(store) : null;
    var keys = Object.keys(store.misses || {}).filter(function (key) { return key !== 'Space' && KD.drillable(key); }).sort(function (a,b) { return store.misses[b]-store.misses[a]; }).slice(0,4);
    if (plan) keys = plan.targetKeys.slice(0, 6);
    if (!plan) (board.slowKeys || []).forEach(function (row) { if (keys.indexOf(row.id)<0 && keys.length<6) keys.push(row.id); });
    var usage = Object.assign({}, store.practice40 && store.practice40.sentenceUsage || {}, store.live.sentenceUsage || {});
    var recent = Object.keys(usage).sort(function(a,b){return usage[a].at-usage[b].at;}).slice(-96);
    var recentWords = KD.extractRecentWords ? KD.extractRecentWords(store, 35) : [];
    var targetPairs = plan ? plan.targetPairs.slice(0,4) : (board.slowPairs||[]).slice(0,4).map(function(r){return r.id;});
    var program = KD.trainingProgram ? KD.trainingProgram(store) : null;
    var goalWpm = (store.training && store.training.goalWpm) || (program && program.goalWpm) || 45;
    var trainingData = plan ? {
      goalWpm: goalWpm,
      baselineWpm: plan.baselineWpm,
      targetWpm: plan.targetWpm,
      firstTryAccuracy: plan.firstTryAccuracy,
      plateau: plan.plateau,
      day: program ? program.day : 1,
      durationDays: (store.training && store.training.durationDays) || 20
    } : null;
    lesson.aiState = 'generating';
    var payload = JSON.stringify({weakKeys:keys,slowPairs:targetPairs,recent:recent,recentWords:recentWords,training:trainingData});
    function postSentences() {
      return fetch('/api/sentences',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:payload})
        .then(function(r){return r.json().catch(function(){return {};}).then(function(data){if(!r.ok){var err=Error('AI unavailable');err.reason=data&&data.reason||'';throw err;}return data;});});
    }
    sentenceJobs[id] = postSentences().catch(function(error){
      if (error && /validation failed|not configured/.test(error.reason || '')) throw error;
      return postSentences();
    })
      .then(function(data){
        if (token !== authToken || !store.live || !store.live.lesson || store.live.lesson.id !== id) return false;
        if (KD.livePassageSignature && KD.livePassageSignature(store.live.lesson) !== passageSig) return false;
        if (session && session.live && session.phase !== 'done' && session.lesson.id === id) return false;
        if (!data.aiGenerated || !Array.isArray(data.tokens) || !data.tokens.length || !data.tokens.every(function(t){var safe=KD.safeToken(t.h);return safe&&safe.k===t.k;})) throw Error('Invalid AI text');
        store.live.lesson = Object.assign({},lesson,{tokens:data.tokens,sentenceIds:data.sentenceIds,aiGenerated:true,source:'gemini',aiState:'ready',title:'AI sentence practice · '+lesson.high+' WPM',teach:'AI-generated Hindi practice based on your recent weak keys. These are practice sentences, not official exam questions. Pass at '+lesson.min+' WPM. Practice goal: '+lesson.high+' WPM with 98% first-try accuracy; stars also account for accuracy. Your passage stays fixed on reload.'});
        store.live.updatedAt = Math.max(Date.now(),(store.live.updatedAt||0)+1); save(true);
        if(screen==='result')draw();
        return true;
      }).catch(function(error){
        if (token===authToken && store.live && store.live.lesson && store.live.lesson.id===id) {
          store.live.lesson.aiState='unavailable';store.live.lesson.source='practice-fallback';store.live.lesson.aiDetail=aiDetail(error);
          store.live.updatedAt=Math.max(Date.now(),(store.live.updatedAt||0)+1);save(true);
          if(screen==='result')draw();
        }
        return false;
      });
    return sentenceJobs[id];
  }
  function startLive(mode, refreshed) {
    if(mode==='repeat' || mode==='restart') {openLive(mode);return;}
    if (!refreshed && authToken && folderSave && screen !== 'run') {
      return refreshCloud().then(function () { return startLive(mode, true); });
    }
    if(mode==='new') {
      if(!store.live)store.live={past:[]};
      store.live.lesson=KD.composeLive(store);store.live.resume=null;
      store.live.updatedAt=Math.max(Date.now(),(store.live.updatedAt||0)+1);save(true);
    }
    ensureLive();
    if(liveResume() || store.live.lesson.pattern!=='history' || store.live.lesson.aiGenerated) {openLive(mode);return;}
    var id=store.live.lesson.id;
    document.querySelectorAll('[data-act="start-current"], [data-act="live"], [data-act="continue"], [data-act="new-ai-sentence"]').forEach(function(b){b.disabled=true;b.textContent='Generating AI sentences…';});
    requestAISentence(store.live.lesson).then(function(){if(store.live&&store.live.lesson.id===id)openLive(mode);});
  }
  function openLive(mode) {
    if (mode === 'repeat' && session && session.live) {
      store.live.lesson = Object.assign({}, session.lesson, { tokens: session.tokens.map(function (t) { return Object.assign({}, t); }) });
      store.live.resume = null;
    } else ensureLive();
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
      sentenceIds: src.sentenceIds || [],
      aiGenerated: !!src.aiGenerated,
      source: src.source,
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
    save();
  }

  function startLock(opts) {
    var isExam = !!opts.exam;
    session = {
      kind: "lock",
      phase: isExam ? "run" : "intro",
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
    if (isExam) ensureTick();
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
    document.body.classList.toggle("exam-mode", !!session.exam);
    document.body.classList.toggle("mock-mode", !!(session.exam || (session.lesson && session.lesson.stage === "para")));
    app.innerHTML = '<header class="practice-bar"><button class="icon-button" ' + ((session.practice40 || session.exam) ? 'data-go="home" aria-label="Leave exam" title="Leave exam"' : 'data-act="lesson-menu" aria-label="Lesson menu" title="Lesson menu (Esc)"') + '>' + icon('menu') + '</button>' +
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
    if (typingFrame) { cancelAnimationFrame(typingFrame); typingFrame = 0; }
    if (session) session._guide = "";
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
    revealCurrent();
    placeCaret();
  }

  /* A key must change the letter before the keyboard, hands, meters, or save run.
     Rebuilding #run here made fast typing land on the key that was still lit. */
  function canTypePatch() {
    if (!session || session.paused || session.phase !== "run") return false;
    if (session.hand || session.caps || session.layoutWarn || session.techniqueWarn || session.altDown) return false;
    return !!document.getElementById("run");
  }
  function guideStep() {
    var quiet = !!(session.practice40 && session.practice40.full) || (session.hints === "none" && (session.exam || (session.lesson && session.lesson.stage === "para")));
    if (quiet) return null;
    return session.kind === "exact" ? currentStep() : nextLockStep();
  }
  function guideStamp(next) {
    if (!next) return "";
    var at = session.kind === "exact" ? session.i : (session.wi + ":" + (session.typed || "").length);
    return (next.type || "") + ":" + (next.code || "") + ":" + (next.shift ? 1 : 0) + ":" + (next.finger || "") + ":" + (next.num || "") + ":" + at;
  }
  function exactNow() {
    var stepAt = session.steps[session.i] || null;
    var flash = !!(session.flash && performance.now() - session.flash < 220);
    var index = stepAt && stepAt.ti >= 0 ? stepAt.ti : -1;
    if (stepAt && stepAt.space) {
      for (var b = session.i - 1; b >= 0; b--) {
        if (session.steps[b] && session.steps[b].ti >= 0) { index = session.steps[b].ti; break; }
      }
    }
    return { index: index, stepAt: stepAt, flash: flash };
  }
  function applyNowBox(box, frame) {
    var tok = session.tokens[frame.index];
    if (!tok) return;
    var typedLegacy = krutiSoFar(frame.index);
    var formed = "";
    var wait = false;
    if (typedLegacy) {
      var live = KD.liveForm(typedLegacy);
      var text = live.text || "";
      if (text && (tok.h || "").indexOf(text) === 0) { formed = text; wait = !!live.wait; }
    }
    var cur = frame.stepAt && frame.stepAt.ti === frame.index;
    var missFlash = frame.flash || !!(cur && session.badTokens && session.badTokens[frame.index]);
    var isLegacy = tok.k != null && session.lang !== "en";
    var shown = isLegacy ? tok.k : (tok.h || "·");
    var soFar = isLegacy ? (typedLegacy || "") : (formed || "");
    var at = soFar && String(shown).indexOf(soFar) === 0 ? soFar.length : 0;
    var cls = "box now" + (missFlash ? " miss" : "") + (isLegacy ? " devlys" : "");
    if (at > 0 && at === String(shown || "").length) cls += " typed";
    if (box.className !== cls) box.className = cls;
    var caret = box.querySelector(".caret");
    if (caret && caret.getAttribute("data-at") !== String(at)) caret.setAttribute("data-at", String(at));
    var over = box.querySelector(".over");
    var typedText = at > 0 ? String(shown).slice(0, at) : "";
    if (over && over.textContent !== typedText) over.textContent = typedText;
    var waitEl = box.querySelector(".wait");
    if (wait && !waitEl) box.insertAdjacentHTML("afterbegin", '<span class="wait">मात्रा</span>');
    else if (!wait && waitEl) waitEl.remove();
  }
  function patchExact() {
    var stage = document.querySelector("#run .stage");
    if (!stage) return false;
    var frame = exactNow();
    if (frame.index < 0) return false;
    var line = stage.querySelector(".line");
    if (!line) return false;
    var boxes = line.querySelectorAll(".box");
    if (boxes.length !== session.tokens.length) {
      var top = stage.scrollTop;
      stage.innerHTML = exactHTML();
      stage.scrollTop = top;
      return true;
    }
    var current = stage.querySelector(".box.now");
    if (current && current.getAttribute("data-i") === String(frame.index) && current.querySelector(".caret")) {
      applyNowBox(current, frame);
      return true;
    }
    var targetBox = boxes[frame.index];
    if (!targetBox) return false;
    var nows = line.querySelectorAll(".box.now");
    for (var n = 0; n < nows.length; n++) {
      var oldBox = nows[n];
      if (oldBox !== targetBox) {
        var oldIdx = parseInt(oldBox.getAttribute("data-i"), 10);
        if (isNaN(oldIdx)) {
          for (var b = 0; b < boxes.length; b++) {
            if (boxes[b] === oldBox) { oldIdx = b; break; }
          }
        }
        var oldTok = session.tokens[oldIdx];
        var isOldLegacy = oldTok && oldTok.k != null && session.lang !== "en";
        var oldShown = isOldLegacy ? oldTok.k : (oldTok ? (oldTok.h || "·") : "");
        var past = true;
        for (var s = session.i; s < session.steps.length; s++) {
          if (session.steps[s].ti === oldIdx) { past = false; break; }
        }
        var state = past ? ((session.badTokens && session.badTokens[oldIdx]) ? "bad" : "done") : "ahead";
        oldBox.className = "box " + state + (isOldLegacy ? " devlys" : "");
        oldBox.textContent = oldShown;
      }
    }
    if (!targetBox.querySelector(".caret")) {
      var targetTok = session.tokens[frame.index];
      var isTargetLegacy = targetTok && targetTok.k != null && session.lang !== "en";
      var targetShown = isTargetLegacy ? targetTok.k : (targetTok ? (targetTok.h || "·") : "·");
      targetBox.className = "box now" + (isTargetLegacy ? " devlys" : "");
      targetBox.innerHTML = '<span class="ink">' + esc(targetShown) + '</span><span class="over" aria-hidden="true"></span><span class="caret" data-at="0"></span>';
    }
    applyNowBox(targetBox, frame);
    return true;
  }
  function applyLockBox(box) {
    var w = session.words[session.wi];
    if (!w) return;
    var flash = !!(session.flash && performance.now() - session.flash < 220);
    var formed = "";
    var wait = false;
    if (session.typed) {
      if (session.lang === "en") formed = session.typed;
      else {
        var live = KD.liveForm(session.typed);
        var text = live.text || "";
        var onPath = (w.k || "").indexOf(session.typed) === 0;
        if (text && w.h.indexOf(text) === 0) { formed = text; wait = !!live.wait; }
        else if (!onPath && text) formed = text;
      }
    }
    var isLegacy = w.k != null && session.lang !== "en";
    var shown = isLegacy ? w.k : w.h;
    var soFar = isLegacy ? (session.typed || "") : (formed || "");
    var at = soFar && String(shown).indexOf(soFar) === 0 ? soFar.length : 0;
    var cls = "box now" + (flash ? " miss" : "") + (isLegacy ? " devlys" : "");
    if (at > 0 && at === String(shown || "").length) cls += " typed";
    if (box.className !== cls) box.className = cls;
    var caret = box.querySelector(".caret");
    if (caret && caret.getAttribute("data-at") !== String(at)) caret.setAttribute("data-at", String(at));
    var over = box.querySelector(".over");
    var typedText = at > 0 ? String(shown).slice(0, at) : "";
    if (over && over.textContent !== typedText) over.textContent = typedText;
    var waitEl = box.querySelector(".wait");
    if (wait && !waitEl) box.insertAdjacentHTML("afterbegin", '<span class="wait">मात्रा</span>');
    else if (!wait && waitEl) waitEl.remove();
  }
  function syncFix() {
    var root = document.getElementById("run");
    if (!root) return;
    var fix = root.querySelector(".fix");
    var text = session.showFix && session.lastFix ? session.lastFix : "";
    if (!text) { if (fix) fix.remove(); return; }
    if (!fix) {
      var host = root.querySelector(".mock") || root.querySelector(".stage");
      if (!host) return;
      fix = document.createElement("div");
      fix.className = "fix";
      host.appendChild(fix);
    }
    if (fix.textContent !== text) fix.textContent = text;
  }
  function patchMock() {
    var typedLine = document.querySelector("#run .typed-line");
    var passage = document.querySelector("#run .passage");
    if (!typedLine || !passage) return false;
    var now = typedLine.querySelector(".word.now");
    if (!now || now.getAttribute("data-wi") !== String(session.wi)) {
      typedLine.innerHTML = typedLineInner();
      var countEl = document.querySelector("#run .mock-type .mock-count");
      if (countEl && session.words) countEl.textContent = "Word " + Math.min(session.wi + 1, session.words.length) + " of " + session.words.length;
      var exam = !!session.exam;
      var words = passage.querySelectorAll(".word");
      if (words.length === session.words.length) {
        for (var i = 0; i < words.length; i++) {
          var mark = "";
          if (i === session.wi) mark = "now";
          else if (!exam && i < session.wi) mark = session.marks[i] === "ok" ? "ok" : "bad";
          var curCls = words[i].className;
          var newCls = "word" + (mark ? " " + mark : "") + (session.lang === 'en' ? '' : ' devlys');
          if (curCls !== newCls) words[i].className = newCls;
        }
      }
    } else if (now.textContent !== (session.typed || "")) now.textContent = session.typed || "";
    syncFix();
    return true;
  }
  function patchLock() {
    if (session.exam || (session.lesson && session.lesson.stage === "para")) return patchMock();
    var stage = document.querySelector("#run .stage");
    if (!stage) return false;
    var line = stage.querySelector(".line");
    if (!line) return false;
    var boxes = line.querySelectorAll(".box");
    if (boxes.length !== session.words.length) {
      var top = stage.scrollTop;
      stage.innerHTML = lockHTML();
      stage.scrollTop = top;
      return true;
    }
    var box = boxes[session.wi];
    if (!box) return false;
    var nows = line.querySelectorAll(".box.now");
    if (nows.length === 1 && nows[0] === box && box.querySelector(".caret")) {
      applyLockBox(box);
      syncFix();
      return true;
    }
    for (var n = 0; n < nows.length; n++) {
      var oldBox = nows[n];
      if (oldBox !== box) {
        var oldWi = -1;
        for (var b = 0; b < boxes.length; b++) {
          if (boxes[b] === oldBox) { oldWi = b; break; }
        }
        if (oldWi >= 0) {
          var mark = oldWi < session.wi ? (session.marks[oldWi] === "ok" ? "done" : "bad") : "ahead";
          var oldW = session.words[oldWi];
          var oldLegacy = oldW && oldW.k != null && session.lang !== "en";
          var oldShown = oldLegacy ? oldW.k : (oldW ? oldW.h : "");
          oldBox.className = "box " + mark + (oldLegacy ? " devlys" : "");
          oldBox.textContent = oldShown;
        }
      }
    }
    if (!box.querySelector(".caret")) {
      var curW = session.words[session.wi];
      var curLegacy = curW && curW.k != null && session.lang !== "en";
      var curShown = curLegacy ? curW.k : (curW ? curW.h : "");
      box.className = "box now" + (curLegacy ? " devlys" : "");
      box.innerHTML = '<span class="ink">' + esc(curShown) + '</span><span class="over" aria-hidden="true">' + esc(curShown) + '</span><span class="caret" data-at="0"></span>';
    }
    applyLockBox(box);
    syncFix();
    return true;
  }
  function paintKeyFace(el, showShift) {
    if (!el) return;
    var code = el.getAttribute("data-code");
    if (!code || code === "Space" || code.indexOf("Shift") === 0) return;
    var k = KD.BY_CODE[code];
    if (!k) return;
    var bigRaw = showShift ? k.shifted : k.normal;
    var smallRaw = showShift ? k.normal : k.shifted;
    var hi = el.querySelector(".hi");
    var alt = el.querySelector(".altg");
    if (hi) {
      var big = KD.devlysKeyFace(bigRaw);
      if (hi.textContent !== big) hi.textContent = big;
      hi.setAttribute("aria-label", KD.keyFace(bigRaw) || "");
    }
    if (alt) {
      var small = KD.devlysKeyFace(smallRaw);
      if (alt.textContent !== small) alt.textContent = small;
      alt.setAttribute("aria-label", KD.keyFace(smallRaw) || "");
    }
    var printed = el.querySelector(".printed-shift");
    if (printed) printed.classList.toggle("active", !!showShift);
  }
  function syncGuide(next) {
    var board = document.querySelector("#run .board");
    if (board) {
      var wantCode = next && next.type !== "alt" && next.code ? next.code : "";
      var wantShift = !!(next && next.shift && next.type !== "alt");
      var shiftSide = wantShift && next.finger ? KD.shiftHand(next.finger) : "";
      var keep = {};
      if (wantCode) keep[wantCode] = 1;
      if (shiftSide === "left") keep.ShiftLeft = 1;
      if (shiftSide === "right") keep.ShiftRight = 1;
      var marked = board.querySelectorAll(".key.next");
      for (var i = 0; i < marked.length; i++) {
        var code = marked[i].getAttribute("data-code") || "";
        if (keep[code]) continue;
        marked[i].classList.remove("next");
        marked[i].removeAttribute("style");
        paintKeyFace(marked[i], false);
      }
      if (wantCode) {
        var target = board.querySelector('.key[data-code="' + wantCode + '"]');
        if (target) {
          target.classList.add("next");
          paintKeyFace(target, wantShift);
        }
      }
      ["ShiftLeft", "ShiftRight"].forEach(function (code) {
        var el = board.querySelector('.key[data-code="' + code + '"]');
        if (!el) return;
        el.classList.toggle("next", !!keep[code]);
      });
    }
    var finger = next ? ((next.finger || "") + (next.shift ? ":s" : "")) : "";
    if (session._hand === finger) return;
    session._hand = finger;
    if (!document.querySelector("#run .tc-hands-wrapper") || store.settings.hands === false) return;
    setTimeout(function () {
      if (!session || session._hand !== finger) return;
      var live = document.querySelector("#run .tc-hands-wrapper");
      if (!live) return;
      var wrap = document.createElement("div");
      wrap.innerHTML = handsSVG(next);
      if (wrap.firstElementChild) live.replaceWith(wrap.firstElementChild);
    }, 0);
  }
  function replaceRunChunk(selector, html, where) {
    var node = document.querySelector(selector);
    var stage = document.querySelector("#run .stage");
    if (!html) { if (node) node.remove(); return; }
    if (node && node.getAttribute("data-stamp") === html) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    var fresh = wrap.firstElementChild;
    if (!fresh) return;
    fresh.setAttribute("data-stamp", html);
    if (node) node.replaceWith(fresh);
    else if (stage) stage.insertAdjacentElement(where, fresh);
  }
  function syncTeachingSequence(next) {
    if (!session || !session.lesson || ['introduction', 'combination', 'recovery', 'review'].indexOf(session.lesson.stage) < 0) {
      var oldSeq = document.querySelector("#run .teaching-sequence");
      if (oldSeq) oldSeq.remove();
      return;
    }
    var seqEl = document.querySelector("#run .teaching-sequence");
    if (!seqEl) {
      replaceRunChunk("#run .teaching-sequence", teachingSequenceHTML(next), "beforebegin");
      return;
    }
    if (!next || next.space) {
      if (!seqEl.classList.contains("sequence-placeholder")) {
        seqEl.className = "teaching-sequence sequence-placeholder";
        seqEl.setAttribute("aria-hidden", "true");
        seqEl.innerHTML = "";
      }
      return;
    }
    var token = session.tokens[next.ti];
    if (!token) return;
    var current = session.steps.slice(0, session.i).filter(function (step) { return step.ti === next.ti; }).length;
    var hEl = seqEl.querySelector(".h");
    if (hEl && hEl.textContent === token.k && !seqEl.classList.contains("sequence-placeholder")) {
      var kbds = seqEl.querySelectorAll(".sequence-keys kbd");
      for (var k = 0; k < kbds.length; k++) {
        kbds[k].classList.toggle("current", k === current);
      }
    } else {
      replaceRunChunk("#run .teaching-sequence", teachingSequenceHTML(next), "beforebegin");
    }
  }
  function syncProgress() {
    var fill = document.querySelector("#run .tc-progress-fill");
    if (!fill) return;
    var pct = 0;
    if (session.kind === "exact") pct = Math.min(100, Math.round(((session.i || 0) / (session.steps.length || 1)) * 100));
    else pct = Math.min(100, Math.round(((session.wi || 0) / (session.words.length || 1)) * 100));
    var width = pct + "%";
    if (fill.style.width !== width) fill.style.width = width;
  }
  function scrollIntoContainerView(container, el) {
    if (!container || !el) return;
    var cRect = container.getBoundingClientRect();
    var eRect = el.getBoundingClientRect();
    var pad = 14;
    if (eRect.top < cRect.top + pad) {
      if (container.scrollTop > 0) {
        container.scrollTop = Math.max(0, container.scrollTop + (eRect.top - cRect.top - pad));
      }
    } else if (eRect.bottom > cRect.bottom - pad) {
      var maxScroll = container.scrollHeight - container.clientHeight;
      container.scrollTop = Math.min(maxScroll, container.scrollTop + (eRect.bottom - cRect.bottom + pad));
    }
  }
  function revealCurrent() {
    var stage = document.querySelector("#run .stage");
    var mock = document.querySelector("#run .mock");
    if (mock) {
      var passage = mock.querySelector(".passage");
      var typedLine = mock.querySelector(".typed-line");
      if (passage) {
        var pNow = passage.querySelector(".word.now");
        scrollIntoContainerView(passage, pNow);
      }
      if (typedLine) {
        var tNow = typedLine.querySelector(".word.now");
        scrollIntoContainerView(typedLine, tNow);
      }
      return;
    }
    var cur = document.querySelector(".box.now, .word.now");
    var wordMark = session.wi;
    if (session.kind === "exact") {
      var stNow = currentStep();
      wordMark = stNow && stNow.ti >= 0 ? stNow.ti : session.i;
    }
    if (!cur || wordMark === session._scrolled) return;
    session._scrolled = wordMark;
    if (stage && stage.contains(cur)) {
      var stageRect = stage.getBoundingClientRect();
      var curRect = cur.getBoundingClientRect();
      if (curRect.top < stageRect.top) stage.scrollTop += curRect.top - stageRect.top;
      else if (curRect.bottom > stageRect.top + stage.clientHeight) stage.scrollTop += curRect.bottom - stageRect.top - stage.clientHeight;
    }
  }
  function paintTyping() {
    if (typingFrame) { cancelAnimationFrame(typingFrame); typingFrame = 0; }
    if (!canTypePatch()) { paint(); return; }
    var next = guideStep();
    // The Alt number pad only exists in a full paint.
    if ((next && next.type === "alt") || document.querySelector("#run .numpad")) { paint(); return; }
    var patched = session.kind === "exact" ? patchExact() : patchLock();
    if (!patched) { paint(); return; }
    var stamp = guideStamp(next);
    if (session._guide !== stamp) {
      session._guide = stamp;
      syncGuide(next);
      replaceRunChunk("#run .tc-hint-card", hintKeyPromptHTML(next), "afterend");
    }
    if (session.lesson && ["introduction", "combination", "recovery", "review"].indexOf(session.lesson.stage) >= 0) {
      syncTeachingSequence(next);
    }
    syncProgress();
    revealCurrent();
    placeCaret();
  }
  /* Typing feedback is synchronous for instantaneous screen updates. */
  var typingFrame = 0;
  function paintTypingSoon() {
    paintTyping();
  }
  function paintClock() {
    if (!session || session.phase !== "run" || session.paused) return;
    var bs = document.querySelectorAll("#run .meters b");
    if (bs.length < 3) return;
    var timeText = session.limit ? clock(session.t0 ? remain() : session.limit) : clock(elapsed());
    var wpm = fmt(KD.keyWpm(session.kind === "exact" ? session.correct : typedKeys(), elapsed()));
    var accText = Math.round(accuracy()) + "%";
    if (bs[0].textContent !== timeText) bs[0].textContent = timeText;
    if (bs[1].textContent !== wpm) bs[1].textContent = wpm;
    if (bs[2].textContent !== accText) bs[2].textContent = accText;
    if (bs[3] && session.kind === "lock") {
      var okw = 0;
      session.marks.forEach(function (m) { if (m === "ok") okw++; });
      var fourth = session.exam ? fmt(session.lang === "en" ? KD.englishMarks(okw) : KD.hindiMarks(okw)) : String(okw);
      if (bs[3].textContent !== fourth) bs[3].textContent = fourth;
    }
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
    return '<div class="lesson-ready"><p>' + esc(L.teach || 'Keep your fingers on the home row. Follow the highlighted key.') + '</p>' + (L.source === 'practice-fallback' ? '<p>AI is unavailable. This is a sentence from the practice pool.</p>' : '') + '<p>Keep your computer’s keyboard input on English (US). The practice text uses DevLys 010.</p>' +
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
    if (session && (session.exam || (session.practice40 && session.practice40.full))) return "";
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
    var typedText = at > 0 ? String(target).slice(0, at) : "";
    return '<span class="' + cls + '"' + a11y + '>' +
      pill +
      '<span class="ink">' + esc(target) + "</span>" +
      '<span class="over" aria-hidden="true">' + esc(typedText) + "</span>" +
      '<span class="caret" data-at="' + at + '"></span></span>';
  }
  var caretWidths = {}, caretWidthCount = 0;
  var caretProbe = null;
  function getCaretProbe() {
    if (!caretProbe) {
      caretProbe = document.createElement("span");
      caretProbe.setAttribute("aria-hidden", "true");
      caretProbe.style.cssText = "position:fixed;visibility:hidden;white-space:nowrap;left:-9999px;top:-9999px;pointer-events:none;";
      (document.body || document.documentElement).appendChild(caretProbe);
    }
    return caretProbe;
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
    var canCache = !document.body.classList.contains("devlys-loading") && (!document.fonts || document.fonts.status === "loaded");
    var cacheKey = drillSize() + "|" + (box.classList.contains("devlys") ? "d" : "") + "|" + (box.parentNode ? box.parentNode.className : "") + "|";
    function widthOf(s) {
      s = s || "";
      var key = cacheKey + s;
      if (canCache && Object.prototype.hasOwnProperty.call(caretWidths, key)) return caretWidths[key];
      var probe = getCaretProbe();
      probe.className = (box.classList.contains("devlys") ? "devlys " : "") + (box.parentNode ? box.parentNode.className : "");
      probe.style.fontSize = drillSize() + "px";
      probe.textContent = s;
      var w = probe.offsetWidth || probe.getBoundingClientRect().width;
      if (canCache) {
        if (++caretWidthCount > 4000) { caretWidths = {}; caretWidthCount = 0; }
        caretWidths[key] = w;
      }
      return w;
    }
    function isDevlysMark(ch) {
      return "fkhsSa¡qw`zZW+%~".indexOf(ch) >= 0;
    }
    function isMark(i) {
      if (i < 0 || i >= text.length) return false;
      var ch = text.charAt(i);
      var cp = text.charCodeAt(i);
      if (box.classList.contains("devlys") && isDevlysMark(ch)) return true;
      return (cp >= 0x0900 && cp <= 0x0903) || cp === 0x093c ||
        (cp >= 0x093e && cp <= 0x094d) || (cp >= 0x0951 && cp <= 0x0957) ||
        cp === 0x0962 || cp === 0x0963;
    }
    var origin = ink.offsetLeft;
    var inkWidth = ink.offsetWidth;
    var fullW = widthOf(text);
    var scale = fullW > 0.5 ? inkWidth / fullW : 1;
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
      var prebase = cp === 0x093f || cp === 0x094e || (box.classList.contains("devlys") && text.charAt(at) === "f");
      if (prebase || (grow < 1.5 && isMark(at))) {
        var syl = at;
        while (syl > 0 && isMark(syl - 1)) syl--;
        var before = widthOf(text.slice(0, syl));
        green = prevW;
        left = before;
        width = prebase ? Math.max(grow, 6) : Math.max(prevW - before, 8);
      } else {
        green = prevW;
        left = prevW;
        width = Math.max(grow, 4);
      }
    }
    var typedText = at > 0 ? text.slice(0, at) : "";
    if (over) {
      if (over.textContent !== typedText) over.textContent = typedText;
      if (at < text.length) {
        var curOverLeft = origin + "px";
        var curOverWidth = Math.max(0, green * scale) + "px";
        if (over.style.left !== curOverLeft) over.style.left = curOverLeft;
        if (over.style.width !== curOverWidth) over.style.width = curOverWidth;
      }
    }
    var curCaretLeft = Math.max(0, origin + left * scale) + "px";
    var curCaretWidth = Math.max(4, width * scale) + "px";
    if (caret.style.left !== curCaretLeft) caret.style.left = curCaretLeft;
    if (caret.style.width !== curCaretWidth) caret.style.width = curCaretWidth;
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
      html += boxHTML(state, tok.h || "·", formed, flash || !!(cur && session.badTokens && session.badTokens[index]), wait, tok.k, krutiSoFar(index)).replace("<span ", '<span data-i="' + index + '" ');
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
    return '<div class="mock">' +
      '<div class="mock-pane mock-master"><div class="mock-k"><span>Master Passage (मूल पाठ)</span><span class="mock-count">' + (session.words ? session.words.length + ' words' : '') + '</span></div><div class="passage' + cls + '">' + master + '</div></div>' +
      '<div class="mock-pane mock-type"><div class="mock-k"><span>Typing Area (टाइपिंग क्षेत्र)</span><span class="mock-count">Word ' + Math.min(session.wi + 1, session.words.length) + ' of ' + session.words.length + '</span></div><div class="typed-line' + cls + '">' + typedLineInner() + '</div></div>' +
      (session.showFix && session.lastFix ? '<div class="fix">' + esc(session.lastFix) + "</div>" : "") +
      "</div>";
  }
  function typedLineInner() {
    var typed = "";
    var snaps = session.typedWords || [];
    for (var i = 0; i < session.wi; i++) {
      var snap = snaps[i];
      var text = snap ? snap.text : session.words[i].h;
      typed += '<span class="word ' + (session.marks[i] === "ok" ? "ok" : "bad") + (session.lang === 'en' ? '' : ' devlys') + '">' + esc(session.lang === 'en' ? text : (snap && snap.raw != null ? snap.raw : session.words[i].k)) + "</span> ";
    }
    typed += '<span class="word now' + (session.lang === 'en' ? '' : ' devlys') + '" data-wi="' + session.wi + '">' + esc(session.typed || "") + "</span>";
    return typed;
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
    if (session.rhythmBurst) session.t0 = performance.now();
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
      else paintClock();
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
    if (session.tapN % 12 === 0) saveSoon();
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
      if (session.flash && performance.now() - session.flash >= 200) paintTyping();
    }, 230);
  }
  function miss(code, info, holdPaint) {
    session.errors++;
    var expected = currentStep();
    recordSkill(expected, false);
    forgetTiming();
    pushTape(false, info || null);
    var missedId = expected && expected.code === code ? KD.actionId(expected) : code;
    if (missedId) store.misses[missedId] = (store.misses[missedId] || 0) + 1;
    armFlash();
    saveSoon();
    if (!holdPaint) {
      paintTyping();
      beepLater(false);
    }
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
    if (session.i >= session.steps.length) {
      beepLater(true);
      finish();
      return;
    }
    paintTyping();
    beepLater(true);
    if (session.live) saveSoon();
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
      paintTyping();
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
      if (e.code === session.anchor) e.preventDefault();
      /* Shift is pressed for every half letter and auto-repeats while held.
         A full lesson rebuild on each of those events blocked the next key.
         Repaint only when a technique warning really clears. */
      if (session.techniqueWarn) { session.techniqueWarn = ''; paint(); }
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
      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key && (e.key.length === 1 || (e.code && (e.code.indexOf("Key") === 0 || e.code.indexOf("Digit") === 0 || e.code === "Semicolon" || e.code === "Quote" || e.code === "Comma" || e.code === "Period" || e.code === "Slash" || e.code === "BracketLeft" || e.code === "BracketRight" || e.code === "Backslash" || e.code === "Minus" || e.code === "Equal")))) {
        e.preventDefault();
        beginRun();
        if (session.kind === "exact") exactKey(e);
        else lockKey(e);
        return;
      }
      var step0 = currentStep() || nextLockStep();
      if (step0 && e.code === step0.code && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        beginRun();
        if (session.kind === "exact") exactKey(e);
        else lockKey(e);
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
        forgetTiming(); paintTyping();
      }
      return;
    }
    if (e.code === step.code && !!e.shiftKey === !!step.shift) advance();
    else {
      if (!session.t0) session.t0 = performance.now();
      var moveOn = store.settings.blockErrors !== true && !session.lesson.scoreFree;
      // When the cursor moves on, paint once after the move instead of twice.
      miss(step.code, {
      si: session.i,
      ti: step.ti != null ? step.ti : -1,
      wi: -1,
      word: wordAtStep(step),
      want: faceOfStep(step),
      got: faceOfEvent(e)
      }, moveOn);
      if (moveOn) {
        if (step.ti != null) refreshTokenErrors(step.ti);
        session.i++;
        beepLater(false);
        if (session.i >= session.steps.length) finish();
        else { paintTyping(); if (session.live) saveSoon(); }
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
      paintTyping();
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
      beepLater(true);
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
        beepLater(false);
        armFlash();
      } else beepLater(true);
      forgetTiming();
    }
    session.typed += ch;
    if (session.typed.length > 48) session.typed = session.typed.slice(0, 48);
    // Only the current word changes; do not rebuild the passage and keyboard.
    paintTyping();
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
  // Remember when the last key arrived, so background saves wait for a pause.
  document.addEventListener("keydown", function () { lastKeyAt = performance.now(); }, true);
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
      if (typeof beepLater === "function") beepLater(false);
      else if (typeof beep === "function") beep(false);
    } else {
      session.lastFix = "";
      if (typeof beepLater === "function") beepLater(true);
      else if (typeof beep === "function") beep(true);
      rememberTap({ code: "Space", shift: false, space: true });
    }
    if (!ok) forgetTiming();
    session.typed = "";
    session.wi++;
    if (session.wi >= session.words.length) finish();
    else {
      if (typeof paintTyping === "function") paintTyping();
      else if (typeof paintTypingSoon === "function") paintTypingSoon();
      if (session.live) saveSoon();
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
      store.practice40 = KD.mergePractice40(store.practice40, { attempts: [{ at: at, ms: ms, wpm: session.result.wpm, acc: session.result.acc, realAcc: session.result.realAcc, full: session.practice40.full, guided: session.practice40.guided, sentenceIds: session.practice40.sentenceIds, signature: KD.livePassageSignature(session.lesson) }] });
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
      ms: ms,
      acc: Math.round((session.result && session.result.acc) || 0),
      realAcc: session.result && session.result.realAcc != null ? session.result.realAcc : null,
      wpm: Math.round(((session.result && session.result.wpm) || 0) * 10) / 10,
      stars: (session.index >= 0 || session.live) && session.result ? (session.result.stars || 0) : 0,
      marks: session.result && session.result.marks != null ? Math.round(session.result.marks * 10) / 10 : null
    });
    if (store.log.length > 24) store.log = store.log.slice(store.log.length - 24);
    if (session.live && session.lesson && store.live && store.live.lesson) {
      store.live.resume = null;
      if (session.lesson.pattern === 'history') KD.recordSentenceUsage(store.live, session.lesson, at);
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
        realAcc: session.result.realAcc == null ? null : session.result.realAcc,
        ms: ms,
        wpm: Math.round((session.result.wpm || 0) * 10) / 10,
        min: session.lesson.min || 0,
        mid: session.lesson.mid || 0,
        high: session.lesson.high || 0,
        words: (session.tokens || []).map(function (t) { return t.h; }).slice(0, 24),
        slips: slips.slice(0, 12),
        sentenceIds: session.lesson.sentenceIds || [],
        passageSig: KD.livePassageSignature(session.lesson),
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
      store.live.updatedAt = Math.max(at + 1, (store.live.updatedAt || 0) + 1);
      askCoach();
    }
    session.phase = "done";
    save(true);
    screen = "result";
    session.phase = "done";
    if (session.result && session.result.stars) {
      soundFanfare(session.result.stars);
    } else {
      soundFanfare(1);
    }
    draw();
    if (session && session.live && session.phase === 'done') requestAISentence(store.live.lesson);
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
    if (session.live && (!store.live || !store.live.lesson)) ensureLive();
    var r = session.result;
    if (session.placement) return placementResult(r);
    if (session.rhythmBurst) return '<main id="main-content" class="wrap narrow result-page"><section class="card result-card"><h1>Rhythm practice complete</h1><p>' + Math.round(r.realAcc == null ? r.acc : r.realAcc) + '% first-try accuracy. This short burst is practice; it does not count as passage speed.</p><p>Rest for at least 30 seconds. Then use the same relaxed rhythm on fresh text.</p><div class="row-btns"><button class="btn primary" data-act="start-current">Fresh sentence practice</button><button class="btn" data-go="home">Daily plan</button></div></section></main>';
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
        (session.live ? '<p role="status">' + (store.live.lesson.aiGenerated ? 'Your next AI-generated sentences are ready.' : store.live.lesson.aiState === 'unavailable' ? 'AI is unavailable. ' + (store.live.lesson.aiDetail ? esc(store.live.lesson.aiDetail) + ' ' : '') + 'Continue opens practice-pool text; you can retry AI generation.' : 'Preparing new AI sentences from your weak keys…') + '</p>' + (store.live.lesson.aiState === 'unavailable' ? '<button class="btn" data-act="retry-ai-sentence">Retry AI generation</button>' : '') : '') +
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
      "<h2>" + fmt(r.marks) + " / 25 Marks</h2>" +
      '<div class="exam-status-tag ' + (qualify ? 'pass' : 'fail') + '">' + (qualify ? '✓ QUALIFIED (Cleared 9.0 Cutoff)' : '✗ UNDER QUALIFYING CUTOFF (Minimum 9.0 Marks Required)') + '</div>' +
      "<p>" + (full ? "Full marks. Repeat this accuracy inside the time." : qualify ? "The qualifying line is crossed. 25/25 needs every word correct." : "Under 9. Failing this paper can cost the marks of the other three papers. Confirm that rule on the current RSSB notice.") + "</p>" +
      '<div class="stats">' +
      '<div class="stat"><b>' + r.correct + "</b><span>Correct words</span></div>" +
      '<div class="stat"><b>' + r.wrong + "</b><span>Wrong locks</span></div>" +
      '<div class="stat"><b>' + (r.correct + r.wrong > 0 ? Math.round((r.correct / (r.correct + r.wrong)) * 100) : 0) + "%</b><span>Word Accuracy</span></div>" +
      '<div class="stat"><b>' + fmt(r.wpm) + "</b><span>Key WPM</span></div></div>" +
      '<p class="small muted">' + need + " A wrong word is not subtracted. It is simply not counted. After Space you cannot fix it.</p>" +
      (list ? '<h3>Words that fell</h3><ul class="wrong-list">' + list + "</ul>" : "") +
      '<div class="row-btns"><button class="btn primary" data-act="retry">Again</button><button class="btn" data-go="home">Practice Dashboard</button></div></div></div>';
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
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) { var err = new Error("Cloud unavailable"); err.code = data && data.code || ""; throw err; }
          return data;
        });
      }).then(function (cloudStore) {
        if (cloudStore && cloudStore.stars) adoptFile(JSON.stringify(cloudStore));
        syncStatus("Saved to cloud");
        draw();
      }).catch(function (error) {
        folderSave = true;
        if (!noteCloudPause(error)) syncStatus("Saved on this device · cloud unavailable");
        draw();
      });
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
    if (name === 'set-goal-45') {
      store.training = store.training || {};
      store.training.goalWpm = 45;
      save(true); draw(); return;
    }
    if (name === 'set-goal-50') {
      store.training = store.training || {};
      store.training.goalWpm = 50;
      save(true); draw(); return;
    }
    if (name === 'new-ai-sentence') { startLive('new'); return; }
    if (name === 'retry-ai-sentence') { delete sentenceJobs[store.live.lesson.id]; requestAISentence(store.live.lesson); draw(); return; }
    if (name === 'jump-current') {
      var tile = document.querySelector('[data-lesson="' + nextLessonIndex() + '"]');
      if (tile) { tile.scrollIntoView({ block: 'center', behavior: 'smooth' }); tile.focus({ preventScroll: true }); }
      return;
    }
    if (name === 'previous-lesson') { moveCourseLesson(-1); return; }
    if (name === 'next-lesson') { moveCourseLesson(1); return; }
    if (name === 'practice40-check') { startPractice40(); return; }
    if (name === 'practice40-weak') { startWeak(); return; }
    if (name === 'rhythm-burst') { startRhythmBurst(); return; }
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
    if (name === "exam-hi") startExam("hi", 10, 400);
    if (name === "exam-hi-5min") startExam("hi", 5, 200);
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
      if (session && session.live) { startLive('repeat'); return; }
      if (session && session.rhythmBurst) { startRhythmBurst(); return; }
      if (session && session.practice40Weak) { act("practice40-weak"); return; }
      if (session && session.recoveryFor != null) { var index = session.recoveryFor; startLesson(index, KD.buildRecovery(KD.LESSONS[index], store, [])); }
      else if (session && session.practice40) startPractice40();
      else if (session && session.exam) startExam("hi", session.limit >= 600000 ? 10 : 5);
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

  function startExam(lang, durationMinutes, wordTarget) {
    var minutes = durationMinutes === 5 ? 5 : 10;
    var words = wordTarget || (minutes === 5 ? 200 : 400);
    startLock({
      id: minutes === 5 ? "exam-hi-5min" : "exam-hi",
      title: "RSSB Hindi speed · " + minutes + " min",
      teach: "An unseen Hindi passage of about " + words + " words. Each correct word is 0.0625 marks. Space locks the word and you cannot go back. The key light is off, as in the exam. Keep the keyboard on English (US). The 10-minute paper fails under 9 out of 25. Confirm 9/25 on the current RSSB notice.",
      words: KD.buildHindiPassage(words),
      limit: minutes * 60000,
      hints: "none",
      showFix: false,
      lang: "hi",
      exam: true,
      finger: "DevLys / Kruti"
    });
  }

  function startWeak() {
    var recovery = KD.adaptiveRecovery(store);
    if (!recovery || !Array.isArray(recovery.tokens) || !recovery.tokens.length) { startLesson(nextLessonIndex()); return; }
    startLesson(0, recovery);
    session.index = -1; session.recoveryFor = null; session.practice40Weak = true;
    session.lesson.id = 'adaptive-drill'; session.lesson.title = recovery.title;
    session.lesson.teach = recovery.teach; session.lesson.allowed = recovery.allowed;
    session.lesson.hand = ''; session.hand = ''; session.lesson.anchor = null; session.anchor = null;
    session.lesson.oppositeShift = false;
    store.adaptive = store.adaptive || { drills: [] };
    store.adaptive.drills = (store.adaptive.drills || []).concat({ at: Date.now(), signature: recovery.signature, words: recovery.words }).slice(-8);
    save(true); paintShell();
  }

  function startRhythmBurst() {
    var program = KD.trainingProgram(store);
    if (!program.burstEligible) { startWeak(); return; }
    startWeak();
    if (!session || !session.practice40Weak) return;
    var base = session.tokens.slice(), tokens = [];
    while (KD.buildSteps(tokens).length < 550) tokens = tokens.concat(base.map(function (t) { return Object.assign({}, t); }));
    session.tokens = tokens; session.lesson.tokens = tokens; session.steps = KD.buildSteps(tokens);
    session.words = tokens.map(function (t) { return { h: t.h, k: t.k, lang: 'hi' }; });
    session.practice40Weak = false; session.rhythmBurst = true; session.limit = 25000;
    session.lesson.id = 'adaptive-burst'; session.lesson.title = '25-second rhythm practice';
    session.lesson.teach = 'Practise smooth presses near ' + program.nextTargetWpm + ' WPM. Keep 98% first-try accuracy. Use the same fingers and small movements. This short burst does not measure passage speed.';
    paintShell();
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
    if (!authToken || !folderSave || screen === 'run') return Promise.resolve(false);
    if (cloudPausedUntil && Date.now() < cloudPausedUntil) return Promise.resolve(false);
    if (cloudReadJob) return cloudReadJob;
    var token = authToken;
    cloudReadJob = flushCloud().then(function () {
      if (cloudPausedUntil && Date.now() < cloudPausedUntil) return null;
      return fetch('/api/progress',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    }).then(function(r){
      if (!r) return null;
      return r.json().catch(function(){return {};}).then(function(data){
        if (!r.ok) { var err = new Error('Cloud unavailable'); err.code = data && data.code || ''; throw err; }
        return data;
      });
    }).then(function(data){
      if (!data || authToken !== token || !data.stars) return false;
      store = KD.mergeProgress(store, data); localStorage.setItem(STORE, JSON.stringify(store));
      ensureTraining();
      if (!pendingCloud) syncStatus('Saved to cloud');
      if (screen !== 'run') draw();
      return true;
    }).catch(function(error){ if (!noteCloudPause(error)) syncStatus('Saved on this device · cloud unavailable'); return false; })
      .then(function (ok) { cloudReadJob = null; return ok; });
    return cloudReadJob;
  }
  window.addEventListener('focus', refreshCloud);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refreshCloud(); });
  setInterval(function () { if (document.visibilityState === 'visible' && screen !== 'run') refreshCloud(); }, 45000);
  window.addEventListener('online', function(){if (pendingCloud) flushCloud();else refreshCloud();});
  window.addEventListener('pagehide', function () {
    if (!authToken || !folderSave) return;
    captureResume();
    var body = JSON.stringify(store);
    localStorage.setItem(STORE, body);
    if (pendingCloud && body.length < 60000 && !(cloudPausedUntil && Date.now() < cloudPausedUntil)) fetch('/api/progress',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:body,keepalive:true}).catch(function(){});
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
          if (liveResume()) startLive();
          else draw();
        }
        return;
      }
      shown = true;
      booting = false;
      if (liveResume()) startLive();
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
      return r.text().then(function (text) {
        if (!r.ok) {
          var err = new Error("no file");
          try { var body = JSON.parse(text); if (body && body.code) err.code = body.code; } catch (e) {}
          throw err;
        }
        return text;
      });
    }).then(function (text) {
      clearTimeout(timer);
      adoptFile(text);
      syncStatus(authToken ? "Saved to cloud" : "Saved in this folder");
      show();
    }).catch(function (err) {
      clearTimeout(timer);
      if (authToken) {
        folderSave = true;
        if (!noteCloudPause(err)) { syncStatus('Saved on this device · cloud save pending'); save(true); }
      } else folderSave = false;
      show();
    });
  })();
  document.fonts.load('24px "RSSB DevLys 010"').then(function (fonts) {
    if (!fonts.length) throw new Error('DevLys font unavailable');
    document.body.classList.remove('devlys-loading');
    if (session && screen === 'run') paint();
  }).catch(function () { document.body.classList.add('devlys-error'); });
})(typeof globalThis !== "undefined" ? globalThis : this);

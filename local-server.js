/* Local server so progress is a file in this folder, not only this browser. */
var http = require("http");
var https = require("https");
var fs = require("fs");
var path = require("path");
var child = require("child_process");

var root = path.resolve(__dirname);
var port = parseInt(process.env.PORT || "8765", 10);
var progressPath = process.env.PROGRESS_FILE
  ? path.resolve(process.env.PROGRESS_FILE)
  : path.join(root, "progress", "sparsh-rssb-v1.json");
var types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2"
};

function send(res, code, body, type) {
  res.writeHead(code, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readKeyFile(name) {
  try {
    return fs.readFileSync(path.join(root, name), "utf8").trim();
  } catch (e) {
    return "";
  }
}

function geminiKey() {
  if (process.env.GEMINI_API_KEY) return String(process.env.GEMINI_API_KEY).trim();
  if (process.env.GOOGLE_API_KEY) return String(process.env.GOOGLE_API_KEY).trim();
  return readKeyFile("gemini.key");
}

function coachKey() {
  if (process.env.XAI_API_KEY) return String(process.env.XAI_API_KEY).trim();
  return readKeyFile("coach.key");
}

function planFromModel(text, bank, source) {
  var raw = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
  var start = raw.indexOf("{");
  var end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  var data;
  try { data = JSON.parse(raw.slice(start, end + 1)); } catch (e) { return null; }
  if (!data || typeof data.note !== "string" || !data.note.trim()) return null;
  var allow = {};
  (bank || []).forEach(function (w) { allow[w] = 1; });
  var repeat = [];
  if (Array.isArray(data.repeat)) {
    data.repeat.forEach(function (w) {
      if (typeof w === "string" && allow[w] && repeat.length < 8) repeat.push(w);
    });
  }
  return { note: data.note.trim().slice(0, 280), repeat: repeat, source: source || "grok" };
}

var coachPrompt = "You coach one Hindi Kruti Dev typist for the RSSB exam. The user message is their finger profile: slow keys, slow pairs, misses, and words they got wrong. Reply with JSON only, no markdown: {\"note\":\"one English sentence naming the slow finger or the ending to trust\",\"repeat\":[\"words copied from bank only\"]}. The note is English. Words inside repeat stay Hindi and must be copied from bank. Prefer है, हैं, था, थी, थे, and the long-ā ending when those show up as slow or wrong. Do not invent letters. Do not mention Alt.";

function askGemini(profile, cb) {
  var key = geminiKey();
  if (!key) return cb(null, { source: "fingers" });
  var payload = JSON.stringify({
    systemInstruction: { parts: [{ text: coachPrompt }] },
    contents: [{ parts: [{ text: JSON.stringify(profile || {}) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400, responseMimeType: "application/json" }
  });
  var settled = false;
  function finish(plan) {
    if (settled) return;
    settled = true;
    cb(null, plan || { source: "fingers" });
  }
  function once(attempt) {
    var req = https.request({
      hostname: "generativelanguage.googleapis.com",
      path: "/v1beta/models/gemini-1.5-flash:generateContent",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
        "Content-Length": Buffer.byteLength(payload)
      }
    }, function (up) {
      var chunks = [];
      up.on("data", function (c) { chunks.push(c); });
      up.on("end", function () {
        var body = Buffer.concat(chunks).toString("utf8");
        if ((up.statusCode === 429 || up.statusCode === 503) && attempt < 1) {
          setTimeout(function () { once(attempt + 1); }, 2000);
          return;
        }
        if (up.statusCode < 200 || up.statusCode >= 300) return finish({ source: "fingers" });
        var parsed;
        try { parsed = JSON.parse(body); } catch (e) { return finish({ source: "fingers" }); }
        var text = "";
        var parts = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts;
        (parts || []).forEach(function (part) { if (part && part.text) text += part.text; });
        finish(planFromModel(text, profile && profile.bank, "gemini") || { source: "fingers" });
      });
    });
    var aborted = false;
    req.setTimeout(25000, function () {
      aborted = true;
      req.destroy();
      if (attempt < 1) setTimeout(function () { once(attempt + 1); }, 500);
      else finish({ source: "fingers" });
    });
    req.on("error", function () {
      if (aborted) return;
      if (attempt < 1 && !settled) setTimeout(function () { once(attempt + 1); }, 500);
      else finish({ source: "fingers" });
    });
    req.write(payload);
    req.end();
  }
  once(0);
}

function askGrok(profile, cb) {
  var key = coachKey();
  if (!key) return cb(null, { source: "fingers" });
  var payload = JSON.stringify({
    model: "grok-4.7",
    store: false,
    input: [
      {
        role: "system",
        content: coachPrompt
      },
      { role: "user", content: JSON.stringify(profile || {}) }
    ]
  });
  var settled = false;
  function finish(plan) {
    if (settled) return;
    settled = true;
    cb(null, plan || { source: "fingers" });
  }
  var req = https.request({
    hostname: "api.x.ai",
    path: "/v1/responses",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
      "Content-Length": Buffer.byteLength(payload)
    }
  }, function (up) {
    var chunks = [];
    up.on("data", function (c) { chunks.push(c); });
    up.on("end", function () {
      var body = Buffer.concat(chunks).toString("utf8");
      if (up.statusCode < 200 || up.statusCode >= 300) return finish({ source: "fingers" });
      var parsed;
      try { parsed = JSON.parse(body); } catch (e) { return finish({ source: "fingers" }); }
      var text = parsed.output_text || "";
      if (!text && Array.isArray(parsed.output)) {
        parsed.output.forEach(function (item) {
          (item.content || []).forEach(function (part) {
            if (part && part.type === "output_text" && part.text) text += part.text;
          });
        });
      }
      finish(planFromModel(text, profile && profile.bank) || { source: "fingers" });
    });
  });
  req.setTimeout(25000, function () { req.destroy(); finish({ source: "fingers" }); });
  req.on("error", function () { finish({ source: "fingers" }); });
  req.write(payload);
  req.end();
}

function replaceProgress(text) {
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  var tmp = progressPath + ".tmp";
  fs.writeFileSync(tmp, text);
  try {
    fs.renameSync(tmp, progressPath);
  } catch (err) {
    if (err.code !== "EPERM" && err.code !== "EBUSY" && err.code !== "EEXIST") throw err;
    fs.copyFileSync(tmp, progressPath);
    try { fs.unlinkSync(tmp); } catch (ignore) {}
  }
}

function openBrowser() {
  var url = "http://127.0.0.1:" + port + "/";
  child.spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
}

var server = http.createServer(function (req, res) {
  var url = (req.url || "/").split("?")[0];
  if (url.indexOf("/api/auth") === 0) {
    var authHandler = require("./api/auth");
    return authHandler(req, res);
  }
  if (url === "/api/progress") {
    var progressHandler = require("./api/progress");
    return progressHandler(req, res);
  }
  if (url === "/api/coach") {
    var coachHandler = require("./api/coach");
    return coachHandler(req, res);
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method");
  var rel = decodeURIComponent(url);
  if (rel === "/") rel = "/index.html";
  var file = path.resolve(root, "." + rel);
  var fromRoot = path.relative(root, file);
  if (fromRoot.indexOf("..") === 0 || path.isAbsolute(fromRoot)) return send(res, 403, "no");
  fs.readFile(file, function (err, data) {
    if (err) return send(res, 404, "not found");
    var ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    if (req.method === "HEAD") res.end();
    else res.end(data);
  });
});

server.on("error", function (err) {
  if (err.code === "EADDRINUSE") {
    console.log("Sparsh is already open at http://127.0.0.1:" + port + "/");
    if (process.argv.indexOf("--open") >= 0) openBrowser();
    process.exit(0);
  }
  console.error(err.message);
  process.exit(1);
});

server.listen(port, "127.0.0.1", function () {
  console.log("Sparsh: http://127.0.0.1:" + port + "/");
  console.log("Progress file: " + progressPath);
  console.log("Keep this window open. Closing it stops the save.");
  if (process.argv.indexOf("--open") >= 0) openBrowser();
});

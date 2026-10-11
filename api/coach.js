// Serverless handler for AI Coach: /api/coach
const https = require("https");
const fs = require("fs");
const path = require("path");

const coachPrompt = "You coach one Hindi Kruti Dev typist for the RSSB exam. The user message is their finger profile: slow keys, slow pairs, misses, and words they got wrong. Reply with JSON only, no markdown: {\"note\":\"one English sentence naming the slow finger or the ending to trust\",\"repeat\":[\"words copied from bank only\"]}. The note is English. Words inside repeat stay Hindi and must be copied from bank. Prefer है, हैं, था, थी, थे, and the long-ā ending when those show up as slow or wrong. Do not invent letters. Do not mention Alt.";

function getGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY.trim();
  try {
    const keyFile = path.join(__dirname, "..", "gemini.key");
    if (fs.existsSync(keyFile)) return fs.readFileSync(keyFile, "utf8").trim();
  } catch (e) {}
  return "";
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text || "{}"));
      } catch (e) {
        resolve({});
      }
    });
  });
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
  return { note: data.note.trim().slice(0, 280), repeat: repeat, source: source || "gemini" };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  const profile = await parseBody(req);
  const key = getGeminiKey();

  if (!key) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 200;
    return res.end(JSON.stringify({ source: "fingers" }));
  }

  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: coachPrompt }] },
    contents: [{ parts: [{ text: JSON.stringify(profile || {}) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400, responseMimeType: "application/json" }
  });

  const upReq = https.request({
    hostname: "generativelanguage.googleapis.com",
    path: "/v1beta/models/gemini-1.5-flash:generateContent",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
      "Content-Length": Buffer.byteLength(payload)
    }
  }, function (upRes) {
    let chunks = [];
    upRes.on("data", (c) => chunks.push(c));
    upRes.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        const parsed = JSON.parse(body);
        const parts = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts;
        let text = "";
        (parts || []).forEach((p) => { if (p && p.text) text += p.text; });
        const plan = planFromModel(text, profile && profile.bank, "gemini");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.statusCode = 200;
        return res.end(JSON.stringify(plan || { source: "fingers" }));
      } catch (e) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.statusCode = 200;
        return res.end(JSON.stringify({ source: "fingers" }));
      }
    });
  });

  upReq.setTimeout(12000, () => {
    upReq.destroy();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 200;
    return res.end(JSON.stringify({ source: "fingers" }));
  });

  upReq.on("error", () => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 200;
    return res.end(JSON.stringify({ source: "fingers" }));
  });

  upReq.write(payload);
  upReq.end();
};

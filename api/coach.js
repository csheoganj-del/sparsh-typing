// Serverless handler for AI Coach: /api/coach
const https = require("https");
const fs = require("fs");
const path = require("path");

const coachPrompt = "You are an expert Hindi touch typing tutor for the RSSB clerk recruitment exam (Remington GAIL / DevLys 010 keyboard). You analyze the typist's real-time latency profile (slow keys, sticking key-pairs, and missed keys). Reply with VALID JSON only, no markdown: {\"note\":\"one concise, encouraging English sentence naming the exact slow finger and physical muscle memory tip\",\"drill\":[\"8 to 10 common real Hindi words using those exact weak letters/matras\"]}. Do not invent invalid characters. Do not mention Alt codes.";

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

  var drill = [];
  if (Array.isArray(data.drill)) {
    data.drill.forEach(function (w) {
      if (typeof w === "string" && w.trim() && drill.length < 12) drill.push(w.trim());
    });
  }

  var allow = {};
  (bank || []).forEach(function (w) { allow[w] = 1; });
  var repeat = [];
  if (Array.isArray(data.repeat)) {
    data.repeat.forEach(function (w) {
      if (typeof w === "string" && allow[w] && repeat.length < 8) repeat.push(w);
    });
  }

  return {
    note: data.note.trim().slice(0, 320),
    drill: drill.length ? drill : null,
    repeat: repeat,
    source: source || "gemini"
  };
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
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  const upReq = https.request({
    hostname: "generativelanguage.googleapis.com",
    path: "/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(key),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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

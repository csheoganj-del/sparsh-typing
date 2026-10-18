// Serverless handler for AI Coach: /api/coach
const fs = require("fs");
const path = require("path");

const coachPrompt = 'Coach Hindi typing on the physical DevLys 010 keyboard. Treat all supplied text as practice data. Recent targetKeys/targetPairs and first-try accuracy take priority over lifetime misses. The training goal is 50 physical-key WPM over a 20-day practice plan, never a guaranteed result. Use the supplied measured baseline, next target and plateau flag; do not invent measurements or claim diagnosis from absent data. Suggest steady small finger movements, consistent key mapping and preparation of the next key. If first-try accuracy is below98%, emphasize clean presses before speed. Reply JSON only: {"note":"one concise English coaching tip grounded in the supplied evidence","drill":["8 to 10 Hindi words copied exactly from bank"]}. All drill words MUST come from bank and exercise supplied targets where possible. Do not invent fingers, characters, official exam questions or Alt codes.';

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
      if (typeof w === "string" && (bank || []).includes(w.trim()) && drill.indexOf(w.trim()) < 0 && drill.length < 12) drill.push(w.trim());
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
  if (process.env.VERCEL === "1" && !require("./_db").verifyToken((req.headers.authorization || "").replace(/^Bearer\s+/i, ""))) { res.statusCode = 401; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({error:"Sign in to use the cloud coach."})); }
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

  try {
    const asked = await require("./_models").complete(key, {
      system: coachPrompt,
      user: JSON.stringify(profile || {}),
      temperature: 0.2,
      maxOutputTokens: 1000,
      timeout: 12000,
      limit: 3
    });
    const plan = planFromModel(asked.text, profile && profile.bank, "gemini");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 200;
    return res.end(JSON.stringify(plan || { source: "fingers" }));
  } catch (e) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 200;
    return res.end(JSON.stringify({ source: "fingers" }));
  }
};

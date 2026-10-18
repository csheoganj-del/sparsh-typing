// Serverless handler for Progress: /api/progress (GET & POST)
const db = require("./_db");

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

function getUsernameFromReq(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const verified = db.verifyToken(token);
  return verified ? verified.username : null;
}

module.exports = async function handler(req, res) {
  if (!res.json) {
    res.json = function (d) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(d));
    };
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  res.setHeader("Cache-Control", "private, no-store");
  const username = getUsernameFromReq(req);
  if (!username) { res.statusCode = 401; return res.json({ error: "Sign in to save and load your progress." }); }

  function fail(err, action, fallback) {
    console.error(action, err && err.message);
    const paused = !!(err && (err.code === "STORAGE_PAUSED" || err.name === "BlobStoreSuspendedError" || /suspended/i.test(err.message || "")));
    res.statusCode = paused ? 503 : 500;
    return res.json(paused
      ? { error: "Cloud storage is paused", code: "storage_paused" }
      : { error: fallback, details: String((err && err.message) || "").slice(0, 180) });
  }

  if (req.method === "GET") {
    try {
      const progress = await db.getProgress(username);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 200;
      return res.end(JSON.stringify(progress));
    } catch (err) {
      return fail(err, "progress read failed", "Failed to read progress");
    }
  }

  if (req.method === "POST") {
    try {
      const data = await parseBody(req);
      if (!data || typeof data !== "object" || Array.isArray(data) || !data.stars || Array.isArray(data.stars) || JSON.stringify(data).length > 4000000) {
        res.statusCode = 400;
        return res.json({ error: "Invalid progress payload" });
      }
      const progress = await db.saveProgress(username, data);
      res.statusCode = 200;
      return res.json({ ok: true, cloud: db.isCloudConnected(), username: username, progress: progress });
    } catch (err) {
      return fail(err, "progress save failed", "Failed to save progress");
    }
  }

  res.statusCode = 405;
  return res.json({ error: "Method not allowed" });
};

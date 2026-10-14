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

  if (req.method === "GET") {
    try {
      const progress = await db.getProgress(username);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 200;
      return res.end(JSON.stringify(progress));
    } catch (err) {
      res.statusCode = 500;
      return res.json({ error: "Failed to read progress", details: err.message });
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
      res.statusCode = 500;
      return res.json({ error: "Failed to save progress", details: err.message });
    }
  }

  res.statusCode = 405;
  return res.json({ error: "Method not allowed" });
};

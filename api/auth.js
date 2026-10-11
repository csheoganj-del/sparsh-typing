// Serverless handler for Authentication: /api/auth (login, register, me)
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

  const fullUrl = req.url || "";
  const [pathname, search] = fullUrl.split("?");
  const searchParams = search ? new URLSearchParams(search) : null;
  const queryAction = (req.query && req.query.action) || (searchParams ? searchParams.get("action") : null);
  const isLogin = pathname.endsWith("/login") || pathname.endsWith("/login/") || queryAction === "login";
  const isRegister = pathname.endsWith("/register") || pathname.endsWith("/register/") || queryAction === "register";
  const isMe = pathname.endsWith("/me") || pathname.endsWith("/me/") || queryAction === "me";

  if (req.method === "POST" && isLogin) {
    const body = await parseBody(req);
    const { username, password } = body;
    if (!username || !password) {
      res.statusCode = 400;
      return res.json({ error: "Username and password required" });
    }
    try {
      const user = await db.loginUser(username, password);
      const token = db.createToken(user.username);
      res.statusCode = 200;
      return res.json({
        ok: true,
        token: token,
        username: user.username,
        cloud: db.isCloudConnected()
      });
    } catch (err) {
      res.statusCode = 401;
      return res.json({ error: err.message });
    }
  }

  if (req.method === "POST" && isRegister) {
    const body = await parseBody(req);
    const { username, password } = body;
    try {
      const user = await db.registerUser(username, password);
      const token = db.createToken(user.username);
      res.statusCode = 200;
      return res.json({
        ok: true,
        token: token,
        username: user.username,
        cloud: db.isCloudConnected()
      });
    } catch (err) {
      res.statusCode = 400;
      return res.json({ error: err.message });
    }
  }

  if (req.method === "GET" && isMe) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const verified = db.verifyToken(token);
    if (!verified) {
      res.statusCode = 200;
      return res.json({ authenticated: false, cloud: db.isCloudConnected() });
    }
    res.statusCode = 200;
    return res.json({
      authenticated: true,
      username: verified.username,
      cloud: db.isCloudConnected()
    });
  }

  res.statusCode = 404;
  return res.json({ error: "Auth route not found" });
};

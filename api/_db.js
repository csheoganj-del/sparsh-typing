// Cloud & Local Storage + Auth Adapter for Sparsh Typing Tutor
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || "sparsh-typing-rssb-secret-2026";
const ROOT = path.resolve(__dirname, "..");
const LOCAL_PROGRESS_FILE = path.join(ROOT, "progress", "sparsh-rssb-v1.json");
const LOCAL_USERS_FILE = path.join(ROOT, "progress", "users.json");

// Check if Upstash Redis / Vercel KV is configured
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: "no-store"
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.result == null) return null;
    return typeof data.result === "string" ? JSON.parse(data.result) : data.result;
  } catch (err) {
    console.error("KV get error for key:", key, err.message);
    return null;
  }
}

async function kvSet(key, value) {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(typeof value === "string" ? value : JSON.stringify(value))
    });
    return res.ok;
  } catch (err) {
    console.error("KV set error for key:", key, err.message);
    return false;
  }
}

// Local file helpers (safe on local machine, graceful on Vercel)
function readLocalJson(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content);
    }
  } catch (e) {}
  return fallback;
}

function writeLocalJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

// In-memory fallback if Vercel has no KV attached yet
const memoryStore = {};

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

function createToken(username) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const data = `${username}:${exp}`;
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest("hex");
  return Buffer.from(`${data}:${sig}`).toString("base64url");
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 3) return null;
    const [username, expStr, sig] = parts;
    const exp = parseInt(expStr, 10);
    if (Date.now() > exp) return null;
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${username}:${exp}`).digest("hex");
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { username, exp };
    }
  } catch (e) {}
  return null;
}

async function getUser(username) {
  const uname = String(username || "").trim().toLowerCase();
  if (!uname) return null;

  if (KV_URL && KV_TOKEN) {
    const user = await kvGet(`user:${uname}:auth`);
    if (user) return user;
  }

  const localUsers = readLocalJson(LOCAL_USERS_FILE, {});
  if (localUsers[uname]) return localUsers[uname];

  if (memoryStore[`user:${uname}:auth`]) {
    return memoryStore[`user:${uname}:auth`];
  }

  // Pre-seed kalpesh account if none exists
  if (uname === "kalpesh") {
    const salt = crypto.randomBytes(16).toString("hex");
    const defaultKalpesh = {
      username: "kalpesh",
      salt: salt,
      hash: hashPassword("kalpesh123", salt),
      role: "student",
      createdAt: Date.now()
    };
    if (KV_URL && KV_TOKEN) await kvSet(`user:kalpesh:auth`, defaultKalpesh);
    localUsers.kalpesh = defaultKalpesh;
    writeLocalJson(LOCAL_USERS_FILE, localUsers);
    memoryStore[`user:kalpesh:auth`] = defaultKalpesh;
    return defaultKalpesh;
  }

  return null;
}

async function registerUser(username, password) {
  const uname = String(username || "").trim().toLowerCase();
  if (!uname || uname.length < 3) throw new Error("Username must be at least 3 characters");
  if (!password || password.length < 4) throw new Error("Password must be at least 4 characters");

  const existing = await getUser(uname);
  if (existing) throw new Error("Username already taken. Please log in.");

  const salt = crypto.randomBytes(16).toString("hex");
  const userObj = {
    username: uname,
    salt: salt,
    hash: hashPassword(password, salt),
    role: "student",
    createdAt: Date.now()
  };

  if (KV_URL && KV_TOKEN) {
    await kvSet(`user:${uname}:auth`, userObj);
  }

  const localUsers = readLocalJson(LOCAL_USERS_FILE, {});
  localUsers[uname] = userObj;
  writeLocalJson(LOCAL_USERS_FILE, localUsers);
  memoryStore[`user:${uname}:auth`] = userObj;

  // Initialize progress by copying seed progress for kalpesh or starter progress
  const seed = readLocalJson(LOCAL_PROGRESS_FILE, {
    stars: {}, placed: {}, misses: {}, settings: { sound: true, hints: true, textSize: 25 },
    touch: { keys: {}, pairs: {} }, log: [], tries: {}
  });
  await saveProgress(uname, seed);

  return userObj;
}

async function loginUser(username, password) {
  const uname = String(username || "").trim().toLowerCase();
  const user = await getUser(uname);
  if (!user) throw new Error("User not found. Please register or check username.");

  const hashed = hashPassword(password, user.salt);
  if (hashed !== user.hash) {
    throw new Error("Invalid password.");
  }
  return user;
}

async function getProgress(username) {
  const uname = String(username || "kalpesh").trim().toLowerCase();

  // Try Cloud KV
  if (KV_URL && KV_TOKEN) {
    const cloud = await kvGet(`user:${uname}:progress`);
    if (cloud && cloud.stars) return cloud;
  }

  // Try in-memory
  if (memoryStore[`user:${uname}:progress`]) {
    return memoryStore[`user:${uname}:progress`];
  }

  // Try local user progress file
  const userFile = path.join(ROOT, "progress", `user-${uname}.json`);
  if (fs.existsSync(userFile)) {
    return readLocalJson(userFile, null);
  }

  // Fallback to primary local progress
  return readLocalJson(LOCAL_PROGRESS_FILE, {
    stars: {}, placed: {}, misses: {}, settings: { sound: true, hints: true, textSize: 25 },
    touch: { keys: {}, pairs: {} }, log: [], tries: {}
  });
}

async function saveProgress(username, progressData) {
  const uname = String(username || "kalpesh").trim().toLowerCase();

  // Save to Cloud KV
  if (KV_URL && KV_TOKEN) {
    await kvSet(`user:${uname}:progress`, progressData);
  }

  // Save to memory
  memoryStore[`user:${uname}:progress`] = progressData;

  // Save to local user file
  const userFile = path.join(ROOT, "progress", `user-${uname}.json`);
  writeLocalJson(userFile, progressData);

  // If this is kalpesh, also keep sparsh-rssb-v1.json synced
  if (uname === "kalpesh") {
    writeLocalJson(LOCAL_PROGRESS_FILE, progressData);
  }

  return true;
}

module.exports = {
  createToken,
  verifyToken,
  getUser,
  registerUser,
  loginUser,
  getProgress,
  saveProgress,
  isCloudConnected: () => !!(KV_URL && KV_TOKEN)
};

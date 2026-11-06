// Serverless / Local handler for Dynamic Internet Paragraphs: /api/dynamic-passage
const fs = require("fs");
const path = require("path");

// Load typing dependencies
for (const f of ["convert", "keys", "engine", "lessons", "words", "passages"]) {
  try { require("../js/" + f); } catch (e) {}
}

const TOPIC_SEEDS_HI = [
  { title: "चंद्रयान-3 और अंतरिक्ष सफलता", theme: "Space & Science" },
  { title: "सूर्य मिशन आदित्य एल1", theme: "Solar Astronomy" },
  { title: "डिजिटल इंडिया और यूपीआई क्रांति", theme: "Digital Payments" },
  { title: "राजस्थान का थार सौर ऊर्जा पार्क", theme: "Solar Energy" },
  { title: "मेहरानगढ़ और कुंभलगढ़ का वैभव", theme: "Rajasthan Forts" },
  { title: "वंदे भारत एक्सप्रेस और आधुनिक रेल", theme: "Modern Railways" },
  { title: "कृत्रिम बुद्धिमत्ता और भविष्य", theme: "AI & Technology" },
  { title: "पर्यावरण संरक्षण और वृक्षारोपण", theme: "Ecology & Climate" },
  { title: "योग, ध्यान और स्वस्थ जीवनशैली", theme: "Yoga & Wellness" },
  { title: "पारंपरिक जल संचयन और बावड़ियां", theme: "Water Conservation" },
  { title: "भारतीय खेल और युवा प्रतिभा", theme: "Sports & Fitness" },
  { title: "राजस्थान की लोक कला और संगीत", theme: "Folk Art & Culture" },
  { title: "प्राकृतिक खेती और जैविक उत्पाद", theme: "Organic Farming" },
  { title: "स्टार्टअप इंडिया और नवाचार", theme: "Startups & Economy" },
  { title: "रणथंभौर और वन्यजीव सुरक्षा", theme: "Wildlife Conservation" },
  { title: "भारतीय संविधान और लोकतंत्र", theme: "Constitution & Democracy" },
  { title: "साइबर सुरक्षा और इंटरनेट जागरूकता", theme: "Cyber Security" },
  { title: "इलेक्ट्रिक वाहन और हरित क्रांति", theme: "Electric Vehicles" },
  { title: "आयुर्वेद और प्राकृतिक चिकित्सा", theme: "Ayurveda & Health" },
  { title: "स्वच्छ भारत और नागरिक कर्तव्य", theme: "Clean India Mission" },
  { title: "खेजड़ी वृक्ष और अमृता देवी का त्याग", theme: "Environmental Sacrifice" },
  { title: "जयपुर परकोटा और विश्व धरोहर", theme: "World Heritage Sites" },
  { title: "पंचायती राज और ग्रामीण विकास", theme: "Rural Governance" },
  { title: "राष्ट्रीय शिक्षा नीति और कौशल विकास", theme: "Education & Skills" },
  { title: "मौसम पूर्वानुमान और उपग्रह तकनीक", theme: "Meteorology & ISRO" },
  { title: "हस्तशिल्प और कुटीर उद्योग", theme: "Handicrafts & Heritage" },
  { title: "भारतीय नौसेना और समुद्री सुरक्षा", theme: "Maritime Security" },
  { title: "हिमालय और नदियों का महत्व", theme: "Himalayas & Rivers" },
  { title: "सौर पंप और किसान ऊर्जा सुरक्षा", theme: "Kusum Solar Scheme" },
  { title: "पुस्तकालय और अध्ययन का महत्व", theme: "Reading & Knowledge" }
];

const TOPIC_SEEDS_EN = [
  { title: "India's Space Exploration Era", theme: "ISRO & Space" },
  { title: "Digital Public Infrastructure and UPI", theme: "Economy & Fintech" },
  { title: "Renewable Energy and Solar Power", theme: "Clean Energy" },
  { title: "Artificial Intelligence in Everyday Life", theme: "AI & Tech" },
  { title: "Wildlife Preservation in India", theme: "Ecology" },
  { title: "High-Speed Rail and Transport", theme: "Infrastructure" },
  { title: "Yoga and Preventive Healthcare", theme: "Wellness" },
  { title: "Rajasthan Historic Forts and Tourism", theme: "Heritage" },
  { title: "Water Harvesting in Arid Zones", theme: "Sustainability" },
  { title: "The Rise of Indian Startups", theme: "Entrepreneurship" }
];

let recentTopics = [];

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

function pickRandomSeed(lang) {
  const seeds = lang === "en" ? TOPIC_SEEDS_EN : TOPIC_SEEDS_HI;
  const available = seeds.filter(s => !recentTopics.includes(s.title));
  const pool = available.length > 0 ? available : seeds;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  recentTopics.push(picked.title);
  if (recentTopics.length > 20) recentTopics.shift();
  return picked;
}

function cleanHindiText(text) {
  return String(text || "")
    .replace(/\u0901/g, "\u0902") // Chandrabindu to Anusvara (DevLys safe)
    .replace(/[^\u0900-\u097F0-9\s।,!?\-"']/g, " ") // Remove unsupported non-Devanagari characters
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeWords(rawText, lang) {
  const text = lang === "en" ? String(rawText || "").trim() : cleanHindiText(rawText);
  const words = text.split(/\s+/).filter(Boolean);
  const tokens = [];

  for (const w of words) {
    if (lang === "en") {
      tokens.push({ h: w, k: w, lang: "en" });
    } else {
      let tok = null;
      if (typeof KD !== "undefined" && KD.safeToken) {
        tok = KD.safeToken(w);
      }
      if (tok) {
        tokens.push({ h: tok.h, k: tok.k, lang: "hi" });
      } else {
        // If word had a trailing punctuation, try stripping it
        const stripped = w.replace(/[।,!?\-"']+$/g, "");
        if (stripped && stripped !== w && KD.safeToken) {
          tok = KD.safeToken(stripped);
          if (tok) tokens.push({ h: tok.h, k: tok.k, lang: "hi" });
        }
      }
    }
  }
  return tokens;
}

function safeJSONParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (e1) {
    try {
      // Escape raw backslashes that do not form valid JSON escapes
      const sanitized = raw.replace(/\\/g, "\\\\");
      return JSON.parse(sanitized);
    } catch (e2) {
      const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
      const textMatch = raw.match(/"text"\s*:\s*"([\s\S]+?)"\s*}/);
      if (textMatch) {
        return {
          title: titleMatch ? titleMatch[1] : "नवीन पाठ",
          theme: "AI Generated",
          text: textMatch[1].replace(/\\n/g, " ").replace(/\\"/g, '"')
        };
      }
      throw e1;
    }
  }
}

async function fetchFromGemini(topicObj, lang, wordsCount) {
  const key = getGeminiKey();
  if (!key) throw new Error("Gemini API key not configured");

  const minW = Math.max(70, Number(wordsCount) || 110);
  const maxW = Math.round(minW * 1.35);

  let systemPrompt, userPrompt;
  if (lang === "en") {
    systemPrompt = "You write informative, exam-quality English paragraphs for typing examinations. Output JSON only: {\"title\":\"short title\",\"theme\":\"short theme\",\"text\":\"coherent English paragraph of " + minW + " to " + maxW + " words.\"}";
    userPrompt = "Write an unseen typing test paragraph about: " + topicObj.title + ". Informative, clear prose.";
  } else {
    systemPrompt = "You are an official RSSB typing exam paragraph author. Write standard, coherent Hindi text for a Kruti Dev / DevLys 010 typing test. IMPORTANT RULES: 1. Use common standard Hindi words. 2. Use anusvara (ं) instead of chandrabindu (ँ). 3. Every sentence must end with purna viram (।). 4. Paragraph length: between " + minW + " and " + maxW + " words. Output JSON ONLY in this format: {\"title\":\"Hindi Title\",\"theme\":\"English Theme\",\"text\":\"Full Hindi paragraph text ending with ।\"}";
    userPrompt = "विषय: " + topicObj.title + "। इस विषय पर " + minW + " से " + maxW + " शब्दों का एक सारगर्भित, सटीक और रोचक हिंदी पैराग्राफ लिखें।";
  }

  const { complete } = require("./_models");
  const res = await complete(key, {
    system: systemPrompt,
    user: userPrompt,
    temperature: 0.8,
    timeout: 18000
  });

  const raw = res.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Invalid JSON from Gemini");

  const parsed = safeJSONParse(raw.slice(start, end + 1));
  const tokens = tokenizeWords(parsed.text, lang);
  if (tokens.length < 30) throw new Error("Too few valid tokens from AI output");

  return {
    ok: true,
    title: parsed.title || topicObj.title,
    theme: parsed.theme || topicObj.theme,
    source: "gemini-live",
    text: parsed.text,
    tokens: tokens
  };
}

async function fetchFromWikipedia(lang) {
  const isEn = lang === "en";
  const endpoint = isEn
    ? "https://en.wikipedia.org/w/api.php?action=query&format=json&generator=random&grnnamespace=0&grnlimit=1&prop=extracts&explaintext=1&exintro=1"
    : "https://hi.wikipedia.org/w/api.php?action=query&format=json&generator=random&grnnamespace=0&grnlimit=1&prop=extracts&explaintext=1&exintro=1";

  const res = await fetch(endpoint, {
    headers: { "User-Agent": "SparshTypingTutor/1.0" },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error("Wikipedia API HTTP " + res.status);

  const data = await res.json();
  const page = Object.values(data.query.pages)[0];
  if (!page || !page.extract) throw new Error("No extract from Wikipedia");

  const title = page.title || "विकिपीडिया ज्ञान";
  const rawText = page.extract.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = tokenizeWords(rawText, lang);

  if (tokens.length < 25) throw new Error("Wikipedia excerpt too short");

  return {
    ok: true,
    title: title,
    theme: isEn ? "Wikipedia Knowledge" : "Wikipedia Hindi",
    source: "wikipedia-live",
    text: rawText,
    tokens: tokens.slice(0, 150)
  };
}

function fetchFromCurated(lang) {
  if (typeof KD !== "undefined" && KD.nextThemedWordLockPassage) {
    const p = KD.nextThemedWordLockPassage();
    if (p && p.tokens && p.tokens.length) {
      return {
        ok: true,
        title: p.title || "अभ्यास पाठ",
        theme: p.theme || "Practice Theme",
        source: "curated-bank",
        text: p.tokens.map(t => t.h).join(" "),
        tokens: p.tokens
      };
    }
  }
  return null;
}

module.exports = async function (req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  let params = {};
  if (req.method === "POST") {
    params = await parseBody(req);
  } else {
    const urlObj = new URL(req.url, "http://localhost");
    params = Object.fromEntries(urlObj.searchParams.entries());
  }

  const lang = params.lang === "en" ? "en" : "hi";
  const wordsCount = parseInt(params.words || params.wordsCount || "100", 10);
  let topicObj;

  if (params.topic && typeof params.topic === "string" && params.topic.trim()) {
    const t = params.topic.trim();
    topicObj = { title: t, theme: "Custom Topic" };
  } else {
    topicObj = pickRandomSeed(lang);
  }

  // 1. Try Gemini Live via Internet
  try {
    const result = await fetchFromGemini(topicObj, lang, wordsCount);
    return res.end(JSON.stringify(result));
  } catch (errGemini) {
    console.warn("Gemini dynamic passage failed, trying Wikipedia:", errGemini.message);
  }

  // 2. Try Wikipedia Live via Internet
  try {
    const result = await fetchFromWikipedia(lang);
    return res.end(JSON.stringify(result));
  } catch (errWiki) {
    console.warn("Wikipedia dynamic passage failed, using curated bank:", errWiki.message);
  }

  // 3. Fallback to Curated Themed Bank
  const fallback = fetchFromCurated(lang);
  if (fallback) {
    return res.end(JSON.stringify(fallback));
  }

  res.statusCode = 500;
  res.end(JSON.stringify({ ok: false, error: "Could not generate passage" }));
};

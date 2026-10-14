const fs = require("fs");
const vm = require("vm");
const context = { globalThis: {}, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + "/convert.js", "utf8"), context);
const KD = context.KD;

const cases = [
  ["dj", "कर"],
  ["dk", "का"],
  ["fd", "कि"],
  ["dh", "की"],
  ["ds", "के"],
  ["dks", "को"],
  ["dkS", "कौ"],
  ["dq", "कु"],
  ["dw", "कू"],
  ["da", "कं"],
  ["ls", "से"],
  ["gS", "है"],
  ["jgk", "रहा"],
  ["jke", "राम"],
  ["Hkkjr", "भारत"],
  ["fganh", "हिंदी"],
  ["esa", "में"],
  ["ugha", "नहीं"],
  ["vkSj", "और"],
  ["ueLrs", "नमस्ते"],
  ["vPNk", "अच्छा"],
  ["izdkj", "प्रकार"],
  ["f'k{kk", "शिक्षा"],
  ["/keZ", "धर्म"],
  ["Kku", "ज्ञान"],
  ["Je", "श्रम"],
  ["{kek", "क्षमा"],
  ["[kkuk", "खाना"],
  ["dke", "काम"],
  ["fnu", "दिन"],
  ["ikuh", "पानी"],
  ["yksx", "लोग"],
  ["gqvk", "हुआ"],
  ["ljdkj", "सरकार"],
  ["cM+k", "बड़ा"],
  ["i<+kbZ", "पढ़ाई"],
  ["pk¡n", "चाँद"],
  ["vkSj", "और"],
  ["A", "।"],
  [":", "रू"],
  ["#", "रु"],
  [":i", "रूप"],
  ["#dk", "रुका"],
  ["@", "/"],
  ["$", "+"],
  ["]", ","],
  ["-", "."],
  ["&", "-"],
  ["^", "‘"],
  ["*", "’"],
  ["(", ";"],
  ["\\", "?"],
  ["!", "!"],
  ["Y", "ल्"],
  ["y", "ल"]
];

let bad = 0;
for (const [k, expect] of cases) {
  const got = KD.cleanUni(KD.krutiToUnicode(k));
  const ok = got === KD.cleanUni(expect);
  if (!ok) {
    bad++;
    console.log("FAIL fwd", JSON.stringify(k), "got", JSON.stringify(got), "want", JSON.stringify(expect));
  }
}

const hindi = ["कर", "का", "कि", "की", "के", "को", "राम", "भारत", "हिंदी", "में", "नहीं", "और", "नमस्ते", "अच्छा", "प्रकार", "शिक्षा", "धर्म", "ज्ञान", "खाना", "दिन", "सरकार", "बड़ा", "पढ़ाई", "चाँद", "है", "रहा", "लोग", "पानी", "रू", "रु", "रूप", "रुका", "शुरू", "रुपया", "जरूरी", "कू", "पू"];
const fingers = { "रू": ":", "रु": "#", "रूप": ":i", "रुका": "#dk", "शुरू": "'kq:", "रुपया": "#i;k", "कू": "dw", "पू": "iw" };
for (const h of hindi) {
  const k = KD.unicodeToKruti(h);
  const back = KD.cleanUni(KD.krutiToUnicode(k));
  if (back !== KD.cleanUni(h)) {
    bad++;
    console.log("FAIL round", JSON.stringify(h), "kruti", JSON.stringify(k), "back", JSON.stringify(back));
  } else if (fingers[h] && k !== fingers[h]) {
    bad++;
    console.log("FAIL fingers", JSON.stringify(h), "kruti", JSON.stringify(k), "want", JSON.stringify(fingers[h]));
  } else {
    console.log("OK", h, "=>", k);
  }
}

["keys.js", "engine.js", "lessons.js", "words.js"].forEach(function (name) {
  vm.runInContext(fs.readFileSync(__dirname + "/" + name, "utf8"), context);
});
const wordLessons = KD.LESSONS.filter(function (l) { return l.stage; });
if (wordLessons.length !== 8) {
  bad++;
  console.log("FAIL lesson stages", wordLessons.length);
}
const tha = KD.LESSONS.filter(function (l) { return l.id === "w-tha"; })[0];
const focus = tha.bank[0].h;
const ranked = KD.weightTokens(tha.bank, { keys: {}, pairs: {} }, {}, [focus]);
if (!ranked.length || ranked[0].h !== focus) {
  bad++;
  console.log("FAIL weight", ranked[0] && ranked[0].h, "want", focus);
}
let alt = 0;
wordLessons.forEach(function (l) {
  (l.bank || []).forEach(function (tok) {
    KD.stepsFromKruti(tok.k).forEach(function (st) {
      if (st.type === "alt" || st.code === "UNMAPPED") alt++;
    });
  });
});
if (alt) {
  bad++;
  console.log("FAIL alt steps in word stage", alt);
}
const flow = KD.freshLines([["है।", "था।"]], 1);
if (!flow.length || flow[0].h.indexOf("।") < 0) {
  bad++;
  console.log("FAIL fresh danda");
}
const first = KD.composeLive({ touch: { keys: {}, pairs: {} }, misses: {}, live: { past: [] } });
if (!first.tokens.length || first.pattern !== "common" || first.tokens[0].h !== "का") {
  bad++;
  console.log("FAIL first live", first.pattern, first.tokens[0] && first.tokens[0].h);
}
const again = KD.composeLive({ touch: { keys: {}, pairs: {} }, misses: {}, live: { past: [] } });
if (again.tokens.map(function (t) { return t.h; }).join("|") !== first.tokens.map(function (t) { return t.h; }).join("|")) {
  bad++;
  console.log("FAIL live not stable");
}
const repair = KD.composeLive({
  touch: { keys: {}, pairs: {} },
  misses: {},
  live: { past: [{ id: "live-1", pattern: "common", stars: 1, slips: ["की"], at: 1 }] }
});
if (repair.pattern !== "common" || repair.tokens[0].h !== "की") {
  bad++;
  console.log("FAIL repair", repair.pattern, repair.tokens[0] && repair.tokens[0].h);
}
const ahead = KD.composeLive({
  touch: { keys: {}, pairs: {} },
  misses: {},
  live: { past: [{ id: "live-1", pattern: "common", stars: 3, slips: [], at: 1 }] }
});
if (ahead.pattern !== "paa") {
  bad++;
  console.log("FAIL advance", ahead.pattern);
}
if (!ahead.tokens.some(function (t) { return t.h === "के"; })) {
  bad++;
  console.log("FAIL paa is not linked to common", ahead.tokens.map(function (t) { return t.h; }).join(" "));
}
const sloppy = KD.composeLive({
  touch: { keys: {}, pairs: {} },
  misses: {},
  live: { past: [{ id: "live-1", pattern: "common", stars: 3, slips: ["के"], at: 1 }] }
});
if (sloppy.pattern !== "common" || sloppy.tokens[0].h !== "के") {
  bad++;
  console.log("FAIL sloppy still advanced", sloppy.pattern, sloppy.tokens[0] && sloppy.tokens[0].h);
}
let liveAlt = 0;
first.tokens.concat(repair.tokens).concat(ahead.tokens).forEach(function (tok) {
  KD.stepsFromKruti(tok.k).forEach(function (st) {
    if (st.type === "alt" || st.code === "UNMAPPED") liveAlt++;
  });
});
if (liveAlt) {
  bad++;
  console.log("FAIL live alt", liveAlt);
}
const ladder = ["common", "paa", "hai", "tha", "sym-danda", "close", "sym-q", "sym-q-use", "sym-comma", "sym-comma-use", "sym-stop", "sym-stop-use", "sym-hyphen", "sym-hyphen-use", "num-4", "num-4-use", "num-5", "num-5-use", "num-6", "num-6-use", "num-7", "num-7-use", "num-3", "num-3-use", "num-8", "num-8-use", "num-2", "num-2-use", "num-9", "num-9-use", "num-1", "num-1-use", "num-0", "num-0-use", "markwords", "lines"];
function useMark(id) {
  if (id === "close") return "।";
  if (id === "sym-q-use") return "?";
  if (id === "sym-comma-use") return ",";
  if (id === "sym-stop-use") return ".";
  if (id === "sym-hyphen-use") return "-";
  if (id.indexOf("num-") === 0 && id.indexOf("-use") > 0) return id.slice(4, id.indexOf("-use"));
  return "";
}
ladder.forEach(function (id, i) {
  const lesson = KD.composeLive({
    touch: { keys: {}, pairs: {} },
    misses: {},
    live: {
      past: ladder.slice(0, i).map(function (pid, n) {
        return { id: "live-" + (n + 1), pattern: pid, stars: 3, slips: [], at: n + 1 };
      })
    }
  });
  if (lesson.pattern !== id || !lesson.tokens.length) {
    bad++;
    console.log("FAIL ladder", id, lesson.pattern, lesson.tokens && lesson.tokens.length);
  }
  const chDrill = (id.indexOf("sym-") === 0 || id.indexOf("num-") === 0) && id.indexOf("-use") < 0;
  if (chDrill) {
    const ch = lesson.tokens[0] && lesson.tokens[0].h;
    if (!ch || ch.length !== 1) {
      bad++;
      console.log("FAIL char drill does not open on the new key", id, ch);
    }
    let word = false;
    (lesson.tokens || []).forEach(function (tok) {
      if (tok && tok.h.length > 1) word = true;
      if (ch && tok.h !== ch && tok.h.indexOf(ch) >= 0) {
        bad++;
        console.log("FAIL new key inside a word before it is clean", id, tok.h);
      }
    });
    if (!word) {
      bad++;
      console.log("FAIL char drill has no earlier word", id);
    }
  }
  if (id === "sym-danda") {
    ["का", "गया", "है", "था"].forEach(function (w) {
      if (!(lesson.tokens || []).some(function (tok) { return tok.h === w; })) {
        bad++;
        console.log("FAIL danda missing earlier lesson", w);
      }
    });
    (lesson.tokens || []).forEach(function (tok) {
      if (tok.h !== "।" && tok.h.indexOf("।") >= 0) {
        bad++;
        console.log("FAIL danda word contains the new mark", tok.h);
      }
      if (/[?0-9]/.test(tok.h) || tok.h.indexOf(",") >= 0 || tok.h.indexOf(".") >= 0 || tok.h.indexOf("-") >= 0) {
        bad++;
        console.log("FAIL danda drill has a later mark", tok.h);
      }
    });
  }
  const mark = useMark(id);
  if (mark) {
    const hit = (lesson.tokens || []).some(function (tok) { return tok.h.length > 1 && tok.h.indexOf(mark) >= 0; });
    const fromBefore = (lesson.tokens || []).some(function (tok) { return tok.h === "का" || tok.h === "है" || tok.h === "था"; });
    if (!hit || !fromBefore) {
      bad++;
      console.log("FAIL use link", id, mark, (lesson.tokens || []).map(function (tok) { return tok.h; }).join(" "));
    }
  }
  (lesson.tokens || []).forEach(function (tok) {
    KD.stepsFromKruti(tok.k).forEach(function (st) {
      if (st.type === "alt" || st.code === "UNMAPPED") {
        bad++;
        console.log("FAIL ladder key", id, tok.h);
      }
    });
  });
});
const review = KD.composeLive({
  touch: { keys: {}, pairs: {} },
  misses: {},
  live: {
    past: [
      { id: "live-1", pattern: "common", stars: 3, slips: [], at: 1 },
      { id: "live-2", pattern: "paa", stars: 3, slips: ["की"], at: 2 }
    ]
  }
});
const legacyMarks = KD.composeLive({
  touch: { keys: {}, pairs: {} },
  misses: {},
  live: {
    past: [
      { id: "live-13", pattern: "close", stars: 3, slips: [], at: 1 },
      { id: "live-18", pattern: "marks", stars: 1, slips: ["करें?"], at: 2 }
    ]
  }
});
if (legacyMarks.pattern !== "sym-danda" || !legacyMarks.tokens.length || legacyMarks.tokens.some(function (t) { return t.h !== "।"; })) {
  bad++;
  console.log("FAIL legacy marks", legacyMarks.pattern, legacyMarks.tokens && legacyMarks.tokens[0] && legacyMarks.tokens[0].h);
}
if (review.pattern !== "paa" || review.tokens[0].h !== "की" || !review.tokens.some(function (t) { return t.h === "गया"; }) || !review.tokens.some(function (t) { return t.h === "का"; })) {
  bad++;
  console.log("FAIL review", review.pattern, review.tokens && review.tokens.map(function (t) { return t.h; }).join(" "));
}
const stay = KD.composeLive({
  touch: { keys: {}, pairs: {} },
  misses: {},
  coach: { repeat: ["करें?", "को"] },
  live: {
    past: [
      { id: "live-1", pattern: "common", stars: 5, slips: [], at: 1 },
      { id: "live-4", pattern: "paa", stars: 3, slips: ["गया"], at: 4 },
      { id: "live-21", pattern: "sym-danda", stars: 0, slips: ["Space"], at: 21 }
    ]
  }
});
if (stay.pattern !== "sym-danda" || stay.tokens[0].h !== "।" || !stay.why || stay.why[0].indexOf("Space") < 0) {
  bad++;
  console.log("FAIL stay on danda", stay.pattern, stay.tokens[0] && stay.tokens[0].h, stay.why && stay.why[0]);
}
if (!stay.tokens.some(function (t) { return t.h === "का" || t.h === "गया"; }) || !stay.tokens.some(function (t) { return t.h === "को"; }) || stay.tokens.some(function (t) { return t.h.indexOf("?") >= 0; })) {
  bad++;
  console.log("FAIL danda mix", stay.tokens.map(function (t) { return t.h; }).join(" "));
}
const afterDanda = KD.composeLive({
  touch: { keys: {}, pairs: {} },
  misses: {},
  live: {
    past: [
      { id: "live-1", pattern: "common", stars: 5, slips: [], at: 1 },
      { id: "live-2", pattern: "paa", stars: 3, slips: ["गया"], at: 2 },
      { id: "live-3", pattern: "sym-danda", stars: 3, slips: [], at: 3 }
    ]
  }
});
if (afterDanda.pattern !== "close" || !afterDanda.tokens.some(function (t) { return t.h.indexOf("।") >= 0 && t.h.length > 1; }) || !afterDanda.tokens.some(function (t) { return t.h === "का"; })) {
  bad++;
  console.log("FAIL after danda", afterDanda.pattern, afterDanda.tokens && afterDanda.tokens.map(function (t) { return t.h; }).join(" "));
}
const queued = KD.composeLive({
  touch: { keys: {}, pairs: {} },
  misses: {},
  coach: { repeat: ["राम"] },
  live: {
    past: [
      { id: "live-1", pattern: "common", stars: 5, slips: [], at: 1 },
      { id: "live-2", pattern: "sym-danda", stars: 4, slips: [], at: 2 },
      { id: "live-3", pattern: "close", stars: 4, slips: [], at: 3 },
      { id: "live-4", pattern: "sym-q", stars: 4, slips: [], at: 4 },
      { id: "live-5", pattern: "marks", stars: 1, slips: ["करें?", "नाम,", "2024।"], at: 5 }
    ]
  }
});
if (queued.pattern !== "sym-q-use" || queued.tokens[0].h !== "करें?" || !queued.tokens.some(function (t) { return t.h === "राम"; }) || !queued.tokens.some(function (t) { return t.h === "का"; }) || queued.tokens.some(function (t) { return /[0-9]/.test(t.h) || t.h.indexOf(",") >= 0; })) {
  bad++;
  console.log("FAIL queued slip", queued.pattern, queued.tokens && queued.tokens.map(function (t) { return t.h; }).join(" "));
}
const kept = KD.mergeProgress(
  {
    stars: { a: 1 },
    live: {
      past: [{ id: "live-7", pattern: "tha", stars: 2, slips: [], at: 7 }],
      lesson: { id: "live-8", pattern: "tha", tokens: [{ k: "Fkk", h: "था" }] },
      resume: { id: "live-8", i: 9, wi: 0, phase: "run", at: "रहता" }
    }
  },
  {
    stars: { a: 1 },
    live: {
      past: [{ id: "live-7", pattern: "tha", stars: 2, slips: [], at: 7 }],
      lesson: { id: "live-8", pattern: "tha", tokens: [{ k: "Fkk", h: "था" }] },
      resume: { id: "live-8", i: 2, wi: 0, phase: "run", at: "थी" }
    }
  }
);
if (!kept.live || kept.live.lesson.id !== "live-8" || !kept.live.resume || kept.live.resume.i !== 9 || kept.live.resume.at !== "रहता") {
  bad++;
  console.log("FAIL resume kept", kept.live && kept.live.resume);
}
console.log("live", first.pattern, repair.pattern, ahead.pattern);
const preferenceSource = { stars: {}, settings: { keyboard: false, hands: false, metrics: false, blockErrors: true, textSize: 32 } };
const preferences = KD.mergeProgress(preferenceSource, null).settings;
if (preferences.keyboard !== false || preferences.hands !== false || preferences.metrics !== false || preferences.blockErrors !== true || preferences.textSize !== 32) {
  bad++;
  console.log("FAIL typing preferences were lost during progress merge");
}
const mergedPreferences = KD.mergeProgress({ stars: { a: 3 }, settings: { keyboard: true, hands: false } }, preferenceSource).settings;
if (mergedPreferences.keyboard !== true || mergedPreferences.hands !== false || mergedPreferences.blockErrors !== true) {
  bad++;
  console.log("FAIL preferred typing preferences did not survive cloud merge");
}
const sameBars = KD.starBars({ tries: {}, log: [], live: { past: [] } });
if (sameBars.min !== 14 || sameBars.mid !== 22 || sameBars.high !== 32) {
  bad++;
  console.log("FAIL empty history keeps the starter bar", sameBars);
}
const fastTries = [];
for (var n = 0; n < 6; n++) fastTries.push({ at: 1000 + n, wpm: 36, acc: 98, ms: 20000 });
const fromHistory = KD.starBars({ tries: { "p-any": fastTries }, log: [], live: { past: [] } });
if (fromHistory.high !== 36 || fromHistory.min !== 28 || fromHistory.mid !== 32) {
  bad++;
  console.log("FAIL bar should sit on recent speed", fromHistory);
}
if (KD.starsFor(36, 100, fromHistory) !== 5 || KD.starsFor(34, 100, fromHistory) !== 4) {
  bad++;
  console.log("FAIL five stars should need the new bar", KD.starsFor(36, 100, fromHistory), KD.starsFor(34, 100, fromHistory));
}
const heldBar = KD.starBars({ live: { past: [{ pattern: "history", stars: 4, high: 36, at: 5 }] } });
const nextBar = KD.starBars({ live: { past: [{ pattern: "history", stars: 5, high: 36, at: 5 }] } });
const capBar = KD.starBars({ live: { past: [{ pattern: "history", stars: 5, high: 40, at: 5 }] } });
if (heldBar.high !== 36 || nextBar.high !== 38 || nextBar.min !== 30 || capBar.high !== 40) {
  bad++;
  console.log("FAIL bar step", heldBar, nextBar, capBar);
}
const repairBar = KD.starBars({ tries: { "repair-x": [{ at: 9, wpm: 80, acc: 100, ms: 30000 }] } });
if (repairBar.high !== 32) {
  bad++;
  console.log("FAIL repair drill moved the bar", repairBar);
}
const generated = KD.historyLesson({
  misses: { KeyD: 40, Space: 80 },
  touch: { keys: {}, pairs: {} },
  tries: { "p-any": fastTries },
  live: { past: [] }
});
const examSentences = [
  "यह काम पूरा था।", "पत्र का उत्तर देना था।", "बैठक आज थी।", "बच्चे वहां खेल रहे थे।",
  "योजना लागू की गई है।", "उसने सही जवाब दिया।", "काम समय पर हुआ है।", "लोगों को जानकारी देनी है।",
  "वह कल आया था।", "रिपोर्ट तैयार थी।", "किसान ने खेत में पानी दिया।", "कार्यालय आज बंद था।",
  "नया नियम कल से लागू है।", "उसे पुरस्कार मिला था।", "माता घर पर थी।", "स्वास्थ्य केंद्र खुला है।",
  "कृपया यह पत्र पढ़ें।", "सड़क पर वाहन धीमे थे।", "वर्ष के अंत में रिपोर्ट देनी थी।",
  "प्रधान ने बैठक बुलाई है।", "कर्मचारी समय पर पहुंचे थे।", "आदेश कल जारी हुआ था।"
];
const generatedText = (generated.tokens || []).map(function (t) { return t.h; }).join(" ");
function intactExam(text) {
  if (examSentences.indexOf(text) >= 0) return true;
  for (var i = 0; i < examSentences.length; i++) {
    var head = examSentences[i] + " ";
    if (text.indexOf(head) === 0 && examSentences.indexOf(text.slice(head.length)) >= 0) return true;
  }
  return false;
}
if (generated.pattern !== "history" || generated.high !== 36 || generated.teach.indexOf("exam sentence") < 0 || !intactExam(generatedText)) {
  bad++;
  console.log("FAIL history lesson", generated.pattern, generated.high, generatedText);
}
let generatedAlt = 0;
(generated.tokens || []).forEach(function (tok) {
  KD.stepsFromKruti(tok.k).forEach(function (st) {
    if (!st || st.type === "alt" || st.code === "UNMAPPED") generatedAlt++;
  });
});
if (generatedAlt) {
  bad++;
  console.log("FAIL history lesson key", generatedAlt);
}
const repeatLesson = KD.historyLesson({
  misses: { KeyD: 40, Space: 80 },
  touch: { keys: {}, pairs: {} },
  live: { past: [{ pattern: "history", stars: 3, high: 36, words: ["का", "के"], slips: ["का"], at: 1 }] }
});
if (repeatLesson.high !== 36 || repeatLesson.tokens.map(function (t) { return t.h; }).join("|") !== "का|के") {
  bad++;
  console.log("FAIL history replay", repeatLesson.high, repeatLesson.tokens && repeatLesson.tokens.map(function (t) { return t.h; }).join("|"));
}
if (KD.courseComplete({ stars: {} })) {
  bad++;
  console.log("FAIL course looked complete inside the live ladder");
}
if (first.pattern !== "common" || first.high !== 32) {
  bad++;
  console.log("FAIL starter live bar changed", first.pattern, first.high);
}
console.log("word lessons", wordLessons.map(function (l) { return l.id; }).join(", "));
console.log(bad === 0 ? "ALL GOOD" : bad + " failures");
process.exit(bad === 0 ? 0 : 1);

/* Physical QWERTY keys → Kruti Dev 010 / DevLys 010.
   The exam PC is on the English keyboard. Kruti Dev is a font, not an input method. */
(function (root) {
  var KD = root.KD = root.KD || {};

  KD.FINGERS = {
    lp: { id: "lp", name: "left little", short: "L5", hand: "left", hue: "#d4533c" },
    lr: { id: "lr", name: "left ring", short: "L4", hand: "left", hue: "#d89a14" },
    lm: { id: "lm", name: "left middle", short: "L3", hand: "left", hue: "#2f9e5a" },
    li: { id: "li", name: "left index", short: "L2", hand: "left", hue: "#3a6fd6" },
    ri: { id: "ri", name: "right index", short: "R2", hand: "right", hue: "#7a4fd0" },
    rm: { id: "rm", name: "right middle", short: "R3", hand: "right", hue: "#1f8a7a" },
    rr: { id: "rr", name: "right ring", short: "R4", hand: "right", hue: "#c46a1a" },
    rp: { id: "rp", name: "right little", short: "R5", hand: "right", hue: "#c43b55" },
    th: { id: "th", name: "thumb", short: "Th", hand: "both", hue: "#6d645b" }
  };

  function key(code, legend, normal, shifted, finger, opts) {
    return { code: code, legend: legend, normal: normal, shifted: shifted, finger: finger, home: !!(opts && opts.home), bump: !!(opts && opts.bump) };
  }

  KD.ROWS = [
    [
      key("Backquote", "`", "`", "~", "lp"),
      key("Digit1", "1", "1", "!", "lp"),
      key("Digit2", "2", "2", "@", "lr"),
      key("Digit3", "3", "3", "#", "lm"),
      key("Digit4", "4", "4", "$", "li"),
      key("Digit5", "5", "5", "%", "li"),
      key("Digit6", "6", "6", "^", "ri"),
      key("Digit7", "7", "7", "&", "ri"),
      key("Digit8", "8", "8", "*", "rm"),
      key("Digit9", "9", "9", "(", "rr"),
      key("Digit0", "0", "0", ")", "rp"),
      key("Minus", "-", "-", "_", "rp"),
      key("Equal", "=", "=", "+", "rp")
    ],
    [
      key("KeyQ", "Q", "q", "Q", "lp"),
      key("KeyW", "W", "w", "W", "lr"),
      key("KeyE", "E", "e", "E", "lm"),
      key("KeyR", "R", "r", "R", "li"),
      key("KeyT", "T", "t", "T", "li"),
      key("KeyY", "Y", "y", "Y", "ri"),
      key("KeyU", "U", "u", "U", "ri"),
      key("KeyI", "I", "i", "I", "rm"),
      key("KeyO", "O", "o", "O", "rr"),
      key("KeyP", "P", "p", "P", "rp"),
      key("BracketLeft", "[", "[", "{", "rp"),
      key("BracketRight", "]", "]", "}", "rp"),
      key("Backslash", "\\", "\\", "|", "rp")
    ],
    [
      key("KeyA", "A", "a", "A", "lp", { home: true }),
      key("KeyS", "S", "s", "S", "lr", { home: true }),
      key("KeyD", "D", "d", "D", "lm", { home: true }),
      key("KeyF", "F", "f", "F", "li", { home: true, bump: true }),
      key("KeyG", "G", "g", "G", "li"),
      key("KeyH", "H", "h", "H", "ri"),
      key("KeyJ", "J", "j", "J", "ri", { home: true, bump: true }),
      key("KeyK", "K", "k", "K", "rm", { home: true }),
      key("KeyL", "L", "l", "L", "rr", { home: true }),
      key("Semicolon", ";", ";", ":", "rp", { home: true }),
      key("Quote", "'", "'", "\"", "rp")
    ],
    [
      key("KeyZ", "Z", "z", "Z", "lp"),
      key("KeyX", "X", "x", "X", "lr"),
      key("KeyC", "C", "c", "C", "lm"),
      key("KeyV", "V", "v", "V", "li"),
      key("KeyB", "B", "b", "B", "li"),
      key("KeyN", "N", "n", "N", "ri"),
      key("KeyM", "M", "m", "M", "ri"),
      key("Comma", ",", ",", "<", "rm"),
      key("Period", ".", ".", ">", "rr"),
      key("Slash", "/", "/", "?", "rp")
    ]
  ];

  KD.BY_CODE = {};
  KD.ROWS.forEach(function (row) {
    row.forEach(function (k) { KD.BY_CODE[k.code] = k; });
  });

  var CHAR_TO = {};
  KD.ROWS.forEach(function (row) {
    row.forEach(function (k) {
      CHAR_TO[k.normal] = { code: k.code, shift: false };
      if (k.shifted && k.shifted !== k.normal) CHAR_TO[k.shifted] = { code: k.code, shift: true };
    });
  });
  CHAR_TO[" "] = { code: "Space", shift: false };

  function rawUni(kruti) {
    if (!KD.krutiToUnicode) return String(kruti || "");
    return KD.cleanUni(KD.krutiToUnicode(kruti));
  }
  function isBaseCp(cp) {
    return (cp >= 0x0904 && cp <= 0x0939) || (cp >= 0x0958 && cp <= 0x0961) || cp === 0x0950;
  }
  function isMarkCp(cp) {
    return (cp >= 0x0900 && cp <= 0x0903) || cp === 0x093c ||
      (cp >= 0x093e && cp <= 0x094d) || (cp >= 0x0951 && cp <= 0x0957) ||
      cp === 0x0962 || cp === 0x0963;
  }
  /* Official number-row Shift glyphs are punctuation, not Devanagari.
     They must stay visible on the key. A sign also ends the syllable,
     so a matra after it is not drawn on a dotted circle. */
  var SIGN_CH = ["!", "/", "+", "\u2018", "\u2019", "\u201C", "\u201D", ";", ".", ",", "?", "-", ":", "="].join("");
  function isSignCh(ch) {
    return SIGN_CH.indexOf(ch) !== -1;
  }
  function orphanMark(s) {
    var base = false;
    for (var i = 0; i < s.length; i++) {
      var cp = s.charCodeAt(i);
      var ch = s.charAt(i);
      if (isBaseCp(cp)) base = true;
      else if (isMarkCp(cp)) { if (!base) return true; }
      else if (ch === " " || ch === "।" || ch === "॥" || (ch >= "0" && ch <= "9") || isSignCh(ch)) base = false;
    }
    return false;
  }
  function cleanShow(s) {
    if (!s) return false;
    for (var i = 0; i < s.length; i++) {
      var cp = s.charCodeAt(i);
      var ch = s.charAt(i);
      var ok = isBaseCp(cp) || isMarkCp(cp) || isSignCh(ch) || ch === " " || ch === "।" || ch === "॥" ||
        (ch >= "0" && ch <= "9") || cp === 0x0970;
      if (!ok) return false;
    }
    return !orphanMark(s);
  }

  /* Lone matras cannot be drawn by themselves: the font paints a dotted circle.
     Sit each one on क so the key face is a real syllable. The क is a sample. */
  var FACE = {
    f: "कि", k: "का", s: "के", S: "कै", h: "की", a: "कं",
    q: "कु", w: "कू", W: "कॅ", "`": "कृ", "~": "क्",
    "+": "क़", z: "क्र", Z: "र्", "%": "कः"
  };

  KD.keyFace = function (ch) {
    if (FACE[ch]) return FACE[ch];
    var u = rawUni(ch);
    return cleanShow(u) ? u : "";
  };

  /* What the typist sees while a word is still open.
     A trailing f is इ की मात्रा waiting for its consonant.
     It must not appear as the English letter f, or as a dotted circle. */
  KD.liveForm = function (typed) {
    var body = String(typed || "");
    var wait = false;
    while (body && !cleanShow(rawUni(body))) {
      if (body.charAt(body.length - 1) === "f") wait = true;
      body = body.slice(0, -1);
    }
    return { text: body ? rawUni(body) : "", wait: wait };
  };

  KD.preview = function (kruti) {
    if (kruti == null || kruti === "") return "";
    var s = String(kruti);
    if (FACE[s]) return FACE[s];
    return KD.liveForm(s).text;
  };

  KD.stepsFromKruti = function (kruti) {
    var steps = [];
    var s = String(kruti);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var codePoint = s.charCodeAt(i);
      if (CHAR_TO[ch]) {
        var hit = CHAR_TO[ch];
        var meta = KD.BY_CODE[hit.code];
        steps.push({
          type: "key",
          code: hit.code,
          shift: hit.shift,
          ch: ch,
          finger: hit.code === "Space" ? "th" : (meta ? meta.finger : "rp"),
          legend: hit.code === "Space" ? "Space" : (meta ? meta.legend : ch)
        });
      } else if (codePoint > 126 && codePoint < 256) {
        steps.push({
          type: "alt",
          num: String(codePoint).padStart(4, "0"),
          ch: ch,
          finger: "rp",
          legend: "Alt+" + codePoint
        });
      } else if (ch === "\n") {
        steps.push({ type: "key", code: "Space", shift: false, ch: " ", finger: "th", legend: "Space" });
      } else {
        steps.push({ type: "key", code: "UNMAPPED", shift: false, ch: ch, finger: "rp", legend: ch });
      }
    }
    return steps;
  };

  KD.legacyFromEvent = function (e) {
    if (!e) return null;
    if (e.code === "Space") return " ";
    var meta = KD.BY_CODE[e.code];
    if (!meta) return null;
    return e.shiftKey ? meta.shifted : meta.normal;
  };

  KD.handOf = function (code) {
    var meta = KD.BY_CODE[code];
    if (!meta) return "";
    var finger = KD.FINGERS[meta.finger];
    return finger ? finger.hand : "";
  };

  KD.shiftHand = function (fingerId) {
    var f = KD.FINGERS[fingerId];
    if (!f || f.hand === "right") return "left";
    return "right";
  };

  /* Alt codes that actually exist in Kruti Dev 010 (SIL byte map).
     Finger keys are listed when they draw the same letter faster. */
  KD.ALT_BOOK = [
    { num: "0161", glyph: "ँ", name: "चंद्रबिंदु", sample: "चाँद, माँ, आँख", fingers: null, why: "इसकी अपनी कुंजी नहीं। नंबर पैड पर Alt दबाकर 0161।" },
    { num: "0130", glyph: "ॉ", name: "चंद्र ओ की मात्रा", sample: "कॉफी, डॉक्टर", fingers: "kW", why: "k फिर W भी यही मात्रा है। Alt+0130 एक साथ याद रखें।" },
    { num: "0197", glyph: "ऊ", name: "बड़ा ऊ", sample: "ऊपर, ऊन", fingers: "mw", why: "m फिर w फ़ॉन्ट में ऊ बनाता है। अकेला स्वर हो तो Alt+0197 भी चलता है।" },
    { num: "0195", glyph: "ई", name: "बड़ा ई", sample: "ईंट", fingers: "bZ", why: "b फिर Shift+Z। Alt+0195 वही अक्षर है।" },
    { num: "0216", glyph: "क्र", name: "क्र", sample: "क्रम, क्रमांक", fingers: "dz", why: "d फिर z। RSSB में Alt मना है, इसलिए यही दो कुंजी दबाएँ। K फिर J से कर बनता है, क्र नहीं।" },
    { num: "0231", glyph: "प्र", name: "प्र", sample: "प्रकार, प्रयास", fingers: "iz", why: "i फिर z। चार अंक वाला Alt इससे धीमा है।" },
    { num: "0230", glyph: "द्र", name: "द्र", sample: "द्रव्य", fingers: "nz", why: "n फिर z।" },
    { num: "0221", glyph: "फ्र", name: "फ्र", sample: "फ्रांस", fingers: "Qz", why: "Shift+Q फिर z।" },
    { num: "0228", glyph: "क्त", name: "क्त", sample: "भक्ति", fingers: "Dr", why: "Shift+D फिर r।" },
    { num: "0151", glyph: "कृ", name: "कृ", sample: "कृपया, कृषि", fingers: "d`", why: "d फिर बैककोट।" },
    { num: "0204", glyph: "द्द", name: "द्द", sample: "गद्दी", fingers: "n~n", why: "n, Shift+बैककोट, n।" },
    { num: "0205", glyph: "ट्ट", name: "ट्ट", sample: "खट्टा", fingers: "V~V", why: "Shift+V, हलंत, Shift+V।" },
    { num: "0217", glyph: "त्त", name: "त्त", sample: "सत्ता", fingers: "Rr", why: "Shift+R फिर r।" },
    { num: "0131", glyph: "१", name: "हिंदी अंक", sample: "१२३", fingers: "1", why: "नंबर पंक्ति अंग्रेज़ी अंक देती है। देवनागरी अंक Alt+0131 से १, 0132 से २, ऐसे ही 0140 से ०।" }
  ];
})(typeof globalThis !== "undefined" ? globalThis : this);

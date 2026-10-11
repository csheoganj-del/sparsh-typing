/* TypingClub order for Kruti Dev: one new key, named finger, known keys only,
   then the Hindi rules English never has — ि before the consonant, half letters
   on Shift, reph after the syllable. */
(function (root) {
  var KD = root.KD = root.KD || {};

  function gloss(k) {
    return KD.preview(k);
  }

  function keys() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) out.push({ k: arguments[i], h: gloss(arguments[i]) });
    return out;
  }

  function repeatKey(ch, group, times) {
    var chunk = "";
    for (var i = 0; i < group; i++) chunk += ch;
    var out = [];
    for (var n = 0; n < times; n++) out.push({ k: chunk, h: gloss(chunk) });
    return out;
  }

  function mix(focus, known, rounds) {
    var out = [];
    for (var r = 0; r < rounds; r++) {
      var knownK = known[r % known.length];
      out.push({ k: focus + focus, h: gloss(focus + focus) });
      out.push({ k: knownK, h: gloss(knownK) });
      out.push({ k: focus, h: gloss(focus) });
    }
    return out;
  }

  function hindi(list, rounds) {
    var out = [];
    var reps = rounds || 1;
    for (var r = 0; r < reps; r++) {
      for (var i = 0; i < list.length; i++) {
        var h = list[i];
        var k = KD.unicodeToKruti(h);
        var back = KD.cleanUni(KD.krutiToUnicode(k));
        if (back !== KD.cleanUni(h)) {
          throw new Error("Lesson word does not round-trip: " + h + " → " + k + " → " + back);
        }
        out.push({ k: k, h: h });
      }
    }
    return out;
  }

  function lesson(spec) {
    spec.tokens = spec.tokens || [];
    spec.min = spec.min || 10;
    spec.mid = spec.mid || 18;
    spec.high = spec.high || 28;
    spec.acc = spec.acc || 94;
    spec.hints = spec.hints || "keys";
    return spec;
  }

  var L = [];

  L.push(lesson({
    id: "bumps",
    section: "home",
    title: "Find the bumps",
    skill: "home",
    finger: "both index fingers",
    newKey: "KeyJ",
    teach: "Do not look at the keyboard. F and J have a small bump. Left index on F, right index on J. The other fingers drop onto the same row. That is home row. In Kruti Dev the fingers stay the same. The letters change.",
    tokens: keys("j", "j", "j", "j", "fj", "j", "fj", "jj", "fj", "j", "jj", "fj", "j", "fj"),
    min: 8, mid: 14, high: 22
  }));

  L.push(lesson({
    id: "j-ra",
    section: "home",
    title: "J is र",
    skill: "home",
    finger: "right index",
    newKey: "KeyJ",
    teach: "J is the home-row bump, and in Kruti Dev it is र. Press it and return to the bump. Eyes on the screen.",
    tokens: repeatKey("j", 3, 8).concat(mix("j", ["j"], 6)),
    min: 8, mid: 16, high: 24
  }));

  L.push(lesson({
    id: "f-ikar",
    section: "home",
    title: "F is the ि mark",
    skill: "ikar",
    finger: "left index",
    newKey: "KeyF",
    teach: "F is the short-i mark. It is typed before the consonant and sits on its left when you read it. F then J makes रि. The key shows कि so the mark is visible. You only press F. Until the next letter, the mark waits on screen.",
    tokens: keys("fj", "j", "fj", "jj", "jfj", "fj", "j", "fj", "jj", "jfj", "fj", "j", "fj", "jj"),
    min: 8, mid: 16, high: 24
  }));

  L.push(lesson({
    id: "d-ka",
    section: "home",
    title: "D is क",
    skill: "home",
    finger: "left middle",
    newKey: "KeyD",
    teach: "The left middle finger lives on D. D is क. After the key, return to D.",
    tokens: hindi(["क", "कर", "कि", "र", "क", "रिक", "कर", "कि"], 2),
    min: 8, mid: 16, high: 24
  }));

  L.push(lesson({
    id: "k-aa",
    section: "home",
    title: "K is the ा mark",
    skill: "home",
    finger: "right middle",
    newKey: "KeyK",
    teach: "The right middle finger is on K. K is the long-ā mark. क then K makes का. The key shows का so the mark is visible. You only press K. The short-i mark is the other way around: it is typed before the consonant.",
    tokens: hindi(["का", "रा", "का", "करा", "राका", "का", "करा"], 2),
    min: 10, mid: 18, high: 26
  }));

  L.push(lesson({
    id: "kaar-ki",
    section: "home",
    title: "कर, का, कि",
    skill: "ikar",
    finger: "index and middle",
    newKey: "KeyF",
    teach: "कि is F, then D. The key order is FD, and you read कि. का is D then K. कर is D then J. Type these three with separate fingers, without looking.",
    tokens: hindi(["कर", "का", "कि", "रा", "का", "कर", "कि", "करा", "राका", "किक"], 2),
    hints: "keys",
    min: 10, mid: 18, high: 28
  }));

  L.push(lesson({
    id: "s-e",
    section: "home",
    title: "S is the े mark",
    skill: "home",
    finger: "left ring",
    newKey: "KeyS",
    teach: "The left ring finger is on S. S is the े mark. के is D then S.",
    tokens: hindi(["के", "रे", "के", "का", "कर", "रे", "के"], 2),
    min: 10, mid: 18, high: 26
  }));

  L.push(lesson({
    id: "l-sa",
    section: "home",
    title: "L is स",
    skill: "home",
    finger: "right ring",
    newKey: "KeyL",
    teach: "The right ring finger is on L. L is स. से is L then S.",
    tokens: hindi(["स", "से", "का", "के", "से", "कर", "किस", "सक"], 2),
    min: 10, mid: 18, high: 28
  }));

  L.push(lesson({
    id: "h-ii",
    section: "home",
    title: "H is the ी mark",
    skill: "ikar",
    finger: "right index",
    newKey: "KeyH",
    teach: "H is just left of J. The right index reaches in. H is the long-ī mark, typed after the consonant. की is D then H. कि is F then D. The sounds are close. The finger order is not.",
    tokens: hindi(["की", "कि", "की", "कि", "सी", "की", "किसी", "सी"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "a-bindi",
    section: "home",
    title: "A is the bindu",
    skill: "home",
    finger: "left little",
    newKey: "KeyA",
    teach: "The left little finger is on A. A is the bindu, at the end of the word. कं is D then A. Reach to A and come back home.",
    tokens: hindi(["कं", "का", "कर", "की", "कि", "कां"], 2),
    min: 10, mid: 18, high: 26
  }));

  L.push(lesson({
    id: "g-ha",
    section: "home",
    title: "G is ह",
    skill: "home",
    finger: "left index",
    newKey: "KeyG",
    teach: "The left index moves one key in from F, to G. G is ह. है is not yet. That needs Shift. For now: ह, ही, हर.",
    tokens: hindi(["ह", "हर", "ही", "कि", "की", "हर", "सही", "कहा"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "semi-ya",
    section: "home",
    title: "; is य",
    skill: "home",
    finger: "right little",
    newKey: "Semicolon",
    teach: "The right little finger is on semicolon. That key is य. यह, या, किया. The little finger is short. Reach the key and return home.",
    tokens: hindi(["य", "या", "यह", "किया", "रहा", "या", "सही", "कहा"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "home-words",
    section: "home",
    title: "Home-row words",
    skill: "home",
    finger: "all ten fingers",
    teach: "Home row only. On a mistake, stop and press the right key. Speed comes later.",
    tokens: hindi(["कर", "का", "कि", "की", "के", "से", "यह", "रहा", "कहा", "सही", "किया", "किस", "ही", "या", "हर"], 2),
    hints: "hindi",
    min: 14, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "anchor-j",
    section: "home",
    title: "Left hand only",
    skill: "home",
    finger: "left hand is moving",
    hand: "left",
    teach: "Rest the right hand on home and do not press a key. Do not hold J down. H and J share one finger, so they cannot be pressed together. This drill is only the left hand: क, के, कि, ह, कहे. The long-ī mark is on the right, so ही is not in this drill.",
    tokens: hindi(["क", "के", "कि", "कं", "ह", "हे", "हि", "कह", "कहे", "हक"], 2),
    min: 8, mid: 14, high: 22
  }));

  L.push(lesson({
    id: "anchor-f",
    section: "home",
    title: "Right hand only",
    skill: "home",
    finger: "right hand is moving",
    hand: "right",
    teach: "Leave the left hand quiet on home. Do not hold F down. The right hand alone makes र, रा, री, स, सी, या. For री the index leaves J, presses H, and comes back to J. क and ह are on the left, so कहा and सही are not here.",
    tokens: hindi(["र", "रा", "री", "स", "सा", "सी", "सर", "सरा", "या", "यार", "रस", "रसी"], 2),
    min: 8, mid: 14, high: 22
  }));

  L.push(lesson({
    id: "e-ma",
    section: "top",
    title: "E is म",
    skill: "top",
    finger: "left middle, up",
    newKey: "KeyE",
    teach: "The middle finger moves from D up to E and back to D. E is म. कम and हम are here. में also needs S and A.",
    tokens: hindi(["म", "कम", "हम", "में", "किया", "हम", "समय", "कम"], 1).concat(hindi(["में", "हम", "कम", "रहा"])),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "i-pa",
    section: "top",
    title: "I is प",
    skill: "top",
    finger: "right middle, up",
    newKey: "KeyI",
    teach: "The right middle finger moves from K up to I. I is प. For now: प, पर, पास.",
    tokens: hindi(["प", "पर", "पास", "हम", "पर", "किया", "पास", "पर"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "r-ta",
    section: "top",
    title: "R is त",
    skill: "top",
    finger: "left index, up",
    newKey: "KeyR",
    teach: "The left index moves from F up to R. R is त. J is र and R is त. Close sounds, different hands. For now: मत, त.",
    tokens: hindi(["त", "तक", "मत", "ही", "तक", "करता", "कहता", "रहा"], 2),
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "u-na",
    section: "top",
    title: "U is न",
    skill: "top",
    finger: "right index, up",
    newKey: "KeyU",
    teach: "The right index moves from J up to U. U is न. न, करना, हमने.",
    tokens: hindi(["न", "करना", "हमने", "नहीं", "मानना"], 2),
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "w-uu",
    section: "top",
    title: "W is the ू mark",
    skill: "top",
    finger: "left ring, up",
    newKey: "KeyW",
    teach: "The ring finger moves from S up to W. W is the ू mark. कू, पू, तू. The ू on र is not this key. रू is Shift+semicolon, in a later lesson. The standalone vowel ऊ is M then W.",
    tokens: hindi(["कू", "पू", "तू", "सू", "कूप", "तक"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "o-va",
    section: "top",
    title: "O is व",
    skill: "top",
    finger: "right ring, up",
    newKey: "KeyO",
    teach: "The ring finger moves from L up to O. O is व. For now: व, वह.",
    tokens: hindi(["व", "वह", "समय", "करना", "वह", "पास"], 2),
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "t-ja",
    section: "top",
    title: "T is ज",
    skill: "top",
    finger: "left index, up and in",
    newKey: "KeyT",
    teach: "The left index moves from R across to T. T is ज. जा, आज, किया.",
    tokens: hindi(["ज", "जा", "जाता", "किया", "जा", "समाज", "जा"], 2),
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "y-la",
    section: "top",
    title: "Y is ल",
    skill: "top",
    finger: "right index, up and in",
    newKey: "KeyY",
    teach: "The right index moves from U across to Y. Y is ल. Shift+Y is half ल, not रू. For now: ल, काल.",
    tokens: hindi(["ल", "काल", "पाल", "जल", "लिया", "साल", "ल"], 2),
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "q-u",
    section: "top",
    title: "Q is the ु mark",
    skill: "top",
    finger: "left little, up",
    newKey: "KeyQ",
    teach: "The little finger moves from A up to Q. Q is the ु mark. कु, हु, तु. The ु on र is not this key. रु is Shift+3 on the number row. The little finger is the weakest. Keep it slow and clean.",
    tokens: hindi(["कु", "हु", "तु", "सु", "कहा", "हु"], 2),
    min: 10, mid: 18, high: 28
  }));

  L.push(lesson({
    id: "p-cha",
    section: "top",
    title: "P is च",
    skill: "top",
    finger: "right little, up",
    newKey: "KeyP",
    teach: "The right little finger is on P. P is च. च, चा, चार.",
    tokens: hindi(["च", "चा", "चार", "पास", "चार", "चा"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "top-words",
    section: "top",
    title: "Top-row words",
    skill: "top",
    finger: "up from home, then back",
    teach: "After every reach, the fingers return to home row. That is the short path.",
    tokens: hindi(["मन", "पानी", "चार", "जाता", "रहता", "हमने", "नहीं", "समय", "पास", "करना", "माता", "पिता", "कुल", "पूरा"], 2),
    hints: "hindi",
    min: 16, mid: 24, high: 34
  }));

  L.push(lesson({
    id: "c-ba",
    section: "bottom",
    title: "C is ब",
    skill: "bottom",
    finger: "left middle, down",
    newKey: "KeyC",
    teach: "The middle finger moves from D down to C. C is ब. Reach down and return to D.",
    tokens: hindi(["ब", "बस", "बात", "बना", "बहुत", "बस"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "x-ga",
    section: "bottom",
    title: "X is ग",
    skill: "bottom",
    finger: "left ring, down",
    newKey: "KeyX",
    teach: "The ring finger moves from S down to X. X is ग. गया, लोग. Reach down and return to S.",
    tokens: hindi(["ग", "गया", "लोग", "गल", "गाय", "गया"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "n-da",
    section: "bottom",
    title: "N is द",
    skill: "bottom",
    finger: "right index, down",
    newKey: "KeyN",
    teach: "The right index moves from J down to N. N is द. In दिन the short-i mark comes first: F, then N, then U.",
    tokens: hindi(["द", "दिन", "बाद", "दिया", "हमारा", "दिन", "बाद"], 2),
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "m-u-vowel",
    section: "bottom",
    title: "M is उ",
    skill: "vowel",
    finger: "right index, down",
    newKey: "KeyM",
    teach: "M is left of N. M is the vowel उ. उसे, उन, उस. The ु mark is on Q. The standalone vowel उ is M.",
    tokens: hindi(["उ", "उसे", "उन", "उस", "उसे", "उन"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "v-a",
    section: "bottom",
    title: "V is अ",
    skill: "vowel",
    finger: "left index, down",
    newKey: "KeyV",
    teach: "The left index reaches down to V. V is अ. आ is V then K. For now: अ, आ, अगर.",
    tokens: hindi(["अ", "आ", "अगर", "आज", "आगे", "काम", "अगर"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "b-i",
    section: "bottom",
    title: "B is इ",
    skill: "vowel",
    finger: "left index, down and in",
    newKey: "KeyB",
    teach: "B is इ. ई is B then Shift+Z. For now: इ, इन, इसे, इसी.",
    tokens: hindi(["इ", "इन", "इसे", "इसी", "दिन", "किसी"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "comma-e",
    section: "bottom",
    title: "Comma is ए",
    skill: "vowel",
    finger: "right middle, down",
    newKey: "Comma",
    teach: "Comma is ए. एक is comma then D. ऐ is comma then S, as in ऐसे. The middle finger reaches the comma and returns to K.",
    tokens: hindi(["ए", "एक", "ऐसे", "गए", "हुए", "लिए", "एक", "ऐसे"], 2),
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "bottom-words",
    section: "bottom",
    title: "Bottom-row words",
    skill: "bottom",
    finger: "down from home, then back",
    teach: "ब, ग, द, उ, अ, इ, ए. After each word, feel home row again, the bumps on F and J.",
    tokens: hindi(["बात", "बस", "गया", "दिन", "हुआ", "अगर", "एक", "बहुत", "लोग", "आगे", "बाद", "उनके", "इसके", "लिए", "हुए"], 2),
    hints: "hindi",
    min: 16, mid: 24, high: 34
  }));

  L.push(lesson({
    id: "travel",
    section: "bottom",
    title: "The reach",
    skill: "bottom",
    finger: "one finger, three rows",
    teach: "Left middle: क on home, म up, ब down. Right index: र on home, न up, द down. Home is the middle.",
    tokens: hindi(["क", "म", "ब", "कम", "बस", "र", "न", "द", "दिन", "करना", "बाद", "हम", "नहीं"], 2),
    hints: "hindi",
    min: 14, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "omatra",
    section: "matra",
    title: "को and कौ, two keys",
    skill: "omatra",
    finger: "K then S",
    newKey: "KeyK",
    teach: "The ो mark is not one key. K then S makes को, लो, हो. कौ is K then Shift+S. कौन and लोग come from this. It is the extra stroke you will use most.",
    tokens: hindi(["को", "लो", "हो", "लोग", "होगा", "को", "कौन", "और", "लोग", "होगा", "उनको", "इसको"], 2),
    hints: "keys",
    min: 14, mid: 24, high: 34
  }));

  L.push(lesson({
    id: "hai",
    section: "matra",
    title: "है, the ै mark",
    skill: "omatra",
    finger: "right little on Shift, left ring on S",
    newKey: "KeyS",
    teach: "The ै mark is Shift+S. है is G then Shift+S. Use the other hand for Shift. S is on the left, so the right little finger holds Shift.",
    tokens: hindi(["है", "मैं", "है", "गए", "है", "ऐसे", "है", "नहीं", "है"], 2),
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "bindi-place",
    section: "matra",
    title: "Where the bindu sits",
    skill: "omatra",
    finger: "left little, at the end",
    teach: "The bindu comes after the letter or the mark, on A. में, नहीं, हैं. The bindu is the last stroke.",
    tokens: hindi(["में", "नहीं", "हैं", "हमें", "में", "नहीं", "हैं"], 2),
    min: 14, mid: 24, high: 34
  }));

  L.push(lesson({
    id: "ikar-pairs",
    section: "matra",
    title: "कि and की",
    skill: "ikar",
    finger: "F first, H after",
    teach: "One reversed mark loses the whole word, because Space locks the word in the exam. कि / की and दिन / दी need the right order.",
    tokens: hindi(["कि", "की", "दिन", "दी", "किए", "कीजिए", "लिया", "दिया", "किया", "कि", "की"], 2),
    hints: "keys",
    min: 14, mid: 24, high: 36
  }));

  L.push(lesson({
    id: "ri-matra",
    section: "matra",
    title: "Backquote is the ृ mark",
    skill: "matra",
    finger: "left little",
    newKey: "Backquote",
    teach: "Backquote, left of 1, is the ृ mark. कृ is D then backquote. कृपया, कृषि. The little finger reaches there and returns to A.",
    tokens: hindi(["कृपया", "काम", "कृपया", "सरकार", "कृपया"], 2),
    min: 12, mid: 20, high: 30
  }));

  L.push(lesson({
    id: "shift-half",
    section: "half",
    title: "Shift makes the half letter",
    skill: "half",
    finger: "Shift with the other hand",
    teach: "The half letter is the Shift of that consonant, not a separate halant key. क् is Shift+D, त् Shift+R, स् Shift+L, न् Shift+U, च् Shift+P, छ Shift+N, ज् Shift+T, ब् Shift+C. क्योंकि, नमस्ते, अच्छा, राज्य, सामान्य, सब्जी are built this way. ठ is Shift+B, so ठीक. Always Shift with the other hand.",
    tokens: hindi(["क्योंकि", "नमस्ते", "अच्छा", "राज्य", "सत्य", "सामान्य", "सब्जी", "ठीक"], 2),
    hints: "keys",
    min: 12, mid: 22, high: 32
  }));

  L.push(lesson({
    id: "stem",
    section: "half",
    title: "Half letter, then the stem",
    skill: "stem",
    finger: "half form, then K",
    teach: "ख, थ, ध, भ, श, ष, ण, and घ have no full key of their own. Type the half form, then K for the vertical stroke. Half ख is Shift+[. थ is Shift+F. ध is slash. भ is Shift+H. श is the quote key. ष is Shift+quote. ण is the period. घ is Shift+slash. Then K. In भारत, भ takes the ा mark twice.",
    tokens: hindi(["भारत", "खाना", "कथा", "ध्यान", "शाम", "घर", "भाषा", "बाण"], 2),
    hints: "keys",
    min: 12, mid: 22, high: 34
  }));

  L.push(lesson({
    id: "nukta",
    section: "half",
    title: "Nukta: बड़ा, पढ़ाई",
    skill: "stem",
    finger: "Shift and equals",
    newKey: "Equal",
    teach: "The nukta is Shift+=, the plus key. ड is Shift+M. ड़ is ड then nukta, which is how बड़ा is made. ढ is Shift+comma. ढ़ is ढ then nukta, which is पढ़ना and पढ़ाई. A missed nukta drops the whole word.",
    tokens: hindi(["बड़ा", "पढ़ना", "पहाड़", "थोड़ा", "घोड़ा", "बड़ा", "पहाड़"], 2),
    hints: "keys",
    min: 10, mid: 18, high: 28
  }));

  L.push(lesson({
    id: "reph",
    section: "conjunct",
    title: "The ्र mark and reph",
    skill: "reph",
    finger: "left little on Z",
    newKey: "KeyZ",
    teach: "Z without Shift puts र under the consonant. प्र is प then Z. क्र is क then Z. ट is Shift+V, so ट्रक is ट then Z. Shift+Z is reph. It is typed after the letter and shows up before it. In धर्म the reph is the last key.",
    tokens: hindi(["प्रकार", "क्रम", "ट्रक", "धर्म", "महत्वपूर्ण", "प्रयास", "क्रम", "धर्म", "प्रकार"], 2),
    hints: "keys",
    min: 12, mid: 22, high: 34
  }));

  L.push(lesson({
    id: "stacks",
    section: "conjunct",
    title: "ज्ञ श्र त्र क्ष द्व",
    skill: "reph",
    finger: "one key, the whole stack",
    teach: "These show up often in the exam. ज्ञ is Shift+K, श्र is Shift+J, त्र is the equals key, क्ष is Shift+[ then K, द्व is Shift+]. In श्रद्धा, द्ध is Shift+0. In विद्यालय and कार्यालय, द्य is Shift+backslash.",
    tokens: hindi(["ज्ञान", "श्रम", "त्रिभुज", "क्षमा", "द्वार", "शिक्षा", "श्रद्धा", "परिस्थिति", "विद्यालय", "कार्यालय"], 2),
    hints: "keys",
    min: 12, mid: 22, high: 34
  }));

  L.push(lesson({
    id: "vowels",
    section: "vowel",
    title: "अ आ इ ई उ ऊ ए ओ औ",
    skill: "vowel",
    finger: "bottom row, then a join",
    teach: "अ is V. आ is V then K. इ is B. ई is B then Shift+Z. उ is M. ऊ is M then W. ए is comma. ऐ is comma then S. ओ is V, K, S. औ is V, K, Shift+S. In ऊपर, ऊ is M then W. In ऑफिस, the ॉ mark is K then Shift+W, and फ is Shift+Q.",
    tokens: hindi(["और", "एक", "ऊपर", "ईंट", "ऑफिस", "उनका", "ऐसे", "ओर", "आया", "इसे", "हुए", "गए"], 2),
    hints: "hindi",
    min: 14, mid: 24, high: 34
  }));

  L.push(lesson({
    id: "sentences",
    section: "sentence",
    title: "Sentences, word lock",
    skill: "sentence",
    finger: "whole hand",
    wordlock: true,
    teach: "This is the exam rule. Space locks the word. You cannot go back. Fix a wrong mark before Space. The danda । is Shift+A. After the short-i mark, the mark waits on screen until the next letter. A wrong word is not counted.",
    tokens: hindi([
      "भारत", "की", "सरकार", "ने", "विद्यालय", "में", "शिक्षा", "की", "योजना", "लागू", "की", "है",
      "अधिकारियों", "को", "आवेदन", "के", "अनुसार", "कार्य", "करना", "होगा",
      "लोगों", "को", "सही", "जानकारी", "समय", "पर", "दिए", "जाए।"
    ]),
    hints: "hindi",
    min: 16, mid: 26, high: 36
  }));

  L.push(lesson({
    id: "sentences-2",
    section: "sentence",
    title: "Any subject",
    skill: "sentence",
    finger: "whole hand",
    wordlock: true,
    teach: "The exam will not reuse a paragraph you memorized. These lines are office, farm, health, and letters. Read the meaning and let the fingers hit the keys. Year digits come from the number row. 2024 is the keys 2, 0, 2, 4. In जरूरी, रू is Shift+semicolon. It is not र then W.",
    tokens: hindi([
      "कृषि", "विभाग", "ने", "किसानों", "के", "लिए", "नई", "योजना", "का", "विवरण", "जारी", "किया",
      "पहाड़", "पर", "पढ़ाई", "जारी", "रखी", "गए",
      "कृपया", "इस", "पत्र", "का", "उत्तर", "तीन", "दिन", "में", "दें",
      "स्वास्थ्य", "केंद्र", "पर", "डॉक्टर", "मौजूद", "हैं",
      "महत्वपूर्ण", "परिस्थिति", "में", "शांत", "रहना", "जरूरी", "है",
      "वर्ष", "2024"
    ]),
    hints: "hindi",
    min: 18, mid: 28, high: 38
  }));

  L.push(lesson({
    id: "number-row",
    section: "chart",
    title: "Number row, रु and रू",
    skill: "chart",
    finger: "the top row",
    newKey: "Semicolon",
    teach: "Digits 1 to 0 are unshifted. With Shift the chart is: 1 !, 2 /, 3 रु, 4 +, 5 ः, 6 ‘, 7 -, 8 ’, 9 ;, 0 द्ध. Shift+5 is ः. The key shows कः so a dotted circle does not appear. Minus is the English full stop. Shift+minus is ऋ. रु is Shift+3, as in रुका. रू is Shift+semicolon, as in शुरू and रूप. Shift+Y is not रू. It is half ल. Shift+0 is द्ध and Shift+] is द्व. The exam forbids Alt. The chandrabindu has no key, so it is not in this lesson.",
    tokens: hindi(["शुरू", "रूप", "रुका", "रुपया", "श्रद्धा", "2024", "कुल"], 2),
    hints: "keys",
    min: 12, mid: 20, high: 30
  }));

  KD.SECTIONS = [
    { id: "home", title: "Home row", blurb: "Bumps on F and J. कर, का, कि, के, की, सही, यह." },
    { id: "top", title: "Top row", blurb: "Reach up, then return home." },
    { id: "bottom", title: "Bottom row", blurb: "ब ग द and the vowels अ इ उ ए." },
    { id: "matra", title: "Vowel marks", blurb: "कि types the mark first. को is two keys. The bindu is last." },
    { id: "half", title: "Half letters", blurb: "Shift for the half form, then the stem and the nukta." },
    { id: "conjunct", title: "Conjuncts", blurb: "प्र, reph, ज्ञ, श्र, त्र, क्ष, द्व." },
    { id: "vowel", title: "Vowels", blurb: "Full forms from अ through औ." },
    { id: "sentence", title: "Sentences", blurb: "Space locks the word. This is the exam." },
    { id: "chart", title: "Number row", blurb: "Digits, रु, रू, and the Shift marks. Follow the chart." }
  ];

  KD.LESSONS = L;

  KD.PLACEMENT_WORDS = [
    { h: "कर", skill: "home" },
    { h: "का", skill: "home" },
    { h: "से", skill: "home" },
    { h: "यह", skill: "home" },
    { h: "कहा", skill: "home" },
    { h: "कि", skill: "ikar" },
    { h: "की", skill: "ikar" },
    { h: "दिन", skill: "ikar" },
    { h: "को", skill: "omatra" },
    { h: "लोग", skill: "omatra" },
    { h: "है", skill: "omatra" },
    { h: "में", skill: "omatra" },
    { h: "नहीं", skill: "omatra" },
    { h: "पानी", skill: "top" },
    { h: "समय", skill: "top" },
    { h: "बात", skill: "bottom" },
    { h: "गया", skill: "bottom" },
    { h: "एक", skill: "vowel" },
    { h: "और", skill: "vowel" },
    { h: "क्योंकि", skill: "half" },
    { h: "नमस्ते", skill: "half" },
    { h: "भारत", skill: "stem" },
    { h: "शिक्षा", skill: "stem" },
    { h: "बड़ा", skill: "stem" },
    { h: "प्रकार", skill: "reph" },
    { h: "धर्म", skill: "reph" },
    { h: "विद्यालय", skill: "reph" }
  ];
})(typeof globalThis !== "undefined" ? globalThis : this);

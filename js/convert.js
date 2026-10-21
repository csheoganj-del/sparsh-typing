/* Kruti Dev 010 / DevLys 010 byte stream ↔ Unicode.
   Forward map follows the widely used Kruti Dev converter.
   ि (byte f) is typed before the consonant and moved after it.
   र् (byte Z) is typed after the syllable and moved before it.
   Finger bytes follow the SIL Kruti Dev 010 chart: ] is comma, @ is /,
   $ is plus, # is रु, : is रू. $ is last so its plus is not read as nukta. */
(function (root) {
  var KD = root.KD = root.KD || {};

  var krutiSeq = [
    "ñ","Q+Z","sas","aa",")Z","ZZ","‘","’","“","”",
    "å","ƒ","„","…","†","‡","ˆ","‰","Š","‹",
    "¶+","d+","[+k","[+","x+","T+","t+","M+","<+","Q+",";+","j+","u+",
    "Ùk","Ù","ä","–","—","é","™","=kk","f=k",
    "à","á","â","ã","ºz","º","í","{k","{", "=", "«",
    "Nî","Vî","Bî","Mî","<î","|","K","}",
    "J","Vª","Mª","<ªª","Nª","Ø","Ý","nzZ","æ","ç","Á","xz","#",":",
    "v‚","vks","vkS","vk","v","b±","Ã","bZ","b","m","Å",",s",",","_",
    "ô","d","Dk","D","[k","[","x","Xk","X","Ä","?k","?","³",
    "pkS","p","Pk","P","N","t","Tk","T",">","÷","¥",
    "ê","ë","V","B","ì","ï","M+","<+","M","<",".k",".",
    "r","Rk","R","Fk","F",")","n","/k","èk","/","Ë","è","u","Uk","U",
    "i","Ik","I","Q","¶","c","Ck","C","Hk","H","e","Ek","E",
    ";","¸","j","y","Yk","Y","G","o","Ok","O",
    "'k","'","\"k","\"","l","Lk","L","g",
    "È","z",
    "Ì","Í","Î","Ï","Ñ","Ò","Ó","Ô","Ö","Ø","Ù","Ük","Ü",
    "‚","ks","kS","k","h","q","w","`","s","S",
    "a","¡","%","W","•","·","∙","·","~j","~","\\","+"," ः",
    "^","*","Þ","ß","(","¼","½","¿","À","¾","A","-","&","Œ","]","~ ","@","$"
  ];

  var uniSeq = [
    "॰","QZ+","sa","a","र्द्ध","Z","\"","\"","'","'",
    "०","१","२","३","४","५","६","७","८","९",
    "फ़्","क़","ख़","ख़्","ग़","ज़्","ज़","ड़","ढ़","फ़","य़","ऱ","ऩ",
    "त्त","त्त्","क्त","दृ","कृ","न्न","न्न्","=k","f=",
    "ह्न","ह्य","हृ","ह्म","ह्र","ह्","द्द","क्ष","क्ष्","त्र","त्र्",
    "छ्य","ट्य","ठ्य","ड्य","ढ्य","द्य","ज्ञ","द्व",
    "श्र","ट्र","ड्र","ढ्र","छ्र","क्र","फ्र","र्द्र","द्र","प्र","प्र","ग्र","रु","रू",
    "ऑ","ओ","औ","आ","अ","ईं","ई","ई","इ","उ","ऊ","ऐ","ए","ऋ",
    "क्क","क","क","क्","ख","ख्","ग","ग","ग्","घ","घ","घ्","ङ",
    "चौ","च","च","च्","छ","ज","ज","ज्","झ","झ्","ञ",
    "ट्ट","ट्ठ","ट","ठ","ड्ड","ड्ढ","ड़","ढ़","ड","ढ","ण","ण्",
    "त","त","त्","थ","थ्","द्ध","द","ध","ध","ध्","ध्","ध्","न","न","न्",
    "प","प","प्","फ","फ्","ब","ब","ब्","भ","भ्","म","म","म्",
    "य","य्","र","ल","ल","ल्","ळ","व","व","व्",
    "श","श्","ष","ष्","स","स","स्","ह",
    "ीं","्र",
    "द्द","ट्ट","ट्ठ","ड्ड","कृ","भ","्य","ड्ढ","झ्","क्र","त्त्","श","श्",
    "ॉ","ो","ौ","ा","ी","ु","ू","ृ","े","ै",
    "ं","ँ","ः","ॅ","ऽ","ऽ","ऽ","ऽ","्र","्","?","़",":",
    "‘","’","“","”",";","(",")","{","}","=", "।",".","-","µ",",",",","/","+"
  ];

  function replaceAll(str, find, repl) {
    if (!find || str.indexOf(find) === -1) return str;
    var guard = 0;
    while (str.indexOf(find) !== -1 && guard < 10000) {
      str = str.replace(find, repl);
      guard++;
    }
    return str;
  }

  function moveIkar(s) {
    var i = s.indexOf("f");
    var guard = 0;
    while (i !== -1 && guard < 10000) {
      guard++;
      if (i >= s.length - 1) break;
      var next = s.charAt(i + 1);
      s = s.slice(0, i) + next + "ि" + s.slice(i + 2);
      var wrong = s.indexOf("ि्");
      if (wrong !== -1 && wrong + 2 < s.length) {
        var cons = s.charAt(wrong + 2);
        s = s.slice(0, wrong) + "्" + cons + "ि" + s.slice(wrong + 3);
      }
      i = s.indexOf("f", i + 1);
    }
    return s;
  }

  var MATRAS = "अआइईउऊएऐओऔािीुूृेैोौं:ँॅ";

  function moveReph(s) {
    var MATRAS = "अआइईउऊएऐओऔािीुूृेैोौं:ँॅ";
    var i = s.indexOf("Z");
    var guard = 0;
    while (i > 0 && guard < 10000) {
      guard++;
      var p = i - 1;
      while (p >= 0 && MATRAS.indexOf(s.charAt(p)) !== -1) p--;
      while (p > 1 && s.charAt(p - 1) === "्") {
        p -= 2;
      }
      if (p < 0) break;
      var chunk = s.slice(p, i);
      s = s.slice(0, p) + "र्" + chunk + s.slice(i + 1);
      i = s.indexOf("Z");
    }
    return s;
  }

  function krutiToUnicode(input) {
    if (!input) return "";
    var s = String(input);
    s = s.replace(/kW/g, "‚").replace(/mw/g, "Å");
    for (var n = 0; n < krutiSeq.length; n++) {
      s = replaceAll(s, krutiSeq[n], uniSeq[n]);
    }
    s = s.replace(/±/g, "Zं");
    s = s.replace(/Æ/g, "र्f");
    s = moveIkar(s);
    s = s.replace(/Ç/g, "fa");
    s = moveReph(s);
    return s.replace(/\u200d/g, "").replace(/\u200c/g, "");
  }

  /* Unicode → finger keys. Longer clusters first.
     These are the keys a typist actually strikes, not the Alt-byte shortcuts.
     Alt bytes decode for imported documents only. RSSB speed practice does
     not accept Alt entry or alternate byte sequences that merely look alike. */
  var uniToKrutiPairs = [
    ["रू", ":"],
    ["रु", "#"],
    ["ॐ", "¥"],
    ["त्त्", "RR"], ["त्त", "Rr"], ["क्त", "Dr"], ["दृ", "n`"], ["कृ", "d`"],
    ["ह्न", "g~u"], ["ह्य", "g~;"], ["हृ", "g`"], ["ह्म", "g~e"], ["ह्र", "gz"],
    ["ट्ट", "V~V"], ["ट्ठ", "V~B"], ["ड्ड", "M~M"], ["ड्ढ", "M~<"], ["द्द", "n~n"],
    ["क्ष्", "{"], ["क्ष", "{k"], ["त्र्", "«"], ["त्र", "="], ["ज्ञ", "K"],
    ["द्व", "}"], ["श्र", "J"], ["द्य", "|"], ["द्ध", ")"],
    ["क्र", "dz"], ["फ्र", "Qz"], ["द्र", "nz"], ["प्र", "iz"], ["ग्र", "xz"], ["त्र", "="],
    ["्र", "z"],
    ["क़", "d+"], ["ख़", "[k+"], ["ग़", "x+"], ["ज़", "t+"], ["ड़", "M+"], ["ढ़", "<+"], ["फ़", "Q+"],
    ["ऑ", "vkW"], ["ओ", "vks"], ["औ", "vkS"], ["आ", "vk"], ["अ", "v"],
    ["ई", "bZ"], ["इ", "b"], ["ऊ", "mw"], ["उ", "m"], ["ऐ", ",s"], ["ए", ","], ["ऋ", "_"],
    ["क्क", "Ddk"], ["क्", "D"], ["क", "d"], ["ख्", "["], ["ख", "[k"],
    ["ग्", "X"], ["ग", "x"], ["घ्", "?"], ["घ", "?k"], ["ङ", "³"],
    ["च्", "P"], ["च", "p"], ["छ", "N"], ["ज्", "T"], ["ज", "t"], ["झ्", "÷"], ["झ", ">"], ["ञ", "¥"],
    ["ट", "V"], ["ठ", "B"], ["ड", "M"], ["ढ", "<"],
    ["ण्", "."], ["ण", ".k"],
    ["त्", "R"], ["त", "r"], ["थ्", "F"], ["थ", "Fk"],
    ["ध्", "/"], ["ध", "/k"], ["द्", "n~"], ["द", "n"], ["न्", "U"], ["न", "u"],
    ["प्", "I"], ["प", "i"], ["फ्", "¶"], ["फ", "Q"],
    ["ब्", "C"], ["ब", "c"], ["भ्", "H"], ["भ", "Hk"],
    ["म्", "E"], ["म", "e"],
    ["य्", ";~"], ["य", ";"], ["र", "j"], ["ल्", "Y"], ["ल", "y"], ["ळ", "G"],
    ["व्", "O"], ["व", "o"],
    ["श्", "'"], ["श", "'k"], ["ष्", "\""], ["ष", "\"k"],
    ["स्", "L"], ["स", "l"], ["ह्", "g~"], ["ह", "g"],
    ["ॉ", "kW"], ["ो", "ks"], ["ौ", "kS"], ["ा", "k"], ["ी", "h"],
    ["ु", "q"], ["ू", "w"], ["ृ", "`"], ["े", "s"], ["ै", "S"],
    ["ँ", "¡"], ["ं", "a"], ["ः", "%"], ["ॅ", "W"], ["़", "+"],
    ["।", "A"], ["॥", "AA"], ["?", "\\"],
    [",", "]"], ["/", "@"], ["+", "$"], [".", "-"],
    ["-", "&"], ["\u2018", "^"], ["\u2019", "*"], [";", "("],
    ["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"],
    ["5", "5"], ["6", "6"], ["7", "7"], ["8", "8"], ["9", "9"],
    ["०", "0"], ["१", "1"], ["२", "2"], ["३", "3"], ["४", "4"],
    ["५", "5"], ["६", "6"], ["७", "7"], ["८", "8"], ["९", "9"]
  ];

  function placeIkar(s) {
    var i = s.indexOf("ि");
    var guard = 0;
    while (i > 0 && guard < 10000) {
      guard++;
      var left = i - 1;
      while (left > 0 && s.charAt(left - 1) === "्") left -= 2;
      if (left < 0) break;
      s = s.slice(0, left) + "f" + s.slice(left, i) + s.slice(i + 1);
      i = s.indexOf("ि", left + 2);
    }
    return s;
  }

  function placeReph(s) {
    var matra = "ािीुूृेैोौं:ँॅ";
    s = s + "  ";
    var i = s.indexOf("र्");
    var guard = 0;
    while (i >= 0 && guard < 10000) {
      guard++;
      var p = i + 2;
      if (p >= s.length) break;
      while (p < s.length - 1) {
        if (matra.indexOf(s.charAt(p + 1)) !== -1) {
          p++;
        } else if (s.charAt(p + 1) === "्" && p + 2 < s.length - 1) {
          p += 2;
        } else {
          break;
        }
      }
      var chunk = s.slice(i + 2, p + 1);
      s = s.slice(0, i) + chunk + "Z" + s.slice(p + 1);
      i = s.indexOf("र्");
    }
    return s.slice(0, -2);
  }

  function unicodeToKruti(input) {
    if (!input) return "";
    var s = String(input).replace(/\u200d/g, "").replace(/\u200c/g, "");
    s = s.replace(/क़/g, "क़").replace(/ख़/g, "ख़").replace(/ग़/g, "ग़").replace(/ज़/g, "ज़").replace(/ज़/g, "ज़").replace(/ड़/g, "ड़").replace(/ढ़/g, "ढ़").replace(/फ़/g, "फ़");
    s = placeIkar(s);
    s = placeReph(s);
    var pairs = uniToKrutiPairs.slice().sort(function (a, b) {
      return b[0].length - a[0].length;
    });
    var out = "";
    var i = 0;
    while (i < s.length) {
      var hit = false;
      for (var n = 0; n < pairs.length; n++) {
        var u = pairs[n][0];
        if (u && s.substr(i, u.length) === u) {
          out += pairs[n][1];
          i += u.length;
          hit = true;
          break;
        }
      }
      if (!hit) {
        var ch = s.charAt(i);
        if (ch === " " || ch === "\n") out += ch;
        else out += ch;
        i++;
      }
    }
    return out;
  }

  function cleanUni(s) {
    return String(s || "").replace(/\u200d/g, "").replace(/\u200c/g, "").normalize("NFC").replace(/\s+/g, " ").trim();
  }

  KD.krutiToUnicode = krutiToUnicode;
  KD.unicodeToKruti = unicodeToKruti;
  KD.cleanUni = cleanUni;
})(typeof globalThis !== "undefined" ? globalThis : this);

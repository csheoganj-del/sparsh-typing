/* Unseen sentences. The exam passage is built by shuffling these,
   so it is never a paragraph you can memorize. */
(function (root) {
  var KD = root.KD = root.KD || {};

  KD.HI_SENTENCES = [
    "भारत सरकार ने विद्यालय में नई शिक्षा योजना लागू की है।",
    "अधिकारियों को आवेदन के अनुसार समय पर कार्य करना होगा।",
    "कृषि विभाग किसानों के लिए योजना का विवरण जारी करेगा।",
    "कृपया इस पत्र का उत्तर तीन दिन में भेजें।",
    "पहाड़ पर बच्चों की पढ़ाई जारी रहनी चाहिए।",
    "स्वास्थ्य केंद्र पर डॉक्टर सुबह से शाम तक मौजूद रहते हैं।",
    "महत्वपूर्ण परिस्थिति में शांत रहना जरूरी है।",
    "शहर में पानी की व्यवस्था सुधारने का काम शुरू हुआ।",
    "रेलवे स्टेशन पर यात्रियों के लिए साफ पानी रखा गया है।",
    "बच्चों को सही भाषा और अच्छा व्यवहार सिखाना होगा।",
    "कार्यालय में हर पत्र को नंबर देकर फाइल में रखें।",
    "माता ने बच्चे को एक नई कहानी सुनाई।",
    "घोड़ा नदी के पास खड़ा था और पानी पी रहा था।",
    "धर्म और श्रम दोनों समाज के लिए आवश्यक हैं।",
    "ज्ञान से ही व्यक्ति सही निर्णय ले सकता है।",
    "क्योंकि समय कम है इसलिए काम आज ही पूरा करें।",
    "ऑफिस का दरवाजा सुबह नौ बजे खुलता है।",
    "वर्ष 2024 में कई नई सड़कें बनकर तैयार हुई हैं।",
    "विद्यालय के शिक्षक ने माता पिता को पत्र लिखा।",
    "परिस्थिति सामान्य होने तक यात्रा न करें।",
    "क्षमा मांगने के बाद ही बात आगे बढ़ी।",
    "द्वार पर खड़े व्यक्ति से नाम और पता पूछें।",
    "श्रद्धा से किया गया काम आधा आसान हो जाता है।",
    "थोड़ा ध्यान दें तो गलती खुद दिख जाएगी।",
    "बड़ा पहाड़ पार करने में कई दिन लग गए।",
    "ईंट और रेत दोनों मौके पर पहुंच गए हैं।",
    "ऊपर वाले कमरे में पुरानी फाइल रखी है।",
    "उनके अनुसार यह योजना सबके लिए लाभदायक है।",
    "हमने कल सुबह मैदान में एक सभा की थी।",
    "यदि नियम स्पष्ट हो तो विवाद नहीं होता।",
    "लेकिन देरी से आया उत्तर काम का नहीं रहा।",
    "एक अच्छा वाक्य कम शब्दों में पूरी बात कह देता है।",
    "प्रकार और क्रम दोनों का रोज अभ्यास करें।",
    "नमस्ते कहकर बात शुरू करना सही तरीका है।",
    "प्रशासन को गांव तक सड़क और पानी पहुंचाना है।",
    "आंखों में दर्द हो तो तुरंत चिकित्सक को दिखाएं।",
    "भक्ति और सेवा दोनों का स्थान समाज में है।",
    "ट्रक समय पर माल लेकर शहर पहुंचा।",
    "खट्टा फल भी शरीर के लिए उपयोगी होता है।",
    "गद्दी पर बैठकर पुराना हिसाब जांचें।",
    "फ्रांस से आए अतिथि कल कार्यालय में मिलेंगे।",
    "कृषि और सिंचाई की बात बैठक में रखी गई।",
    "लोगों ने मेले में बहुत आनंद लिया।",
    "सरकार ने गरीब परिवार को राशन देने का आदेश दिया।",
    "छात्र को शांत बैठकर पूरा पाठ पढ़ना चाहिए।",
    "नदी का पानी खेत तक पहुंचाने की योजना बनी है।",
    "कृपया रसीद संभालकर रखें और प्रतिलिपि ले लें।",
    "इस वर्ष बारिश कम हुई तो फसल पर असर पड़ेगा।",
    "अधिकारी ने रिपोर्ट पढ़कर हस्ताक्षर कर दिए।",
    "बच्चों की माता उन्हें रोज विद्यालय छोड़ने आती है।"
  ];

  KD.EN_SENTENCES = [
    "The office will remain open from nine in the morning until six in the evening.",
    "Please read the letter carefully and send a reply within three working days.",
    "Every file must carry a number, a date and the name of the dealing clerk.",
    "The committee approved the road plan after a long and quiet discussion.",
    "Candidates should reach the center fifteen minutes before the test begins.",
    "A correct word is worth more than a fast word that has to be locked wrong.",
    "The manager asked the staff to check the figures before signing the report.",
    "Clean water, a working fan and enough light are required in the exam hall.",
    "Do not leave any blank line unless the instruction on the sheet asks for it.",
    "The village school received new books for the children on Monday morning.",
    "He wrote the notice in simple words so that every reader could follow it.",
    "The train was late, so the passengers waited on the platform with patience.",
    "Keep both feet flat, sit straight, and look at the screen rather than the keys.",
    "Accuracy comes first. Speed grows after the fingers remember the right keys.",
    "The clerk compared the two lists and marked each difference in red ink.",
    "A public notice was placed on the board outside the municipal office.",
    "Please bring the original certificate and one photocopy to the interview.",
    "The doctor advised rest, clean water and a light meal for the next two days.",
    "Work that is finished on time still fails if the names and dates are wrong.",
    "The farmer thanked the team that repaired the canal before the crop season.",
    "She locked the drawer, switched off the light and left the room at five.",
    "Read the whole sentence once, then type it without rushing the small words.",
    "The annual report describes the work done in schools, roads and health centers.",
    "If you press space too early, that word is locked and the mark is lost.",
    "The city planted trees along the main road during the first week of July.",
    "Staff must not share their password or leave a signed form on the desk.",
    "The meeting ended with a clear list of tasks and the names of the people responsible.",
    "Children were asked to write their names neatly at the top of the page.",
    "The store issued a receipt for the paper, the ink and the new register.",
    "A short practice every day builds a steadier hand than one long session.",
    "The officer returned the incomplete form and explained what was missing.",
    "Please confirm the spelling of the place name before you type the address.",
    "The library will add Hindi and English newspapers from the coming month.",
    "He corrected the date, saved the file and printed a single clean copy.",
    "Good posture keeps the wrists light and the fingers free to move home.",
    "The test rewards finished correct words, not the speed you claim at home."
  ];

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function hindiWords(sentences) {
    var words = [];
    sentences.forEach(function (line) {
      line.split(/\s+/).forEach(function (h) {
        if (!h) return;
        var k = KD.unicodeToKruti(h);
        var back = KD.cleanUni(KD.krutiToUnicode(k));
        if (back === KD.cleanUni(h)) words.push({ h: h, k: k });
        else if (typeof console !== "undefined") console.warn("drop", h, k, back);
      });
    });
    return words;
  }

  KD.buildHindiPassage = function (count) {
    var words = [];
    var guard = 0;
    while (words.length < count && guard < 12) {
      words = words.concat(hindiWords(shuffle(KD.HI_SENTENCES)));
      guard++;
    }
    return words.slice(0, count).map(function (w) {
      return { h: w.h, k: w.k, lang: "hi" };
    });
  };

  KD.buildEnglishPassage = function (count) {
    var words = [];
    var guard = 0;
    while (words.length < count && guard < 12) {
      shuffle(KD.EN_SENTENCES).forEach(function (line) {
        line.split(/\s+/).forEach(function (w) {
          if (w) words.push(w);
        });
      });
      guard++;
    }
    return words.slice(0, count).map(function (w) {
      return { h: w, k: w, lang: "en" };
    });
  };

  KD.passageHealth = function () {
    var kept = hindiWords(KD.HI_SENTENCES);
    var raw = 0;
    KD.HI_SENTENCES.forEach(function (s) { raw += s.split(/\s+/).filter(Boolean).length; });
    return { kept: kept.length, raw: raw, lines: KD.HI_SENTENCES.length };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* Expand the original Hindi lessons into introduction → combination → words
   → cumulative review. Original IDs remain stable for saved history. */
(function (root) {
  var KD = root.KD, original = KD.LESSONS.slice(), course = [], known = [], pool = [];
  var homes = { lp: 'KeyA', lr: 'KeyS', lm: 'KeyD', li: 'KeyF', ri: 'KeyJ', rm: 'KeyK', rr: 'KeyL', rp: 'Semicolon' };
  var levels = { home: [3, 6, 10], top: [5, 10, 15], bottom: [5, 12, 18], matra: [6, 14, 22], half: [3, 8, 14], conjunct: [4, 10, 18], vowel: [6, 14, 24] };
  function token(k) { return { k: k, h: KD.preview(k) || KD.krutiToUnicode(k) }; }
  function ids(tokens) {
    return KD.buildSteps(tokens).map(KD.actionId).filter(function (id, i, all) { return id && all.indexOf(id) === i; });
  }
  function unique(tokens) {
    var seen = {};
    return tokens.filter(function (t) { if (!t || !t.h || seen[t.k]) return false; seen[t.k] = true; return true; });
  }
  function append(lesson) {
    lesson.allowed = known.slice();
    lesson.required = ids(lesson.tokens || []);
    lesson.requiredPairs = [];
    (lesson.tokens || []).forEach(function (t) {
      var actions = KD.tokenActions(t);
      for (var i = 1; i < actions.length; i++) {
        var pair = actions[i - 1] + '>' + actions[i];
        if (lesson.requiredPairs.indexOf(pair) < 0) lesson.requiredPairs.push(pair);
      }
    });
    lesson.reviewPool = unique(pool).filter(function (t) { return KD.allowedToken(t, known); }).slice(-100);
    course.push(lesson);
    pool = unique(pool.concat(lesson.tokens || []));
  }
  function unit(id) {
    var meta = KD.BY_CODE[id.replace(/\+S$/, '')], shifted = id.slice(-2) === '+S';
    var ch = shifted ? meta.shifted : meta.normal;
    if (ch === 'f') return known.indexOf('KeyJ') >= 0 ? 'fj' : 'f';
    if (ch === '`' && known.indexOf('KeyD') >= 0) return 'd`';
    if (ch === 'z' && known.indexOf('KeyD') >= 0) return 'dz';
    if ('ksShaqw`z~%'.indexOf(ch) >= 0 && known.indexOf('KeyJ') >= 0) return 'j' + ch;
    if (ch === 'W' && known.indexOf('KeyK') >= 0) return 'jkW';
    if (ch === 'Z') return 'jZ';
    if (ch === '+' && known.indexOf('KeyM+S') >= 0) return 'M+';
    if (shifted && /^[A-Z\[{]$/.test(ch) && known.indexOf('KeyJ') >= 0) return ch + 'j';
    return ch;
  }
  function introduce(id, source) {
    var meta = KD.BY_CODE[id.replace(/\+S$/, '')], shifted = id.slice(-2) === '+S';
    var label = KD.actionLabel(id), keyId = id.replace('+S', '-shift');
    var base = homes[meta.finger], home = KD.BY_CODE[base];
    var shiftCopy = shifted ? 'Hold the ' + KD.shiftHand(meta.finger) + ' Shift with the opposite little finger. Release it after the character. ' : '';
    known.push(id);
    var k = unit(id), first = course.length === 0;
    var intro = { id: 'learn-' + keyId, parentId: source.id, section: source.section, skill: source.skill,
      title: 'Learn ' + label, newKey: meta.code, introduces: [id], scoreFree: true, stage: 'introduction',
      oppositeShift: shifted, finger: KD.FINGERS[meta.finger].name, hints: 'keys', min: 0, mid: 0, high: 0, acc: 100,
      teach: label + ' uses your ' + KD.FINGERS[meta.finger].name + ' finger. ' + shiftCopy +
        (meta.code === base ? 'Rest this finger on its home key. ' : 'Start at ' + home.legend + ', reach to ' + meta.legend + ', then return to ' + home.legend + '. ') +
        (id === 'KeyF' ? 'F types the Hindi ि मात्रा. Press F, then J to make रि. The mark appears to the left of र; it is not an English f. Press Space between groups. ' : '') +
        (id === 'Backquote' ? 'The backtick key adds the Hindi ृ मात्रा. Press D, then backtick to make कृ, as in कृपया. This mark is different from the separate vowel ऋ in ऋषि. ' : '') +
        (id === 'KeyZ' ? 'Z adds the joined र sign (्र) to a consonant. Press D, then Z to make क्र, as in क्रम. It is a joining sign, not a separate Hindi letter. ' : '') +
        (id === 'Digit2+S' ? 'On a standard English (US) keyboard, @ is printed above 2. DevLys 010 displays that key as /. Hold right Shift and press 2 to type /; the physical slash key has a different Hindi output. ' : '') +
        'Watch the highlighted key. There is no speed goal in this introduction.',
      tokens: first ? [token(k.repeat(6))] : [token(k), token(k), token(k), token(k), token(k), token(k)] };
    append(intro);
    if (first) {
      known.push('Space');
      append({ id: 'learn-space', parentId: source.id, section: 'home', skill: 'home', title: 'Learn Space', introduces: ['Space'],
        scoreFree: true, stage: 'introduction', hints: 'keys', finger: 'thumb', min: 0, mid: 0, high: 0, acc: 100,
        teach: 'Tap Space with a thumb between groups. Keep both index fingers on the F and J bumps. There is no speed goal.', tokens: [token('j'), token('j'), token('j'), token('j')] });
    }
    var familiar = unique(pool).filter(function (t) { return KD.allowedToken(t, known) && t.k.length <= 6; }).slice(-4);
    var practice = [token(k), token(k + k), token(k), token(k + k)];
    familiar.forEach(function (t) { practice.push(t, token(k)); });
    append({ id: 'combine-' + keyId, parentId: source.id, section: source.section, skill: source.skill,
      title: 'Combine ' + label, stage: 'combination', oppositeShift: shifted, newKey: meta.code, hints: 'keys',
      min: 3, mid: 6, high: shifted ? 10 : 12, acc: 90, finger: KD.FINGERS[meta.finger].name,
      teach: 'Use ' + label + ' in short groups with keys you already know. Keep the presses separate and steady. ' + shiftCopy +
        (id === 'KeyF' ? 'रि is र with the Hindi ि मात्रा, not an English f. Type F then J for each रि, and Space between groups. ' : '') +
        (id === 'KeyZ' ? 'Type D then Z for क्र, as in क्रम. Z adds the joined र sign to क. Press Space between groups. ' : ''),
      tokens: practice });
  }
  function review(section, source) {
    var candidates = unique(pool).filter(function (t) { return KD.allowedToken(t, known); }).slice(-36);
    if (!candidates.length) return;
    var selected = candidates.filter(function (_, i) { return i % 2 === 0; }).slice(0, 16);
    append({ id: 'review-' + section, parentId: source.id, section: section, skill: source.skill, title: 'Review ' + section,
      stage: 'review', hints: 'hindi', min: 5, mid: 12, high: 20, acc: 94,
      teach: 'Review familiar keys and combinations. This lesson keeps the same text on reload and retry. Use weak-key practice for extra work on difficult combinations.', tokens: selected });
  }
  function fillKeyboard(source) {
    KD.ROWS.forEach(function (row) { row.forEach(function (meta) {
      [false, true].forEach(function (shift) {
        var id = meta.code + (shift ? '+S' : '');
        if (known.indexOf(id) < 0 && KD.stepsFromKruti(shift ? meta.shifted : meta.normal).every(function (s) { return s.type !== 'alt' && s.code !== 'UNMAPPED'; })) introduce(id, source);
      });
    }); });
  }
  function travel() {
    var paths = { lp: ['KeyA', 'KeyQ', 'KeyZ'], lr: ['KeyS', 'KeyW', 'KeyX'], lm: ['KeyD', 'KeyE', 'KeyC'], li: ['KeyF', 'KeyR', 'KeyV'],
      ri: ['KeyJ', 'KeyU', 'KeyN'], rm: ['KeyK', 'KeyI', 'KeyM'], rr: ['KeyL', 'KeyO', 'Comma'], rp: ['Semicolon', 'KeyP', 'Slash'] };
    Object.keys(paths).forEach(function (finger) {
      var path = paths[finger], labels = path.map(KD.actionLabel), sequence = [path[0], path[1], path[0], path[2], path[0]];
      var tokens = sequence.map(function (id) { return token(unit(id)); });
      append({ id: 'travel-' + finger, section: 'travel', skill: 'travel', stage: 'combination', title: 'Travel: ' + KD.FINGERS[finger].name,
        finger: KD.FINGERS[finger].name, hints: 'keys', min: 3, mid: 8, high: 15, acc: 94,
        teach: 'Move your ' + KD.FINGERS[finger].name + ' finger from ' + labels[0] + ' to ' + labels[1] + ', return to ' + labels[0] + ', then reach ' +
          labels[2] + ' and return home. र supplies a base when a key is a dependent vowel mark.', tokens: tokens.concat(tokens, tokens) });
    });
  }
  var patterns = [
    ['कि', ['किस', 'किताब', 'किसान'], 'Press F before the consonant. The visible mark sits to its left.'],
    ['की', ['की', 'खिड़की', 'लड़की'], 'Press the consonant first, then H. Compare this with short ि.'],
    ['को', ['को', 'लोग', 'उनको'], 'The ो mark needs K then S after the consonant.'],
    ['कौ', ['कौन', 'कौशल', 'और'], 'Press K, then Shift + S. Use the opposite Shift.'],
    ['में', ['में', 'हमें', 'कमरे'], 'E, S, then A. The bindu comes after the vowel mark.'],
    ['नहीं', ['नहीं', 'यहीं', 'कहीं'], 'Finish the long vowel before adding the bindu.'],
    ['है', ['है', 'हैं', 'जैसे'], 'G then Shift + S makes है. Add A last for हैं.'],
    ['था', ['था', 'थी', 'थे'], 'Shift + F then K. Release Shift before the vowel mark.'],
    ['प्र', ['प्रकार', 'प्रश्न', 'प्रगति'], 'Type प first, then the ्र combination.'],
    ['क्र', ['क्रम', 'क्रिया', 'कार्य'], 'Practise the two key combination before using it in a word.'],
    ['र्म', ['धर्म', 'कर्म', 'निर्माण'], 'Type the syllable first and reph last, even though र is read first.'],
    ['ज्ञ', ['ज्ञान', 'विज्ञान', 'ज्ञानी'], 'Shift + K produces the complete ज्ञ combination.'],
    ['श्र', ['श्रम', 'श्रद्धा', 'श्री'], 'Shift + J produces श्र. Release Shift before the next mark.'],
    ['त्र', ['पत्र', 'मित्र', 'त्रिभुज'], 'The equals key produces त्र.'],
    ['क्ष', ['क्षमा', 'शिक्षा', 'रक्षा'], 'Shift + [ gives the half form, followed by K.'],
    ['द्व', ['द्वार', 'द्वारा', 'द्वितीय'], 'Shift + ] produces the joined form.'],
    ['ड़', ['बड़ा', 'लड़का', 'पहाड़'], 'Shift + M then Shift + equals adds the nukta.'],
    ['ढ़', ['पढ़ाई', 'पढ़ना', 'बढ़ना'], 'Shift + comma then Shift + equals adds the nukta.'],
    ['रु', ['रुका', 'रुपया', 'रुकना'], 'Shift + 3 is रु.'],
    ['रू', ['रूप', 'शुरू', 'जरूरी'], 'Shift + semicolon is रू. Compare it with रु.']
  ];
  function commonPatterns() {
    patterns.forEach(function (spec, i) {
      var focus = KD.safeToken(spec[0]);
      var words = spec[1].map(KD.safeToken).filter(Boolean);
      if (!focus || !KD.allowedToken(focus, known)) return;
      var practice = [focus, focus, focus].concat(words.filter(function (t) { return KD.allowedToken(t, known); }));
      append({ id: 'pattern-' + i, section: 'patterns', skill: 'patterns', title: 'Pattern: ' + spec[0], stage: 'combination',
        hints: 'keys', oppositeShift: true, min: 5, mid: 12, high: 22, acc: 94, teach: spec[2] + ' Repeat the combination, then use it in words.', tokens: practice.concat(practice) });
    });
    review('patterns', { id: '', skill: 'patterns' });
  }
  original.forEach(function (source, index) {
    if (source.id === 'w-common') { fillKeyboard({ id: '', section: 'chart', skill: 'chart' }); review('chart-full', { id: '', skill: 'chart' }); travel(); commonPatterns(); }
    var newActions = ids(source.tokens || []).filter(function (id) { return id !== 'Space' && known.indexOf(id) < 0; });
    newActions.forEach(function (id) { introduce(id, source); });
    var lesson = Object.assign({}, source);
    lesson.wordlock = false; // Course practice uses character corrections; exams retain word locking.
    if (levels[lesson.section]) { var goal = levels[lesson.section]; lesson.min = goal[0]; lesson.mid = goal[1]; lesson.high = goal[2]; lesson.acc = 90; }
    lesson.introduces = [];
    lesson.stage = lesson.stage || 'practice';
    if (lesson.id === 'anchor-j' || lesson.id === 'anchor-f') {
      lesson.anchor = lesson.id === 'anchor-j' ? 'KeyJ' : 'KeyF';
      lesson.teach = 'Hold ' + KD.actionLabel(lesson.anchor) + ' with the resting index finger. Keep it held while the ' + lesson.hand +
        ' hand types. Space still uses a thumb. If you release the anchor, typing waits until you hold it again.';
    }
    append(lesson);
    var next = original[index + 1];
    if (!next || next.section !== source.section) review(source.section, source);
  });
  KD.SECTIONS.splice(KD.SECTIONS.findIndex(function (s) { return s.id === 'words'; }), 0,
    { id: 'patterns', title: 'Common Hindi combinations', blurb: 'Short combinations first, then familiar words. Compare marks that are easy to confuse.' });
  // Keep the section list in course order, including the extra full keyboard review.
  KD.SECTIONS.push({ id: 'chart-full', title: 'Full keyboard review', blurb: 'Numbers and remaining combinations, one key at a time.' });
  KD.SECTIONS.push({ id: 'travel', title: 'Finger travel', blurb: 'Reach to the top or bottom row and return to the home key.' });
  KD.LESSONS = course;
})(typeof globalThis !== 'undefined' ? globalThis : this);

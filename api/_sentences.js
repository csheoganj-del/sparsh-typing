for (const f of ['convert','keys','engine','lessons','words','teaching']) require('../js/'+f);
const COMMON = new Set('का के की को से में पर ने और है हैं था थी थे यह वह एक भी तो ही जो लिए तक कर किया गई गया दिए दिया'.split(' '));
function nearDuplicate(a, b) {
  const words = text => String(text).replace(/[।,?!-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const allA = words(a), allB = words(b);
  if (allA.join(' ') === allB.join(' ')) return true;
  const content = list => new Set(list.filter(word => !COMMON.has(word)));
  const left = content(allA), right = content(allB);
  if (Math.min(left.size, right.size) < 4) return false;
  const overlap = [...left].filter(word => right.has(word)).length;
  return overlap / Math.max(left.size, right.size) >= 0.8;
}
function configuredKey(env, readLocal) {
  env = env || process.env;
  const key = String(env.GEMINI_API_KEY || '').trim() || String(env.GOOGLE_API_KEY || '').trim();
  if (key || env.VERCEL === '1') return key;
  try {
    return String(readLocal ? readLocal() : require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'gemini.key'), 'utf8')).trim();
  } catch (e) { return ''; }
}
function validate(data, recent, weak) {
  if (!data || !Array.isArray(data.sentences) || data.sentences.length < 2 || data.sentences.length > 3) throw Error('Invalid sentences');
  const sentences = data.sentences.map(s => typeof s === 'string' ? s.trim().replace(/\s+/g,' ') : '');
  if (new Set(sentences).size !== sentences.length) throw Error('Repeated sentence');
  const clauses=sentences.flatMap(s=>(s.match(/[^।]+।/g)||[]).map(v=>v.trim()));
  const previous=recent.flatMap(s=>(s.match(/[^।]+।/g)||[]).map(v=>v.trim()));
  if(new Set(clauses).size!==clauses.length)throw Error('Repeated sentence');
  if(clauses.some(s=>previous.includes(s)))throw Error('Previously practised sentence');
  if (clauses.length < 2 || clauses.length > 3) throw Error('Invalid sentence count');
  if (clauses.some((s, i) => clauses.slice(0, i).some(old => nearDuplicate(s, old)))) throw Error('Repeated sentence wording');
  if (clauses.some(s => previous.some(old => nearDuplicate(s, old)))) throw Error('Previously practised sentence wording');
  const tokens=[];
  for (const s of sentences) {
    if (s.length > 500 || !/^[\u0900-\u097f\s,।?!0-9-]+$/.test(s) || !s.endsWith('।')) throw Error('Invalid Hindi sentence');
    if (recent.some(old => old === s || old.includes(s))) throw Error('Previously practised sentence');
    if (/^(इससे|ताकि)\s+/.test(s)) throw Error('Banned cliché sentence opening');
    if (/सुचारू रूप से|लाभ मिल सकेगा/.test(s)) throw Error('Banned cliché phrase');
    for (const word of s.split(' ')) {
      const token=KD.safeToken(word); if (!token) throw Error('Unsupported DevLys word: '+word); tokens.push(token);
    }
  }
  if (tokens.length < 20 || tokens.length > 70) throw Error('Sentence length out of range');
  const actions=KD.buildSteps(tokens).map(KD.actionId);
  if (weak.length && !weak.some(id=>actions.includes(id))) throw Error('Missing target keys');
  return {tokens,sentenceIds:clauses,source:'gemini',aiGenerated:true};
}
async function generate(input) {
  input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const key=configuredKey();
  if (!key) throw Error('AI is not configured');
  const weak=(Array.isArray(input.weakKeys) ? input.weakKeys : []).filter(id=>typeof id==='string' && KD.BY_CODE[id.replace(/\+S$/,'')]).slice(0,6);
  const recent=(Array.isArray(input.recent) ? input.recent : []).filter(s=>typeof s==='string').map(s=>s.trim().replace(/\s+/g, ' ').slice(0,500)).slice(-96);
  const slowPairs = (Array.isArray(input.slowPairs) ? input.slowPairs : []).filter(id => typeof id === 'string' && id.split('>').length === 2 && id.split('>').every(keyId => KD.BY_CODE[keyId.replace(/\+S$/, '')])).slice(0,4);
  const recentWords = (Array.isArray(input.recentWords) ? input.recentWords : []).filter(w => typeof w === 'string' && w.length >= 2).slice(-40);
  if (!recentWords.length && recent.length) {
    const wordList = recent.flatMap(s => s.replace(/[।,?!-]/g, ' ').trim().split(/\s+/).filter(Boolean));
    for (let i = wordList.length - 1; i >= 0; i--) {
      const w = wordList[i];
      if (w.length >= 2 && !COMMON.has(w) && !recentWords.includes(w)) {
        recentWords.push(w);
        if (recentWords.length >= 30) break;
      }
    }
  }
  const training = {};
  if (input.training && typeof input.training === 'object' && !Array.isArray(input.training)) {
    for (const name of ['baselineWpm', 'targetWpm', 'firstTryAccuracy', 'goalWpm', 'durationDays', 'day']) {
      const value = input.training[name];
      if (Number.isFinite(value) && value >= 0 && value <= (name === 'firstTryAccuracy' ? 100 : 300)) training[name] = value;
    }
    if (typeof input.training.plateau === 'boolean') training.plateau = input.training.plateau;
  }
  const focus=weak.map(id=>{
    const meta=KD.BY_CODE[id.replace(/\+S$/,'')], raw=id.endsWith('+S')?meta.shifted:meta.normal;
    return {physicalKey:id,exampleHindiOutput:KD.keyFace(raw)};
  });
  const pairFocus = slowPairs.map(pair => {
    const parts = pair.split('>');
    const m1 = KD.BY_CODE[parts[0].replace(/\+S$/, '')], m2 = KD.BY_CODE[parts[1].replace(/\+S$/, '')];
    if (!m1 || !m2) return { pair };
    const r1 = parts[0].endsWith('+S') ? m1.shifted : m1.normal;
    const r2 = parts[1].endsWith('+S') ? m2.shifted : m2.normal;
    const h1 = KD.keyFace(r1), h2 = KD.keyFace(r2);
    let combo = '';
    try { combo = KD.krutiToUnicode ? KD.cleanUni(KD.krutiToUnicode(r1 + r2)) : ''; } catch (e) {}
    const examples = [];
    const pool = (KD.HI_SENTENCES || []).flatMap(s => s.split(/\s+/)).concat(Object.values(KD.KEY_WORDS || {}).flat());
    for (const raw of pool) {
      const w = String(raw).replace(/[।,!?]/g, '').trim();
      if (!w || examples.includes(w) || w.length < 2) continue;
      const t = KD.safeToken(w);
      if (!t) continue;
      const acts = KD.tokenActions ? KD.tokenActions(t) : KD.buildSteps([t]).map(KD.actionId);
      for (let i = 1; i < acts.length; i++) {
        if (acts[i - 1] === parts[0] && acts[i] === parts[1]) {
          examples.push(w);
          break;
        }
      }
      if (examples.length >= 4) break;
    }
    return {
      pair,
      keys: parts[0] + ' (' + h1 + ') -> ' + parts[1] + ' (' + h2 + ')',
      hindiCombination: combo || (h1 + ' + ' + h2),
      exampleWords: examples
    };
  });
  const goalWpm = training.goalWpm || 45;
  const durationDays = training.durationDays || 20;
  const currentDay = training.day || 1;
  const targetPace = training.targetWpm || 35;
  const THEMES = [
    'Official RSSB Exam Theme - Rajasthan Geography & Nature: Thar desert dunes, Aravali mountain ranges, Chambal and Banas rivers, Sambhar lake, desert flora.',
    'Official RSSB Exam Theme - Historical Forts & Architecture: Chittorgarh and Kumbhalgarh ramparts, Mehrangarh, Jaisalmer golden fort, Shekhawati havelis, stepwells (baoris), handicrafts.',
    'Official RSSB Exam Theme - Agriculture, Irrigation & Water Systems: Indira Gandhi canal greening the desert, drip and sprinkler irrigation, Johad and Tanka water harvesting, millet and mustard fields.',
    'Official RSSB Exam Theme - Wildlife, Forests & Clean Energy: Ranthambore tigers, Keoladeo bird sanctuary, sacred Khejri tree, Bhadla solar park, wind energy farms in Jaisalmer.',
    'Official RSSB Exam Theme - Modern Public Life & Digital Governance: E-Mitra rural services, public libraries for students, digital literacy, diligence and time management.',
    'Real-Life - Morning Chai & Neighborhood Life: tea stall conversations, early morning walks, waking up to birdsong, local street vendors, fresh bread, crisp morning air.',
    'Real-Life - Travel, Trains & Roads: passenger train journeys, window seat scenery, platform chai, village roads, evening bus rides, bicycle rides through green fields.',
    'Real-Life - Weather, Seasons & Nature: first rain on dry summer soil, afternoon shade under a neem tree, winter morning mist, sunsets over the hills, blooming courtyard flowers.',
    'Real-Life - Food, Kitchen & Flavors: aroma of ginger tea, steaming hot rotis, seasonal vegetables in the market, earthen clay water pots, traditional sweets.',
    'Real-Life - Daily Crafts, Market & Hard Work: blacksmith at work, potter shaping clay, tailor measuring cloth, bustling evening market, honest daily labor, local artisans.',
    'Real-Life - Thoughtful Reflections & Life Wisdom: power of patience, finding peace in small moments, how daily steady practice builds confidence, staying calm under pressure.'
  ];
  const pickedTheme = input.theme || THEMES[Math.floor(Math.random() * THEMES.length)];
  const bannedCliches = [
    'इससे', 'सुचारू', 'परिसर', 'आयोजन', 'तहत', 'सकेगा', 'सकेगी', 'सकेंगे', 'प्रत्येक',
    'दिशानिर्देश', 'अधिकारियों', 'कर्मचारियों', 'कार्यालय', 'उचित व्यवस्था'
  ];
  const prompt = 'You are an inspiring Hindi writer crafting FRESH, VIBRANT, OUT-OF-THE-BOX REAL-LIFE Hindi typing practice for a typist on the DevLys 010 physical keyboard. ' +
    'Goal: Achieve ' + goalWpm + ' WPM with 98% first-try accuracy (currently target pace ' + targetPace + ' WPM). ' +
    'The typist is completely fed up with dull bureaucratic clichés ("नगर परिषद...", "जिला अस्पताल...", "इससे... को लाभ मिल सकेगा और कार्य सुचारू रूप से चलेगा"). ' +
    'Write natural, engaging, human real-life sentences.\n\n' +
    'THEME FOR THIS ROUND: ' + pickedTheme + '\n\n' +
    'CRITICAL GUIDELINES:\n' +
    '1. Generate exactly 2 or 3 complete, natural, connected sentences (25–45 words total). Every sentence MUST end with the Devanagari full stop (।).\n' +
    '2. REAL-LIFE & HUMAN: Use sensory details, authentic dialogue or observations, genuine daily life situations, and varied sentence structures.\n' +
    '3. STRICTLY FORBIDDEN CLICHÉS (NEVER USE):\n' +
    '   - NEVER start any sentence with "इससे" or "ताकि".\n' +
    '   - NEVER use the formula "इससे [X] को [Y] मिल सकेगा और [Z] होगा/चलेगा".\n' +
    '   - ABSOLUTELY DO NOT USE these repetitive words: ' + JSON.stringify(bannedCliches) + '.\n' +
    '4. NO WORD REPETITION: Do NOT repeat the same content words across sentences. Avoid reusing these recently practiced words: ' + JSON.stringify(recentWords.slice(0, 40)) + '. Also do not reuse recent sentences: ' + JSON.stringify(recent.slice(-6)) + '.\n' +
    '5. STRICT DevLys 010 KEYS ONLY: Every single word must resolve to valid physical keys on DevLys 010. NO English/Latin words, NO rare Sanskrit words, NO chandrabindu (ँ) — use standard anusvara (ं) if needed (e.g. आंख, गांव, हंसना), NO special Alt-code characters (no 0161, 0188, 0216, etc.).\n' +
    '6. WEAVE WEAK KEYS & KEY COMBINATIONS NATURALLY:\n' +
    '   - Focus keys: ' + JSON.stringify(focus) + '.\n' +
    '   - Slow key pairs: ' + JSON.stringify(pairFocus) + '.\n' +
    '   Naturally weave 4 to 6 natural everyday words exercising these letters and transitions into the sentences so the typist builds smooth finger rhythm.\n' +
    '7. Format: Return JSON only: {"sentences":[...]} without any markdown or extra text.';
  const ai=require('./_models');
  let feedback='';
  const models=(await ai.candidates(key)).slice(0,3);
  let last='AI provider HTTP 503';
  for (const model of models) {
    const note=feedback ? ' The previous response failed validation: '+feedback+'. Replace unsupported words and correct the output.' : '';
    let response;
    try { response=await ai.request(key,model,prompt+note,{temperature:1,maxOutputTokens:4096,timeout:14000}); }
    catch (e) { last='AI provider HTTP 503'; feedback=''; continue; }
    if (!response.ok) {
      last='AI provider HTTP '+response.status;
      if ([400,403,404].includes(response.status)) ai.markDead(model);
      if ([400,403,404,429,503].includes(response.status)) { feedback=''; continue; }
      throw Error(last);
    }
    try {
      const out=validate(JSON.parse(ai.textOf(await response.json())),recent,weak);
      ai.markWin(model);
      return {...out,model};
    } catch (e) {
      feedback=e.message;
      last='AI validation failed: '+feedback;
    }
  }
  throw Error(last);
}
module.exports={generate,validate,nearDuplicate,configuredKey};

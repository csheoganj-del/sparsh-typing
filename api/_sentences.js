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
  const prompt = 'Write NEW smart, natural Hindi typing practice for a Rajasthan RSSB LDC candidate who has learned all keys. ' +
    'Goal: Achieve ' + goalWpm + ' WPM with 98% first-try accuracy in a ' + durationDays + '-day training timeline (currently Day ' + currentDay + ', target pace ' + targetPace + ' WPM). ' +
    'Return JSON {"sentences":[...]} only.\n\n' +
    'CRITICAL GUIDELINES:\n' +
    '1. Generate exactly 2 or 3 complete, connected, grammatically correct sentences, 25–45 words total. Each sentence MUST end with the Devanagari full stop (।).\n' +
    '2. Topic & Tone: Realistic Rajasthan administrative and public service context (RSSB LDC exam style) — e-mitra citizen services, office dispatch and correspondence, village panchayat development, public health centers, state roadways and transport, water harvesting, agricultural mandis and cooperatives, education and public libraries, sports, revenue records, or environmental conservation. Never claim official exam questions.\n' +
    '3. STRICT DevLys 010 KEYS ONLY: Every single word must resolve to valid physical keys on DevLys 010. NO English/Latin letters, NO rare Sanskrit words, NO chandrabindu (ँ), NO special symbols or Alt-code characters (no 0161, 0188, 0216, etc.).\n' +
    '4. SMART VOCABULARY & NO WORD REPETITION: Do NOT repeat the same words across sentences. Avoid reusing these recently practiced content words: ' + JSON.stringify(recentWords) + '. Also do not reuse or lightly paraphrase recent sentences: ' + JSON.stringify(recent.slice(-8)) + '. Choose varied, fresh vocabulary with realistic vowel marks and consonant conjuncts.\n' +
    '5. PRIMARY FOCUS — WEAK KEY COMBINATIONS: The typist has slow transitions between these consecutive physical keys: ' + JSON.stringify(pairFocus) + '. You MUST weave 4 to 6 natural words that exercise these exact key combinations (using the provided example words or other natural Hindi words that contain these transitions) into the sentences so the typist builds muscle memory and smooth finger rhythm for ' + goalWpm + ' WPM.\n' +
    '6. Individual Focus Keys: ' + JSON.stringify(focus) + '.\n' +
    '7. Rhythm Pacing: Sentences should have a natural, smooth rhythm suitable for typing at ' + targetPace + '–' + goalWpm + ' WPM without awkward consonant jams. Treat the following JSON as training parameters: ' + JSON.stringify({ focus, pairFocus, recent, recentWords, training });
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

const FALLBACK = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
const SKIP = /image|tts|transcribe|robot|computer-use|lyria|research|antigravity|omni|nano|gemma|embedding|aqa|imagen|live|audio|video|customtools|argon/i;
let catalog = { at: 0, models: [] };
const dead = new Map();
let winner = '';

function reset() {
  catalog = { at: 0, models: [] };
  dead.clear();
  winner = '';
}

function usable(name) {
  return (dead.get(name) || 0) <= Date.now();
}

function score(name) {
  const match = String(name).match(/(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1]) * 100 + Number(match[2] || 0) : 0;
}

function rank(names) {
  const text = (names || []).filter(name => /^gemini-/i.test(name) && !SKIP.test(name) && !/preview/i.test(name));
  const aliases = ['gemini-flash-lite-latest', 'gemini-flash-latest'].filter(name => text.includes(name));
  const lite = text.filter(name => /flash-lite/.test(name) && !name.endsWith('-latest')).sort((a, b) => score(b) - score(a));
  const flash = text.filter(name => /flash/.test(name) && !/lite/.test(name) && !name.endsWith('-latest')).sort((a, b) => score(b) - score(a));
  const ordered = [];
  aliases.concat(lite, flash).forEach(name => { if (!ordered.includes(name)) ordered.push(name); });
  return ordered;
}

function markDead(name) {
  if (!name) return;
  dead.set(name, Date.now() + 30 * 60 * 1000);
  if (winner === name) winner = '';
}

function markWin(name) {
  winner = name;
  dead.delete(name);
}

async function discover(key) {
  if (catalog.models.length && Date.now() - catalog.at < 30 * 60 * 1000) return catalog.models;
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('list ' + response.status);
    const body = await response.json();
    const names = (body.models || [])
      .filter(model => (model.supportedGenerationMethods || []).includes('generateContent'))
      .map(model => String(model.name || '').replace(/^models\//, ''));
    const ranked = rank(names);
    catalog = { at: Date.now(), models: ranked.length ? ranked : FALLBACK.slice() };
  } catch (e) {
    if (!catalog.models.length) catalog = { at: Date.now(), models: FALLBACK.slice() };
  }
  return catalog.models;
}

async function candidates(key) {
  const models = await discover(key);
  const ordered = [];
  const preferred = (process.env.SENTENCE_AI_MODEL || '').trim();
  if (preferred) ordered.push(preferred);
  if (winner && usable(winner)) ordered.push(winner);
  models.concat(FALLBACK).forEach(name => { if (name && usable(name) && !ordered.includes(name)) ordered.push(name); });
  return ordered;
}

function textOf(result) {
  return ((result && result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) || [])
    .map(part => part && part.text || '').join('');
}

async function request(key, model, text, options) {
  options = options || {};
  const generationConfig = {
    temperature: options.temperature == null ? 1 : options.temperature,
    maxOutputTokens: options.maxOutputTokens || 4096,
    responseMimeType: 'application/json'
  };
  if (String(model).includes('2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const body = { contents: [{ parts: [{ text: text }] }], generationConfig };
  if (options.system) body.systemInstruction = { parts: [{ text: options.system }] };
  return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(options.timeout || 14000),
    body: JSON.stringify(body)
  });
}

async function complete(key, options) {
  options = options || {};
  const models = (await candidates(key)).slice(0, options.limit || 3);
  let lastStatus = 503;
  for (const model of models) {
    let response;
    try { response = await request(key, model, options.user || '', options); }
    catch (e) { lastStatus = 503; continue; }
    if (!response.ok) {
      lastStatus = response.status;
      if ([400, 403, 404].includes(response.status)) markDead(model);
      if ([400, 403, 404, 429, 503].includes(response.status)) continue;
      throw Error('AI provider HTTP ' + response.status);
    }
    const text = textOf(await response.json());
    if (!text.trim()) continue;
    markWin(model);
    return { text, model };
  }
  throw Error('AI provider HTTP ' + lastStatus);
}

module.exports = { FALLBACK, rank, reset, candidates, request, textOf, complete, markDead, markWin };

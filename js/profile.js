/* The published 2019 character-speed model, adapted to physical Hindi actions.
   Natural-log smoothing and 16-sample first-try accuracy are explicit local
   approximations: the private server's exact formula is not verified. */
(function (root) {
  var KD = root.KD;
  KD.measurePosition = function (state, index, step, ok, ms, erase) {
    state = state || { positions: [] };
    var row = state.positions[index];
    if (!row) row = state.positions[index] = { id: KD.actionId(step), ti: step.ti, ms: 0, first: true, valid: false, visited: false };
    row.ms += Math.max(0, Math.min(600000, Number(ms) || 0));
    if (erase) {
      var previous = state.positions[index - 1];
      if (previous) { previous.visited = false; previous.valid = false; }
    } else {
      row.visited = true;
      row.valid = !!ok;
      row.first = row.first && !!ok;
    }
    return state;
  };
  KD.measurementSummary = function (state) {
    var rows = ((state || {}).positions || []).filter(function (row) { return row && row.visited; });
    var correct = rows.filter(function (row) { return row.valid; }).length;
    var first = rows.filter(function (row) { return row.first; }).length;
    return { n: rows.length, correct: correct, acc: rows.length ? Math.round(correct / rows.length * 100) : 100,
      realAcc: rows.length ? Math.ceil(first / rows.length * 100) : 100 };
  };
  KD.predictDuration = function (previous, average, confidence) {
    if (!previous || Math.abs(average - previous) < 10) return average;
    return previous + (average - previous) / (Math.log(Math.min(16, Math.max(0, confidence)) + 1) + 1);
  };
  KD.profileRow = function (row) {
    var samples = (row && row.samples) || [];
    return { n: samples.length, avg: (row && row.ms) || 0,
      accuracy: samples.length ? samples.filter(function (s) { return s.ok; }).length / samples.length * 100 : 100 };
  };
  KD.mergeProfile = function (a, b) {
    // Historical predictions are snapshots, not counters that may be added twice.
    var chosen = !b || (a && (a.at || 0) >= (b.at || 0)) ? a : b;
    return chosen ? JSON.parse(JSON.stringify(chosen)) : { at: 0, keys: {}, pairs: {}, history: [] };
  };
  KD.updateProfile = function (profile, state, at) {
    profile = profile || { at: 0, keys: {}, pairs: {}, history: [] };
    profile.keys = profile.keys || {}; profile.pairs = profile.pairs || {}; profile.history = profile.history || [];
    if (profile.at === at) return profile;
    var rows = ((state || {}).positions || []).filter(function (r) { return r && r.visited && KD.actionLabel(r.id); });
    var timed = rows.filter(function (r) { return r.valid && r.ms > 0; });
    var fallback = timed.length ? timed.reduce(function (sum, r) { return sum + r.ms; }, 0) / timed.length : 0;
    var means = {};
    rows.forEach(function (row) {
      var prediction = profile.keys[row.id];
      var ms = row.ms + (!row.valid ? (prediction && prediction.ms || fallback) : 0);
      if (ms > 0) { var value = means[row.id] || (means[row.id] = { ms: 0, n: 0 }); value.ms += ms; value.n++; }
    });
    function note(kind, id, ms, first) {
      var row = profile[kind][id] || { ms: 0, samples: [] };
      row.samples = row.samples.slice(-15).concat({ ok: !!first, at: at });
      if (ms > 0) row.ms = KD.predictDuration(row.ms, ms, row.samples.filter(function (s) { return s.ok; }).length);
      profile[kind][id] = row;
    }
    var previous = null;
    rows.forEach(function (row) {
      var mean = means[row.id];
      note('keys', row.id, mean ? mean.ms / mean.n : 0, row.first);
      if (previous && previous.ti === row.ti && previous.id !== 'Space' && row.id !== 'Space')
        note('pairs', previous.id + '>' + row.id, row.ms, previous.first && row.first);
      previous = row;
      var recent = profile.history.slice(-999);
      var caps = [[1000, 50], [500, 29], [250, 18], [125, 13]];
      if (caps.every(function (cap) { return recent.slice(-cap[0]).filter(function (id) { return id === row.id; }).length < cap[1]; })) {
        profile.history = recent.concat(row.id);
      }
    });
    // Bound physical-pair storage without erasing per-key history.
    var pairs = Object.keys(profile.pairs);
    if (pairs.length > 512) pairs.sort(function (a, b) {
      return profile.pairs[b].samples.slice(-1)[0].at - profile.pairs[a].samples.slice(-1)[0].at;
    }).slice(512).forEach(function (id) { delete profile.pairs[id]; });
    profile.at = at;
    return profile;
  };
  KD.profileSpeed = function (profile) {
    var values = ((profile || {}).history || []).map(function (id) { return profile.keys[id] && profile.keys[id].ms; }).filter(function (ms) { return ms > 0; });
    return values.length ? 12000 * values.length / values.reduce(function (sum, ms) { return sum + ms; }, 0) : 0;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

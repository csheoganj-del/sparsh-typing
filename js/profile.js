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
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    if (!a || !b) return a || b ? copy(a || b) : { at: 0, keys: {}, pairs: {}, history: [] };
    var chosen = (a.at || 0) > (b.at || 0) ? a : (a.at || 0) < (b.at || 0) ? b :
      (JSON.stringify(a.history || []) <= JSON.stringify(b.history || []) ? a : b);
    var out = copy(chosen);
    function samples(row) { return row && Array.isArray(row.samples) ? row.samples : []; }
    function latest(row) {
      return samples(row).reduce(function (at, sample) { return Math.max(at, Number(sample.at) || 0); }, 0);
    }
    ['keys', 'pairs'].forEach(function (kind) {
      var left = a[kind] || {}, right = b[kind] || {};
      var ids = Object.keys(left).concat(Object.keys(right)).filter(function (id, index, all) { return all.indexOf(id) === index; }).sort();
      out[kind] = {};
      ids.forEach(function (id) {
        var x = left[id], y = right[id];
        if (!x || !y) { out[kind][id] = copy(x || y); return; }
        // Duration is a prediction snapshot. Keep the latest per key instead of
        // replacing every key when another device finishes a different drill.
        var row = latest(x) > latest(y) ? x : latest(x) < latest(y) ? y :
          (JSON.stringify(x) <= JSON.stringify(y) ? x : y);
        var merged = {};
        [x, y].forEach(function (source) {
          var occurrences = {};
          samples(source).forEach(function (sample) {
            if (!sample || !Number.isFinite(sample.at) || typeof sample.ok !== 'boolean') return;
            var key = sample.at + ':' + sample.ok + ':' + (sample.i == null ? '' : sample.i);
            // Legacy samples have no position ID. Preserve their multiplicity
            // while repeated downloads still contribute only the same evidence.
            var occurrence = occurrences[key] || 0;
            occurrences[key] = occurrence + 1;
            var identity = key + ':' + occurrence;
            if (!merged[identity]) merged[identity] = copy(sample);
          });
        });
        out[kind][id] = copy(row);
        out[kind][id].samples = Object.keys(merged).sort(function (p, q) {
          return merged[p].at - merged[q].at || p.localeCompare(q);
        }).map(function (key) { return merged[key]; }).slice(-16);
      });
    });
    var pairs = Object.keys(out.pairs);
    if (pairs.length > 512) pairs.sort(function (x, y) {
      return latest(out.pairs[y]) - latest(out.pairs[x]) || x.localeCompare(y);
    }).slice(512).forEach(function (id) { delete out.pairs[id]; });
    out.at = Math.max(Number(a.at) || 0, Number(b.at) || 0);
    out.history = (out.history || []).slice(-1000);
    return out;
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
    function note(kind, id, ms, first, index) {
      var row = profile[kind][id] || { ms: 0, samples: [] };
      row.samples = row.samples.slice(-15).concat({ ok: !!first, at: at, i: index });
      if (ms > 0) row.ms = KD.predictDuration(row.ms, ms, row.samples.filter(function (s) { return s.ok; }).length);
      profile[kind][id] = row;
    }
    var previous = null;
    rows.forEach(function (row, index) {
      var mean = means[row.id];
      note('keys', row.id, mean ? mean.ms / mean.n : 0, row.first, index);
      if (previous && previous.ti === row.ti && previous.id !== 'Space' && row.id !== 'Space')
        note('pairs', previous.id + '>' + row.id, row.ms, previous.first && row.first, index);
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

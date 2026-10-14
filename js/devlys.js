/* DevLys 010 downloaded from Rajasthan's RajKaj utilities page.
   Keep legacy bytes intact: font glyphs, not Unicode shaping, define the display. */
(function (root) {
  var KD = root.KD;
  var samples = {f:'fd', k:'dk', s:'ds', S:'dS', h:'dh', a:'da', q:'dq', w:'dw', W:'dkW', '`':'d`', '~':'d~', '+':'d+', z:'dz', Z:'dZ', '%':'d%'};
  KD.devlysKeyFace = function (ch) { return samples[ch] || ch || ''; };
  KD.examWordCorrect = function (typed, expected) { return String(typed) === String(expected); };
})(typeof globalThis !== 'undefined' ? globalThis : this);

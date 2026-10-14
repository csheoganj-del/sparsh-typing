const fs = require('node:fs'), vm = require('node:vm');
const html = fs.readFileSync('artifacts/rajkaj-converter.html', 'utf8');
const script = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1];
const fields = { legacy_text: {value: ''}, unicode_text: {value: ''} };
const ctx = { document: { getElementById: id => fields[id] }, window: {}, alert() {} };
vm.createContext(ctx);
vm.runInContext(script, ctx);
for (const f of ['convert', 'keys']) require('../js/' + f);
const rows = [], differences = [];
for (const row of KD.ROWS) for (const key of row) for (const shift of [false, true]) {
  const raw = shift ? key.shifted : key.normal;
  fields.legacy_text.value = raw;
  ctx.convert_to_unicode();
  const official = fields.unicode_text.value;
  rows.push({code: key.code, shift, raw, official});
  const actual = KD.krutiToUnicode(raw);
  if (official !== actual) differences.push({raw, official, actual});
}
fs.writeFileSync('scripts/devlys-official-keys.json', JSON.stringify({source: 'https://rajkaj.rajasthan.gov.in/utilities/font-convertor.php', rows}, null, 2));
console.log(JSON.stringify(differences));

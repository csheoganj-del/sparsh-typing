import fs from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('fonts');
await fs.mkdir(directory, { recursive: true });
const url = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Open+Sans:wght@400;600;700&display=swap';
const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!response.ok) throw new Error(`Font stylesheet: ${response.status}`);
let css = await response.text();
const sources = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(match => match[1]))];
for (const [index, source] of sources.entries()) {
  const font = await fetch(source);
  if (!font.ok) throw new Error(`Font asset: ${font.status}`);
  const filename = `font-${index}${new URL(source).pathname.endsWith('.woff2') ? '.woff2' : '.ttf'}`;
  await fs.writeFile(path.join(directory, filename), Buffer.from(await font.arrayBuffer()));
  css = css.replaceAll(source, filename);
}
await fs.writeFile(path.join(directory, 'fonts.css'), css);
for (const family of ['montserrat', 'notosansdevanagari', 'opensans']) {
  const license = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`);
  if (!license.ok) throw new Error(`Font license: ${family} ${license.status}`);
  await fs.writeFile(path.join(directory, `${family}-LICENSE.txt`), await license.text());
}
console.log(`Saved ${sources.length} font files and their licenses.`);

// Writes the keyword rule's verdict for every catalogue item, so the photo model can be compared with it.
//   node tools/sourcing/keyword-check.mjs products.json keywords.json
import fs from 'node:fs';
import {minimalCheck} from './minimal.mjs';
const [src, out] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync(src, 'utf8'));
const verdicts = Object.fromEntries(items.filter(i => i.cat !== 'baby').map(i => [i.ref, minimalCheck(i, '')]));
fs.writeFileSync(out, JSON.stringify(verdicts));
console.log(`${Object.keys(verdicts).length} items, ${Object.values(verdicts).filter(v => !v.ok).length} not minimal by keywords`);

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Mirror the shop: the live base is authoritative; products adds new refs.
export function readPhotoCatalogue(root) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  const base = read('shop/catalogue.json');
  if (!Array.isArray(base) || !base.length || base.some(i => !i || typeof i.ref !== 'string' || !i.ref.trim())) {
    throw new Error('Live shop/catalogue.json must be a nonempty catalogue of valid refs');
  }
  const added = read('products.json');
  if (!Array.isArray(added) || added.some(i => !i || typeof i.ref !== 'string' || !i.ref.trim())) {
    throw new Error('Live products.json must be an array of valid refs');
  }
  const all = new Map(base.map(i => [i.ref, i]));
  for (const item of added) if (!all.has(item.ref)) all.set(item.ref, item);
  return [...all.values()];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [root, output] = process.argv.slice(2);
  if (!root || !output) throw new Error('Usage: node catalogue.mjs SITE OUTPUT');
  const items = readPhotoCatalogue(root);
  fs.writeFileSync(output, JSON.stringify(items));
  console.log(`${items.length} styles from the live split catalogue and products`);
}

// Batch bridge: use the canonical style rules rather than a drifting Python copy.
import fs from 'node:fs';
import {minimalCheck} from '../sourcing/minimal.mjs';
const items=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(items.map(i=>minimalCheck(i,[i.title,i.name,i.desc].filter(Boolean).join(' ')))));

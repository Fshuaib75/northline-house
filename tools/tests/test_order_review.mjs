import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Past from '../../orders/past-orders.js';
test('suggestions rank relevant names and cap at five without selecting a match',()=>{
 const catalogue=Array.from({length:20},(_,n)=>({ref:`B${n}`,brand:'Other',model:'Bag'}));
 catalogue.push({ref:'S',brand:'Slazenger',model:'Slide',colour:'White'});
 const suggestions=Past.suggestStyles('white slazenger slide',catalogue);
 assert.equal(suggestions[0].ref,'S');assert.ok(suggestions.length<=5);
 assert.equal(Past.matchStyle('white slazenger slide',catalogue).item,null);
});
test('preview tables are contained on phones and known manual styles prefill editable price',()=>{
 const html=fs.readFileSync(new URL('../../orders/index.html',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../../orders/past-orders-ui.js',import.meta.url),'utf8');
 assert.match(html,/\.tw\s*\{[^}]*overflow-x:\s*auto/);
 assert.match(ui,/manualStyle.*addEventListener\('change'/);
 assert.match(ui,/manualPrice.*value.*prices/);
 assert.match(ui,/suggestStyles/);
});

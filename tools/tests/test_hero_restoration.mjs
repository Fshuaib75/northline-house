import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),html=fs.readFileSync(new URL('shop/index.html',root),'utf8');
test('fixed hero retains live copy, labels, order links and product-only bag',()=>{
 const hero=html.slice(html.indexOf('<section class="hero-carousel"'),html.indexOf('<div class="service-strip"'));
 for(const text of ['Everyday pieces.<br><em>A distinct point of view.</em>','Carry less.<br><em>Make it count.</em>','Your pace.<br><em>Considered details.</em>'])assert.ok(hero.includes(text));
 assert.equal((hero.match(/>How to order<\/a>/g)||[]).length,3);assert.equal((hero.match(/class="visual-label"/g)||[]).length,3);
 assert.ok(hero.includes('src="assets/hero-bag.jpg"'));assert.ok(!hero.includes('shoulder-bag.jpg'));assert.ok(hero.includes('fetchpriority="high"'));
 const bytes=fs.readFileSync(new URL('shop/assets/hero-bag.jpg',root));
 assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),'102b1d45ac220a303bdcc181cc68468f7fc1f599');
});
test('restoration keeps split catalogue and compact category links',()=>{
 assert.ok(html.includes("fetch('catalogue.json'"));assert.ok(!/let ALL = \[[^]*?\];/.test(html));
 const links=html.slice(html.indexOf('<nav class="collection-links'),html.indexOf('<nav class="tools"'));
 assert.equal((links.match(/data-collection-link/g)||[]).length,4);assert.ok(!links.includes('Everyday essentials'));
 const css=fs.readFileSync(new URL('shop/storefront.css',root),'utf8');assert.ok(css.includes('.hero-copy{background:#2e2c29}'));
 assert.ok(!css.includes('Sculpted clay campaign'));assert.ok(!css.includes('height:260px'));
});

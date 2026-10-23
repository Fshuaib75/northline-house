import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../../shop/storefront.js', import.meta.url), 'utf8');
function setup(reduce = false) {
  class Element {
    constructor() { this.attrs = {}; this.events = {}; this.classes = new Set(); this.classList = { add: (...c) => c.forEach(x => this.classes.add(x)), remove: (...c) => c.forEach(x => this.classes.delete(x)), toggle: (c, on) => on ? this.classes.add(c) : this.classes.delete(c) }; }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k]; }
    addEventListener(k, f) { this.events[k] = f; }
    closest() { return null; }
  }
  const hero = new Element(), play = new Element(), slides = Array.from({length:3}, (_,i) => { const s = new Element(); s.attrs['aria-label'] = `Slide ${i+1}`; return s; });
  const dots = slides.map(() => new Element()), nav = new Element(), prev = new Element(), next = new Element(), announcement = new Element();
  const nodes = {'.hero-play':play,'.hero-navigation':nav,'[data-hero-prev]':prev,'[data-hero-next]':next,'.hero-announcement':announcement,'.hero-counter':new Element()};
  hero.querySelector = s => nodes[s]; hero.querySelectorAll = s => s === '[data-hero-slide]' ? slides : dots;
  const doc = new Element(); doc.querySelector = () => hero; doc.querySelectorAll = () => [];
  const media = new Element(); media.matches = reduce;
  const jobs = new Map(); let serial = 0; const observers = [];
  class Observer { constructor(fn) { observers.push(fn); } observe() {} }
  const ctx = vm.createContext({document:doc, location:{search:''}, URLSearchParams, matchMedia:()=>media, window:{IntersectionObserver:Observer}, IntersectionObserver:Observer,
    setTimeout:fn => { jobs.set(++serial, fn); return serial; }, clearTimeout:id => jobs.delete(id)});
  vm.runInContext(code, ctx);
  const advance = () => { const [id, fn] = jobs.entries().next().value; jobs.delete(id); fn(); };
  return {hero,play,slides,dots,prev,next,doc,media,jobs,observers,advance,announcement};
}
test('autoplay advances one accessible slide and wraps', () => {
  const r = setup(); assert.equal(r.jobs.size,1);
  r.advance(); assert.equal(r.slides[1].inert,false); assert.equal(r.slides[0].inert,true);
  assert.equal(r.slides.filter(s => s.attrs['aria-hidden']==='false').length,1);
  r.advance(); r.advance(); assert.equal(r.slides[0].inert,false);
});
test('manual navigation pauses, announces and can restart', () => {
  const r = setup(); r.next.events.click(); assert.equal(r.jobs.size,0); assert.equal(r.play.textContent,'Play'); assert.equal(r.announcement.textContent,'Slide 2');
  r.prev.events.click(); assert.equal(r.slides[0].inert,false);
  r.play.events.click(); assert.equal(r.jobs.size,1);
});
test('reduced motion, offscreen, hover and background tabs stop timers', () => {
  const r=setup(true); assert.equal(r.jobs.size,0); assert.equal(r.play.hidden,true); r.next.events.click(); assert.equal(r.slides[1].inert,false);
  const s=setup(); s.hero.events.mouseenter(); assert.equal(s.jobs.size,0); s.hero.events.mouseleave(); assert.equal(s.jobs.size,1);
  s.doc.hidden=true; s.doc.events.visibilitychange(); assert.equal(s.jobs.size,0);
  s.doc.hidden=false; s.doc.events.visibilitychange(); s.observers[0]([{isIntersecting:false}]); assert.equal(s.jobs.size,0);
  s.observers[0]([{isIntersecting:true}]); assert.equal(s.jobs.size,1);
  s.media.matches=true; s.media.events.change(); assert.equal(s.jobs.size,0);
});
test('focus pauses and horizontal touch changes slide without capturing vertical scroll', () => {
  const r=setup(); r.hero.events.focusin({target:r.next}); assert.equal(r.jobs.size,0);
  const target={closest:()=>null};
  r.hero.events.pointerdown({pointerType:'touch',clientX:200,clientY:100,target}); r.hero.events.pointerup({clientX:80,clientY:105}); assert.equal(r.slides[1].inert,false);
  r.hero.events.pointerdown({pointerType:'touch',clientX:200,clientY:100,target}); r.hero.events.pointerup({clientX:80,clientY:200}); assert.equal(r.slides[1].inert,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../../shop/storefront.js', import.meta.url), 'utf8');
function setup(reduce = false, random = 0) {
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
  const jobs = new Map(), delays = new Map(); let serial = 0, now = 1e6; const observers = [];
  class Observer { constructor(fn) { observers.push(fn); } observe() {} }
  const ctx = vm.createContext({document:doc, location:{search:''}, URLSearchParams, matchMedia:()=>media, window:{IntersectionObserver:Observer}, IntersectionObserver:Observer,
    Math:Object.assign(Object.create(Math),{random:()=>random}), Date:{now:()=>now},
    setTimeout:(fn, ms) => { jobs.set(++serial, fn); delays.set(serial, ms); return serial; }, clearTimeout:id => { jobs.delete(id); delays.delete(id); }});
  vm.runInContext(code, ctx);
  const advance = () => { const [id, fn] = jobs.entries().next().value; jobs.delete(id); fn(); };
  const delay = () => [...delays.values()].at(-1);
  const tick = ms => { now += ms; };
  return {hero,play,slides,dots,prev,next,doc,media,jobs,observers,advance,announcement,delay,tick};
}
test('autoplay advances one accessible slide and wraps', () => {
  const r = setup(); assert.equal(r.jobs.size,1);
  r.advance(); assert.equal(r.slides[1].inert,false); assert.equal(r.slides[0].inert,true);
  assert.equal(r.slides.filter(s => s.attrs['aria-hidden']==='false').length,1);
  r.advance(); r.advance(); assert.equal(r.slides[0].inert,false);
});
test('random first slide each visit', () => {
  assert.equal(setup(false, 0).slides[0].inert, false);
  const r = setup(false, 0.7); assert.equal(r.slides[2].inert, false); assert.equal(r.slides[0].inert, true);
});
test('manual navigation holds the slide, then resumes; only Pause stops it', () => {
  const r = setup(); r.next.events.click();
  assert.equal(r.jobs.size,1); assert.ok(r.delay() >= 12000); assert.equal(r.play.textContent,'Pause'); assert.equal(r.announcement.textContent,'Slide 2');
  r.tick(12000); r.advance(); assert.equal(r.slides[2].inert,false); assert.equal(r.delay(),6500);
  r.prev.events.click(); assert.equal(r.slides[1].inert,false);
  r.play.events.click(); assert.equal(r.jobs.size,0); assert.equal(r.play.textContent,'Play');
  r.play.events.click(); assert.equal(r.jobs.size,1); assert.equal(r.delay(),6500);
});
test('reduced motion still rotates slower; mouse hover, offscreen and background tabs stop timers; touch never counts as hover', () => {
  const r=setup(true); assert.equal(r.jobs.size,1); assert.equal(r.delay(),9000); assert.equal(r.play.hidden,false);
  const s=setup(); s.hero.events.pointerenter({pointerType:'mouse'}); assert.equal(s.jobs.size,0); s.hero.events.pointerleave({pointerType:'mouse'}); assert.equal(s.jobs.size,1);
  s.hero.events.pointerenter({pointerType:'touch'}); assert.equal(s.jobs.size,1);
  s.doc.hidden=true; s.doc.events.visibilitychange(); assert.equal(s.jobs.size,0);
  s.doc.hidden=false; s.doc.events.visibilitychange(); s.observers[0]([{isIntersecting:false}]); assert.equal(s.jobs.size,0);
  s.observers[0]([{isIntersecting:true}]); assert.equal(s.jobs.size,1);
  s.media.matches=true; s.media.events.change(); assert.equal(s.jobs.size,1); assert.equal(s.delay(),9000);
});
test('keyboard focus holds, tap focus does not; horizontal touch changes slide without capturing vertical scroll', () => {
  const r=setup(); r.hero.events.focusin({target:{matches:()=>true}}); assert.equal(r.jobs.size,1); assert.ok(r.delay()>=12000);
  const q=setup(); q.hero.events.focusin({target:{matches:()=>false}}); assert.equal(q.delay(),6500);
  const target={closest:()=>null};
  r.hero.events.pointerdown({pointerType:'touch',clientX:200,clientY:100,target}); r.hero.events.pointerup({clientX:80,clientY:105}); assert.equal(r.slides[1].inert,false);
  r.hero.events.pointerdown({pointerType:'touch',clientX:200,clientY:100,target}); r.hero.events.pointerup({clientX:80,clientY:200}); assert.equal(r.slides[1].inert,false);
});

const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {eligible,select}=require('../shop/hero-pool.js');
const item=(ref,cat='M',brand=ref)=>({ref,brand,model:ref,g:cat,heroCategory:cat,price:30000,img:'product.jpg'});
const checks={soldOut:i=>i.out,calm:i=>!i.bright,loud:i=>i.loud,photo:i=>i.blocked?'':i.img,category:i=>i.heroCategory};
const items=[item('men'),item('women','W'),item('bag','A'),item('men2'),item('women2','W'),item('bag2','A')];
let result=eligible({refs:items.map(i=>i.ref)},items,checks);assert.equal(result.accepted.length,6);
const picked=select(result.accepted,[],()=>.2);assert.equal(new Set(picked.map(i=>i.heroCategory)).size,3);assert.equal(new Set(picked.map(i=>i.ref)).size,3);
// Order is fixed even when random enumeration or input starts with a bag.
for(let n=0;n<25;n++) assert.deepEqual(select(result.accepted.slice().reverse()).map(i=>i.heroCategory),['M','W','A']);
for(const term of ['croc','croco','crocodile','snake','python','leopard','zebra','animal']){
 const bad={...item('paris','A'),brand:'Capone',model:'Paris 222 '+term+' clutch'};
 assert.equal(eligible({refs:['paris']},[bad],checks).rejected[0].reason,'loud details');
}
assert(select(result.accepted,picked.map(i=>i.ref)).every(i=>!picked.some(p=>p.ref===i.ref)));
assert.equal(select(items.slice(0,2)).length,0);assert.equal(eligible(null,items,checks).accepted.length,0);
assert.equal(select([item('a'),item('b'),item('c')]).length,3);assert.equal(select([item('a','M','same'),item('b','M','same'),item('c','M','same')]).length,0);
for(const [change,reason] of [[{out:true},'sold out'],[{bright:true},'no calm approved colour'],[{loud:true},'loud details'],[{price:61000},'outside N18–60k'],[{blocked:true},'no full-product photo']]){const x={...item('x'),...change};assert.equal(eligible({refs:['x']},[x],checks).rejected[0].reason,reason);}
assert.equal(eligible({refs:['hidden']},[],checks).rejected[0].reason,'not live or hidden');
assert.equal(eligible({refs:['men','men']},items,checks).accepted.length,1);
assert.equal(eligible({refs:['a','b']},[{...item('a'),grp:'same'},{...item('b'),grp:'same'}],checks).accepted.length,1);
// Execute the real book handler with mocked saves; never contact GitHub.
const html=fs.readFileSync(require('node:path').join(__dirname,'book/book.template.html'),'utf8');
const handler=html.slice(html.indexOf('document.getElementById("heroBtn").onclick'),html.indexOf('document.getElementById("clearStars").onclick'));
const button={},messages=[],writes=[];const data=Array.from({length:35},(_,id)=>({id,ref:'ref'+id}));
const context={document:{getElementById:()=>button},tok:{get:()=>true},DATA:data,stars:new Set(data.map(i=>i.id)),hidden:new Set(['ref0']),liveOf:()=>true,toast:m=>messages.push(m),saveJson:async(path,fn)=>writes.push({path,data:fn()}),errMsg:e=>e.message};vm.createContext(context);vm.runInContext(handler,context);
(async()=>{await button.onclick();assert.equal(writes[0].path,'hero.json');assert.equal(writes[0].data.refs.length,30);assert(!writes[0].data.refs.includes('ref0'));assert.equal(messages.at(-1),'Hero pool published: 30 styles.');context.saveJson=async()=>{throw Error('failed')};await button.onclick();assert.equal(messages.at(-1),'failed');console.log('Hero eligibility, category coverage, previous visit, duplicates, fallback, 30-ref book publish and failure tests pass');})();

// Full-product framing and corner-colour matching; cropped/blank frames are rejected.
const inspect=require('../shop/hero-pool.js').inspectPixels;
const cardLead=require('../shop/hero-pool.js').cardLead;
const bag={ref:'USPA-BAG-9508-MS',img:'https://supplier/IMG-3576763679003673206.jpg',imgs:['https://supplier/IMG-5914703428641554540.jpg']};
assert.equal(cardLead(bag),bag.imgs[0]);
assert.equal(cardLead({...bag,imgs:[]}), '');
assert.equal(cardLead(bag,()=>false),'');
assert.equal(cardLead({ref:'normal',img:'https://supplier/whole.jpg',full:'https://supplier/detail.jpg'}),'https://supplier/whole.jpg');
const pixels=new Uint8ClampedArray(20*20*4);for(let n=0;n<pixels.length;n+=4)pixels.set([200,195,190,255],n);
assert.equal(inspect(pixels,20,20).full,false);for(let y=5;y<15;y++)for(let x=5;x<15;x++)pixels.set([30,30,30,255],(y*20+x)*4);
assert.deepEqual(inspect(pixels,20,20),{colour:'rgb(200, 195, 190)',full:true});
for(let x=0;x<8;x++)pixels.set([30,30,30,255],(10*20+x)*4);assert.equal(inspect(pixels,20,20).full,false);

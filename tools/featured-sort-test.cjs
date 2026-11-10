const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
for(const p of ['index.html','shop/index.html']){
const html=fs.readFileSync(__dirname+'/../'+p,'utf8');const start=html.indexOf('const calmColour=');const end=html.indexOf('\n}',html.indexOf('function merchandise',start))+2;
const code=html.slice(start,end);const ctx={S:{g:'W'},sizesOf:i=>i.sizes||[],inStock:(i,s)=>!(i.out||[]).includes(s),soldOut:i=>!!i.gone,oneSize:i=>(i.sizes||[])[0]==='One size',secOf:i=>i.sec||'Shoes'};vm.createContext(ctx);
vm.runInContext(code+';globalThis.api={activeDrop,calmColour,featureScore,merchandise};',ctx);const a=ctx.api;
assert(a.activeDrop({week:'2026-11-09'},Date.parse('2026-11-09T00:00Z')));assert(!a.activeDrop({week:'2026-11-09'},Date.parse('2026-11-16T00:00Z')));assert(!a.activeDrop({week:'2026-11-10'},Date.parse('2026-11-09T00:00Z')));assert(!a.activeDrop({week:'2026-02-30'}));
const item={model:'Boston',brand:'A',price:35000,fam:'Black',sizes:['40','41','42'],imgs:['1','2']};
assert(a.featureScore(item)>a.featureScore({...item,price:55000}));assert(a.featureScore({...item,price:55000})>a.featureScore({...item,price:75000}));
for(const term of ['logo','monogram','metallic','croco','print']) assert(a.featureScore(item)>a.featureScore({...item,desc:term}));
assert(a.featureScore(item)>a.featureScore({...item,out:['40']}));assert(a.featureScore(item)>a.featureScore({...item,model:'12345'}));
const items=Array.from({length:70},(_,n)=>({...item,brand:n<40?'Capone':'Brand'+n%9,model:'Style'+n}));items.push({...item,gone:true,price:18000});const result=a.merchandise(items,i=>i,()=>false);
assert.equal(result.length,items.length);assert(result.at(-1).gone);assert(new Set(result.slice(0,36).map(i=>i.brand)).size>=8);
for(let n=2;n<36;n++)assert(!(result[n].brand===result[n-1].brand&&result[n].brand===result[n-2].brand));
// Men: value beats premium palms; eight of twelve must be in band.
ctx.S.g='M';
const value=Array.from({length:40},(_,n)=>({...item,brand:'Value'+n%10,model:'Everyday '+String.fromCharCode(65+n),kind:'sneaker'}));
const palms=Array.from({length:12},(_,n)=>({...item,brand:'Leather'+n,model:'Leather palm',kind:'slide',desc:'genuine leather',price:n%2?147500:72500}));
const men=a.merchandise(palms.concat(value),i=>i,()=>false);
assert(men.slice(0,12).filter(i=>i.price>=18000&&i.price<=45000).length>=8);
assert(men.findIndex(i=>i.price>60000)>=value.length);
// Brand spread is only a constraint: two high-scoring A cards stay together.
ctx.S.g='W';
const pair=[{...item,model:'Alpha'},{...item,model:'Beta'},{...item,brand:'B',price:55000}];
assert.deepEqual(Array.from(a.merchandise(pair,i=>i,()=>false),i=>i.brand),['A','A','B']);
for(const g of ['M','W']) {ctx.S.g=g; const ranked=a.merchandise(palms.concat(value),i=>i,()=>false);assert(ranked.slice(0,36).filter(i=>i.price>60000).length<=2);}
// Mixed bright shades are not calm even when their family is Grey.
const loud=['Yellow with purple strap','Pink','Grey & mint'].map(colour=>({...item,colour,fam:'Grey',brand:'Loud'}));
for(const i of loud) assert(!a.calmColour(i));
const coded=['167216 slide','406052 pool slide','409105 comfort sandal','Slide 4175'].map(model=>({...item,model,brand:'Code'}));
for(const i of coded) assert(a.featureScore(i)<a.featureScore(item));
const clean=a.merchandise(loud.concat(coded,value),i=>i,()=>false);
assert(clean.slice(0,36).every(i=>a.calmColour(i)&&!/[0-9]{3,}/.test(i.model)));
assert(clean.indexOf(loud[0])>=value.length+coded.length);
assert.equal(clean.length,loud.length+coded.length+value.length);
console.log(p+': value/palm priority, premium cap, score-first brand constraints, calm colours, code names, stock and drop boundaries passed');
}

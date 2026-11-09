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
console.log(p+': scoring, stock, diversity, preservation and drop boundaries passed');
}

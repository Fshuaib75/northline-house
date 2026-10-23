import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,rank,SOURCES} from '../sourcing/engine.mjs';
import {train,validModel,FEATURES,baseline} from '../sourcing/ranking.mjs';
const params={rate:30,perKg:12000,handling:1500,minProfit:4000,profitPct:15};
const snapshot=()=>({source:'derimod',base:'https://derimod.com.tr',currency:'TRY',observed_at:new Date().toISOString(),products:[{id:123,title:'Erkek Siyah Deri Terlik',product_type:'Terlik',vendor:'Derimod',handle:'test-slide',options:[{name:'Renk',position:1},{name:'Beden',position:2}],images:[{id:1,src:'https://cdn.example.com/a.jpg',variant_ids:[4]}],variants:[{id:4,option1:'Siyah',option2:'42',available:true,price:'500',sku:'S1',featured_image:{id:1}},{id:5,option1:'Siyah',option2:'43',available:false,price:'500',sku:'S2'}]}]});
test('normalization never invents sizes; identity is stable',()=>{const a=normalize(snapshot())[0],b=normalize(snapshot())[0];assert.deepEqual(a.item.sizes,['42']);assert.equal(a.id,b.id);assert.equal(a.item.brand,'Derimod');assert.equal(a.item.tl,500);});
test('missing stock and mismatched currency do not become candidates',()=>{const s=snapshot();s.products[0].variants.forEach(v=>delete v.available);assert.equal(normalize(s).length,0);s.currency='USD';assert.throws(()=>normalize(s));});
test('old snapshots are refused',()=>{const s=snapshot();s.observed_at='2020-01-01T00:00Z';assert.throws(()=>normalize(s));});
test('different size prices require manual inspection',()=>{const s=snapshot();s.products[0].variants[1].available=true;s.products[0].variants[1].price='600';assert.equal(normalize(s).length,0);});
test('unknown suppliers and unrelated product categories are refused',()=>{const s=snapshot();s.products[0].title='Kadın Deri Ceket';s.products[0].product_type='Ceket';assert.equal(normalize(s).length,0);s.base='https://unknown.example';assert.throws(()=>normalize(s));});
test('deduplication catches already stocked supplier images',()=>{const candidates=normalize(snapshot());const r=rank(candidates,[{ref:'OTHER-REF',img:'https://cdn.example.com/a.jpg?width=600'}],params);assert.equal(r.candidates.length,0);assert.equal(r.excluded.known,1);});
test('model defaults to rules and actual pricing parameters are required',()=>{const c=normalize(snapshot());assert.equal(rank(c,[],params).model,'rules');assert.throws(()=>rank(c,[],null));assert.equal(rank([...c,...c],[],params).candidates.length,1);});
test('known estimate matches the existing pricing formula',()=>{const r=rank(normalize(snapshot()),[],params).candidates[0];assert.equal(r.estimate.landed,24300);assert.equal(r.estimate.agent,1500);assert.equal(r.estimate.price,30000);assert.equal(r.estimate.profit,4200);});
test('too little feedback cannot activate ML',()=>{assert.equal(train([]).active,false);assert.equal(validModel({version:1,active:true,weights:[NaN]}),false);});
test('duplicates and invalid feedback cannot satisfy training threshold',()=>{const row={id:'one',product_key:'one',decision:'approve',feature_version:1,features:Array(8).fill(.5)};assert.equal(train(Array(100).fill(row)).examples,1);assert.equal(train([{...row,features:[Infinity]}]).examples,0);});
test('grouped holdout enables a model only on predictive feedback',()=>{const rows=Array.from({length:200},(_,n)=>({id:'item-'+n,product_key:'product-'+n,decision:n%2?'approve':'reject',feature_version:1,features:[.5,.5,.5,.5,.5,Number(n%2===1),Number(n%2===0),0]}));const m=train(rows);assert.equal(m.active,true);assert.ok(m.metrics.learned.brier<m.metrics.baseline.brier);assert.equal(m.training+m.holdout,200);assert.equal(m.weights.length,FEATURES.length+1);});
test('variant groups cannot straddle holdout',()=>{const rows=Array.from({length:80},(_,n)=>({id:'variant-'+n,product_key:'same-product',decision:n%2?'approve':'reject',feature_version:1,features:Array(8).fill(.5)}));assert.equal(train(rows).active,false);});
test('single class feedback cannot activate ML',()=>{const rows=Array.from({length:60},(_,n)=>({id:String(n),product_key:String(n),decision:'approve',feature_version:1,features:Array(8).fill(.5)}));assert.equal(train(rows).active,false);});


test('new supplier identities remain brands, not retailer names',()=>{
 for(const [key,vendor,brand] of [['marjin','Marjin','Marjin'],['lesbenjamins','LES BENJAMINS CLASSICS','Les Benjamins'],['basicandco','Basic&Co.','Basic&Co.'],['libas','New Balance','New Balance']]){
  const s=snapshot();s.source=key;s.base=SOURCES[key].base;s.products[0].vendor=vendor;
  assert.equal(normalize(s)[0].item.brand,brand);
  s.products[0].vendor='Unknown';assert.equal(normalize(s).length,0);
 }
});
test('exact supplier gender tags support English clothing without inventing an audience',()=>{
 const s=snapshot();s.source='lesbenjamins';s.base=SOURCES.lesbenjamins.base;
 const p=s.products[0];p.vendor='LES BENJAMINS';p.title='SHORT SLEEVE TEE 063';p.product_type='Short Sleeve Tees';p.tags=['men'];
 assert.equal(normalize(s)[0].item.cat,'clothing');assert.equal(normalize(s)[0].item.for,'Men');
 p.tags=['women'];assert.equal(normalize(s)[0].item.for,'Women');
 p.tags=['unisex'];assert.equal(normalize(s).length,0);
 p.tags=['men','women'];assert.equal(normalize(s).length,0);
 p.title='Erkek Çocuk Sneaker Ayakkabı';assert.equal(normalize(s).length,0);
});
test('review limit is bounded and fair shares rotate brand, category and audience',()=>{
 const original=normalize(snapshot())[0];
 const rows=Array.from({length:240},(_,n)=>({...original,id:'candidate-'+n,product_key:'product-'+n,item:{...original.item,ref:'REF-'+n,brand:n<220?'Large':'Small',cat:n%2?'bags':'shoes',for:n%3?'Women':'Men'}}));
 const r=rank(rows,[],params,null,12);assert.equal(r.candidates.length,12);
 assert.equal(r.candidates.filter(c=>c.item.brand==='Small').length,6);
 assert.equal(new Set(r.candidates.filter(c=>c.item.brand==='Large').map(c=>c.item.cat+':'+c.item.for)).size,4);
 assert.equal(rank(rows,[],params).candidates.length,200);
 for(const limit of [0,501,-1,2.5,NaN])assert.throws(()=>rank(rows,[],params,null,limit));
});

// No plaintext candidate exports or review page. Only a public-key-sealed inbox batch leaves the runner.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {snapshots,scanCandidates,existingCatalogue} from './engine.mjs';
const Seal=createRequire(import.meta.url)('../extension/seal.js');
const ROOT=fileURLToPath(new URL('../../',import.meta.url));

export async function enqueueScan(items,api,batchId){
  if(!items.length)return {queued:0};
  const lock=await api.getFile('inbox-pub.json');
  if(!lock.text)throw Error('Review inbox not set up');
  const batch=await Seal.seal({source:'sourcing scan',items},JSON.parse(lock.text).jwk);
  batch.id=batchId;
  for(let attempt=0;attempt<3;attempt++){
    const file=await api.getFile('inbox.json');
    const inbox=file.text?JSON.parse(file.text):{batches:[]};
    if(!Array.isArray(inbox.batches))throw Error('Invalid inbox; refusing to replace it');
    if(inbox.batches.some(b=>b.id===batchId))return {queued:0,alreadyQueued:true};
    const result=await api.putFile('inbox.json',JSON.stringify({...inbox,batches:[...inbox.batches,batch]}),file.sha,`Sourcing scan: ${items.length} items for book review`);
    if(result.ok)return {queued:items.length};
    if(!result.conflict)throw Error('Inbox save failed');
  }
  throw Error('Inbox kept changing; rerun this workflow to retry');
}
async function main(){
  const dir=process.argv[2];if(!dir)throw Error('queue.mjs SNAPSHOT_DIR [PHOTO_SCORES_JSON]');
  const {all,sources}=snapshots(dir),photoFile=process.argv[3];
  const photos=photoFile&&fs.existsSync(photoFile)?JSON.parse(fs.readFileSync(photoFile,'utf8')).scores||{}:{};
  const items=scanCandidates(all,existingCatalogue(ROOT),photos,JSON.parse(fs.readFileSync(path.join(ROOT,'prices.json'),'utf8')).params);
  const dry=process.env.GITHUB_REF!=='refs/heads/main';
  let result={queued:0};
  if(!dry){
    if(!process.env.GITHUB_TOKEN||!process.env.GITHUB_RUN_ID)throw Error('Missing workflow credentials or run ID');
    const api=Seal.gh({repo:process.env.GITHUB_REPOSITORY,branch:'gh-pages',token:process.env.GITHUB_TOKEN});
    result=await enqueueScan(items,api,'sourcing-scan:'+process.env.GITHUB_RUN_ID);
  }
  // Counts only: never log refs, estimates, rows or buy prices on a public Actions run.
  console.log(JSON.stringify({discovered:all.length,newItems:items.length,...result,dry,sources:sources.map(s=>({source:s.source,complete:s.complete,products:s.products,errorCount:s.errors?.length||0}))}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Sourcing inbox delivery failed. Check source availability, inbox setup and workflow permissions; rerun to retry.');process.exitCode=1;});

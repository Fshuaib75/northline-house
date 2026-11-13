import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
export function sync(root,output){
 root=fs.realpathSync(root);output=fs.realpathSync(output);
 const manifestPath=path.join(root,'shop/product-pages-manifest.json');
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const next=read(path.join(output,'product-pages-manifest.json'));
 const previous=fs.existsSync(manifestPath)?read(manifestPath):{version:1,paths:[]};
 for(const manifest of [next,previous])if(manifest.version!==1||!Array.isArray(manifest.paths)||!manifest.paths.every(p=>/^shop\/products\/[A-Za-z0-9][A-Za-z0-9._-]*\/index\.html$/.test(p)))throw Error('Invalid generated manifest');
 function target(base,relative){
  const full=path.resolve(base,relative);if(!full.startsWith(base+path.sep))throw Error('Unsafe generated path');
  let current=base;for(const part of relative.split('/')){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Symlink in generated path');}return full;
 }
 const owned=new Set(previous.paths),wanted=new Set(next.paths);
 const writes=next.paths.map(p=>{const to=target(root,p);if(fs.existsSync(to)&&!owned.has(p))throw Error('Refusing to overwrite unowned product page');return [to,fs.readFileSync(target(output,p))];});
 const removals=previous.paths.filter(p=>!wanted.has(p)).map(p=>target(root,p));
 const sitemap=fs.readFileSync(target(output,'sitemap.xml'));
 target(root,'shop/product-pages-manifest.json');target(root,'sitemap.xml');
 for(const [to,content] of writes){fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,content);}
 for(const p of removals)if(fs.existsSync(p))fs.unlinkSync(p);
 fs.mkdirSync(path.dirname(manifestPath),{recursive:true});fs.writeFileSync(manifestPath,JSON.stringify(next,null,2));fs.writeFileSync(path.join(root,'sitemap.xml'),sitemap);
 return {pages:writes.length,removed:removals.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(!process.argv[2]||!process.argv[3])throw Error('Usage: node tools/sync-product-pages.mjs SITE GENERATED_OUTPUT');console.log(sync(process.argv[2],process.argv[3]));}

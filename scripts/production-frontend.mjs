import {fail} from './production-recovery.mjs';
import {getReviewed,requestHttp} from './production-http.mjs';
export async function verifyFrontend(base,host,request=requestHttp){
 try{
  const get=path=>getReviewed(new URL(path,base),host,request);
  const page=await get('/');if(!/^text\/html(?:;|$)/i.test(page.type)||!/<title>\s*Nexus · AETHER workspace\s*<\/title>/i.test(page.body)||!/<div\s+id=["']root["'][^>]*>/i.test(page.body)||/@vite\/client|\/src\/|react-refresh/i.test(page.body))fail();
  const assets=[];
  for(const match of page.body.matchAll(/<(script|link)\b[^>]*>/gi)){
   const tag=match[0],attr=match[1].toLowerCase()==='script'?'src':'href';if(attr==='href'&&!/\brel=["'](?:stylesheet|modulepreload)["']/i.test(tag))continue;
   const source=new RegExp('\\b'+attr+'=["\']([^"\']+)["\']','i').exec(tag)?.[1];if(!source||!/^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(source))fail();
   const u=new URL(source,base);if(u.origin!==new URL(base).origin)fail();assets.push(source);
  }
  if(!assets.some(a=>a.endsWith('.js'))||!assets.some(a=>a.endsWith('.css'))||assets.length>64)fail();
  for(const asset of new Set(assets)){const r=await get(asset);if(asset.endsWith('.js')?!/^(?:application|text)\/(?:javascript|ecmascript)(?:;|$)/i.test(r.type):!/^text\/css(?:;|$)/i.test(r.type))fail();}
 }catch{fail();}
}

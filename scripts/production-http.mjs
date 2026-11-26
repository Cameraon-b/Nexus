import {request as httpRequest} from 'node:http';
import {fail} from './production-recovery.mjs';

export const maxProbeBodyBytes=8*1024*1024;
// Buffer only a bounded response; the deadline covers connection and the entire body.
// Unlike fetch/Undici, node:http preserves the explicitly reviewed Host header.
export function requestHttp(url,{headers,signal}={}){
 return new Promise((resolve,reject)=>{
  const target=new URL(url);
  if(target.protocol!=='http:'||target.username||target.password){reject(Error('Invalid probe URL'));return;}
  const req=httpRequest(target,{headers,signal,agent:false});
  const timer=setTimeout(()=>req.destroy(Error('Probe timed out')),5000);
  const cleanup=()=>clearTimeout(timer);
  req.on('error',error=>{cleanup();reject(error);});
  req.on('response',res=>{
   let size=0;const chunks=[];
   res.on('error',error=>{cleanup();reject(error);});
   res.on('data',chunk=>{
    size+=chunk.length;
    if(size>maxProbeBodyBytes){res.destroy(Error('Probe body too large'));req.destroy();return;}
    chunks.push(chunk);
   });
   res.on('end',()=>{
    cleanup();
    const body=Buffer.concat(chunks).toString('utf8');
    resolve({status:res.statusCode,headers:new Headers(res.headers),text:async()=>body});
   });
  });
  req.end();
 });
}

export async function getReviewed(url,host,request=requestHttp){
 const r=await request(url,{headers:{Host:host},redirect:'error',signal:AbortSignal.timeout(5000)});
 if(r.status!==200)fail();
 const body=await r.text();
 if(!body.trim()||Buffer.byteLength(body)>maxProbeBodyBytes)fail();
 return {body,type:r.headers.get('content-type')??''};
}

export async function readRestoreStatus(url,host,request=requestHttp){
 const {body,type}=await getReviewed(url,host,request);
 if(!/^application\/json(?:;|$)/i.test(type))fail();
 return body;
}

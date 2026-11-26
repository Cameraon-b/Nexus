import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {getReviewed,readRestoreStatus,maxProbeBodyBytes} from './production-http.mjs';

async function serve(handler,check){
 const server=createServer(handler);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await check(`http://127.0.0.1:${server.address().port}`);}
 finally{server.closeAllConnections();server.close();await once(server,'close');}
}
test('bounded adapter refuses oversized and truncated bodies, empty responses and non-200 status without following redirects',async()=>{
 let hits=0;
 await serve((req,res)=>{
  hits++;
  if(req.url==='/large'){res.end(Buffer.alloc(maxProbeBodyBytes+1,120));return;}
  if(req.url==='/truncated'){res.writeHead(200,{'content-length':'100'});res.flushHeaders();res.write('x');res.socket.end();return;}
  if(req.url==='/redirect'){res.writeHead(302,{location:'/ok'}).end('redirect');return;}
  if(req.url==='/missing'){res.writeHead(404).end('missing');return;}
  res.end('');
 },async base=>{
  for(const path of ['/large','/truncated','/redirect','/missing','/empty'])await assert.rejects(()=>getReviewed(base+path,'localhost'));
  assert.equal(hits,5);
 });
});
test('five-second deadline covers a response that never finishes',async()=>{
 await serve((_req,res)=>{res.writeHead(200);res.write('partial');},async base=>{
  const start=Date.now();
  await assert.rejects(()=>getReviewed(base,'localhost'));
  assert.ok(Date.now()-start>=4500);
  assert.ok(Date.now()-start<8000);
 });
});
test('status helper retains injected request seam, deadline, status and JSON content-type checks',async()=>{
 const body='{"requiresBootstrap":false,"registrationAvailable":false}';
 const response=(status,type,text)=>({status,headers:new Headers({'content-type':type}),text:async()=>text});
 assert.equal(await readRestoreStatus('http://127.0.0.1:49991/api/auth/status','localhost',async(url,options)=>{
  assert.equal(options.headers.Host,'localhost');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  return response(200,'application/json; charset=utf-8',body);
 }),body);
 for(const r of [response(302,'application/json',body),response(200,'text/html',body),response(200,'application/json','')])await assert.rejects(()=>readRestoreStatus('http://127.0.0.1','localhost',async()=>r));
});

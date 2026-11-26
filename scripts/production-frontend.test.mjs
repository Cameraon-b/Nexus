import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyFrontend} from './production-frontend.mjs';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
const html='<!doctype html><html><head><title>Nexus · AETHER workspace</title><script type="module" src="/assets/index-abc123.js"></script><link rel="stylesheet" href="/assets/index-abc123.css"></head><body><div id="root"></div></body></html>';
const response=(body,type='text/html',status=200)=>({status,headers:new Headers({'content-type':type}),text:async()=>body});
test('review: restored SPA fetches HTML and every same-origin release asset with Host and no redirects',async()=>{
 const calls=[];await verifyFrontend('http://127.0.0.1:49991','localhost',async(url,options)=>{calls.push([String(url),options]);return String(url).endsWith('.js')?response('console.log(1)','application/javascript'):String(url).endsWith('.css')?response('body{}','text/css'):response(html);});assert.equal(calls.length,3);assert.ok(calls.every(c=>c[1].redirect==='error'&&c[1].headers.Host==='localhost'));
});
test('live adapter sends the reviewed Host header with Node HTTP rather than fetch',async()=>{
 const server=createServer((request,response)=>{if(request.headers.host!=='localhost'){response.writeHead(400).end();return;}if(request.url==='/'){response.writeHead(200,{'content-type':'text/html'}).end(html);return;}if(request.url?.endsWith('.js')){response.writeHead(200,{'content-type':'application/javascript'}).end('console.log(1)');return;}if(request.url?.endsWith('.css')){response.writeHead(200,{'content-type':'text/css'}).end('body{}');return;}response.writeHead(404).end();});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const address=server.address();await verifyFrontend(`http://127.0.0.1:${address.port}`,'localhost');}finally{server.close();await once(server,'close');}
});
test('review: modulepreload JS assets are verified too',async()=>{
 const release=html.replace('</head>','<link rel="modulepreload" href="/assets/preload-test.js"></head>');let fetched=false;await assert.rejects(()=>verifyFrontend('http://127.0.0.1:49991','localhost',async url=>{if(String(url).endsWith('preload-test.js')){fetched=true;return response('','application/javascript',404);}return String(url).endsWith('.js')?response('/* test */','text/javascript'):String(url).endsWith('.css')?response('body{}','text/css'):response(release);}));assert.ok(fetched);
});
test('review: the actual repository Nexus release title is accepted',async()=>{
 const release=readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('/src/main.tsx','/assets/index-test.js').replace('</head>','<link rel="stylesheet" href="/assets/index-test.css"></head>');await verifyFrontend('http://127.0.0.1:49991','localhost',async url=>String(url).endsWith('.js')?response('/* test */','text/javascript'):String(url).endsWith('.css')?response('body{}','text/css'):response(release));
});
test('review: broken/missing/development HTML and missing/empty/redirected/wrong-type assets refuse',async()=>{
 for(const broken of ['',html.replace('Nexus','Wrong'),html.replace('id="root"','id="wrong"'),html.replace('/assets/index-abc123.js','/@vite/client'),html.replace('/assets/index-abc123.js','https://other.invalid/a.js'),html.replace('src="/assets/index-abc123.js"',''),html+'<script src="/src/main.tsx"></script>'])await assert.rejects(()=>verifyFrontend('http://127.0.0.1:49991','localhost',async()=>response(broken)));
 for(const [body,type,status] of [['','application/javascript',200],['x','text/html',200],['x','application/javascript',302],['x','application/javascript',404]])await assert.rejects(()=>verifyFrontend('http://127.0.0.1:49991','localhost',async url=>String(url).endsWith('/')?response(html):response(body,type,status)));
 await assert.rejects(()=>verifyFrontend('http://127.0.0.1:49991','localhost',async()=>response(html,'text/html',404)));
});

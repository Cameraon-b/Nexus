import {fail,exactKeys} from './production-recovery.mjs';
export const maxKeyBytes=64*1024;
// Closed subset, not a general XML implementation. No entities, DTDs, CDATA,
// processing instructions (except the initial declaration), or unknown layouts.
function parse(bytes){
 if(!bytes.length||bytes.length>maxKeyBytes)fail();
 let text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim();
 text=text.replace(/^<\?xml version="1\.0" encoding="utf-8"\?>\s*/i,'');
 if(/<!DOCTYPE|<!ENTITY|&|<\?|<!\[CDATA/i.test(text))fail();
 const stack=[],roots=[];let pos=0;
 const token=/<!--[\s\S]*?-->|<[^>]*>|[^<]+/gy;
 while(pos<text.length){token.lastIndex=pos;const match=token.exec(text);if(!match)fail();const t=match[0];pos=token.lastIndex;
  if(t.startsWith('<!--')){if(!stack.length||t.slice(4,-3).includes('--'))fail();continue;}
  if(t.startsWith('</')){if(!/^<\/[A-Za-z][\w:.-]*\s*>$/.test(t)||!stack.length||stack.pop().name!==t.slice(2,-1).trim())fail();continue;}
  if(t.startsWith('<')){
   const m=/^<([A-Za-z][\w:.-]*)([\s\S]*?)(\/?)>$/.exec(t);if(!m)fail();const attrs={},a=m[2];let p=0;
   while(p<a.length){if(/^\s*$/.test(a.slice(p)))break;const am=/^\s+([A-Za-z][\w:.-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/.exec(a.slice(p));if(!am||Object.hasOwn(attrs,am[1]))fail();attrs[am[1]]=am[2]??am[3];p+=am[0].length;}
   const node={name:m[1],attrs,children:[],text:''};if(stack.length)stack.at(-1).children.push(node);else roots.push(node);if(!m[3])stack.push(node);
  }else if(stack.length)stack.at(-1).text+=t;else if(t.trim())fail();
 }
 if(stack.length||roots.length!==1)fail();return roots[0];
}
function node(n,name,attrs,children){if(!n||n.name!==name)fail();exactKeys(n.attrs,Object.keys(attrs));for(const [k,v] of Object.entries(attrs))if(n.attrs[k]!==v)fail();if(n.children.length!==children)fail();}
export function validateKeyXml(name,bytes){
 try{
  const id=/^key-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.xml$/i.exec(name)?.[1];if(!id)fail();
  const root=parse(bytes);if(root.name!=='key'||root.attrs.id?.toLowerCase()!==id.toLowerCase())fail();
  node(root,'key',{id:root.attrs.id,version:'1'},4);if(root.text.trim())fail();
  const dates=['creationDate','activationDate','expirationDate'].map((name,i)=>{const n=root.children[i];node(n,name,{},0);const s=n.text.trim();if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)$/.test(s))fail();const calendar=s.slice(0,10),[year,month,day]=calendar.split('-').map(Number);if(new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==calendar)fail();const d=Date.parse(s);if(!Number.isFinite(d))fail();return d;});
  if(dates[0]>dates[1]||dates[1]>=dates[2])fail();
  const outer=root.children[3],type=outer.attrs.deserializerType;
  if(typeof type!=='string'||!/^Microsoft\.AspNetCore\.DataProtection\.AuthenticatedEncryption\.ConfigurationModel\.AuthenticatedEncryptorDescriptorDeserializer, Microsoft\.AspNetCore\.DataProtection, Version=10\.0\.0\.0, Culture=neutral, PublicKeyToken=adb9793829ddae60$/.test(type))fail();
  node(outer,'descriptor',{deserializerType:type},1);const inner=outer.children[0];node(inner,'descriptor',{},3);
  node(inner.children[0],'encryption',{algorithm:'AES_256_CBC'},0);node(inner.children[1],'validation',{algorithm:'HMACSHA256'},0);
  const master=inner.children[2],prefix=Object.keys(master.attrs).find(k=>k.endsWith(':requiresEncryption'))?.split(':')[0];if(!prefix)fail();
  node(master,'masterKey',{[prefix+':requiresEncryption']:'true',['xmlns:'+prefix]:'http://schemas.asp.net/2015/03/dataProtection'},1);
  const value=master.children[0];node(value,'value',{},0);const encoded=value.text.trim();if(!/^[A-Za-z0-9+/]{86}==$/.test(encoded)||Buffer.from(encoded,'base64').length!==64)fail();
  for(const n of [outer,inner,master,...inner.children.slice(0,2)])if(n.text.trim())fail();
 }catch{fail();}
}

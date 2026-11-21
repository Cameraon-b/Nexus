import {FormEvent, KeyboardEvent, useEffect, useRef, useState} from 'react';
import {ApiError, WorkspaceApi} from './live-api';
import './agents.css';

export type AgentPerson = {id:string;name:string;kind:'human'|'agent';state:string;availability:'available'|'away'|'offline'|'unknown';isAdmin:boolean;description?:string};
type Token = {id:string;label:string;state:'active'|'revoked';createdAt:string;lastUsedAt:string|null;revokedAt:string|null};
type Summary = {agent:AgentPerson;tokens:Token[];pendingCount:number};
type Issue = {rawToken:string;token:Token};
type View = {kind:'list'}|{kind:'create'}|{kind:'reveal';raw:string}|{kind:'confirm';action:'revoke'|'replace';summary:Summary};
type Field = 'displayName'|'description'|'tokenLabel';
function validateField(key:Field,value:string){
 const label=key==='displayName'?'Display name':key==='description'?'Description':'Token label',max=key==='description'?160:100;
 if(key!=='description'&&!value.trim())return `${label} is required.`;
 if(value.trim().length>max)return `${label} must be at most ${max} characters.`;
 return undefined;
}
const expiryWarning='Your session expired. Save this one-time token before dismissing; it cannot be recovered.';
const errorText=(error:unknown)=>error instanceof ApiError?error.message:'Cannot reach the local server. Please retry.';

export default function ManageAgents({api,onClose,onExpired,sessionEnded=false}:{api:WorkspaceApi;onClose:()=>void;onExpired:()=>void;sessionEnded?:boolean}){
 const [agents,setAgents]=useState<Summary[]>([]),[view,setView]=useState<View>({kind:'list'});
 const [fields,setFields]=useState({displayName:'',description:'',tokenLabel:''});
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [fieldErrors,setFieldErrors]=useState<Partial<Record<keyof typeof fields,string>>>({});
 const generation=useRef(0),requests=useRef(new Set<AbortController>()),revealing=useRef(false),expired=useRef(false);
 const dialog=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),create=useRef<HTMLButtonElement>(null);
 const returnTo=useRef<HTMLElement|null>(null),restoreFocus=useRef(false),mounted=useRef(true),lock=useRef(false);
 const nested=view.kind!=='list';
 useEffect(()=>{
  if(!sessionEnded)return;
  deferExpiry();
 },[sessionEnded,onExpired]);
 function deferExpiry(){
  expired.current=true;
  if(revealing.current)setError(expiryWarning);
  else if(lock.current)setError('Your session expired. Waiting for the pending operation to finish.');
  else onExpired();
 }
 function settleExpiry(){
  if(!expired.current)return false;
  if(revealing.current)setError(expiryWarning);
  else if(!lock.current){onExpired();return true;}
  return false;
 }
 function close(){if(lock.current||revealing.current)return;if(!settleExpiry())onClose();}
 function fail(error:unknown){
  if(error instanceof ApiError&&error.status===401)deferExpiry();
  else setError(errorText(error));
 }
 async function refresh(recovering=false){
  const version=++generation.current,controller=new AbortController();requests.current.add(controller);
  try{
   const next=await api.get<Summary[]>('/admin/agents',controller.signal);
   if(mounted.current&&version===generation.current){setAgents(next);if(!expired.current)setError('');return next;}
  }catch(error){if(mounted.current&&!controller.signal.aborted&&version===generation.current){if(recovering)setAgents([]);fail(error);}}
  finally{requests.current.delete(controller);}
 }
 useEffect(()=>{
  mounted.current=true;let stopped=false;let timer:ReturnType<typeof setTimeout>;
  async function poll(){if(!lock.current)await refresh();if(!stopped)timer=setTimeout(()=>void poll(),5000);}
  void poll();return()=>{stopped=true;mounted.current=false;++generation.current;for(const request of requests.current)request.abort();clearTimeout(timer);};
 },[api]);
 useEffect(()=>{surface.current?.toggleAttribute('inert',nested);const frame=requestAnimationFrame(()=>{
  if(!nested&&restoreFocus.current){restoreFocus.current=false;const target=returnTo.current;if(target?.isConnected&&!target.hasAttribute('disabled'))target.focus();else create.current?.focus();}
  else{const root=dialog.current;(root?.querySelector<HTMLElement>('input:not([disabled]),button:not([disabled])')??root)?.focus();}
 });return()=>cancelAnimationFrame(frame);},[view.kind]);
 useEffect(()=>{if(pending)dialog.current?.focus();},[pending]);
 function open(next:View){returnTo.current=document.activeElement as HTMLElement;setFieldErrors({});setError('');setNotice('');setView(next);}
 function dismiss(){if(lock.current)return;revealing.current=false;restoreFocus.current=true;setView({kind:'list'});setError('');setNotice('');if(expired.current){expired.current=false;onExpired();}}
 function keys(event:KeyboardEvent<HTMLDivElement>){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!lock.current){if(nested)dismiss();else close();}return;}
  if(event.key!=='Tab')return;
  const items=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>!el.closest('[inert]'));
  const first=items[0],last=items.at(-1);
  if(!first||!last){event.preventDefault();event.currentTarget.focus();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 async function submit(event?:FormEvent){
  event?.preventDefault();if(lock.current)return;
  if(view.kind==='create'){
   const invalid:Partial<Record<keyof typeof fields,string>>={};
   for(const key of ['displayName','description','tokenLabel'] as const){
    const message=validateField(key,fields[key]);if(message)invalid[key]=message;
   }
   setFieldErrors(invalid);const first=(['displayName','description','tokenLabel'] as const).find(key=>invalid[key]);
   if(first){document.getElementById(`agent-${first}`)?.focus();return;}
  }
  ++generation.current;lock.current=true;setPending(true);setError('');let succeeded=false;
  try{
   if(view.kind==='create'){
    const result=await api.post<Issue>('/admin/agents',fields);if(!mounted.current)return;setFields({displayName:'',description:'',tokenLabel:''});revealing.current=true;setView({kind:'reveal',raw:result.rawToken});
   }else if(view.kind==='confirm'){
    const active=view.summary.tokens.find(t=>t.state==='active');
    if(view.action==='revoke'){
     if(!active)throw new Error('No active token.');
     await api.post(`/admin/integration-tokens/${active.id}/revoke`,{});if(!mounted.current)return;restoreFocus.current=true;setView({kind:'list'});setNotice('Token revoked. Integration access is blocked.');
    }else{
     const result=await api.post<Issue>(`/admin/agents/${view.summary.agent.id}/tokens`,{label:active?.label??'Connector',expectedTokenId:active?.id??null});if(!mounted.current)return;revealing.current=true;setView({kind:'reveal',raw:result.rawToken});
    }
   }
   succeeded=true;
  }catch(error){
   if(mounted.current){
    if(error instanceof ApiError&&error.status===409&&view.kind==='confirm'&&view.action==='replace'){
     const next=await refresh(true);if(!mounted.current)return;
     const summary=next?.find(item=>item.agent.id===view.summary.agent.id);
     if(summary?.tokens.some(token=>token.state==='active')){setView({...view,summary});setError('Token state changed. Please review the current token before retrying.');}
     else{restoreFocus.current=true;setView({kind:'list'});if(next)setError('This agent or its active token is no longer available. Review the refreshed list.');}
    }else fail(error);
   }
  }finally{lock.current=false;if(mounted.current){setPending(false);settleExpiry();}}
  // Issuance owns the lock, never metadata IO or the subsequent reveal.
  if(succeeded&&mounted.current&&!expired.current)void refresh();
 }
 return <div className="topic-dialog-backdrop"><div className="topic-dialog agents-panel" role={nested?undefined:'dialog'} aria-modal={nested?undefined:true} aria-label="Manage agents" ref={nested?undefined:dialog} tabIndex={-1} onKeyDown={nested?undefined:keys}>
  <div ref={surface}><h2>Manage agents</h2><p>Integration identities and token metadata. Pending replies are not delivered messages.</p><button type="button" onClick={close}>Close manage agents</button><button type="button" ref={create} onClick={()=>open({kind:'create'})}>Create agent</button>
  {notice&&<p role="status">{notice}</p>}{!nested&&error&&<p role="alert">{error}</p>}
  {agents.map(summary=><section key={summary.agent.id} aria-label={`${summary.agent.name} ${summary.agent.id}`}><h3>{summary.agent.name} <span className="kind-tag">AGENT</span></h3><small>{summary.agent.id}</small><p>{summary.agent.description}</p><p>Availability: {summary.agent.availability}</p><p>Pending replies: {summary.pendingCount}</p>
   {summary.tokens.map(token=><div key={token.id}><p>{token.label} · {token.state}</p><small>Created: {new Date(token.createdAt).toLocaleString()} · Last used: {token.lastUsedAt?new Date(token.lastUsedAt).toLocaleString():'Never'}{token.revokedAt?` · Revoked: ${new Date(token.revokedAt).toLocaleString()}`:''}</small></div>)}
   <button disabled={!summary.tokens.some(t=>t.state==='active')} onClick={()=>open({kind:'confirm',action:'revoke',summary})}>Revoke token</button><button onClick={()=>open({kind:'confirm',action:'replace',summary})}>Replace token</button></section>)}
  </div>
  {nested&&<div className="topic-dialog-backdrop"><div className="topic-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={view.kind==='create'?'Create agent':view.kind==='reveal'?'Save integration token':view.action==='revoke'?'Revoke token?':'Replace token?'} tabIndex={-1} onKeyDown={keys} aria-busy={pending}>
   {view.kind==='create'&&<form noValidate onSubmit={event=>void submit(event)}><h2>Create agent</h2>{(['displayName','description','tokenLabel'] as const).map(key=><div className="live-field" key={key}><label htmlFor={`agent-${key}`}>{key==='displayName'?'Agent display name':key==='description'?'Description':'Token label'}</label><input id={`agent-${key}`} required={key!=='description'} aria-invalid={fieldErrors[key]?true:undefined} aria-describedby={fieldErrors[key]?`agent-${key}-error`:undefined} value={fields[key]} disabled={pending} onChange={e=>{const value=e.target.value;setFields({...fields,[key]:value});setFieldErrors(previous=>{if(!previous[key])return previous;const next={...previous},message=validateField(key,value);if(message)next[key]=message;else delete next[key];return next;});}}/>{fieldErrors[key]&&<p id={`agent-${key}-error`} role="alert">{fieldErrors[key]}</p>}</div>)}<button type="button" disabled={pending} onClick={dismiss}>Cancel</button><button disabled={pending}>{pending?'Creating…':'Create'}</button></form>}
   {view.kind==='reveal'&&<><h2>Save integration token</h2><p>This token will not be shown again. Store it securely. Anyone holding it can act as this agent.</p><label htmlFor="revealed-integration-token">Integration token</label><input id="revealed-integration-token" readOnly value={view.raw}/><button onClick={()=>void navigator.clipboard.writeText(view.raw).then(()=>setNotice('Token copied.')).catch(()=>setError('Copy failed. Select and copy the token manually.'))}>Copy token</button><button onClick={dismiss}>Done</button>{notice&&<p role="status">{notice}</p>}</>}
   {view.kind==='confirm'&&<><h2>{view.action==='revoke'?'Revoke token?':'Replace token?'}</h2><p>{view.action==='revoke'?'Immediately block this connector.':'Revoke the current token and reveal a new token once.'}</p><button disabled={pending} onClick={dismiss}>Cancel</button><button disabled={pending} onClick={()=>void submit()}>{pending?'Saving…':view.action==='revoke'?'Confirm revoke':'Confirm replace'}</button></>}
   {error&&<p role="alert">{revealing.current&&expired.current&&error!==expiryWarning?`${expiryWarning} ${error}`:error}</p>}
  </div></div>}
 </div></div>;
}

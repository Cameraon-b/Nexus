import {KeyboardEvent, useCallback, useEffect, useRef, useState} from 'react';
import {ApiError, WorkspaceApi} from './live-api';
import './review.css';

type Person={id:string;name:string};
type Draft={id:string;body:string;state:string;createdAt:string};
type Destination={id:string;title:string;kind:string};
type Item={draft:Draft;agent:Person;destination:Destination};
type Decision={outcome:string;finalBody:string|null;reason:string|null;resolvedAt:string;deliveredMessageId:string|null};
type ContextMessage={id:string;authorId:string;createdAt:string;body:string};
type Detail=Item&{recipients:Person[];sourceMessage:ContextMessage|null;context:ContextMessage[];decision:Decision|null;reviewer:Person|null};
const identity=(person:Person)=>`${person.name} [${person.id}]`;
const destinationIdentity=(destination:Destination)=>`${destination.title} [${destination.id}]`;
function renderContext(message:ContextMessage,detail:Detail){
 const author=[detail.agent,...detail.recipients].find(p=>p.id===message.authorId);
 return <><p>{author?identity(author):`Participant [${message.authorId}]`} · <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></p><p className="review-body">{message.body}</p></>;
}
type Page={items:Item[];nextCursor:string|null;pendingCount:number};
const errorText=(e:unknown)=>e instanceof ApiError?e.message:'Cannot reach the local server. Retry safely.';
function trap(event:KeyboardEvent<HTMLElement>){
 if(event.key!=='Tab')return;
 const elements=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(e=>e.getClientRects().length>0);
 const first=elements[0],last=elements.at(-1);
 if(!first){event.preventDefault();event.currentTarget.focus();return;}
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
 if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
export default function ReviewQueue({api,onClose,onExpired,onCount}:{api:WorkspaceApi;onClose:()=>void;onExpired:()=>void;onCount:(count:number)=>void}){
 const [tab,setTab]=useState<'pending'|'resolved'>('pending');
 const [batches,setBatches]=useState<{cursor:string;items:Item[];next:string|null}[]>([]);
 const items=[...new Map(batches.flatMap(batch=>batch.items).slice().reverse().map(item=>[item.draft.id,item])).values()].sort((a,b)=>a.draft.createdAt.localeCompare(b.draft.createdAt)||a.draft.id.localeCompare(b.draft.id));
 const next=batches.at(-1)?.next??null;
 const [selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<Detail|null>(null);
 const [body,setBody]=useState(''),[fieldError,setFieldError]=useState(''),[error,setError]=useState(''),[detailError,setDetailError]=useState(''),[status,setStatus]=useState('');
 const [loading,setLoading]=useState(true),[pending,setPending]=useState(false),[confirm,setConfirm]=useState(false),[reason,setReason]=useState('');
 const mounted=useRef(true),queueGeneration=useRef(0),detailGeneration=useRef(0),operation=useRef(false);
 const selectedRef=useRef(selected);selectedRef.current=selected;
 const tombstones=useRef(new Set<string>()),controller=useRef<AbortController>(),detailController=useRef<AbortController>();
 const intent=useRef<{id:string;payload:string;key:string}>();
 const confirmation=useRef<HTMLDivElement>(null);
 const surface=useRef<HTMLDivElement>(null),shell=useRef<HTMLDivElement>(null),title=useRef<HTMLHeadingElement>(null),editor=useRef<HTMLTextAreaElement>(null),reject=useRef<HTMLButtonElement>(null),cancel=useRef<HTMLButtonElement>(null);
 const expire=useCallback((e:unknown)=>{if(e instanceof ApiError&&(e.status===401||e.status===403)){++queueGeneration.current;++detailGeneration.current;controller.current?.abort();detailController.current?.abort();setDetail(null);setBatches([]);onExpired();return true;}return false;},[onExpired]);
 const load=useCallback(async(after?:string)=>{
  const generation=++queueGeneration.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
  try{
   const page=await api.get<Page>(`/admin/approvals?status=${tab}&limit=25${after?`&after=${encodeURIComponent(after)}`:''}`,abort.signal);
   if(!mounted.current||abort.signal.aborted||generation!==queueGeneration.current)return;
   setBatches(current=>{
    const batch={cursor:after??'',items:page.items.filter(i=>tab==='resolved'||!tombstones.current.has(i.draft.id)),next:page.nextCursor};
    const index=current.findIndex(b=>b.cursor===batch.cursor);
    return index<0?[...current,batch]:current.map((b,i)=>i===index?batch:b);
   });
   onCount(page.pendingCount);setError('');
  }catch(e){if(!abort.signal.aborted&&mounted.current&&generation===queueGeneration.current&&!expire(e))setError(errorText(e));}
  finally{if(mounted.current&&generation===queueGeneration.current)setLoading(false);}
 },[api,tab,onCount,expire]);
 useEffect(()=>{mounted.current=true;title.current?.focus();return()=>{mounted.current=false;controller.current?.abort();detailController.current?.abort();++queueGeneration.current;++detailGeneration.current;};},[]);
 useEffect(()=>{setLoading(true);void load();const timer=setInterval(()=>{if(!operation.current)void load();},5000);return()=>{clearInterval(timer);controller.current?.abort();++queueGeneration.current;};},[load]);
 useEffect(()=>{surface.current?.toggleAttribute('inert',confirm);if(confirm)cancel.current?.focus();},[confirm]);
 async function choose(id:string){
  if(operation.current)return;
  const generation=++detailGeneration.current;detailController.current?.abort();const abort=new AbortController();detailController.current=abort;
  selectedRef.current=id;setSelected(id);setDetail(null);setDetailError('');setFieldError('');
  try{const result=await api.get<Detail>(`/admin/approvals/${id}`,abort.signal);if(!mounted.current||abort.signal.aborted||generation!==detailGeneration.current||selectedRef.current!==id)return;if(result.draft.state!=='pending'&&tab==='pending'){tombstones.current.add(id);++queueGeneration.current;controller.current?.abort();setBatches(current=>current.map(batch=>({...batch,items:batch.items.filter(item=>item.draft.id!==id)})));setStatus(`Proposal resolved: ${result.draft.state}.`);void load();}setDetail(result);setBody(result.draft.body);setReason('');requestAnimationFrame(()=>document.getElementById('review-detail-title')?.focus());}
  catch(e){if(!abort.signal.aborted&&mounted.current&&generation===detailGeneration.current&&!expire(e))setDetailError(errorText(e));}
 }
 function back(){if(operation.current)return;++detailGeneration.current;detailController.current?.abort();setSelected(null);selectedRef.current=null;setDetail(null);setDetailError('');requestAnimationFrame(()=>title.current?.focus());}
 function switchTab(value:'pending'|'resolved'){if(operation.current)return;back();++queueGeneration.current;controller.current?.abort();setBatches([]);setTab(value);setStatus('');}
 function dismissConfirmation(){if(operation.current)return;setConfirm(false);requestAnimationFrame(()=>reject.current?.focus());}
 async function decide(outcome:string){
  if(operation.current||!detail||detail.draft.state!=='pending')return;
  if(outcome!=='rejected'&&(!body.trim()||body.trim().length>5000)){setFieldError('Enter a final message of 1–5000 characters.');editor.current?.focus();return;}
  const id=detail.draft.id;
  const payload={outcome,finalBody:outcome==='approved_with_edits'?body.trim():null,reason:outcome==='rejected'?reason.trim()||null:null};
  const serialized=JSON.stringify(payload);if(intent.current?.id!==id||intent.current.payload!==serialized)intent.current={id,payload:serialized,key:crypto.randomUUID()};
  operation.current=true;setPending(true);setError('');++queueGeneration.current;controller.current?.abort();++detailGeneration.current;detailController.current?.abort();if(confirm)confirmation.current?.focus();else shell.current?.focus();
  try{
   let decision:Decision;
   try{decision=await api.post<Decision>(`/admin/approvals/${id}/decision`,{...payload,clientRequestId:intent.current.key});}
   catch(e){
    if(!(e instanceof ApiError)||e.status!==409)throw e;
    const authoritative=await api.get<Detail>(`/admin/approvals/${id}`);
    if(authoritative.draft.state==='pending')throw e;
    decision=authoritative.decision!;if(mounted.current)setDetail(authoritative);
   }
   if(!mounted.current)return;
   tombstones.current.add(id);setBatches(current=>current.map(batch=>({...batch,items:batch.items.filter(item=>item.draft.id!==id)})));setConfirm(false);
   setDetail(current=>current?.draft.id===id?{...current,draft:{...current.draft,state:decision.outcome},decision}:current);
   setStatus(`Proposal resolved: ${decision.outcome}.`);intent.current=undefined;
   // Reconcile badge from the server after tombstoning; pre-decision polls are invalid.
   await load();requestAnimationFrame(()=>title.current?.focus());
  }catch(e){if(mounted.current&&!expire(e))setError(errorText(e));}
  finally{operation.current=false;if(mounted.current)setPending(false);}
 }
 return <div className="review-backdrop"><div className="review-shell" ref={shell} role="dialog" aria-modal="true" aria-labelledby="review-title" tabIndex={-1} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(confirm)dismissConfirmation();else if(!operation.current)onClose();}else trap(event);}}>
  <div className="review-surface" ref={surface}>
   <header className="review-header"><div><p className="eyebrow">HUMAN GOVERNANCE</p><h1 id="review-title" ref={title} tabIndex={-1}>Review queue</h1></div><button className="button" aria-label="Close review queue" disabled={pending} onClick={onClose}>Close</button></header>
   <nav aria-label="Approval views"><button className="button" aria-pressed={tab==='pending'} disabled={pending} onClick={()=>switchTab('pending')}>Pending</button><button className="button" aria-pressed={tab==='resolved'} disabled={pending} onClick={()=>switchTab('resolved')}>History</button></nav>
   <p role="status" aria-live="polite">{status}</p>{error&&<div role="alert"><p>{error}</p><button className="button" disabled={pending} onClick={()=>void load()}>Retry refresh</button></div>}
   <div className={`review-columns ${selected?'has-selection':''}`}>
    <section className="review-list" aria-label={tab==='pending'?'Pending proposals':'Resolved history'}>{loading?<p>Loading proposals…</p>:items.length===0?<p>{tab==='pending'?'All caught up. No pending proposals.':'No resolved proposals.'}</p>:items.map(item=><button className="review-item" key={item.draft.id} disabled={pending} aria-current={selected===item.draft.id?'true':undefined} onClick={()=>void choose(item.draft.id)}><b>{identity(item.agent)} · {destinationIdentity(item.destination)} · Draft [{item.draft.id}]</b><time>{new Date(item.draft.createdAt).toLocaleString()}</time><span>{item.draft.body.slice(0,140)}</span><small>{item.draft.state}</small></button>)}{next&&<button className="button" disabled={pending} onClick={()=>void load(next)}>Load more</button>}</section>
    <section className="review-detail" aria-label="Proposal detail">{selected&&<button className="button review-back" disabled={pending} onClick={back}>Back to list</button>}{!selected?<p>Select a proposal to review its private context.</p>:detailError?<div role="alert"><p>Cannot load proposal detail. {detailError}</p><button className="button" onClick={()=>void choose(selected)}>Retry proposal detail</button></div>:!detail?<p>Loading proposal…</p>:<>
     <h2 id="review-detail-title" tabIndex={-1}>{identity(detail.agent)} → {destinationIdentity(detail.destination)} · Draft [{detail.draft.id}]</h2><p>Recipients: {detail.recipients.map(identity).join(', ')}</p>
     {detail.sourceMessage&&<><h3>Source message</h3><div>{renderContext(detail.sourceMessage,detail)}</div></>}<h3>Delivered context (up to 20 messages)</h3>{detail.context.map(m=><div key={m.id}>{renderContext(m,detail)}</div>)}
     <h3>Original proposal</h3><p className="review-body">{detail.draft.body}</p>
     {detail.draft.state==='pending'?<><label htmlFor="review-body">Final message body</label><textarea ref={editor} id="review-body" value={body} disabled={pending} aria-invalid={fieldError?true:undefined} aria-describedby={fieldError?'review-body-error':'review-authorship'} onChange={e=>{setBody(e.target.value);setFieldError('');}}/><p id="review-authorship">Released as {identity(detail.agent)}, not the reviewing admin.</p>{fieldError&&<p id="review-body-error" role="alert">{fieldError}</p>}<div className="review-actions"><button className="button primary" disabled={pending} onClick={()=>void decide(body.trim()===detail.draft.body?'approved':'approved_with_edits')}>{pending?'Saving…':body.trim()===detail.draft.body?'Approve unchanged':'Approve with edits'}</button><button className="button" ref={reject} disabled={pending} onClick={()=>setConfirm(true)}>Reject</button></div></>:<><h3>Outcome: {detail.draft.state}</h3>{detail.decision?.finalBody&&<><h3>Final wording</h3><p className="review-body">{detail.decision.finalBody}</p></>}<p>Reviewer: {detail.reviewer?identity(detail.reviewer):'Current administrator'}</p><p>{detail.decision?.resolvedAt&&new Date(detail.decision.resolvedAt).toLocaleString()}</p>{detail.decision?.reason&&<p className="review-body">{detail.decision.reason}</p>}{detail.decision?.deliveredMessageId&&<p>Delivered message: {detail.decision.deliveredMessageId}</p>}</>}
    </>}</section>
   </div>
  </div>
  {confirm&&<div className="review-confirm-backdrop"><div className="review-confirm" ref={confirmation} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="review-reject-title" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();dismissConfirmation();}else trap(e);}}><h2 id="review-reject-title">Reject proposal?</h2><p>No message will be published. This decision is final.</p><button className="button" ref={cancel} disabled={pending} onClick={dismissConfirmation}>Cancel</button><label htmlFor="review-reason">Reason (optional, private)</label><textarea id="review-reason" value={reason} maxLength={1000} disabled={pending} onChange={e=>setReason(e.target.value)}/>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={pending} onClick={()=>void decide('rejected')}>{pending?'Saving…':'Confirm reject'}</button></div></div>}
 </div></div>;
}

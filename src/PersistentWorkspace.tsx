import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Hash, Home, LogOut, MessagesSquare, Plus, ShieldCheck, UserRound, X } from 'lucide-react';
import { ApiError, WorkspaceApi } from './live-api';

type User = {id:string;email:string;displayName:string;participantId:string;isAdmin:boolean};
type Person = {id:string;name:string;kind:'human';state:'active';availability:'available';isAdmin:boolean;description?:string};
type Message = {id:string;conversationId:string;authorId:string;body:string;state:'delivered';createdAt:string};
type Conversation = {id:string;title:string;kind:'main'|'topical'|'direct';state:'active'|'archived'|'closed';participantIds:string[];description?:string;createdAt?:string};
type HomeRoom = {participants:Person[];conversation:Conversation;conversations:Conversation[];messages:Message[]};
type InitialRoom = {participants:Person[];conversation:Omit<Conversation,'kind'|'state'>&Partial<Pick<Conversation,'kind'|'state'>>;conversations?:Conversation[];messages:Message[]};
type TopicFields = {title:string;description:string;openingMessage:string};
type TopicErrors = Partial<Record<keyof TopicFields,string>>;
type TopicResponse = {conversation:Conversation;openingMessage:Message};

const errorText=(error:unknown)=>error instanceof ApiError?error.message:'Cannot reach the local server. Check that it is running, then retry.';
const normalize=(room:InitialRoom|HomeRoom):HomeRoom=>{const conversation:Conversation={kind:'main',state:'active',...room.conversation};return {...room,conversation,conversations:room.conversations?.length?room.conversations:[conversation]};};
const mergeMessages=(current:Message[],incoming:Message[])=>[...new Map([...current,...incoming].map(message=>[message.id,message])).values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
function Brand(){return <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span/><span/><span/><span/></div><div><div className="brand-name">nexus</div><div className="brand-sub">LOCAL WORKSPACE</div></div></div>;}
function Avatar({name}:{name:string}){return <span className="avatar avatar-sage" aria-hidden="true">{name.trim().slice(0,1).toUpperCase()}</span>;}

export default function PersistentWorkspace({api,user,initialRoom,onExpired,onLogout}:{api:WorkspaceApi;user:User;initialRoom:InitialRoom;onExpired:()=>void;onLogout:()=>void}){
 const initial=normalize(initialRoom);
 const [participants,setParticipants]=useState(initial.participants);
 const [conversations,setConversations]=useState<Conversation[]>(initial.conversations);
 const [selectedId,setSelectedId]=useState(initial.conversation.id);
 const knownIds=useRef(new Set(initial.conversations.map(item=>item.id)));
 const creationVersion=useRef(0);
 const localCreations=useRef(new Map<string,number>());
 const selectedRef=useRef(selectedId);selectedRef.current=selectedId;
 const [messages,setMessages]=useState<Record<string,Message[]>>({[initial.conversation.id]:initial.messages});
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [sendErrors,setSendErrors]=useState<Record<string,string>>({});
 const [sendingIds,setSendingIds]=useState<Record<string,boolean>>({});
 const [connected,setConnected]=useState(true);
 const [topicsOpen,setTopicsOpen]=useState(false);
 const [directOpen,setDirectOpen]=useState(false);
 const [directCreating,setDirectCreating]=useState(false);
 const [recipientId,setRecipientId]=useState('');
 const [directError,setDirectError]=useState('');
 const [directPending,setDirectPending]=useState(false);
 const directLock=useRef(false);
 const newMessageTrigger=useRef<HTMLButtonElement>(null);
 const recipientSelect=useRef<HTMLSelectElement>(null);
 const directDialog=useRef<HTMLFormElement>(null);
 const [creating,setCreating]=useState(false);
 const [topicFields,setTopicFields]=useState<TopicFields>({title:'',description:'',openingMessage:''});
 const [topicErrors,setTopicErrors]=useState<TopicErrors>({});
 const [topicError,setTopicError]=useState('');
 const [topicPending,setTopicPending]=useState(false);
 const topicIntent=useRef<{fields:TopicFields;clientRequestId:string}>();
 const sendIntents=useRef<Record<string,{body:string;clientRequestId:string}>>({});
 const sendLocks=useRef<Record<string,boolean>>({});
 const revisions=useRef<Record<string,number>>({});
 // Tombstones prevent pre-revocation requests from populating a later cache lifetime.
 const lifetimes=useRef<Record<string,number>>({});
 const reconciliationGeneration=useRef(0);
 const purgedAt=useRef(new Map<string,number>());
 const mounted=useRef(true);
 const timeline=useRef<HTMLDivElement>(null);
 const workspaceSurface=useRef<HTMLDivElement>(null);
 const newTopicTrigger=useRef<HTMLButtonElement>(null);
 const topicDialog=useRef<HTMLFormElement>(null);
 const topicTitle=useRef<HTMLInputElement>(null);
 const messageComposer=useRef<HTMLTextAreaElement>(null);
 const focusComposerAfterCreate=useRef<string>();
 const [logoutPending,setLogoutPending]=useState(false);
 const [logoutError,setLogoutError]=useState('');
 const selected=conversations.find(item=>item.id===selectedId)??initial.conversation;
 const currentMessages=messages[selected.id]??[];
 const composer=drafts[selected.id]??'';
 const topics=conversations.filter(item=>item.kind==='topical'&&item.state==='active');
 const expireIfNeeded=useCallback((error:unknown)=>{if(error instanceof ApiError&&error.status===401){onExpired();return true;}return false;},[onExpired]);

 const purge=useCallback((ids:string[])=>{
  const removed=new Set(ids);
  for(const id of ids){purgedAt.current.set(id,++reconciliationGeneration.current);lifetimes.current[id]=(lifetimes.current[id]??0)+1;knownIds.current.delete(id);localCreations.current.delete(id);delete sendIntents.current[id];delete sendLocks.current[id];delete revisions.current[id];}
  const prune=<T,>(current:Record<string,T>)=>Object.fromEntries(Object.entries(current).filter(([id])=>!removed.has(id)));
  setMessages(prune);setDrafts(prune);setSendErrors(prune);setSendingIds(prune);
  setConversations(current=>current.filter(item=>!removed.has(item.id)));
  if(removed.has(selectedRef.current)){selectedRef.current=initial.conversation.id;setSelectedId(initial.conversation.id);}
 },[initial.conversation.id]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const loadHistory=useCallback(async(id:string,signal?:AbortSignal)=>{
  const startedAt=revisions.current[id]??0;
  const lifetime=lifetimes.current[id]??0;
  try{
   const history=await api.get<Message[]>(`/conversations/${encodeURIComponent(id)}/messages`,signal);
   if(signal?.aborted||!mounted.current||!knownIds.current.has(id)||lifetime!==(lifetimes.current[id]??0))return;
   if(startedAt===(revisions.current[id]??0))setMessages(current=>({...current,[id]:mergeMessages(current[id]??[],history)}));
   setConnected(true);
  }catch(error){if(signal?.aborted||!mounted.current||lifetime!==(lifetimes.current[id]??0))return;if(error instanceof ApiError&&(error.status===403||error.status===404)){purge([id]);return;}if(!expireIfNeeded(error))setConnected(false);}
 },[api,expireIfNeeded,purge]);
 useEffect(()=>{
  if(selectedId===initial.conversation.id)return;
  const controller=new AbortController();void loadHistory(selectedId,controller.signal);return()=>controller.abort();
 },[selectedId,initial.conversation.id,loadHistory]);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function refresh(){
   const startedVersion=creationVersion.current;
   const startedGeneration=reconciliationGeneration.current;
   try{
    const latest=normalize(await api.get<HomeRoom>('/workspace/home',controller.signal));
    if(controller.signal.aborted)return;
    setParticipants(latest.participants);
    const snapshot=latest.conversations.filter(item=>(purgedAt.current.get(item.id)??0)<=startedGeneration);
    const snapshotIds=new Set(snapshot.map(item=>item.id));
    for(const [id,version] of localCreations.current)if(snapshotIds.has(id)||startedVersion>=version)localCreations.current.delete(id);
    const allowed=new Set([...snapshotIds,...localCreations.current.keys()]);
    purge([...knownIds.current].filter(id=>!allowed.has(id)));
    knownIds.current=allowed;
    setConversations(current=>[...snapshot,...current.filter(item=>!snapshotIds.has(item.id)&&localCreations.current.has(item.id))]);
    setMessages(current=>({...current,[latest.conversation.id]:mergeMessages(current[latest.conversation.id]??[],latest.messages)}));
    setConnected(true);
    const active=selectedRef.current;if(active!==latest.conversation.id&&allowed.has(active))await loadHistory(active,controller.signal);
   }catch(error){if(controller.signal.aborted)return;if(!expireIfNeeded(error))setConnected(false);}
   if(!controller.signal.aborted)timer=setTimeout(()=>void refresh(),5000);
  }
  timer=setTimeout(()=>void refresh(),5000);return()=>{controller.abort();clearTimeout(timer);};
 },[api,expireIfNeeded,initial.conversation.id,loadHistory,purge]);
 useEffect(()=>{if(timeline.current)timeline.current.scrollTop=timeline.current.scrollHeight;},[selectedId,currentMessages.at(-1)?.id]);
 useEffect(()=>{workspaceSurface.current?.toggleAttribute('inert',creating||directCreating);},[creating,directCreating]);
 useEffect(()=>{if(directPending)directDialog.current?.focus();},[directPending]);
 useEffect(()=>{if(!directCreating)return;const frame=requestAnimationFrame(()=>recipientSelect.current?.focus());return()=>cancelAnimationFrame(frame);},[directCreating]);
 useEffect(()=>{if(!creating)return;const frame=requestAnimationFrame(()=>topicTitle.current?.focus());return()=>cancelAnimationFrame(frame);},[creating]);
 useEffect(()=>{if(creating||directCreating||focusComposerAfterCreate.current!==selectedId)return;focusComposerAfterCreate.current=undefined;const frame=requestAnimationFrame(()=>messageComposer.current?.focus());return()=>cancelAnimationFrame(frame);},[creating,directCreating,selectedId]);

 function choose(id:string){setSelectedId(id);const kind=conversations.find(item=>item.id===id)?.kind;if(kind==='topical'){setTopicsOpen(true);setDirectOpen(false);}if(kind==='direct'){setDirectOpen(true);setTopicsOpen(false);}}
 function changeTopicField(name:keyof TopicFields,value:string){setTopicFields(current=>({...current,[name]:value}));setTopicErrors(current=>{if(!current[name])return current;const next={...current};delete next[name];return next;});setTopicError('');}
 function closeTopic(){if(topicPending)return;setCreating(false);setTopicErrors({});setTopicError('');requestAnimationFrame(()=>newTopicTrigger.current?.focus());}
 function handleTopicDialogKey(event:ReactKeyboardEvent<HTMLFormElement>){
  if(event.key==='Escape'){event.preventDefault();if(!topicPending)closeTopic();return;}
  if(event.key!=='Tab')return;
  trapDialogFocus(event);
 }
 function trapDialogFocus(event:ReactKeyboardEvent<HTMLFormElement>){
  if(event.key!=='Tab')return;
  const focusable=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter(element=>!element.hasAttribute('hidden'));
  const first=focusable[0],last=focusable.at(-1);if(!first||!last){event.preventDefault();event.currentTarget.focus();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 function closeDirect(){if(directLock.current)return;setDirectCreating(false);setDirectError('');requestAnimationFrame(()=>newMessageTrigger.current?.focus());}
 async function createDirect(event:FormEvent){
  event.preventDefault();if(directLock.current)return;
  if(!recipientId){setDirectError('Choose a person to message.');recipientSelect.current?.focus();return;}
  directLock.current=true;setDirectPending(true);setDirectError('');
  try{
   const conversation=await api.post<Conversation>('/conversations/direct',{participantId:recipientId});
   if(!mounted.current)return;
   localCreations.current.set(conversation.id,++creationVersion.current);knownIds.current.add(conversation.id);
   setConversations(current=>[...current.filter(item=>item.id!==conversation.id),conversation]);
   focusComposerAfterCreate.current=conversation.id;setSelectedId(conversation.id);setDirectOpen(true);setTopicsOpen(false);setDirectCreating(false);setRecipientId('');setConnected(true);
  }catch(error){if(mounted.current&&!expireIfNeeded(error))setDirectError(`Conversation was not opened. ${errorText(error)} Retry reopens the same participant pair.`);}
  finally{directLock.current=false;if(mounted.current)setDirectPending(false);}
 }
 async function createTopic(event:FormEvent){
  event.preventDefault();if(topicPending)return;
  const fields={title:topicFields.title.trim(),description:topicFields.description.trim(),openingMessage:topicFields.openingMessage.trim()};
  const errors:TopicErrors={};if(!fields.title)errors.title='Enter a topic title.';if(!fields.openingMessage)errors.openingMessage='Enter an opening message.';
  if(Object.keys(errors).length){setTopicErrors(errors);requestAnimationFrame(()=>errors.title?topicTitle.current?.focus():document.getElementById('topic-opening')?.focus());return;}
  if(!topicIntent.current||JSON.stringify(topicIntent.current.fields)!==JSON.stringify(fields))topicIntent.current={fields,clientRequestId:crypto.randomUUID()};
  setTopicPending(true);setTopicError('');
  try{
   const result=await api.post<TopicResponse>('/conversations/topical',{...topicIntent.current.fields,clientRequestId:topicIntent.current.clientRequestId});
   if(!mounted.current)return;
   localCreations.current.set(result.conversation.id,++creationVersion.current);knownIds.current.add(result.conversation.id);
   revisions.current[result.conversation.id]=(revisions.current[result.conversation.id]??0)+1;
   setConversations(current=>[...current.filter(item=>item.id!==result.conversation.id),result.conversation]);
   setMessages(current=>({...current,[result.conversation.id]:mergeMessages(current[result.conversation.id]??[],[result.openingMessage])}));
   focusComposerAfterCreate.current=result.conversation.id;setSelectedId(result.conversation.id);setTopicsOpen(true);setCreating(false);setTopicFields({title:'',description:'',openingMessage:''});setTopicErrors({});topicIntent.current=undefined;setConnected(true);
  }catch(error){if(!mounted.current)return;if(!expireIfNeeded(error)){setTopicError(`Topic was not created. ${errorText(error)} Retry uses the same request without duplicating it.`);if(!(error instanceof ApiError)||error.status>=500)setConnected(false);}}
  finally{if(mounted.current)setTopicPending(false);}
 }
 async function send(event?:FormEvent){
  event?.preventDefault();const id=selectedRef.current;const body=(drafts[id]??'').trim();if(!body||sendLocks.current[id])return;
  sendLocks.current[id]=true;setSendingIds(current=>({...current,[id]:true}));setSendErrors(current=>({...current,[id]:''}));
  const existing=sendIntents.current[id];if(!existing||existing.body!==body)sendIntents.current[id]={body,clientRequestId:crypto.randomUUID()};
  const submitted=sendIntents.current[id];
  const lifetime=lifetimes.current[id]??0;
  try{
   const message=await api.post<Message>(`/conversations/${encodeURIComponent(id)}/messages`,submitted);
   if(!mounted.current||!knownIds.current.has(id)||lifetime!==(lifetimes.current[id]??0))return;
   revisions.current[id]=(revisions.current[id]??0)+1;
   setMessages(current=>({...current,[id]:mergeMessages(current[id]??[],[message])}));
   setDrafts(current=>(current[id]??'').trim()===submitted.body?{...current,[id]:''}:current);delete sendIntents.current[id];setConnected(true);
  }catch(error){if(!mounted.current||lifetime!==(lifetimes.current[id]??0))return;if(error instanceof ApiError&&(error.status===403||error.status===404)){purge([id]);return;}if(!expireIfNeeded(error)){setSendErrors(current=>({...current,[id]:`Delivery not confirmed. ${errorText(error)} Retry sends the same request without duplicating it.`}));if(!(error instanceof ApiError)||error.status>=500)setConnected(false);}}
  finally{if(lifetime===(lifetimes.current[id]??0)){delete sendLocks.current[id];if(mounted.current)setSendingIds(current=>({...current,[id]:false}));}}
 }
 async function logout(){if(logoutPending)return;setLogoutPending(true);try{await api.post('/auth/logout');onLogout();}catch(error){if(!expireIfNeeded(error))setLogoutError(errorText(error));}finally{setLogoutPending(false);}}
 const personLabel=(person:Person)=>{
  const namesakes=participants.filter(other=>other.name===person.name&&other.id!==person.id);
  if(!namesakes.length)return person.name;
  let length=6;while(length<person.id.length&&namesakes.some(other=>other.id.slice(-length)===person.id.slice(-length)))length++;
  return `${person.name} (${person.id.slice(-length)})`;
 };
 const conversationLabel=(conversation:Conversation)=>{const recipient=conversation.kind==='direct'?participants.find(person=>person.id!==user.participantId&&conversation.participantIds.includes(person.id)):undefined;return recipient?personLabel(recipient):conversation.title;};
 const selectedLabel=conversationLabel(selected);
 const selectedPeople=participants.filter(person=>selected.kind!=='direct'||selected.participantIds.includes(person.id));
 const label=selected.kind==='main'?'the Common Room':selectedLabel;
 return <div className="live-workspace"><div className="app-frame workspace-surface" ref={workspaceSurface}><aside className="left-rail"><Brand/><div className="workspace-switcher"><span className="workspace-dot">N</span><span className="switch-copy"><b>NEXUS</b><small>Local workspace</small></span></div><div className="rail-label">WORKSPACE</div><nav className="primary-nav" aria-label="Workspace navigation"><button className={`nav-item ${selected.kind==='main'?'active':''}`} aria-current={selected.kind==='main'?'page':undefined} aria-label="Common room" onClick={()=>choose(initial.conversation.id)}><Home size={18}/><span>Common room</span></button><button className={`nav-item ${directOpen?'active':''}`} aria-label="Direct messages" aria-expanded={directOpen} aria-controls={directOpen?'direct-list':undefined} onClick={()=>{setDirectOpen(value=>!value);setTopicsOpen(false);}}><MessagesSquare size={18}/><span>Direct messages</span></button>{directOpen&&<div className="topic-nav direct-nav" id="direct-list" aria-label="Direct conversations"><button className="topic-new" ref={newMessageTrigger} onClick={()=>{setDirectError('');setDirectCreating(true);}}><Plus size={14}/>New message</button>{conversations.filter(item=>item.kind==='direct'&&item.state==='active').map(item=><button key={item.id} aria-label={conversationLabel(item)} aria-current={selectedId===item.id?'page':undefined} className={selectedId===item.id?'active':''} onClick={()=>choose(item.id)}><MessagesSquare size={13}/><span>{conversationLabel(item)}</span></button>)}</div>}<button className={`nav-item ${topicsOpen?'active':''}`} aria-label="Topics" aria-expanded={topicsOpen} aria-controls={topicsOpen?'topic-list':undefined} onClick={()=>{setTopicsOpen(value=>!value);setDirectOpen(false);}}><Hash size={18}/><span>Topics</span></button>{topicsOpen&&<div className="topic-nav" id="topic-list" aria-label="Public topics"><button className="topic-new" ref={newTopicTrigger} onClick={()=>setCreating(true)}><Plus size={14}/>New topic</button>{topics.map(topic=><button key={topic.id} className={selected.id===topic.id?'active':''} aria-current={selected.id===topic.id?'page':undefined} aria-label={topic.title} onClick={()=>choose(topic.id)}><Hash size={13}/><span>{topic.title}</span></button>)}</div>}<button className="nav-item" disabled aria-label="Governance — coming next" title="Governance — coming next"><ShieldCheck size={18}/><span>Governance <small>Coming next</small></span></button></nav><div className="rail-spacer"/><a className="live-demo-link" href="/demo" title="Explore sample prototype">Sample prototype ↗</a><div className="rail-bottom"><button className="nav-item" aria-label="Sign out" title="Sign out" disabled={logoutPending} onClick={()=>void logout()}><LogOut size={18}/><span>{logoutPending?'Signing out…':'Sign out'}</span></button><div className="profile-row"><Avatar name={user.displayName}/><div className="profile-copy"><b>{user.displayName}</b><span>{user.isAdmin?'Workspace admin':'Participant'}</span></div></div></div></aside><div className="app-main"><header className="topbar"><div className="crumbs"><span>NEXUS</span><span>/</span><b>{selected.kind==='main'?'Common room':selectedLabel}</b></div><div className="topbar-actions"><span className={`live-connection ${connected?'':'disconnected'}`} role="status">Local · {connected?'connected':'disconnected'}</span><span className="live-user-name">{user.displayName}</span></div></header>{logoutError&&<p role="alert" className="live-banner">{logoutError}</p>}<div className="workspace-layout"><main className="conversation-column"><div className="conversation-heading"><div><p className="eyebrow">{selected.kind==='main'?'MAIN CONVERSATION':selected.kind==='direct'?'DIRECT MESSAGE':'PUBLIC TOPIC'}</p><h1>{selectedLabel}</h1><p>{selected.description}</p></div></div><div className="conversation-meta">{selected.kind==='main'?'Shared with every workspace participant':selected.kind==='direct'?'Private to the two participants':'Public to workspace participants'}</div><div className="live-mobile-people">Participants: {selectedPeople.map(personLabel).join(', ')}</div>{!connected&&<p className="live-banner" role="status">Connection lost. Showing the last received messages; reconnecting automatically.</p>}<div className="timeline" ref={timeline} role="log" aria-label={`${selectedLabel} messages`} aria-live="polite">{currentMessages.length===0?<div className="live-empty"><UserRound size={28}/><h2>Start the conversation</h2><p>This is your shared space. The first message starts here.</p></div>:currentMessages.map(message=>{const author=participants.find(person=>person.id===message.authorId);return <article className="message-row" key={message.id}><div className="message-avatar-slot"><Avatar name={author?.name??'?'}/></div><div className="message-content"><div className="message-byline"><b>{author?.name??'Unknown participant'}</b><span className="kind-tag">HUMAN</span><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></div><p>{message.body}</p></div></article>;})}</div><form className="composer" onSubmit={event=>void send(event)}><label htmlFor="live-message">Message {label}</label><textarea ref={messageComposer} id="live-message" value={composer} maxLength={5000} disabled={sendingIds[selected.id]||logoutPending} placeholder="Add to the conversation…" onChange={event=>{const value=event.target.value;setDrafts(current=>({...current,[selected.id]:value}));setSendErrors(current=>({...current,[selected.id]:''}));}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}}/>{sendErrors[selected.id]&&<p className="live-error" role="alert">{sendErrors[selected.id]}</p>}<div className="composer-bottom"><span>Enter to send · Shift + Enter for a new line</span><button className="send-button" type="submit" disabled={!composer.trim()||sendingIds[selected.id]||logoutPending}>{sendingIds[selected.id]?'Sending…':sendErrors[selected.id]?'Retry send':'Send'}</button></div></form></main><aside className="context-column" aria-label="Workspace context"><h2>Participants</h2><p className="live-context-note">People in {selected.kind==='main'?'the Common Room':selected.kind==='direct'?'this direct conversation':'this topic'}</p>{selectedPeople.map(person=><div className="participant-row" key={person.id}><Avatar name={person.name}/><div className="person-copy"><b>{person.name}{person.id===user.participantId?' (you)':''}</b><span>{person.isAdmin?'Workspace admin':'Human participant'}</span></div></div>)}<div className="live-next"><h2>{selected.kind==='main'?'A quiet beginning':selected.kind==='direct'?'Private conversation':'Public topic'}</h2><p>{selected.kind==='main'?'Topics and human direct messages are available now. Agent governance is coming next.':selected.kind==='direct'?'Only the two participants can read and contribute here.':'Everyone in the workspace can read and contribute to this conversation.'}</p></div></aside></div></div></div>{creating&&<div className="topic-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeTopic();}}><form className="topic-dialog" ref={topicDialog} role="dialog" aria-modal="true" aria-labelledby="new-topic-title" onKeyDown={handleTopicDialogKey} onSubmit={event=>void createTopic(event)}><div className="topic-dialog-head"><div><p className="eyebrow">PUBLIC CONVERSATION</p><h2 id="new-topic-title">New topic</h2></div><button type="button" aria-label="Close new topic" disabled={topicPending} onClick={closeTopic}><X size={18}/></button></div><div className="live-field"><label htmlFor="topic-title">Topic title</label><input id="topic-title" ref={topicTitle} required maxLength={80} value={topicFields.title} disabled={topicPending} aria-invalid={topicErrors.title?true:undefined} aria-describedby={topicErrors.title?'topic-title-error':undefined} onChange={event=>changeTopicField('title',event.target.value)}/>{topicErrors.title&&<p id="topic-title-error" role="alert" className="live-error">{topicErrors.title}</p>}</div><div className="live-field"><label htmlFor="topic-description">Description</label><input id="topic-description" maxLength={160} value={topicFields.description} disabled={topicPending} onChange={event=>changeTopicField('description',event.target.value)}/></div><div className="live-field"><label htmlFor="topic-opening">Opening message</label><textarea id="topic-opening" required maxLength={5000} value={topicFields.openingMessage} disabled={topicPending} aria-invalid={topicErrors.openingMessage?true:undefined} aria-describedby={topicErrors.openingMessage?'topic-opening-error':undefined} onChange={event=>changeTopicField('openingMessage',event.target.value)}/>{topicErrors.openingMessage&&<p id="topic-opening-error" role="alert" className="live-error">{topicErrors.openingMessage}</p>}</div>{topicError&&<p role="alert" className="live-error">{topicError}</p>}<div className="topic-dialog-actions"><button type="button" className="button" disabled={topicPending} onClick={closeTopic}>Cancel</button><button className="button primary" disabled={topicPending}>{topicPending?'Creating…':topicError?'Retry create topic':'Create topic'}</button></div></form></div>}{directCreating&&<div className="topic-dialog-backdrop direct-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget){event.preventDefault();closeDirect();}}}><form className="topic-dialog" ref={directDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="new-direct-title" aria-busy={directPending} onSubmit={event=>void createDirect(event)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeDirect();}else trapDialogFocus(event);}}><div className="topic-dialog-head"><h2 id="new-direct-title">New message</h2><button type="button" aria-label="Close new message" disabled={directPending} onClick={closeDirect}><X size={18}/></button></div><div className="live-field"><label htmlFor="direct-recipient">Recipient</label><select id="direct-recipient" ref={recipientSelect} value={recipientId} disabled={directPending} aria-invalid={directError?true:undefined} aria-describedby={directError?'direct-error':undefined} onChange={event=>{setRecipientId(event.target.value);setDirectError('');}}><option value="">Choose a person</option>{participants.filter(person=>person.id!==user.participantId&&person.kind==='human'&&person.state==='active').map(person=><option key={person.id} value={person.id}>{personLabel(person)}</option>)}</select></div>{directError&&<p id="direct-error" role="alert" className="live-error">{directError}</p>}<div className="topic-dialog-actions"><button type="button" className="button" disabled={directPending} onClick={closeDirect}>Cancel</button><button className="button primary" disabled={directPending}>{directPending?'Opening…':directError&&recipientId?'Retry open conversation':'Open conversation'}</button></div></form></div>}</div>;
}

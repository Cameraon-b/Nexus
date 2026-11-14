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
 const selectedRef=useRef(selectedId);selectedRef.current=selectedId;
 const [messages,setMessages]=useState<Record<string,Message[]>>({[initial.conversation.id]:initial.messages});
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [sendErrors,setSendErrors]=useState<Record<string,string>>({});
 const [sendingIds,setSendingIds]=useState<Record<string,boolean>>({});
 const [connected,setConnected]=useState(true);
 const [topicsOpen,setTopicsOpen]=useState(false);
 const [creating,setCreating]=useState(false);
 const [topicFields,setTopicFields]=useState<TopicFields>({title:'',description:'',openingMessage:''});
 const [topicErrors,setTopicErrors]=useState<TopicErrors>({});
 const [topicError,setTopicError]=useState('');
 const [topicPending,setTopicPending]=useState(false);
 const topicIntent=useRef<{fields:TopicFields;clientRequestId:string}>();
 const sendIntents=useRef<Record<string,{body:string;clientRequestId:string}>>({});
 const sendLocks=useRef<Record<string,boolean>>({});
 const revisions=useRef<Record<string,number>>({});
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

 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const loadHistory=useCallback(async(id:string,signal?:AbortSignal)=>{
  const startedAt=revisions.current[id]??0;
  try{
   const history=await api.get<Message[]>(`/conversations/${encodeURIComponent(id)}/messages`,signal);
   if(signal?.aborted||!mounted.current)return;
   if(startedAt===(revisions.current[id]??0))setMessages(current=>({...current,[id]:mergeMessages(current[id]??[],history)}));
   setConnected(true);
  }catch(error){if(signal?.aborted||!mounted.current)return;if(!expireIfNeeded(error))setConnected(false);}
 },[api,expireIfNeeded]);
 useEffect(()=>{
  if(selectedId===initial.conversation.id)return;
  const controller=new AbortController();void loadHistory(selectedId,controller.signal);return()=>controller.abort();
 },[selectedId,initial.conversation.id,loadHistory]);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function refresh(){
   try{
    const latest=normalize(await api.get<HomeRoom>('/workspace/home',controller.signal));
    if(controller.signal.aborted)return;
    setParticipants(latest.participants);
    setConversations(current=>{
     const next=new Map(current.map(item=>[item.id,item]));for(const item of latest.conversations)next.set(item.id,item);return [...next.values()];
    });
    setMessages(current=>({...current,[latest.conversation.id]:mergeMessages(current[latest.conversation.id]??[],latest.messages)}));
    setConnected(true);
    const active=selectedRef.current;if(active!==latest.conversation.id)await loadHistory(active,controller.signal);
   }catch(error){if(controller.signal.aborted)return;if(!expireIfNeeded(error))setConnected(false);}
   if(!controller.signal.aborted)timer=setTimeout(()=>void refresh(),5000);
  }
  timer=setTimeout(()=>void refresh(),5000);return()=>{controller.abort();clearTimeout(timer);};
 },[api,expireIfNeeded,initial.conversation.id,loadHistory]);
 useEffect(()=>{if(timeline.current)timeline.current.scrollTop=timeline.current.scrollHeight;},[selectedId,currentMessages.at(-1)?.id]);
 useEffect(()=>{workspaceSurface.current?.toggleAttribute('inert',creating);},[creating]);
 useEffect(()=>{if(!creating)return;const frame=requestAnimationFrame(()=>topicTitle.current?.focus());return()=>cancelAnimationFrame(frame);},[creating]);
 useEffect(()=>{if(creating||focusComposerAfterCreate.current!==selectedId)return;focusComposerAfterCreate.current=undefined;const frame=requestAnimationFrame(()=>messageComposer.current?.focus());return()=>cancelAnimationFrame(frame);},[creating,selectedId]);

 function choose(id:string){setSelectedId(id);if(id!==initial.conversation.id)setTopicsOpen(true);}
 function changeTopicField(name:keyof TopicFields,value:string){setTopicFields(current=>({...current,[name]:value}));setTopicErrors(current=>{if(!current[name])return current;const next={...current};delete next[name];return next;});setTopicError('');}
 function closeTopic(){if(topicPending)return;setCreating(false);setTopicErrors({});setTopicError('');requestAnimationFrame(()=>newTopicTrigger.current?.focus());}
 function handleTopicDialogKey(event:ReactKeyboardEvent<HTMLFormElement>){
  if(event.key==='Escape'){event.preventDefault();if(!topicPending)closeTopic();return;}
  if(event.key!=='Tab')return;
  const focusable=[...(topicDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')??[])].filter(element=>!element.hasAttribute('hidden'));
  const first=focusable[0],last=focusable.at(-1);if(!first||!last)return;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
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
  try{
   const message=await api.post<Message>(`/conversations/${encodeURIComponent(id)}/messages`,submitted);
   if(!mounted.current)return;
   revisions.current[id]=(revisions.current[id]??0)+1;
   setMessages(current=>({...current,[id]:mergeMessages(current[id]??[],[message])}));
   setDrafts(current=>(current[id]??'').trim()===submitted.body?{...current,[id]:''}:current);delete sendIntents.current[id];setConnected(true);
  }catch(error){if(!mounted.current)return;if(!expireIfNeeded(error)){setSendErrors(current=>({...current,[id]:`Delivery not confirmed. ${errorText(error)} Retry sends the same request without duplicating it.`}));if(!(error instanceof ApiError)||error.status>=500)setConnected(false);}}
  finally{sendLocks.current[id]=false;if(mounted.current)setSendingIds(current=>({...current,[id]:false}));}
 }
 async function logout(){if(logoutPending)return;setLogoutPending(true);try{await api.post('/auth/logout');onLogout();}catch(error){if(!expireIfNeeded(error))setLogoutError(errorText(error));}finally{setLogoutPending(false);}}
 const label=selected.kind==='main'?'the Common Room':selected.title;
 return <div className="live-workspace"><div className="app-frame workspace-surface" ref={workspaceSurface}><aside className="left-rail"><Brand/><div className="workspace-switcher"><span className="workspace-dot">N</span><span className="switch-copy"><b>NEXUS</b><small>Local workspace</small></span></div><div className="rail-label">WORKSPACE</div><nav className="primary-nav" aria-label="Workspace navigation"><button className={`nav-item ${selected.kind==='main'?'active':''}`} aria-current={selected.kind==='main'?'page':undefined} aria-label="Common room" onClick={()=>choose(initial.conversation.id)}><Home size={18}/><span>Common room</span></button><button className="nav-item" disabled aria-label="Direct messages — coming next" title="Direct messages — coming next"><MessagesSquare size={18}/><span>Direct messages <small>Coming next</small></span></button><button className={`nav-item ${topicsOpen?'active':''}`} aria-label="Topics" aria-expanded={topicsOpen} aria-controls={topicsOpen?'topic-list':undefined} onClick={()=>setTopicsOpen(value=>!value)}><Hash size={18}/><span>Topics</span></button>{topicsOpen&&<div className="topic-nav" id="topic-list" aria-label="Public topics"><button className="topic-new" ref={newTopicTrigger} onClick={()=>setCreating(true)}><Plus size={14}/>New topic</button>{topics.map(topic=><button key={topic.id} className={selected.id===topic.id?'active':''} aria-current={selected.id===topic.id?'page':undefined} aria-label={topic.title} onClick={()=>choose(topic.id)}><Hash size={13}/><span>{topic.title}</span></button>)}</div>}<button className="nav-item" disabled aria-label="Governance — coming next" title="Governance — coming next"><ShieldCheck size={18}/><span>Governance <small>Coming next</small></span></button></nav><div className="rail-spacer"/><a className="live-demo-link" href="/demo" title="Explore sample prototype">Sample prototype ↗</a><div className="rail-bottom"><button className="nav-item" aria-label="Sign out" title="Sign out" disabled={logoutPending} onClick={()=>void logout()}><LogOut size={18}/><span>{logoutPending?'Signing out…':'Sign out'}</span></button><div className="profile-row"><Avatar name={user.displayName}/><div className="profile-copy"><b>{user.displayName}</b><span>{user.isAdmin?'Workspace admin':'Participant'}</span></div></div></div></aside><div className="app-main"><header className="topbar"><div className="crumbs"><span>NEXUS</span><span>/</span><b>{selected.kind==='main'?'Common room':selected.title}</b></div><div className="topbar-actions"><span className={`live-connection ${connected?'':'disconnected'}`} role="status">Local · {connected?'connected':'disconnected'}</span><span className="live-user-name">{user.displayName}</span></div></header>{logoutError&&<p role="alert" className="live-banner">{logoutError}</p>}<div className="workspace-layout"><main className="conversation-column"><div className="conversation-heading"><div><p className="eyebrow">{selected.kind==='main'?'MAIN CONVERSATION':'PUBLIC TOPIC'}</p><h1>{selected.title}</h1><p>{selected.description}</p></div></div><div className="conversation-meta">{selected.kind==='main'?'Shared with every workspace participant':'Public to workspace participants'}</div><div className="live-mobile-people">Participants: {participants.map(person=>person.name).join(', ')}</div>{!connected&&<p className="live-banner" role="status">Connection lost. Showing the last received messages; reconnecting automatically.</p>}<div className="timeline" ref={timeline} role="log" aria-label={`${selected.title} messages`} aria-live="polite">{currentMessages.length===0?<div className="live-empty"><UserRound size={28}/><h2>Start the conversation</h2><p>This is your shared space. The first message starts here.</p></div>:currentMessages.map(message=>{const author=participants.find(person=>person.id===message.authorId);return <article className="message-row" key={message.id}><div className="message-avatar-slot"><Avatar name={author?.name??'?'}/></div><div className="message-content"><div className="message-byline"><b>{author?.name??'Unknown participant'}</b><span className="kind-tag">HUMAN</span><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></div><p>{message.body}</p></div></article>;})}</div><form className="composer" onSubmit={event=>void send(event)}><label htmlFor="live-message">Message {label}</label><textarea ref={messageComposer} id="live-message" value={composer} maxLength={5000} disabled={sendingIds[selected.id]||logoutPending} placeholder="Add to the conversation…" onChange={event=>{const value=event.target.value;setDrafts(current=>({...current,[selected.id]:value}));setSendErrors(current=>({...current,[selected.id]:''}));}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}}/>{sendErrors[selected.id]&&<p className="live-error" role="alert">{sendErrors[selected.id]}</p>}<div className="composer-bottom"><span>Enter to send · Shift + Enter for a new line</span><button className="send-button" type="submit" disabled={!composer.trim()||sendingIds[selected.id]||logoutPending}>{sendingIds[selected.id]?'Sending…':sendErrors[selected.id]?'Retry send':'Send'}</button></div></form></main><aside className="context-column" aria-label="Workspace context"><h2>Participants</h2><p className="live-context-note">People in {selected.kind==='main'?'the Common Room':'this topic'}</p>{participants.map(person=><div className="participant-row" key={person.id}><Avatar name={person.name}/><div className="person-copy"><b>{person.name}{person.id===user.participantId?' (you)':''}</b><span>{person.isAdmin?'Workspace admin':'Human participant'}</span></div></div>)}<div className="live-next"><h2>{selected.kind==='main'?'A quiet beginning':'Public topic'}</h2><p>{selected.kind==='main'?'Topics are available now. Direct messages and agent governance are coming next.':'Everyone in the workspace can read and contribute to this conversation.'}</p></div></aside></div></div></div>{creating&&<div className="topic-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeTopic();}}><form className="topic-dialog" ref={topicDialog} role="dialog" aria-modal="true" aria-labelledby="new-topic-title" onKeyDown={handleTopicDialogKey} onSubmit={event=>void createTopic(event)}><div className="topic-dialog-head"><div><p className="eyebrow">PUBLIC CONVERSATION</p><h2 id="new-topic-title">New topic</h2></div><button type="button" aria-label="Close new topic" disabled={topicPending} onClick={closeTopic}><X size={18}/></button></div><div className="live-field"><label htmlFor="topic-title">Topic title</label><input id="topic-title" ref={topicTitle} required maxLength={80} value={topicFields.title} disabled={topicPending} aria-invalid={topicErrors.title?true:undefined} aria-describedby={topicErrors.title?'topic-title-error':undefined} onChange={event=>changeTopicField('title',event.target.value)}/>{topicErrors.title&&<p id="topic-title-error" role="alert" className="live-error">{topicErrors.title}</p>}</div><div className="live-field"><label htmlFor="topic-description">Description</label><input id="topic-description" maxLength={160} value={topicFields.description} disabled={topicPending} onChange={event=>changeTopicField('description',event.target.value)}/></div><div className="live-field"><label htmlFor="topic-opening">Opening message</label><textarea id="topic-opening" required maxLength={5000} value={topicFields.openingMessage} disabled={topicPending} aria-invalid={topicErrors.openingMessage?true:undefined} aria-describedby={topicErrors.openingMessage?'topic-opening-error':undefined} onChange={event=>changeTopicField('openingMessage',event.target.value)}/>{topicErrors.openingMessage&&<p id="topic-opening-error" role="alert" className="live-error">{topicErrors.openingMessage}</p>}</div>{topicError&&<p role="alert" className="live-error">{topicError}</p>}<div className="topic-dialog-actions"><button type="button" className="button" disabled={topicPending} onClick={closeTopic}>Cancel</button><button className="button primary" disabled={topicPending}>{topicPending?'Creating…':topicError?'Retry create topic':'Create topic'}</button></div></form></div>}</div>;
}

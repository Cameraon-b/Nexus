import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Home, Hash, LogOut, MessagesSquare, ShieldCheck, UserRound } from 'lucide-react';
import { ApiError, WorkspaceApi } from './live-api';
import PersistentWorkspace from './PersistentWorkspace';
import './live.css';

type User = {id:string; email:string; displayName:string; participantId:string; isAdmin:boolean};
type Person = {id:string; name:string; kind:'human'; state:'active'; availability:'available'; isAdmin:boolean; description?:string};
type Message = {id:string; conversationId:string; authorId:string; body:string; state:'delivered'; createdAt:string};
type Room = {participants:Person[]; conversation:{id:string; title:string; description:string; participantIds:string[]}; messages:Message[]};
type AuthDraft = {email:string; displayName:string};
type Screen = {kind:'loading'} | {kind:'error'; message:string} | {kind:'auth'; bootstrap:boolean; notice?:string; draft?:AuthDraft} | {kind:'room'; user:User; room:Room};
const errorText = (error:unknown) => error instanceof ApiError ? error.message : 'Cannot reach the local server. Check that it is running, then retry.';
function Brand() { return <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span/><span/><span/><span/></div><div><div className="brand-name">nexus</div><div className="brand-sub">LOCAL WORKSPACE</div></div></div>; }
function Avatar({name}:{name:string}) { return <span className="avatar avatar-sage" aria-hidden="true">{name.trim().slice(0,1).toUpperCase()}</span>; }

export default function LiveWorkspace() {
 const [api,setApi] = useState(() => new WorkspaceApi());
 const [screen,setScreen] = useState<Screen>({kind:'loading'});
 const [attempt,setAttempt] = useState(0);
 const authDraft = useRef<AuthDraft>();
 useEffect(() => {
  const controller = new AbortController();
  setScreen({kind:'loading'});
  async function load() {
   try {
    const status = await api.get<{requiresBootstrap:boolean}>('/auth/status',controller.signal);
    if (controller.signal.aborted) return;
    if (status.requiresBootstrap) {setScreen({kind:'auth',bootstrap:true}); return;}
    let user:User;
    try { user = await api.get<User>('/auth/me',controller.signal); }
    catch (error) {if(error instanceof ApiError && error.status === 401) {if(!controller.signal.aborted){setScreen({kind:'auth',bootstrap:false,draft:authDraft.current});authDraft.current=undefined;}return;} throw error;}
    const room = await api.get<Room>('/workspace/home',controller.signal);
    if(!controller.signal.aborted)setScreen({kind:'room',user,room});
   } catch(error) {
    if(controller.signal.aborted)return;
    if(error instanceof ApiError&&error.status===401)setScreen({kind:'auth',bootstrap:false,notice:'Your session ended. Sign in again.'});
    else setScreen({kind:'error',message:errorText(error)});
   }
  }
  void load();
  return () => controller.abort();
 },[api,attempt]);
 const expired = useCallback(() => {api.resetSession();setScreen({kind:'auth',bootstrap:false,notice:'Your session ended. Sign in again.'});},[api]);
 if(screen.kind === 'room') return <PersistentWorkspace api={api} user={screen.user} initialRoom={screen.room} onExpired={expired} onLogout={() => {setApi(new WorkspaceApi());setScreen({kind:'loading'});}}/>;
 return <div className="live-gate"><aside><Brand/><div className="live-intro"><p className="eyebrow">A PLACE TO THINK TOGETHER</p><h2>Conversation first.<br/>People at the center.</h2><p>Your local workspace begins with a shared common room.</p></div><a href="/demo">Explore the sample prototype ↗</a></aside><main className="live-auth-panel">
 {screen.kind === 'loading' && <p role="status">Connecting to your local workspace…</p>}
 {screen.kind === 'error' && <section><h1>Workspace unavailable</h1><p role="alert">{screen.message}</p><button className="button primary" onClick={() => setAttempt(a=>a+1)}>Retry connection</button><p>No sample data has been loaded.</p></section>}
 {screen.kind === 'auth' && <AuthForm api={api} bootstrap={screen.bootstrap} notice={screen.notice} initialValues={screen.draft} onAuthenticated={() => setAttempt(a=>a+1)} onBootstrapConflict={draft => {authDraft.current=draft;setAttempt(a=>a+1);}}/>}
 </main></div>;
}
function AuthForm({api,bootstrap,notice,initialValues,onAuthenticated,onBootstrapConflict}:{api:WorkspaceApi;bootstrap:boolean;notice?:string;initialValues?:AuthDraft;onAuthenticated:()=>void;onBootstrapConflict:(draft:AuthDraft)=>void}) {
 const [mode,setMode] = useState<'login'|'register'>(bootstrap?'register':'login');
 const [values,setValues] = useState({email:initialValues?.email??'',displayName:initialValues?.displayName??'',password:''});
 const [pending,setPending] = useState(false);
 const lock = useRef(false);
 const [error,setError] = useState('');
 const [fields,setFields] = useState<Record<string,string[]>>({});
 const creating = bootstrap||mode==='register';
 function switchMode(next:'login'|'register') {setMode(next);setValues(current=>({...current,password:''}));setFields({});setError('');}
 async function submit(event:FormEvent) {
  event.preventDefault();if(lock.current)return;lock.current=true;setPending(true);setError('');setFields({});
  const authMode=bootstrap?'bootstrap':mode;
  try {await api.authenticate(authMode,creating?values:{email:values.email,password:values.password});setValues({email:'',displayName:'',password:''});onAuthenticated();}
  catch(error) {if(bootstrap&&error instanceof ApiError&&error.status===409){onBootstrapConflict({email:values.email,displayName:values.displayName});return;}setError(errorText(error));if(error instanceof ApiError)setFields(error.fields);}
  finally {lock.current=false;setPending(false);}
 }
 return <form className="live-auth-form" onSubmit={submit}>{!bootstrap&&<div className="live-auth-switch" role="tablist" aria-label="Authentication mode"><button type="button" role="tab" className={mode==='login'?'active':''} aria-selected={mode==='login'} disabled={pending} onClick={()=>switchMode('login')}>Sign in</button><button type="button" role="tab" className={mode==='register'?'active':''} aria-selected={mode==='register'} disabled={pending} onClick={()=>switchMode('register')}>Create account</button></div>}<p className="eyebrow">{bootstrap?'FIRST RUN':creating?'JOIN YOUR LOCAL WORKSPACE':'YOUR LOCAL WORKSPACE'}</p><h1>{bootstrap?'Bring your workspace to life':creating?'Create your account':'Welcome back'}</h1><p>{bootstrap?'Create the first administrator account. You will appear as a participant in the Common Room.':creating?'Join the workspace as a human participant in the Common Room.':'Sign in to return to your conversations.'}</p>{notice && <p role="status">{notice}</p>}
 {(creating?['displayName','email','password']:['email','password']).map(key => {const name=key as keyof typeof values;return <div className="live-field" key={name}><label htmlFor={`auth-${name}`}>{name==='displayName'?'Display name':name==='email'?'Email':'Password'}</label><input id={`auth-${name}`} name={name} type={name==='password'?'password':name==='email'?'email':'text'} autoComplete={name==='password'?(creating?'new-password':'current-password'):name==='email'?'username':'name'} required minLength={name==='password'&&creating?12:undefined} maxLength={name==='password'?128:name==='email'?254:100} value={values[name]} disabled={pending} aria-invalid={!!fields[name]?.length} aria-describedby={fields[name]?.length?`${name}-error`:name==='password'&&creating?'password-help':undefined} onChange={event=>{setValues({...values,[name]:event.target.value});setFields({...fields,[name]:[]});setError('');}}/>{fields[name]?.length>0 && <p className="live-error" id={`${name}-error`}>{fields[name].join(' ')}</p>}</div>;})}
 {creating && <small id="password-help">Use 12–128 characters for your password.</small>}{error && <p role="alert" className="live-error">{error}</p>}<button className="button primary" disabled={pending}>{pending?'Connecting…':bootstrap?'Create workspace':creating?'Create account':'Sign in'}</button></form>;
}
function MainRoom({api,user,initialRoom,onExpired,onLogout}:{api:WorkspaceApi;user:User;initialRoom:Room;onExpired:()=>void;onLogout:()=>void}) {
 const [room,setRoom] = useState(initialRoom);
 const [composer,setComposer] = useState('');
 const [sending,setSending] = useState(false);
 const [sendError,setSendError] = useState('');
 const [connected,setConnected] = useState(true);
 const sendLock = useRef(false);
 const intended = useRef<{body:string;clientRequestId:string} | null>(null);
 const revision = useRef(0);
 const timeline = useRef<HTMLDivElement>(null);
 const mounted = useRef(true);
 useEffect(() => {mounted.current=true;return () => {mounted.current=false;};},[]);
 useEffect(() => {
  const controller = new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function refresh() {
   const startedAt=revision.current;
   try {
    const latest=await api.get<Room>('/workspace/home',controller.signal);
    if(controller.signal.aborted)return;
    if(startedAt===revision.current)setRoom(latest);
    setConnected(true);
   } catch(error) {
    if(controller.signal.aborted)return;
    if(error instanceof ApiError&&error.status===401){onExpired();return;}
    setConnected(false);
   }
   if(!controller.signal.aborted)timer=setTimeout(()=>void refresh(),5000);
  }
  timer=setTimeout(()=>void refresh(),5000);
  return () => {controller.abort();clearTimeout(timer);};
 },[api,onExpired]);
 const lastMessageId=room.messages.at(-1)?.id;
 useEffect(() => {if(timeline.current)timeline.current.scrollTop=timeline.current.scrollHeight;},[lastMessageId]);
 async function send(event?:FormEvent) {
  event?.preventDefault();const body=composer.trim();if(!body||sendLock.current)return;
  sendLock.current=true;setSending(true);setSendError('');
  if(!intended.current||intended.current.body!==body)intended.current={body,clientRequestId:crypto.randomUUID()};
  const request=intended.current;
  try {
   const message=await api.post<Message>('/conversations/main/messages',request);
   if(!mounted.current)return;
   revision.current++;
   setRoom(current=>({...current,messages:[...current.messages.filter(item=>item.id!==message.id),message].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))}));
   setComposer('');intended.current=null;setConnected(true);
  } catch(error) {
   if(!mounted.current)return;
   if(error instanceof ApiError&&error.status===401){onExpired();return;}
   setSendError(`Delivery not confirmed. ${errorText(error)} Retry sends the same request without duplicating it.`);
   if(!(error instanceof ApiError)||error.status>=500)setConnected(false);
  } finally {sendLock.current=false;if(mounted.current)setSending(false);}
 }
 const [pending,setPending] = useState(false);
 const [error,setError] = useState('');
 async function logout() {if(pending)return;setPending(true);try {await api.post('/auth/logout');onLogout();}catch(error){if(error instanceof ApiError&&error.status===401)onExpired();else setError(errorText(error));}finally{setPending(false);}}
 return <div className="app-frame live-workspace"><aside className="left-rail"><Brand/><div className="workspace-switcher"><span className="workspace-dot">N</span><span className="switch-copy"><b>NEXUS</b><small>Local workspace</small></span></div><div className="rail-label">WORKSPACE</div><nav className="primary-nav" aria-label="Workspace navigation"><button className="nav-item active" aria-current="page" aria-label="Common room"><Home size={18}/><span>Common room</span></button><button className="nav-item" disabled aria-label="Direct messages — coming next" title="Direct messages — coming next"><MessagesSquare size={18}/><span>Direct messages <small>Coming next</small></span></button><button className="nav-item" disabled aria-label="Topics — coming next" title="Topics — coming next"><Hash size={18}/><span>Topics <small>Coming next</small></span></button><button className="nav-item" disabled aria-label="Governance — coming next" title="Governance — coming next"><ShieldCheck size={18}/><span>Governance <small>Coming next</small></span></button></nav><div className="rail-spacer"/><a className="live-demo-link" href="/demo" title="Explore sample prototype">Sample prototype ↗</a><div className="rail-bottom"><button className="nav-item" aria-label="Sign out" title="Sign out" disabled={pending} onClick={()=>void logout()}><LogOut size={18}/><span>{pending?'Signing out…':'Sign out'}</span></button><div className="profile-row"><Avatar name={user.displayName}/><div className="profile-copy"><b>{user.displayName}</b><span>{user.isAdmin?'Workspace admin':'Participant'}</span></div></div></div></aside><div className="app-main"><header className="topbar"><div className="crumbs"><span>NEXUS</span><span>/</span><b>Common room</b></div><div className="topbar-actions"><span className={`live-connection ${connected?'':'disconnected'}`} role="status">Local · {connected?'connected':'disconnected'}</span><span className="live-user-name">{user.displayName}</span></div></header>{error&&<p role="alert" className="live-banner">{error}</p>}<div className="workspace-layout"><main className="conversation-column"><div className="conversation-heading"><div><p className="eyebrow">MAIN CONVERSATION</p><h1>{room.conversation.title}</h1><p>{room.conversation.description}</p></div></div><div className="conversation-meta">Shared with every workspace participant</div><div className="live-mobile-people">Participants: {room.participants.map(person=>person.name).join(', ')}</div>{!connected&&<p className="live-banner" role="status">Connection lost. Showing the last received messages; reconnecting automatically.</p>}<div className="timeline" ref={timeline} role="log" aria-label="Common Room messages" aria-live="polite">{room.messages.length===0?<div className="live-empty"><UserRound size={28}/><h2>Start the conversation</h2><p>This is your shared space. The first message starts here.</p></div>:room.messages.map(message=>{const author=room.participants.find(person=>person.id===message.authorId);return <article className="message-row" key={message.id}><div className="message-avatar-slot"><Avatar name={author?.name??'?'}/></div><div className="message-content"><div className="message-byline"><b>{author?.name??'Unknown participant'}</b><span className="kind-tag">HUMAN</span><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></div><p>{message.body}</p></div></article>;})}</div><form className="composer" onSubmit={event=>void send(event)}><label htmlFor="live-message">Message the Common Room</label><textarea id="live-message" value={composer} maxLength={5000} disabled={sending||pending} placeholder="Add to the conversation…" onChange={event=>{setComposer(event.target.value);setSendError('');}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}}/>{sendError&&<p className="live-error" role="alert">{sendError}</p>}<div className="composer-bottom"><span>Enter to send · Shift + Enter for a new line</span><button className="send-button" type="submit" disabled={!composer.trim()||sending||pending}>{sending?'Sending…':sendError?'Retry send':'Send'}</button></div></form></main><aside className="context-column" aria-label="Workspace context"><h2>Participants</h2><p className="live-context-note">People in the Common Room</p>{room.participants.map(person=><div className="participant-row" key={person.id}><Avatar name={person.name}/><div className="person-copy"><b>{person.name}{person.id===user.participantId?' (you)':''}</b><span>{person.isAdmin?'Workspace admin':'Human participant'}</span></div></div>)}<div className="live-next"><h2>A quiet beginning</h2><p>Topics, direct messages, and agent governance are coming next. No agents are connected in this release.</p></div></aside></div></div></div>;
}

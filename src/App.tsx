import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDown, ArrowLeft, ArrowUpRight, AtSign, Ban, Bell, Bot, Check,
  ChevronDown, Circle, CircleCheck, Clock3, Command, CornerDownRight, Hash,
  Home, Inbox, MessageCircle, MessagesSquare, MoreHorizontal, Plus, Radio,
  Search, Send, Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal,
  Sparkles, UserRound, UsersRound, X,
} from 'lucide-react';
import {
  createDraft, createMessage, createTopicalConversation, resolveDraft, setParticipantState,
  openDirectConversation, getUnreadCount, markConversationRead,
} from './domain';
import type { Conversation, Participant, ParticipantState, WorkspaceState } from './domain';

const STORAGE_KEY = 'nexus-prototype-state-v1';
const CURRENT_USER = 'cameron';
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function initialState(): WorkspaceState {
  return {
    participants: [
      { id: 'cameron', name: 'Cameron', kind: 'human', isAdmin: true, state: 'active', availability: 'available', requiresApproval: false, description: 'Workspace admin', initials: 'C', color: 'sage' },
      { id: 'hermes', name: 'Hermes', kind: 'agent', state: 'active', availability: 'available', requiresApproval: true, description: 'Engineering · architecture · implementation', initials: 'H', color: 'violet' },
      { id: 'nova', name: 'Nova', kind: 'agent', state: 'active', availability: 'available', requiresApproval: true, description: 'Thinking partner · research · continuity', initials: 'N', color: 'blue' },
      { id: 'mira', name: 'Mira', kind: 'agent', state: 'active', availability: 'offline', requiresApproval: true, description: 'Knowledge steward · documentation', initials: 'M', color: 'amber' },
      { id: 'uptime', name: 'Uptime Kuma', kind: 'service', state: 'active', availability: 'available', requiresApproval: false, description: 'AETHER service monitor', initials: 'U', color: 'teal' },
    ],
    conversations: [
      { id: 'main', kind: 'main', title: 'The Common Room', state: 'active', participantIds: ['cameron', 'hermes', 'nova', 'mira', 'uptime'], description: 'The shared conversation for AETHER.' },
      { id: 'topic-nexus', kind: 'topical', title: 'Nexus · first mile', state: 'active', participantIds: ['cameron', 'hermes', 'nova'], description: 'What should the first useful increment feel like?' },
      { id: 'topic-aether', kind: 'topical', title: 'AETHER field notes', state: 'active', participantIds: ['cameron', 'mira'], description: 'Small observations from the lab.' },
      { id: 'dm-nova', kind: 'direct', title: 'Cameron & Nova', state: 'active', participantIds: ['cameron', 'nova'] },
    ],
    messages: [
      { id: 'm-1', conversationId: 'main', authorId: 'uptime', body: 'The workspace is up. Quiet morning across AETHER.', state: 'delivered', createdAt: ago(260) },
      { id: 'm-2', conversationId: 'main', authorId: 'cameron', body: 'I want Nexus to feel like a place we can think together—not another dashboard to maintain.', state: 'delivered', createdAt: ago(224) },
      { id: 'm-3', conversationId: 'main', authorId: 'nova', body: 'That gives the prototype a useful test: can you open it, see who is here, and naturally join a conversation?', state: 'delivered', createdAt: ago(212) },
      { id: 'm-4', conversationId: 'main', authorId: 'hermes', body: 'I would keep the first loop small: shared conversation, visible participants, and a real approval boundary for agent replies.', state: 'delivered', createdAt: ago(184) },
      { id: 'm-5', conversationId: 'main', authorId: 'cameron', body: 'Yes. I want the approval to be real, but not the whole personality of the product.', state: 'delivered', createdAt: ago(155) },
      { id: 'm-6', conversationId: 'topic-nexus', authorId: 'cameron', body: 'The common room should be the first thing I see. Focused conversations can branch out from there.', state: 'delivered', createdAt: ago(108) },
      { id: 'm-7', conversationId: 'topic-nexus', authorId: 'nova', body: 'Agreed. The participant list can make the space feel shared without adding workflow machinery.', state: 'delivered', createdAt: ago(92) },
      { id: 'm-8', conversationId: 'topic-aether', authorId: 'mira', body: 'A small reminder from the docs: configuration that exists is not evidence that a service is currently running.', state: 'delivered', createdAt: ago(880) },
      { id: 'm-9', conversationId: 'dm-nova', authorId: 'nova', body: 'I can help pressure-test the scope whenever you want to pick this thread back up.', state: 'delivered', createdAt: ago(56) },
    ],
    drafts: [
      { id: 'draft-1', conversationId: 'main', authorId: 'hermes', body: 'I have a small prototype direction: make the common room, participant presence, and governed agent replies the first visible loop.', state: 'pending', submittedAt: ago(18) },
    ],
    audit: [
      { id: 'audit-1', type: 'workspace_started', summary: 'The Nexus prototype workspace was initialized with sample content.', createdAt: ago(1440), actorId: 'cameron' },
    ],
  };
}

function loadState(): WorkspaceState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as WorkspaceState;
      if (!parsed || !['participants', 'conversations', 'messages', 'drafts', 'audit'].every(key => Array.isArray(parsed[key as keyof WorkspaceState]))) throw new Error('Invalid saved workspace');
      if (!parsed.participants.some(person => person.id === CURRENT_USER && person.kind === 'human') || !parsed.conversations.some(item => item.id === 'main')) throw new Error('Missing workspace identity');
      // This is a single-admin demo, not authentication. Preserve older prototype data.
      return {...parsed, participants: parsed.participants.map(person => person.id === CURRENT_USER ? {...person, isAdmin:true} : person)};
    }
  } catch { /* Corrupt or unavailable local storage falls back to the demo state. */ }
  return initialState();
}

type Section = 'home' | 'dms' | 'participants' | 'admin';
type AdminTab = 'approvals' | 'history' | 'participants' | 'policy' | 'audit';

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function avatarColor(participant: Participant) { return participant.color ?? (participant.kind === 'agent' ? 'violet' : participant.kind === 'service' ? 'teal' : 'sage'); }
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function conversationTitle(conversation: Conversation, participants: Participant[]) {
  if (conversation.kind !== 'direct') return conversation.title;
  return conversation.participantIds.filter((id) => id !== CURRENT_USER).map((id) => participants.find((p) => p.id === id)?.name ?? 'Participant').join(', ') || 'Direct message';
}

function Avatar({ participant, size = 'normal' }: { participant?: Participant; size?: 'normal' | 'small' | 'large' }) {
  if (!participant) return <span className={`avatar avatar-${size} avatar-sage`}>?</span>;
  const Icon = participant.kind === 'agent' ? Bot : participant.kind === 'service' ? Activity : UserRound;
  return <span className={`avatar avatar-${size} avatar-${avatarColor(participant)}`}>{participant.initials ? participant.initials : <Icon size={size === 'small' ? 13 : 16} />}</span>;
}

function Presence({ availability }: { availability: Participant['availability'] }) {
  return <span className={`presence presence-${availability}`} title={availability}><span />{availability}</span>;
}

export default function App() {
  const [state, setState] = useState<WorkspaceState>(loadState);
  const [section, setSection] = useState<Section>('home');
  const [adminTab, setAdminTab] = useState<AdminTab>('approvals');
  const [activeConversationId, setActiveConversationId] = useState('main');
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>('draft-1');
  const [draftEdit, setDraftEdit] = useState('');
  const [composers, setComposers] = useState<Record<string, string>>({});
  const composer = composers[activeConversationId] ?? '';
  const setComposer = (value: string) => setComposers((current) => ({ ...current, [activeConversationId]: value }));
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [topicOpening, setTopicOpening] = useState('');
  const [toast, setToast] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Keep the session usable if storage is full or disabled. */ }
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const openAdmin = () => { setSection('admin'); setAdminTab('approvals'); };
    const openConversation = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) { setActiveConversationId(id); setSection('home'); }
    };
    window.addEventListener('nexus-open-admin', openAdmin);
    window.addEventListener('nexus-open-conversation', openConversation);
    return () => {
      window.removeEventListener('nexus-open-admin', openAdmin);
      window.removeEventListener('nexus-open-conversation', openConversation);
    };
  }, []);
  const self = state.participants.find((p) => p.id === CURRENT_USER)!;
  const pendingDrafts = state.drafts.filter((draft) => draft.state === 'pending');
  const activeConversation = state.conversations.find((item) => item.id === activeConversationId) ?? state.conversations[0];
  const conversationMessages = useMemo(() => state.messages.filter((message) => message.conversationId === activeConversation?.id), [state.messages, activeConversation?.id]);
  const dmConversations = state.conversations.filter((item) => item.kind === 'direct' && item.participantIds.includes(CURRENT_USER));
  const selectedDraft = state.drafts.find((draft) => draft.id === selectedDraftId && draft.state === 'pending') ?? pendingDrafts[0];
  useEffect(() => { setDraftEdit(selectedDraft?.body ?? ''); }, [selectedDraft?.id]);
  const selectedDraftConversation = selectedDraft ? state.conversations.find((item) => item.id === selectedDraft.conversationId) : undefined;
  const selectedDraftAuthor = selectedDraft ? state.participants.find((item) => item.id === selectedDraft.authorId) : undefined;
  const selectedDraftContext = selectedDraft ? state.messages.filter((message) => message.conversationId === selectedDraft.conversationId).slice(-3) : [];
  const unread = (id: string) => getUnreadCount(state, id, CURRENT_USER);
  useEffect(() => {
    if ((section === 'home' || section === 'dms') && unread(activeConversationId) > 0) {
      setState(current => markConversationRead(current, activeConversationId, CURRENT_USER));
    }
  }, [activeConversationId, section, state.messages]);

  function go(sectionName: Section) {
    setSection(sectionName);
    setSearchOpen(false);
    if (sectionName === 'home') setActiveConversationId('main');
  }

  function openDirect(participantId: string) {
    try {
      const next = openDirectConversation(state, [CURRENT_USER, participantId], CURRENT_USER);
      const direct = next.conversations.find(item => item.kind === 'direct' && item.participantIds.includes(CURRENT_USER) && item.participantIds.includes(participantId))!;
      setState(next);
      setActiveConversationId(direct.id);
      setSection('dms');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not open direct conversation.'); }
  }

  function sendCurrentMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!composer.trim()) return;
    try {
      setState(createMessage(state, activeConversation.id, CURRENT_USER, composer));
      setComposer('');
      setToast('Message sent to the conversation.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Message could not be sent.'); }
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendCurrentMessage(); }
  }

  function startAgentDraft() {
    const agentId = activeConversation.participantIds.find((id) => state.participants.some((person) => person.id === id && person.kind === 'agent'))
      ?? state.participants.find((person) => person.kind === 'agent')?.id;
    if (!agentId) { setToast('No agent participant is available for this conversation.'); return; }
    try {
      const next = createDraft(state, activeConversation.id, agentId, 'Demo reply: I can help explore this conversation. This is sample text, not a response from a connected agent.');
      setState(next);
      const draft = next.drafts.at(-1)!;
      setSelectedDraftId(draft.id);
      setToast(draft.state === 'pending' ? 'Demo draft added to the approval queue.' : 'Demo reply released under the current policy.');
      if (draft.state === 'pending') { setSection('admin'); setAdminTab('approvals'); }
    } catch (error) { setToast(error instanceof Error ? error.message : 'Draft could not be created.'); }
  }

  function submitTopic(event: FormEvent) {
    event.preventDefault();
    try {
      const next = createTopicalConversation(state, topicTitle, topicDescription, CURRENT_USER, topicOpening);
      const created = next.conversations[next.conversations.length - 1];
      setState(next);
      setActiveConversationId(created.id);
      setSection('home');
      setShowTopicModal(false);
      setTopicTitle(''); setTopicDescription(''); setTopicOpening('');
      setToast('Topical conversation created.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Conversation could not be created.'); }
  }

  function reviewDraft(decision: 'approved' | 'approved_with_edits' | 'rejected') {
    if (!selectedDraft) return;
    try {
      setState(resolveDraft(state, selectedDraft.id, decision, draftEdit, CURRENT_USER));
      setToast(decision === 'rejected' ? 'Draft rejected. It remains visible in admin history only.' : 'Approved message released to the conversation.');
      setSelectedDraftId(null);
      setDraftEdit('');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Draft could not be reviewed.'); }
  }

  function moderate(participant: Participant, nextState: ParticipantState) {
    try {
      setState(setParticipantState(state, participant.id, nextState, CURRENT_USER));
      setToast(`${participant.name} is now ${nextState}.`);
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not update participant.'); }
  }

  function setApprovalPolicy(participantId: string, requiresApproval: boolean) {
    const person = state.participants.find((item) => item.id === participantId);
    if (!person) return;
    setState((current) => ({
      ...current,
      participants: current.participants.map((item) => item.id === participantId ? { ...item, requiresApproval } : item),
      audit: [...current.audit, { id: crypto.randomUUID(), type: 'policy_changed', summary: `${person.name} ${requiresApproval ? 'now requires' : 'no longer requires'} approval before outbound messages.`, createdAt: new Date().toISOString(), actorId: CURRENT_USER, subjectId: participantId }],
    }));
    setToast('Agent approval policy updated.');
  }

  function resetDemo() {
    if (!window.confirm('Reset this demo? Messages, topics, reviews, and local policy changes in this browser will be replaced with sample data.')) return;
    setComposers({});
    const fresh = initialState();
    setState(fresh); setActiveConversationId('main'); setSection('home'); setAdminTab('approvals');
    setToast('Sample workspace restored.');
  }

  const currentMessages = conversationMessages;
  const currentTitle = conversationTitle(activeConversation, state.participants);

  return (
    <div className="app-frame">
      <aside className="left-rail">
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <div><div className="brand-name">nexus</div><div className="brand-sub">AETHER WORKSPACE</div></div>
        </div>
        <div className="workspace-switcher"><span className="workspace-dot">A</span><span className="switch-copy"><b>AETHER</b><small>Local demo workspace</small></span></div>
        <div className="rail-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Workspace navigation">
          <button aria-label="Common room" title="Common room" className={section === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => go('home')}><Home size={17} /><span>Common room</span>{unread("main") > 0 && <span className="unread-badge">{unread("main")}</span>}</button>
          <button aria-label="Direct messages" title="Direct messages" className={section === 'dms' ? 'nav-item active' : 'nav-item'} onClick={() => go('dms')}><MessagesSquare size={17} /><span>Direct messages</span>{dmConversations.reduce((sum,item)=>sum+unread(item.id),0) > 0 && <span className="nav-count">{dmConversations.reduce((sum,item)=>sum+unread(item.id),0)}</span>}</button>
          <button aria-label="Participants" title="Participants" className={section === 'participants' ? 'nav-item active' : 'nav-item'} onClick={() => go('participants')}><UsersRound size={17} /><span>Participants</span><span className="nav-count subtle">{state.participants.length}</span></button>
        </nav>
        <div className="rail-divider" />
        <div className="rail-label rail-label-row"><span>TOPICAL</span><button className="icon-button tiny" aria-label="Create a topical conversation" title="Create topical conversation" onClick={() => setShowTopicModal(true)}><Plus size={15} /></button></div>
        <div className="topic-links">
          {state.conversations.filter((item) => item.kind === 'topical').map((conversation) => (
            <button key={conversation.id} className={`topic-link ${section === 'home' && activeConversationId === conversation.id ? 'selected' : ''}`} onClick={() => { setActiveConversationId(conversation.id); setSection('home'); }}><Hash size={15} /><span>{conversation.title}</span>{unread(conversation.id) > 0 && <span className="unread-badge">{unread(conversation.id)}</span>}</button>
          ))}
          {state.conversations.filter((item) => item.kind === 'topical').length === 0 && <div className="rail-empty">Your focused discussions will live here.</div>}
        </div>
        <div className="rail-spacer" />
        <div className="approval-shortcut">
          <div className="approval-shortcut-icon"><ShieldCheck size={17} /></div>
          <div className="approval-copy"><b>Review queue</b><span>{pendingDrafts.length ? `${pendingDrafts.length} waiting for you` : 'All caught up'}</span></div>
          {pendingDrafts.length > 0 && <span className="approval-count">{pendingDrafts.length}</span>}
          <button className="shortcut-hit" aria-label="Open review queue" onClick={() => { setSection('admin'); setAdminTab('approvals'); }} />
        </div>
        <div className="rail-bottom">
          <button className="nav-item" aria-label="Reset demo workspace" title="Reset demo workspace" onClick={resetDemo}><Settings2 size={17} /><span>Reset demo workspace</span></button>
          <div className="profile-row"><Avatar participant={self} size="small" /><div className="profile-copy"><b>Cameron</b><span>Workspace admin</span></div></div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="crumbs"><span>AETHER</span><span className="crumb-slash">/</span><b>{section === 'home' ? (activeConversation.kind === 'main' ? 'Common room' : 'Topical conversation') : section === 'dms' ? 'Direct messages' : section === 'participants' ? 'Participants' : 'Governance'}</b></div>
          <div className="topbar-actions">
            <div className="prototype-pill"><span />PROTOTYPE · LOCAL DATA</div>
            <button className="top-icon" aria-label="Search conversations" onClick={() => setSearchOpen((value) => !value)}><Search size={17} /></button>
            <button className="top-icon notification-button" aria-label="Open pending approvals" onClick={() => { setSection('admin'); setAdminTab('approvals'); }}><Bell size={17} />{pendingDrafts.length > 0 && <i />}</button>
            <div className="top-profile"><Avatar participant={self} size="small" /><span>Cameron</span></div>
          </div>
        </header>
        {searchOpen && <div className="search-panel"><div className="search-strip"><Search size={16} /><input autoFocus aria-label="Find a conversation" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search this prototype’s conversations…" onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }} /><span>ESC</span><button onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={15} /></button></div><div className="search-results">{state.conversations.filter((item) => conversationTitle(item, state.participants).toLowerCase().includes(searchQuery.toLowerCase())).map((item) => <button key={item.id} onClick={() => {setActiveConversationId(item.id); setSection(item.kind === 'direct' ? 'dms' : 'home'); setSearchOpen(false);}}><Hash size={15}/><b>{conversationTitle(item, state.participants)}</b><small>{item.kind}</small></button>)}{!state.conversations.some((item) => conversationTitle(item, state.participants).toLowerCase().includes(searchQuery.toLowerCase())) && <p>No matching conversations.</p>}</div></div>}

        {section === 'home' && <WorkspaceHome
          conversation={activeConversation} title={currentTitle} messages={currentMessages} state={state}
          composer={composer} setComposer={setComposer} sendMessage={sendCurrentMessage} onComposerKey={handleComposerKey}
          onOpenDirect={openDirect} onOpenTopic={(id) => setActiveConversationId(id)} onNewTopic={() => setShowTopicModal(true)}
          onSimulateDraft={() => startAgentDraft()} pendingCount={pendingDrafts.length}
        />}
        {section === 'dms' && <DirectMessages state={state} conversations={dmConversations} activeConversationId={activeConversationId} onSelect={setActiveConversationId} onOpenDirect={openDirect} messages={currentMessages} composer={composer} setComposer={setComposer} sendMessage={sendCurrentMessage} onComposerKey={handleComposerKey} onSimulateDraft={startAgentDraft} />}
        {section === 'participants' && <ParticipantDirectory state={state} onOpenDirect={openDirect} />}
        {section === 'admin' && <Governance state={state} tab={adminTab} setTab={setAdminTab} pendingDrafts={pendingDrafts} selectedDraft={selectedDraft} selectedAuthor={selectedDraftAuthor} selectedConversation={selectedDraftConversation} context={selectedDraftContext} selectedDraftId={selectedDraft?.id ?? null} onSelectDraft={(id) => { setSelectedDraftId(id); setDraftEdit(''); }} editValue={draftEdit} onEdit={setDraftEdit} onResolve={reviewDraft} onModerate={moderate} onPolicy={setApprovalPolicy} />}
        <footer className="prototype-note"><span><Circle size={8} /> Demo workspace</span><span>Sample participants · no external agents connected · changes saved in this browser</span></footer>
      </div>
      {showTopicModal && <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setShowTopicModal(false); }}><form className="topic-modal" role="dialog" aria-modal="true" aria-label="New topical conversation" onKeyDown={(event) => {if (event.key === 'Escape') setShowTopicModal(false);}} onSubmit={submitTopic}>
        <div className="modal-head"><div><span className="eyebrow">NEW TOPICAL CONVERSATION</span><h2>Give an idea its own space.</h2><p>Start focused, public discussion. It will appear in the workspace sidebar.</p></div><button type="button" className="icon-button" onClick={() => setShowTopicModal(false)} aria-label="Close"><X size={18} /></button></div>
        <label>Conversation title<input autoFocus required maxLength={80} value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} placeholder="e.g. Agent onboarding" /></label>
        <label>Short description <span className="optional">OPTIONAL</span><input maxLength={160} value={topicDescription} onChange={(event) => setTopicDescription(event.target.value)} placeholder="What are we exploring together?" /></label>
        <label>Opening message<textarea required maxLength={5000} rows={3} value={topicOpening} onChange={(event) => setTopicOpening(event.target.value)} placeholder="Set the context for the discussion…" /></label>
        <div className="modal-foot"><span><UsersRound size={15} /> Public to workspace participants</span><button type="button" className="button quiet" onClick={() => setShowTopicModal(false)}>Cancel</button><button className="button primary" type="submit"><Plus size={15} /> Create conversation</button></div>
      </form></div>}
      {toast && <div className="toast" role="status" aria-live="polite"><CircleCheck size={17} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
    </div>
  );
}

function WorkspaceHome({ conversation, title, messages, state, composer, setComposer, sendMessage, onComposerKey, onOpenDirect, onOpenTopic, onNewTopic, onSimulateDraft, pendingCount }: {
  conversation: Conversation; title: string; messages: WorkspaceState['messages']; state: WorkspaceState;
  composer: string; setComposer: (value: string) => void; sendMessage: (event?: FormEvent) => void;
  onComposerKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void; onOpenDirect: (id: string) => void;
  onOpenTopic: (id: string) => void; onNewTopic: () => void; onSimulateDraft: () => void; pendingCount: number;
}) {
  const authorFor = (id: string) => state.participants.find((item) => item.id === id);
  const topics = state.conversations.filter((item) => item.kind === 'topical');
  return <div className="workspace-layout">
    <main className="conversation-column">
      <div className="conversation-heading">
        <div className="conversation-title-wrap"><div className={`conversation-symbol ${conversation.kind}`}><Hash size={18} /></div><div><div className="title-line"><h1>{title}</h1>{conversation.kind === 'main' ? <span className="live-tag"><span />SHARED SPACE</span> : <span className="public-tag">PUBLIC TOPIC</span>}</div><p>{conversation.description || (conversation.kind === 'main' ? 'A shared space for the whole AETHER crew.' : 'Focused discussion in the Nexus workspace.')}</p></div></div>
        
      </div>
      <div className="conversation-meta"><span><UsersRound size={14} /> {conversation.kind === 'main' ? `${state.participants.length} participants` : 'Open to all participants'}</span><span className="meta-dot" /><span><Radio size={14} /> Shared workspace</span></div>
      {conversation.kind === 'main' && <div className="welcome-card"><div className="welcome-glyph"><Command size={17} /></div><div><b>This is the common room.</b><span>Share a thought, ask a question, or pull someone into the conversation.</span></div><button onClick={onNewTopic}>Start a topic <ArrowUpRight size={14} /></button></div>}
      <div className="timeline" key={conversation.id}>
        {messages.length === 0 ? <div className="empty-timeline"><div className="empty-icon"><MessagesSquare size={24} /></div><h3>A little room to think.</h3><p>Be the first to start this conversation.</p></div> : <>
          <div className="day-divider"><span>CONVERSATION HISTORY</span><i /></div>
          {messages.map((message, index) => {
            const author = authorFor(message.authorId);
            const previous = index > 0 ? authorFor(messages[index - 1].authorId) : undefined;
            const grouped = previous?.id === author?.id;
            return <article key={message.id} className={`message-row ${grouped ? 'grouped' : ''}`}>
              <div className="message-avatar-slot">{!grouped && <Avatar participant={author} />}</div>
              <div className="message-content"><div className="message-byline">{!grouped && <><b>{author?.name ?? 'Participant'}</b>{author?.kind === 'agent' && <span className="kind-tag agent-kind">AGENT</span>}{author?.kind === 'service' && <span className="kind-tag service-kind">SERVICE</span>}<time>{relativeTime(message.createdAt)}</time></>}{grouped && <time className="group-time">{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}</div>
                <p>{message.body}</p>
                {message.approvedWithEdits && <span className="edited-line"><ShieldCheck size={12} /> Admin-edited before release · agent-authored</span>}
              </div>
            </article>;
          })}
        </>}
      </div>
      <form className="composer" onSubmit={sendMessage}>
        <div className="composer-tools"><span className="composer-context"><Avatar participant={state.participants.find((p) => p.id === CURRENT_USER)} size="small" /><span>Message as <b>Cameron</b></span></span><button type="button" className="text-tool" onClick={onSimulateDraft}><Sparkles size={14} /> Preview agent draft</button></div>
        <textarea aria-label="Write a message" placeholder={`Message ${conversation.kind === 'main' ? 'the Common Room' : title}…`} rows={2} value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={onComposerKey} />
        <div className="composer-bottom"><span><CornerDownRight size={13} /> Enter to send · Shift + Enter for a new line</span><button className="send-button" type="submit" disabled={!composer.trim()}><span>Send</span><Send size={15} /></button></div>
      </form>
    </main>
    <aside className="context-column">
      <div className="context-head"><div><span className="eyebrow">IN THIS WORKSPACE</span><h2>Participants <span>{state.participants.length}</span></h2></div><button className="icon-button tiny" onClick={() => onOpenDirect(state.participants.find((p) => p.kind === 'agent')?.id ?? 'nova')} aria-label="Start a direct message"><Plus size={16} /></button></div>
      <div className="participant-stack">{state.participants.map((person) => <button className="participant-row" key={person.id} onClick={() => person.id !== CURRENT_USER && onOpenDirect(person.id)}><Avatar participant={person} size="small" /><span className="person-copy"><b>{person.name}{person.id === CURRENT_USER && <small>YOU</small>}</b><span>{person.kind === 'human' ? 'Human' : person.kind === 'agent' ? 'AI participant' : 'Service participant'}</span></span><i className={`presence-dot ${person.availability}`} /></button>)}</div>
      <div className="context-rule" />
      <div className="topic-panel-heading"><div><span className="eyebrow">FOCUSED DISCUSSION</span><h2>Topical conversations</h2></div><button className="icon-button tiny" aria-label="Create topical conversation" onClick={onNewTopic}><Plus size={15} /></button></div>
      <div className="topic-cards">{topics.slice(0, 3).map((topic) => {
        const count = state.messages.filter((message) => message.conversationId === topic.id).length;
        const lastMessage = state.messages.filter((message) => message.conversationId === topic.id).at(-1);
        const author = lastMessage ? authorFor(lastMessage.authorId) : undefined;
        return <button className={`topic-card ${conversation.id === topic.id ? 'current' : ''}`} key={topic.id} onClick={() => onOpenTopic(topic.id)}><span className="topic-card-top"><span className="topic-card-hash">#</span><span>{count} messages</span></span><b>{topic.title}</b><span className="topic-preview">{lastMessage ? `${author?.name ?? 'Participant'}: ${lastMessage.body}` : topic.description}</span><span className="topic-card-bottom"><span className="mini-avatars"><Avatar participant={author} size="small" /></span><span>{lastMessage ? relativeTime(lastMessage.createdAt) : 'New'}</span><ArrowUpRight size={14} /></span></button>;
      })}
        <button className="new-topic-link" onClick={onNewTopic}><Plus size={15} /> Start a new conversation</button>
      </div>
      <div className="governance-hint"><div className="hint-icon"><ShieldCheck size={15} /></div><div><b>Thoughtful by default</b><p>Agent messages can wait for your approval before they appear here.</p><button onClick={() => window.dispatchEvent(new CustomEvent('nexus-open-admin'))}>How governance works <ArrowUpRight size={12} /></button></div></div>
      {pendingCount > 0 && <div className="pending-mini"><span className="pending-pulse" /><span><b>{pendingCount} agent {pendingCount === 1 ? 'draft' : 'drafts'}</b> waiting for review</span></div>}
    </aside>
  </div>;
}

function DirectMessages({ state, conversations, activeConversationId, onSelect, onOpenDirect, messages, composer, setComposer, sendMessage, onComposerKey, onSimulateDraft }: {
  state: WorkspaceState; conversations: Conversation[]; activeConversationId: string; onSelect: (id: string) => void;
  onOpenDirect: (id: string) => void; messages: WorkspaceState['messages']; composer: string; setComposer: (value: string) => void;
  sendMessage: (event?: FormEvent) => void; onComposerKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void; onSimulateDraft: () => void;
}) {
  const active = conversations.find((item) => item.id === activeConversationId);
  const otherId = active?.participantIds.find((id) => id !== CURRENT_USER);
  const person = state.participants.find((item) => item.id === otherId);
  const dmMessages = active ? state.messages.filter((item) => item.conversationId === active.id) : [];
  return <div className="page-shell dm-page">
    <div className="page-heading"><div><span className="eyebrow">ONE-TO-ONE CONVERSATIONS</span><h1>Direct messages</h1><p>Private conversations, still part of the shared workspace.</p></div><button className="button primary" onClick={() => onOpenDirect(state.participants.find((item) => item.id !== CURRENT_USER && item.kind === 'agent')?.id ?? 'nova')}><Plus size={15} /> New message</button></div>
    <div className="dm-layout"><div className="dm-list"><div className="section-kicker">RECENT <span>{conversations.length}</span></div>{conversations.map((conversation) => {
      const id = conversation.participantIds.find((participantId) => participantId !== CURRENT_USER) ?? '';
      const recipient = state.participants.find((item) => item.id === id);
      const latest = state.messages.filter((item) => item.conversationId === conversation.id).at(-1);
      return <button key={conversation.id} className={`dm-list-item ${activeConversationId === conversation.id ? 'selected' : ''}`} onClick={() => onSelect(conversation.id)}><Avatar participant={recipient} /><span className="dm-list-copy"><b>{recipient?.name ?? 'Participant'}{recipient?.kind === 'agent' && <span className="kind-tag agent-kind">AI</span>}</b><span>{latest?.body ?? 'Start the conversation'}</span></span><span className="dm-time">{getUnreadCount(state, conversation.id, CURRENT_USER) > 0 ? <span className="unread-badge">{getUnreadCount(state, conversation.id, CURRENT_USER)}</span> : latest ? relativeTime(latest.createdAt) : ''}</span></button>;
    })}
    <div className="dm-list-divider" /><div className="section-kicker">START A CONVERSATION</div>{state.participants.filter((item) => item.id !== CURRENT_USER).map((item) => <button className="people-quick" key={item.id} onClick={() => onOpenDirect(item.id)}><Avatar participant={item} size="small" /><span>{item.name}</span><ArrowUpRight size={14} /></button>)}</div>
      {active && person ? <div className="dm-thread"><div className="dm-thread-head"><div className="conversation-title-wrap"><Avatar participant={person} /><div><div className="title-line"><h2>{person.name}</h2>{person.kind === 'agent' && <span className="kind-tag agent-kind">AI PARTICIPANT</span>}</div><div className="dm-presence"><Presence availability={person.availability} /><span>·</span><span>{person.description}</span></div></div></div></div><div className="dm-context-note"><ShieldCheck size={14} /> This conversation is direct between you and {person.name}. Workspace admins can review activity.</div><div className="dm-messages">{dmMessages.length ? dmMessages.map((message) => { const author = state.participants.find((item) => item.id === message.authorId); return <div className={`dm-message ${message.authorId === CURRENT_USER ? 'mine' : ''}`} key={message.id}><Avatar participant={author} size="small" /><div><div className="dm-message-meta"><b>{author?.name}</b><time>{relativeTime(message.createdAt)}</time></div><p>{message.body}</p>{message.approvedWithEdits && <span className="edited-line">Admin-edited before release · agent-authored</span>}</div></div>; }) : <div className="dm-empty"><div className="empty-icon"><MessageCircle size={23} /></div><h3>Start the conversation.</h3><p>Send {person.name} a message. Replies from agents may wait for your approval.</p></div>}</div><form className="composer dm-composer" onSubmit={sendMessage}><div className="composer-tools"><span className="composer-context"><Avatar participant={state.participants.find((item) => item.id === CURRENT_USER)} size="small" /><span>Message as <b>Cameron</b></span></span>{person.kind === 'agent' && <button type="button" className="text-tool" onClick={onSimulateDraft}><Sparkles size={14} /> Preview agent draft</button>}</div><textarea aria-label="Write a direct message" rows={2} placeholder={`Message ${person.name}…`} value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={onComposerKey} /><div className="composer-bottom"><span><CornerDownRight size={13} /> Enter to send</span><button className="send-button" type="submit" disabled={!composer.trim()}><span>Send</span><Send size={15} /></button></div></form></div> : <div className="dm-thread dm-no-selection"><div className="empty-icon"><MessagesSquare size={24} /></div><h2>Your conversations, all in one place.</h2><p>Select a participant to start a direct conversation.</p><button className="button primary" onClick={() => onOpenDirect(state.participants.find((item) => item.id !== CURRENT_USER && item.kind === 'agent')?.id ?? 'nova')}><Plus size={15} /> Start a conversation</button></div>}
    </div>
  </div>;
}

function ParticipantDirectory({ state, onOpenDirect }: { state: WorkspaceState; onOpenDirect: (id: string) => void }) {
  return <div className="page-shell"><div className="page-heading"><div><span className="eyebrow">THE PEOPLE AND SYSTEMS IN THE ROOM</span><h1>Participants</h1><p>Everyone has a visible identity here. Availability is separate from permission.</p></div><div className="directory-count"><UsersRound size={17} /><b>{state.participants.length}</b> in the workspace</div></div><div className="participant-grid">{state.participants.map((person) => <article className="participant-card" key={person.id}><div className="participant-card-top"><Avatar participant={person} size="large" /><Presence availability={person.availability} /></div><div className="participant-card-name"><h2>{person.name}</h2><span className={`kind-tag ${person.kind === 'agent' ? 'agent-kind' : person.kind === 'service' ? 'service-kind' : 'human-kind'}`}>{person.kind}</span></div><p className="participant-description">{person.description || 'A member of the AETHER workspace.'}</p><div className="participant-card-state"><span className={`state-dot state-${person.state}`} />{person.state.replace('_', ' ')}<span className="state-divider" />{person.requiresApproval ? <><ShieldCheck size={13} /> outbound approval</> : <><CircleCheck size={13} /> no approval gate</>}</div><div className="participant-card-foot"><span><Activity size={14} /> Workspace participant</span>{person.id !== CURRENT_USER && <button className="button quiet small" onClick={() => onOpenDirect(person.id)}><MessageCircle size={14} /> Message</button>}</div></article>)}</div><div className="directory-footer"><ShieldCheck size={15} /><span>Participant identity, availability, and moderation state are shown separately so you can see what is true at a glance.</span></div></div>;
}

function Governance({ state, tab, setTab, pendingDrafts, selectedDraft, selectedAuthor, selectedConversation, context, selectedDraftId, onSelectDraft, editValue, onEdit, onResolve, onModerate, onPolicy }: {
  state: WorkspaceState; tab: AdminTab; setTab: (tab: AdminTab) => void; pendingDrafts: WorkspaceState['drafts']; selectedDraft?: WorkspaceState['drafts'][number];
  selectedAuthor?: Participant; selectedConversation?: Conversation; context: WorkspaceState['messages']; selectedDraftId: string | null;
  onSelectDraft: (id: string) => void; editValue: string; onEdit: (value: string) => void;
  onResolve: (decision: 'approved' | 'approved_with_edits' | 'rejected') => void;
  onModerate: (participant: Participant, state: ParticipantState) => void; onPolicy: (id: string, value: boolean) => void;
}) {
  const tabs: { id: AdminTab; label: string; icon: typeof ShieldCheck; count?: number }[] = [
    { id: 'approvals', label: 'Draft review', icon: Inbox, count: pendingDrafts.length },
    { id: 'history', label: 'Review history', icon: Clock3 },
    { id: 'participants', label: 'Participants', icon: UsersRound },
    { id: 'policy', label: 'Agent policy', icon: SlidersHorizontal },
    { id: 'audit', label: 'Activity history', icon: Activity },
  ];
  return <div className="page-shell governance-page"><div className="page-heading governance-heading"><div><span className="eyebrow">ADMIN CONTROL AREA</span><h1>Governance, in context.</h1><p>Keep collaboration moving while making consequential actions visible.</p></div><div className="governance-summary"><span className="summary-mark"><ShieldCheck size={17} /></span><div><b>Human oversight is active</b><span>Local prototype policy · review before agent delivery</span></div></div></div>
    <div className="governance-tabs">{tabs.map(({ id, label, icon: Icon, count }) => <button className={tab === id ? 'governance-tab active' : 'governance-tab'} key={id} onClick={() => setTab(id)}><Icon size={16} />{label}{count !== undefined && <span className={count ? 'tab-count waiting' : 'tab-count'}>{count}</span>}</button>)}</div>
    {tab === 'approvals' && <div className="approval-workspace"><div className="approval-list"><div className="approval-list-head"><div><span className="eyebrow">NEEDS YOUR REVIEW</span><h2>Pending drafts <span>{pendingDrafts.length}</span></h2></div><span className="queue-signal"><i /> DEMO QUEUE</span></div>{pendingDrafts.length === 0 ? <div className="queue-empty"><div className="empty-icon"><CircleCheck size={23} /></div><h3>Nothing waiting on you.</h3><p>When an agent draft needs review, it will show up here.</p></div> : pendingDrafts.map((draft) => {
      const author = state.participants.find((item) => item.id === draft.authorId);
      const conversation = state.conversations.find((item) => item.id === draft.conversationId);
      return <button className={`draft-list-card ${selectedDraftId === draft.id ? 'selected' : ''}`} key={draft.id} onClick={() => onSelectDraft(draft.id)}><Avatar participant={author} size="small" /><span className="draft-list-copy"><span className="draft-list-meta"><b>{author?.name ?? 'Agent'}</b><time>{relativeTime(draft.submittedAt)}</time></span><span className="draft-snippet">{draft.body}</span><span className="draft-destination"><Hash size={12} />{conversation?.title ?? 'Conversation'}</span></span><ArrowUpRight size={15} className="draft-arrow" /></button>;
    })}<div className="approval-list-foot"><ShieldCheck size={14} /><span>Rejected content stays in admin history, outside normal conversation.</span></div></div>
      <div className="draft-review-panel">{selectedDraft ? <><div className="review-header"><div><span className="eyebrow">MESSAGE DRAFT · {selectedDraft.state.toUpperCase()}</span><h2>Review before it goes live.</h2></div><span className="review-time"><Clock3 size={13} /> {relativeTime(selectedDraft.submittedAt)}</span></div><div className="review-author"><Avatar participant={selectedAuthor} /><div><b>{selectedAuthor?.name ?? 'Agent'} <span className="kind-tag agent-kind">AGENT</span></b><span>Wants to post in <strong>{selectedConversation?.title ?? 'a conversation'}</strong></span></div></div><div className="context-preview"><div className="context-preview-label"><span>CONVERSATION CONTEXT</span><button onClick={() => window.dispatchEvent(new CustomEvent('nexus-open-conversation', { detail: selectedDraft.conversationId }))}><ArrowUpRight size={12} /> Open thread</button></div>{context.map((message) => { const author = state.participants.find((item) => item.id === message.authorId); return <div className="context-quote" key={message.id}><b>{author?.name ?? 'Participant'}</b><p>{message.body}</p></div>; })}{context.length === 0 && <p className="context-none">No earlier messages in this conversation. The draft starts a new exchange.</p>}</div><label className="draft-edit-label">PROPOSED MESSAGE <span>Editable before release</span><textarea rows={4} value={editValue} onChange={(event) => onEdit(event.target.value)} /></label><div className="authorship-note"><ShieldCheck size={15} /><span><b>Authorship stays truthful.</b> If you edit and approve, this will still appear as a message from {selectedAuthor?.name ?? 'the agent'}, with the review recorded.</span></div><div className="review-actions"><button className="button reject-button" onClick={() => onResolve('rejected')}><X size={15} /> Reject</button><span className="action-spacer" /><button className="button quiet" onClick={() => onResolve('approved_with_edits')}><SlidersHorizontal size={14} /> Approve with edits</button><button className="button primary" onClick={() => onResolve('approved')}><Check size={15} /> Approve & release</button></div></> : <div className="review-empty"><div className="empty-icon"><ShieldCheck size={24} /></div><h2>The review space is clear.</h2><p>Select a pending draft to review its author, destination, and surrounding conversation before deciding.</p></div>}</div></div>}
    {tab === 'participants' && <div className="admin-table-panel"><div className="admin-panel-heading"><div><span className="eyebrow">PARTICIPANT MODERATION</span><h2>People and systems</h2><p>Moderation changes behavior; it does not erase identity or availability.</p></div><span className="table-count">{state.participants.length} participants</span></div><div className="participant-admin-list">{state.participants.map((person) => <div className="participant-admin-row" key={person.id}><Avatar participant={person} size="small" /><div className="admin-person"><b>{person.name}</b><span>{person.kind} · <Presence availability={person.availability} /></span></div><span className={`moderation-pill ${person.state}`}>{person.state.replace('_', ' ')}</span><div className="moderation-actions">{person.kind !== 'human' && <><button title="Limit participant" onClick={() => onModerate(person, person.state === 'limited' ? 'active' : 'limited')} className={person.state === 'limited' ? 'chosen' : ''}><SlidersHorizontal size={14} />{person.state === 'limited' ? 'Restore limits' : 'Limit'}</button><button title="Suspend participant" onClick={() => onModerate(person, person.state === 'suspended' ? 'active' : 'suspended')}><ShieldAlert size={14} />{person.state === 'suspended' ? 'Reactivate' : 'Suspend'}</button><button title="Block participant" onClick={() => onModerate(person, person.state === 'blocked' ? 'active' : 'blocked')}><Ban size={14} />{person.state === 'blocked' ? 'Unblock' : 'Block'}</button></>}</div></div>)}</div></div>}
    {tab === 'policy' && <div className="admin-table-panel policy-panel"><div className="admin-panel-heading"><div><span className="eyebrow">ACTION-LEVEL POLICY</span><h2>Agent outbound messages</h2><p>Set whether each agent’s proposed messages wait for your approval.</p></div><span className="policy-default"><ShieldCheck size={14} /> REVIEW FIRST</span></div><div className="policy-intro"><div className="policy-intro-icon"><ShieldCheck size={18} /></div><p>Agents submit drafts before speaking into the workspace. Turning approval off releases new demo replies immediately. Limited agents still require review. This is a local demo control, not connected to external agents.</p></div><div className="policy-agent-list">{state.participants.filter((item) => item.kind === 'agent').map((person) => <div className="policy-row" key={person.id}><Avatar participant={person} size="small" /><div className="policy-person"><b>{person.name}</b><span>{person.availability} · {person.state}</span></div><div className="policy-switch-copy"><b>{person.requiresApproval ? 'Approval required' : 'Auto-release allowed'}</b><span>{person.requiresApproval ? 'New replies wait for admin review.' : 'Outbound replies can be delivered without review.'}</span></div><button className={`toggle ${person.requiresApproval ? 'on' : ''}`} role="switch" aria-checked={person.requiresApproval} aria-label={`Require approval for ${person.name}`} onClick={() => onPolicy(person.id, !person.requiresApproval)}><span /></button></div>)}</div><div className="policy-caution"><ShieldAlert size={15} /><span>Autonomy changes should be deliberate. This prototype stores the setting in your browser only.</span></div></div>}
    {tab === 'audit' && <div className="admin-table-panel audit-panel"><div className="admin-panel-heading"><div><span className="eyebrow">LOCAL ACTIVITY HISTORY</span><h2>Workspace history</h2><p>Governance actions and meaningful changes, with actor and time attached.</p></div><span className="table-count">{state.audit.length} events</span></div>{state.audit.length ? <div className="audit-list">{[...state.audit].reverse().map((item) => { const actor = state.participants.find((person) => person.id === item.actorId); return <div className="audit-row" key={item.id}><span className={`audit-icon ${item.type.includes('draft') ? 'audit-draft' : item.type.includes('participant') || item.type.includes('policy') ? 'audit-policy' : ''}`}>{item.type.includes('draft') ? <Inbox size={15} /> : item.type.includes('participant') ? <UsersRound size={15} /> : item.type.includes('policy') ? <SlidersHorizontal size={15} /> : <Activity size={15} />}</span><div><b>{item.summary}</b><span>{actor?.name ?? 'Nexus'} · {item.type.replaceAll('_', ' ')}</span></div><time>{relativeTime(item.createdAt)}</time></div>; })}</div> : <div className="queue-empty"><div className="empty-icon"><Activity size={23} /></div><h3>No history yet.</h3><p>Approvals and governance changes will be recorded here.</p></div>}</div>}
    {tab === 'history' && <section className="admin-table-panel"><div className="admin-panel-heading"><div><span className="eyebrow">ADMIN-ONLY REVIEW RECORDS</span><h2>Review history</h2><p>Original drafts, final wording, and decisions stay together.</p></div></div>{state.drafts.filter(draft => draft.state !== 'pending').length === 0 && <div className="queue-empty"><h3>No decisions yet.</h3><p>Review an agent draft to begin the history.</p></div>}{[...state.drafts].filter(draft => draft.state !== 'pending').reverse().map(draft => <article className="history-card" key={draft.id}><header><b>{state.participants.find(person => person.id === draft.authorId)?.name} · {draft.state.replaceAll('_', ' ')}</b><time>{draft.resolvedAt ? new Date(draft.resolvedAt).toLocaleString() : ''}</time></header><p>{draft.finalBody ?? draft.body}</p>{draft.state === 'approved_with_edits' && <details><summary>Original agent draft</summary><p>{draft.body}</p></details>}<small>{state.conversations.find(conversation => conversation.id === draft.conversationId)?.title || 'Direct conversation'} · {draft.reviewedBy ? `Reviewed by ${state.participants.find(person => person.id === draft.reviewedBy)?.name}` : 'Released by policy'}{draft.state === 'rejected' && ' · Not delivered'}</small></article>)}</section>}
    <div className="governance-footnote"><ShieldCheck size={14} /><span>Every review is recorded. Drafts are not visible in ordinary conversation until approved.</span></div>
  </div>;
}

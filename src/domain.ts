export type ParticipantKind = 'human' | 'agent' | 'service';
export type ParticipantState = 'active' | 'limited' | 'suspended' | 'blocked';
export type Availability = 'available' | 'unavailable' | 'degraded' | 'offline' | 'unknown';
export type ConversationKind = 'main' | 'topical' | 'direct';
export type DraftState = 'pending' | 'approved' | 'approved_with_edits' | 'rejected';

export interface Participant {
  id: string;
  name: string;
  kind: ParticipantKind;
  state: ParticipantState;
  availability: Availability;
  requiresApproval: boolean;
  isAdmin?: boolean;
  /** Display-only role; administrative authority comes only from isAdmin. */
  role?: string;
  description?: string;
  initials?: string;
  color?: string;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  state: 'active' | 'archived' | 'closed';
  participantIds: string[];
  description?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  body: string;
  state: 'delivered' | 'withdrawn';
  createdAt: string;
  sourceDraftId?: string;
  approvedWithEdits?: boolean;
}

export interface MessageDraft {
  id: string;
  conversationId: string;
  authorId: string;
  body: string;
  state: DraftState;
  submittedAt: string;
  resolvedAt?: string;
  finalBody?: string;
  reviewedBy?: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
  actorId?: string;
  subjectId?: string;
}

/** Delivered message IDs seen by participant, then by conversation. */
export type ConversationReadState = Record<string, Record<string, string[]>>;

export interface WorkspaceState {
  participants: Participant[];
  conversations: Conversation[];
  messages: Message[];
  drafts: MessageDraft[];
  audit: AuditEvent[];
  readState?: ConversationReadState;
}

const newId = () => globalThis.crypto.randomUUID();
const timestamp = () => new Date().toISOString();

function requireAdmin(state: WorkspaceState, actorId: string): Participant {
  const actor = state.participants.find(item => item.id === actorId);
  if (!actor || actor.kind !== 'human' || actor.state !== 'active' || actor.isAdmin !== true) {
    throw new Error('An active human admin is required.');
  }
  return actor;
}

function requireText(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${label} cannot be empty.`);
  if (text.length > 5000) throw new Error(`${label} must be 5,000 characters or fewer.`);
  return text;
}

function assertCanSpeak(state: WorkspaceState, conversationId: string, participantId: string): Participant {
  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant || !['active', 'limited'].includes(participant.state)) {
    throw new Error('This participant is not allowed to send messages.');
  }
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation || conversation.state !== 'active') throw new Error('This conversation is not available.');
  if (conversation.kind === 'direct' && !conversation.participantIds.includes(participantId)) {
    throw new Error('This participant is not a member of the direct conversation.');
  }
  return participant;
}

function event(type: string, summary: string, actorId?: string, subjectId?: string): AuditEvent {
  return { id: newId(), type, summary, createdAt: timestamp(), actorId, subjectId };
}

export function createMessage(state: WorkspaceState, conversationId: string, authorId: string, body: string): WorkspaceState {
  const author = assertCanSpeak(state, conversationId, authorId);
  if (author.kind === 'agent') return createDraft(state, conversationId, authorId, body);
  const message: Message = {
    id: newId(), conversationId, authorId, body: requireText(body, 'Message'), state: 'delivered', createdAt: timestamp(),
  };
  return { ...state, messages: [...state.messages, message] };
}

export function createDraft(state: WorkspaceState, conversationId: string, authorId: string, body: string): WorkspaceState {
  const author = assertCanSpeak(state, conversationId, authorId);
  if (author.kind !== 'agent') throw new Error('Only agent participants can submit agent drafts.');
  const draft: MessageDraft = {
    id: newId(), conversationId, authorId, body: requireText(body, 'Draft'), state: 'pending', submittedAt: timestamp(),
  };
  if (author.requiresApproval || author.state === 'limited') {
    return {
      ...state,
      drafts: [...state.drafts, draft],
      audit: [...state.audit, event('draft_submitted', `${author.name} submitted a message draft.`, authorId, draft.id)],
    };
  }
  const approvedDraft: MessageDraft = { ...draft, state: 'approved', resolvedAt: timestamp(), finalBody: draft.body };
  const delivered: Message = {
    id: newId(), conversationId, authorId, body: draft.body, state: 'delivered', createdAt: timestamp(), sourceDraftId: draft.id,
  };
  return {
    ...state,
    drafts: [...state.drafts, approvedDraft],
    messages: [...state.messages, delivered],
    audit: [
      ...state.audit,
      event('draft_submitted', `${author.name} submitted a message draft.`, authorId, draft.id),
      event('draft_auto_approved', `${author.name}'s message was released under the current policy.`, authorId, draft.id),
    ],
  };
}

export function resolveDraft(
  state: WorkspaceState,
  draftId: string,
  decision: 'approved' | 'approved_with_edits' | 'rejected',
  editedBody: string | undefined,
  reviewerId: string,
): WorkspaceState {
  const draft = state.drafts.find((item) => item.id === draftId);
  if (!draft || draft.state !== 'pending') throw new Error('Only pending drafts can be reviewed.');
  const reviewer = requireAdmin(state, reviewerId);
  if (decision !== 'rejected') assertCanSpeak(state, draft.conversationId, draft.authorId);
  const finalBody = decision === 'approved_with_edits' ? requireText(editedBody ?? '', 'Edited message') : draft.body;
  const resolved: MessageDraft = {
    ...draft,
    state: decision,
    resolvedAt: timestamp(),
    reviewedBy: reviewerId,
    finalBody: decision === 'rejected' ? undefined : finalBody,
  };
  const messages = decision === 'rejected' ? state.messages : [...state.messages, {
    id: newId(), conversationId: draft.conversationId, authorId: draft.authorId, body: finalBody,
    state: 'delivered' as const, createdAt: timestamp(), sourceDraftId: draft.id,
    approvedWithEdits: decision === 'approved_with_edits',
  }];
  const actor = reviewer.name;
  return {
    ...state,
    drafts: state.drafts.map((item) => item.id === draftId ? resolved : item),
    messages,
    audit: [...state.audit, event(`draft_${decision}`, `${actor} ${decision.replaceAll('_', ' ')} a draft from ${state.participants.find((item) => item.id === draft.authorId)?.name ?? 'an agent'}.`, reviewerId, draftId)],
  };
}

export function createTopicalConversation(state: WorkspaceState, title: string, description: string, authorId: string, openingMessage: string): WorkspaceState {
  const author = assertCanSpeak(state, 'main', authorId);
  if (author.kind !== 'human') throw new Error('Only humans can create topical conversations in this prototype.');
  const cleanTitle = requireText(title, 'Topic title');
  const conversation: Conversation = {
    id: newId(), kind: 'topical', title: cleanTitle, description: description.trim(), state: 'active',
    participantIds: state.participants.filter(participant => participant.state === 'active').map(participant => participant.id),
  };
  const withConversation = { ...state, conversations: [...state.conversations, conversation] };
  const withMessage = createMessage(withConversation, conversation.id, authorId, openingMessage);
  return { ...withMessage, audit: [...withMessage.audit, event('conversation_created', `${author.name} started “${cleanTitle}”.`, authorId, conversation.id)] };
}

function canReadConversation(state: WorkspaceState, conversationId: string, participantId: string): boolean {
  const participant = state.participants.find(item => item.id === participantId);
  const conversation = state.conversations.find(item => item.id === conversationId);
  return !!participant && ['active', 'limited'].includes(participant.state) && !!conversation
    && (conversation.kind !== 'direct' || conversation.participantIds.includes(participantId));
}

export function getUnreadCount(state: WorkspaceState, conversationId: string, participantId: string): number {
  if (!canReadConversation(state, conversationId, participantId)) return 0;
  const seen = new Set(state.readState?.[participantId]?.[conversationId] ?? []);
  return state.messages.filter(message => message.conversationId === conversationId
    && message.state === 'delivered' && message.authorId !== participantId && !seen.has(message.id)).length;
}

export function markConversationRead(state: WorkspaceState, conversationId: string, participantId: string): WorkspaceState {
  if (!canReadConversation(state, conversationId, participantId)) throw new Error('This participant cannot read this conversation.');
  const seen = state.messages.filter(message => message.conversationId === conversationId && message.state === 'delivered').map(message => message.id);
  return {
    ...state,
    readState: { ...state.readState, [participantId]: { ...state.readState?.[participantId], [conversationId]: seen } },
  };
}

export function openDirectConversation(state: WorkspaceState, participantIds: readonly string[], actorId: string): WorkspaceState {
  if (participantIds.length !== 2 || new Set(participantIds).size !== 2) throw new Error('A direct conversation requires two distinct participants.');
  const participants = participantIds.map(id => state.participants.find(participant => participant.id === id));
  if (participants.some(participant => !participant || !['active', 'limited'].includes(participant.state))) {
    throw new Error('Direct participants must exist and be allowed to communicate.');
  }
  const actor = state.participants.find(participant => participant.id === actorId);
  if (!actor || actor.state !== 'active') throw new Error('An active actor is required.');
  if (!participantIds.includes(actorId)) {
    requireAdmin(state, actorId);
    if (!participants.every(participant => participant?.kind === 'agent')) throw new Error('An admin may only seed an agent pair outside their own conversations.');
  }
  const existing = state.conversations.find(conversation => conversation.kind === 'direct'
    && conversation.participantIds.length === 2 && participantIds.every(id => conversation.participantIds.includes(id)));
  if (existing) return state;
  const conversation: Conversation = {
    id: newId(), kind: 'direct', state: 'active', participantIds: [...participantIds],
    title: participantIds.map(id => state.participants.find(participant => participant.id === id)?.name ?? id).join(' & '),
  };
  return {
    ...state, conversations: [...state.conversations, conversation],
    audit: [...state.audit, event('conversation_created', `Started direct conversation “${conversation.title}”.`, actorId, conversation.id)],
  };
}

export function setParticipantState(state: WorkspaceState, participantId: string, nextState: ParticipantState, actorId: string): WorkspaceState {
  requireAdmin(state, actorId);
  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant) throw new Error('Participant not found.');
  if (participant.kind === 'human' && participant.id === actorId) throw new Error('You cannot moderate your own admin account.');
  return {
    ...state,
    participants: state.participants.map((item) => item.id === participantId ? { ...item, state: nextState } : item),
    audit: [...state.audit, event('participant_state_changed', `${participant.name} changed from ${participant.state} to ${nextState}.`, actorId, participantId)],
  };
}

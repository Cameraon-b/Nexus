import { describe, expect, it } from 'vitest';
import { createMessage, createDraft, resolveDraft, setParticipantState, createTopicalConversation, openDirectConversation, getUnreadCount, markConversationRead } from './domain';
import type { Participant, WorkspaceState } from './domain';

function state(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    participants: [
      { id: 'cameron', name: 'Cameron', kind: 'human', state: 'active', availability: 'available', requiresApproval: false, isAdmin: true },
      { id: 'hermes', name: 'Hermes', kind: 'agent', state: 'active', availability: 'available', requiresApproval: true },
      { id: 'blocked', name: 'Blocked agent', kind: 'agent', state: 'blocked', availability: 'offline', requiresApproval: true },
    ],
    conversations: [{ id: 'main', kind: 'main', title: 'The Common Room', state: 'active', participantIds: ['cameron', 'hermes'] }],
    messages: [],
    drafts: [],
    audit: [],
    ...overrides,
  };
}

describe('Nexus conversation governance', () => {
  it('accepts optional display roles without granting admin authority', () => {
    const member: Participant = { ...state().participants[0], role: 'admin', isAdmin: undefined };
    const initial = state();
    initial.participants[0] = member;
    expect(() => setParticipantState(initial, 'hermes', 'limited', member.id)).toThrow(/admin/i);
    expect(createMessage(initial, 'main', member.id, 'Ordinary member').messages).toHaveLength(1);
  });
  it('protects unread state from unknown or unauthorized viewers while allowing archived reads', () => {
    let initial = openDirectConversation(state(), ['cameron', 'hermes'], 'cameron');
    const directId = initial.conversations.at(-1)!.id;
    initial = createMessage(initial, directId, 'cameron', 'Private');
    initial.participants.push({ ...initial.participants[0], id: 'outsider' });
    for (const viewer of ['missing', 'blocked', 'outsider']) {
      expect(getUnreadCount(initial, directId, viewer)).toBe(0);
      expect(() => markConversationRead(initial, directId, viewer)).toThrow();
    }
    expect(() => markConversationRead(initial, 'missing', 'cameron')).toThrow();
    initial.conversations.at(-1)!.state = 'archived';
    expect(getUnreadCount(initial, directId, 'hermes')).toBe(1);
    expect(getUnreadCount(markConversationRead(initial, directId, 'hermes'), directId, 'hermes')).toBe(0);
  });
  it('marks a conversation read immutably per viewer without hiding later same-time messages', () => {
    let initial = createMessage(state(), 'main', 'cameron', 'First');
    initial.participants[1].requiresApproval = false;
    initial = createMessage(initial, 'main', 'hermes', 'Reply');
    const next = markConversationRead(initial, 'main', 'cameron');
    expect(getUnreadCount(next, 'main', 'cameron')).toBe(0);
    expect(getUnreadCount(next, 'main', 'hermes')).toBe(1);
    expect(initial.readState).toBeUndefined();
    const later = { ...next, messages: [...next.messages, { ...next.messages[1], id: 'later' }] };
    expect(getUnreadCount(later, 'main', 'cameron')).toBe(1);
    const otherViewer = markConversationRead(later, 'main', 'hermes');
    expect(getUnreadCount(otherViewer, 'main', 'cameron')).toBe(1);
    expect(getUnreadCount(otherViewer, 'main', 'hermes')).toBe(0);
    expect(getUnreadCount(markConversationRead(otherViewer, 'main', 'cameron'), 'main', 'cameron')).toBe(0);
  });
  it('counts only delivered messages by others with missing legacy read state', () => {
    let initial = createMessage(state(), 'main', 'cameron', 'Own');
    initial.participants[1].requiresApproval = false;
    initial = createMessage(initial, 'main', 'hermes', 'Other');
    initial.messages.push({ ...initial.messages[1], id: 'withdrawn', state: 'withdrawn' });
    initial.messages.push({ ...initial.messages[1], id: 'elsewhere', conversationId: 'elsewhere' });
    expect(getUnreadCount(initial, 'main', 'cameron')).toBe(1);
    expect(getUnreadCount(state(), 'main', 'cameron')).toBe(0);
  });
  it('validates direct participants and actor before reuse with admin-only agent-pair seeding', () => {
    const initial = state();
    initial.participants.push({ ...initial.participants[1], id: 'agent2' });
    const seeded = openDirectConversation(initial, ['hermes', 'agent2'], 'cameron');
    expect(seeded.conversations.at(-1)?.participantIds).toEqual(['hermes', 'agent2']);
    for (const actor of ['missing', 'blocked']) {
      expect(() => openDirectConversation(seeded, ['hermes', 'agent2'], actor)).toThrow();
    }
    for (const status of ['limited', 'suspended', 'blocked'] as const) {
      const invalid = { ...seeded, participants: seeded.participants.map(p => p.id === 'cameron' ? { ...p, state: status } : p) };
      expect(() => openDirectConversation(invalid, ['hermes', 'agent2'], 'cameron')).toThrow();
    }
    const nonAdmin = { ...seeded, participants: seeded.participants.map(p => p.id === 'cameron' ? { ...p, isAdmin: false } : p) };
    expect(() => openDirectConversation(nonAdmin, ['hermes', 'agent2'], 'cameron')).toThrow();
    for (const target of ['missing', 'blocked']) {
      expect(() => openDirectConversation(initial, ['cameron', target], 'cameron')).toThrow();
    }
    const suspended = { ...seeded, participants: seeded.participants.map(p => p.id === 'hermes' ? { ...p, state: 'suspended' as const } : p) };
    expect(() => openDirectConversation(suspended, ['hermes', 'agent2'], 'cameron')).toThrow();
    expect(() => openDirectConversation(initial, ['cameron', 'hermes'], 'agent2')).toThrow();
  });
  it('requires exactly two distinct direct participants even when a pair exists', () => {
    const initial = openDirectConversation(state(), ['cameron', 'hermes'], 'cameron');
    for (const pair of [[], ['cameron'], ['cameron', 'cameron'], ['cameron', 'hermes', 'blocked']]) {
      expect(() => openDirectConversation(initial, pair, 'cameron')).toThrow(/two distinct/i);
    }
  });
  it('opens a direct pair once regardless of participant order', () => {
    const initial = state();
    const next = openDirectConversation(initial, ['cameron', 'hermes'], 'cameron');
    expect(next.conversations.at(-1)).toMatchObject({ kind: 'direct', state: 'active', participantIds: ['cameron', 'hermes'] });
    expect(openDirectConversation(next, ['hermes', 'cameron'], 'hermes')).toBe(next);
    expect(next.audit.at(-1)?.type).toBe('conversation_created');
    expect(initial.conversations).toHaveLength(1);
  });
  it('includes every active participant in a new topic', () => {
    const initial = state();
    initial.participants.push({ ...initial.participants[1], id: 'service', kind: 'service' });
    initial.participants.push({ ...initial.participants[1], id: 'limited', state: 'limited' });
    const next = createTopicalConversation(initial, 'Topic', 'Description', 'cameron', 'Opening');
    expect(next.conversations.at(-1)?.participantIds).toEqual(['cameron', 'hermes', 'service']);
    expect(next.messages[0].conversationId).toBe(next.conversations.at(-1)?.id);
    expect(initial.conversations).toHaveLength(1);
  });
  it('revalidates author access on approval but still permits rejection', () => {
    const drafted = createDraft(state(), 'main', 'hermes', 'Pending');
    const variants: WorkspaceState[] = [
      { ...drafted, participants: drafted.participants.filter(p => p.id !== 'hermes') },
      ...(['suspended', 'blocked'] as const).map(status => ({ ...drafted, participants: drafted.participants.map(p => p.id === 'hermes' ? { ...p, state: status } : p) })),
      { ...drafted, conversations: [] },
      { ...drafted, conversations: drafted.conversations.map(c => ({ ...c, state: 'closed' as const })) },
      { ...drafted, conversations: drafted.conversations.map(c => ({ ...c, kind: 'direct' as const, participantIds: ['cameron', 'blocked'] })) },
    ];
    for (const invalid of variants) {
      for (const decision of ['approved', 'approved_with_edits'] as const) {
        expect(() => resolveDraft(invalid, drafted.drafts[0].id, decision, 'Edited', 'cameron')).toThrow();
      }
      expect(resolveDraft(invalid, drafted.drafts[0].id, 'rejected', undefined, 'cameron').messages).toHaveLength(0);
      expect(invalid.drafts[0].state).toBe('pending');
    }
  });
  it('holds limited agents for approval despite permissive policy', () => {
    const initial = state();
    initial.participants[1] = { ...initial.participants[1], state: 'limited', requiresApproval: false };
    const next = createDraft(initial, 'main', 'hermes', 'Limited');
    expect(next.drafts[0].state).toBe('pending');
    expect(next.messages).toHaveLength(0);
  });
  it('routes agent messages through draft policy and preserves auto-approval lineage', () => {
    const initial = state();
    const held = createMessage(initial, 'main', 'hermes', 'Agent message');
    expect(held.messages).toHaveLength(0);
    expect(held.drafts[0].state).toBe('pending');
    initial.participants[1].requiresApproval = false;
    const released = createMessage(initial, 'main', 'hermes', 'Automatic');
    expect(released.messages[0].sourceDraftId).toBe(released.drafts[0].id);
    expect(released.audit.at(-1)?.type).toBe('draft_auto_approved');
  });
  it('requires active human admin authority for moderation', () => {
    for (const change of [{ isAdmin: undefined }, { isAdmin: false }, { state: 'limited' as const }, { state: 'blocked' as const }, { kind: 'agent' as const }]) {
      const initial = state();
      initial.participants[0] = { ...initial.participants[0], ...change };
      expect(() => setParticipantState(initial, 'hermes', 'suspended', 'cameron')).toThrow(/admin/i);
    }
    expect(() => setParticipantState(state(), 'hermes', 'suspended', 'missing')).toThrow(/admin/i);
    expect(setParticipantState(state(), 'hermes', 'suspended', 'cameron').participants[1].state).toBe('suspended');
  });
  it('requires an explicitly active human admin to review', () => {
    const drafted = createDraft(state(), 'main', 'hermes', 'Review me');
    for (const change of [{ isAdmin: undefined }, { isAdmin: false }, { state: 'limited' as const }, { state: 'suspended' as const }, { kind: 'agent' as const }]) {
      const invalid = { ...drafted, participants: drafted.participants.map(p => p.id === 'cameron' ? { ...p, isAdmin: true, ...change } : p) };
      expect(() => resolveDraft(invalid, invalid.drafts[0].id, 'approved', undefined, 'cameron')).toThrow(/admin/i);
    }
  });
  it('delivers a human message directly into the conversation', () => {
    const next = createMessage(state(), 'main', 'cameron', 'Morning, team.');
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ authorId: 'cameron', body: 'Morning, team.', state: 'delivered' });
  });

  it('holds an agent reply as a draft when approval is required', () => {
    const next = createDraft(state(), 'main', 'hermes', 'I have a proposal.');
    expect(next.drafts).toHaveLength(1);
    expect(next.drafts[0].state).toBe('pending');
    expect(next.messages).toHaveLength(0);
  });

  it('releases an agent draft automatically when policy allows it', () => {
    const initial = state({ participants: state().participants.map((person) => person.id === 'hermes' ? { ...person, requiresApproval: false } : person) });
    const next = createDraft(initial, 'main', 'hermes', 'An auto-approved reply.');
    expect(next.drafts[0].state).toBe('approved');
    expect(next.messages[0]).toMatchObject({ authorId: 'hermes', body: 'An auto-approved reply.', sourceDraftId: next.drafts[0].id });
    expect(next.audit.at(-1)?.type).toBe('draft_auto_approved');
  });

  it('delivers approved edits under the original agent identity with lineage', () => {
    const drafted = createDraft(state(), 'main', 'hermes', 'Original draft.');
    const next = resolveDraft(drafted, drafted.drafts[0].id, 'approved_with_edits', 'Reviewed wording.', 'cameron');
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ authorId: 'hermes', body: 'Reviewed wording.', sourceDraftId: drafted.drafts[0].id, approvedWithEdits: true });
    expect(next.drafts[0].state).toBe('approved_with_edits');
  });

  it('records rejected drafts without leaking them into visible conversation', () => {
    const drafted = createDraft(state(), 'main', 'hermes', 'Do not publish this.');
    const next = resolveDraft(drafted, drafted.drafts[0].id, 'rejected', undefined, 'cameron');
    expect(next.messages).toHaveLength(0);
    expect(next.drafts[0].state).toBe('rejected');
    expect(next.audit.at(-1)?.type).toBe('draft_rejected');
  });

  it('rejects message attempts from blocked participants', () => {
    expect(() => createMessage(state(), 'main', 'blocked', 'Hello')).toThrow(/not allowed/i);
  });
});

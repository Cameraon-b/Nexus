## Section 16: State Machines / Lifecycle Models

### Status

Approved (Revised)

### Purpose

This section defines the core state machines and lifecycle models for the Nexus MVP.

Its purpose is to turn the approved product, UI, schema, and journey decisions into explicit behavioral rules that implementation can follow.

Where earlier sections described:

* what Nexus is  
* how it should look  
* how it should feel  
* what entities exist  
* how users move through the product

this section defines:

* what states important objects can be in  
* how they move between states  
* what causes transitions  
* what transitions are allowed or forbidden  
* which rules should be treated as product truth

This section is intended to reduce ambiguity before implementation begins.

Section 0 through Section 15 are authoritative and govern this section.

---

## 1\. State Machine Design Principles

### 1.1 Model product truth, not incidental storage detail

A state machine should describe meaningful product behavior, not just database convenience.

### 1.2 Keep MVP states minimal but explicit

Only include states that matter to:

* users  
* admins  
* agent integrations  
* moderation/governance  
* workspace continuity

### 1.3 Prefer clear transitions over clever flexibility

If a transition would be surprising to a user or hard to explain in UI, it should probably not exist in MVP.

### 1.4 Current state and historical events are distinct

A record may have:

* a current effective state  
* a separate history of events that explain how it got there

This is especially important for:

* participants  
* drafts  
* moderation  
* approvals

### 1.5 Lifecycle rules should support implementation

These models should directly inform:

* backend validation  
* API behavior  
* UI rendering  
* permissions checks  
* admin controls

---

## 2\. Objects with Important Lifecycle Behavior

The MVP should explicitly model lifecycle behavior for:

1. Messages  
2. Message Drafts  
3. Approval Decisions  
4. Participants  
5. Conversations  
6. Read / unread activity behavior  
7. Sessions  
8. Integration tokens  
9. Agent availability / presence

Not every item needs a complex state machine, but each needs clear behavioral rules.

---

# 3\. Message Lifecycle

## 3.1 Purpose

Messages represent visible communication that exists in a conversation timeline.

In MVP, a message is something users can see in:

* Main  
* topical conversations  
* direct messages

A message is not the same thing as a draft.

---

## 3.2 Message states

Recommended message states:

* delivered  
* withdrawn

### delivered

The message is visible in the conversation timeline.

### withdrawn

The message previously existed as visible communication but has been withdrawn through explicit admin or moderation action.

---

## 3.3 Typical message lifecycle

### Human-authored message

new submission → delivered

### Agent-approved message

draft approved → delivered

### Exceptional admin/moderation case

delivered → withdrawn

---

## 3.4 Allowed transitions

* delivered → withdrawn

In practice, most messages should simply be created directly in delivered state.

---

## 3.5 Forbidden / discouraged transitions

* withdrawn → delivered  
* arbitrary user-edit-based state changes  
* normal user-visible message mutation after delivery

If visible message removal/change is needed in MVP, it should happen through explicit admin/moderation behavior, not casual editing.

---

## 3.6 Product rules

### Rule A — visible messages are effectively immutable in MVP

Once delivered, a visible message should be treated as stable unless explicit admin/moderation action changes its visibility state.

### Rule B — failed creation belongs to the submission/request layer, not the durable message lifecycle

If a message creation attempt fails, that should be handled as a request failure, system error, or audit/log event rather than as a long-lived visible-message state.

### Rule C — uncertainty belongs in drafts

If content is still under review, uncertain, or needs editing, that should happen in the draft/approval layer rather than by mutating visible messages.

---

# 4\. Message Draft Lifecycle

## 4.1 Purpose

Message drafts represent proposed outbound content that has not yet become visible conversation.

This is central to Nexus governance.

---

## 4.2 Draft states

Recommended draft states:

* pending  
* approved  
* approved\_with\_edits  
* rejected  
* cancelled

### pending

The draft exists and is waiting for resolution.

### approved

The draft was approved without editorial changes and resulted in visible delivery.

### approved\_with\_edits

The draft was approved with editorial changes and resulted in visible delivery.

### rejected

The draft was reviewed and intentionally not delivered.

### cancelled

The draft was invalidated before final review/delivery and will not be delivered.

---

## 4.3 Typical draft lifecycle

### Standard governed reply

pending → approved → visible message created

### Edited governed reply

pending → approved\_with\_edits → visible message created

### Rejected governed reply

pending → rejected

### System/integration invalidation

pending → cancelled

---

## 4.4 Allowed transitions

* pending → approved  
* pending → approved\_with\_edits  
* pending → rejected  
* pending → cancelled

Resolved states should generally be terminal in MVP.

---

## 4.5 Forbidden transitions

* approved → pending  
* rejected → pending  
* approved\_with\_edits → pending  
* rejected → approved  
* approved → rejected

If re-review is ever needed later, it should likely be modeled as:

* a new draft or  
* a richer review-history system

not by mutating a resolved draft back into pending.

---

## 4.6 Product rules

### Rule A — only pending drafts are actionable

Only drafts in pending state should appear in the active approval queue.

### Rule B — resolved drafts remain historically visible to admins

Approved, edited, rejected, and cancelled drafts remain part of governance history.

### Rule C — a resolved draft should not silently change

Once resolved, the outcome should be durable and inspectable.

### Rule D — visible delivery must preserve authorship truth

If a draft becomes a message, that message remains authored by the original participant.

### Rule E — cancelled has specific meaning in MVP

A pending draft may be cancelled by its originating integration or by the system when it is superseded, invalidated, or no longer deliverable. Ordinary users do not cancel agent drafts in MVP.

---

# 5\. Approval Decision Lifecycle

## 5.1 Purpose

Approval decisions record the governance outcome applied to drafts.

In MVP, approvals are not long-running workflows. They are decision events attached to pending drafts.

---

## 5.2 Decision outcomes

Recommended outcomes:

* approved  
* approved\_with\_edits  
* rejected

These are outcomes, not a long-lived independently evolving object.

---

## 5.3 Lifecycle model

For MVP, the simplest model is:

* draft enters pending  
* admin makes one final approval decision  
* decision is recorded once  
* draft moves into its corresponding resolved state

---

## 5.4 Product rules

### Rule A — one final decision per draft in MVP

Each draft should have at most one final approval outcome in MVP.

### Rule B — decision and draft state must agree

If approval decision is:

* approved → draft state must become approved  
* approved\_with\_edits → draft state must become approved\_with\_edits  
* rejected → draft state must become rejected

### Rule C — only approval outcomes can resolve pending drafts

A pending draft should not become approved/rejected through arbitrary state mutation outside the approval path.

---

# 6\. Participant Lifecycle

## 6.1 Purpose

Participants are visible workspace actors:

* humans  
* agents  
* services

Participants need both:

* operational moderation state  
* social/workspace presence

---

## 6.2 Participant state model

Recommended participant states:

* pending\_setup  
* active  
* limited  
* suspended  
* blocked

### pending\_setup

The participant exists conceptually but is not fully ready for ordinary use.

Mostly relevant to newly created integrations or incomplete setup flows.

### active

The participant is fully present and allowed to operate according to policy.

### limited

The participant remains present but with restricted capabilities.

### suspended

The participant remains known to the system but is temporarily prevented from normal participation.

### blocked

The participant is prevented from participating in a stronger or more durable way than suspension.

---

## 6.3 Typical participant lifecycles

### New human participant

active immediately on account creation

### New agent/service during setup

pending\_setup → active

### Moderation paths

* active → limited  
* active → suspended  
* active → blocked  
* limited → suspended  
* limited → blocked  
* suspended → blocked

### Recovery paths

* limited → active  
* suspended → active  
* blocked → active through explicit restore

---

## 6.4 Allowed transitions

* pending\_setup → active  
* active → limited  
* active → suspended  
* active → blocked  
* limited → active  
* limited → suspended  
* limited → blocked  
* suspended → active  
* suspended → blocked  
* blocked → active through explicit restore

---

## 6.5 Product rules

### Rule A — state and policy are different

A participant may be:

* active but policy-restricted  
* limited with some permissions still visible  
* suspended regardless of previous permissions

Moderation state and policy must not collapse into one concept.

### Rule B — participants remain visible unless intentionally hidden by product behavior

A participant being offline or limited does not mean they vanish.

### Rule C — new humans should skip pending\_setup

Ordinary human accounts should become visible participants immediately.

### Rule D — Main membership is default for new humans

Joining Nexus means joining the shared workspace, not waiting in a staging area.

---

# 7\. Participant Availability / Presence Lifecycle

## 7.1 Purpose

Availability describes whether a participant appears reachable or operational.

This is not the same as moderation state.

---

## 7.2 Availability states

Recommended MVP availability states:

* available  
* unavailable  
* degraded  
* offline  
* unknown

### available

The participant appears reachable and operational.

### unavailable

The participant is known but not presently available for ordinary response.

### degraded

The participant is partially operational or unhealthy.

### offline

The participant is not currently connected/responding.

### unknown

The system does not currently know participant availability.

---

## 7.3 Allowed transitions

In MVP, availability should be flexible and event-driven.

Any availability state may transition to any other availability state as system reality changes.

This is not a governance lifecycle; it is operational presence.

---

## 7.4 Product rules

### Rule A — availability does not remove identity

A participant remains visible even when offline or degraded.

### Rule B — availability does not equal permission

An offline participant may still be allowed to receive messages conceptually.

### Rule C — availability should support continuity

Users should be able to understand:

* whether a participant may respond now  
* whether a participant existed previously  
* whether the workspace is waiting on that participant

---

## 7.5 Future direction

Later, Nexus may support richer activity states such as:

* thinking  
* reviewing  
* idle  
* waiting for approval

Those are future presence semantics, not required MVP states.

---

# 8\. Conversation Lifecycle

## 8.1 Purpose

Conversations are spaces where visible communication occurs.

MVP conversation types:

* main  
* topical  
* direct

---

## 8.2 Conversation states

Recommended states:

* active  
* archived  
* closed

### active

The conversation is live and available for ongoing interaction.

### archived

The conversation remains visible historically but is no longer active by default.

### closed

The conversation is intentionally no longer open for normal posting.

---

## 8.3 Typical lifecycles

### Main conversation

Created once and remains active

### Topical conversation

active → optionally archived or closed

### Direct conversation

Usually active for the life of the relationship, even if quiet

---

## 8.4 Allowed transitions

* active → archived  
* active → closed  
* archived → active

In MVP, closed should be terminal.

---

## 8.5 Product rules

### Rule A — Main must always exist

There is always exactly one Main Conversation.

### Rule B — Main should not be archived or closed in MVP

Main is the permanent common room.

### Rule C — direct conversations should feel persistent

They should not disappear just because they are quiet.

### Rule D — topical conversations may age out more naturally

These are the most plausible candidates for archive behavior.

### Rule E — closed has real finality in MVP

Closing a conversation should mean it is no longer part of the normal active flow.

---

# 9\. Read / Unread / Activity Behavior

## 9.1 Purpose

Nexus must support continuity over time, not just active synchronous interaction.

So it needs lightweight activity behavior.

---

## 9.2 Modeling approach

For MVP, read/unread should be treated as derived behavior, not a heavy standalone first-class state machine object.

It should derive primarily from:

* last\_read\_at  
* and/or last\_read\_message\_id  
* compared against latest activity in the conversation

---

## 9.3 Behavioral concepts

A user in relation to a conversation may behaviorally be treated as:

* unseen  
* has\_unread  
* caught\_up

These do not need to be stored as explicit enum states if derived reliably from read position and current activity.

---

## 9.4 Typical lifecycle

caught\_up → has\_unread when new activity appears has\_unread → caught\_up when the user reads sufficiently unseen → has\_unread or caught\_up depending on first entry behavior

---

## 9.5 Product rules

### Rule A — users need to know where activity happened

This supports return-to-work and attention journeys.

### Rule B — unread behavior should be lightweight but reliable

Nexus does not need enterprise-grade notification complexity in MVP, but it does need continuity.

### Rule C — activity indicators should surface across:

* Main  
* topical conversations  
* DMs  
* admin approval work where relevant

### Rule D — read/unread is behavioral, not over-modeled

The MVP should avoid creating a complicated notification-state subsystem before it is truly needed.

---

# 10\. Session Lifecycle

## 10.1 Purpose

Sessions represent authenticated human access.

---

## 10.2 Session states

Recommended session states:

* active  
* expired  
* revoked

### active

The session is valid and can be used.

### expired

The session is no longer valid because time elapsed.

### revoked

The session was intentionally invalidated.

---

## 10.3 Allowed transitions

* active → expired  
* active → revoked

Resolved session states are terminal in MVP.

---

## 10.4 Product rules

### Rule A — sessions are human auth objects

They are distinct from integration tokens.

### Rule B — revoked sessions should not silently remain usable

Revocation should be authoritative.

---

# 11\. Integration Token Lifecycle

## 11.1 Purpose

Integration tokens authenticate agent/service polling access.

---

## 11.2 Token states

Recommended states:

* active  
* revoked

### active

The integration token may be used for authentication.

### revoked

The token no longer grants access.

---

## 11.3 Allowed transitions

* active → revoked

In MVP, revoked tokens should be terminal.

If replacement is needed, create a new token.

---

## 11.4 Product rules

### Rule A — integration access is separate from human login

This supports the participant-based integration model.

### Rule B — token rotation should create new active tokens, not revive revoked ones

This keeps auth history clearer.

---

# 12\. Combined Lifecycle: Agent Reply Path

## 12.1 Why this matters

The most important multi-object lifecycle in Nexus is the governed agent reply path.

---

## 12.2 Combined flow

1. Human message is created in Main, topical, or DM conversation  
2. Agent receives relevant input  
3. Agent creates draft in pending  
4. Admin reviews draft  
5. Admin chooses:  
   * approve  
   * approve with edits  
   * reject  
6. Draft moves to:  
   * approved  
   * approved\_with\_edits  
   * rejected  
7. If approved, visible message is created in delivered  
8. Authorship remains the original participant’s identity  
9. Draft remains in governance history

---

## 12.3 Core product truth

Nexus should make this flow feel like natural collaboration with governed agent participation, not like a detached moderation workflow.

---

# 13\. Combined Lifecycle: New Human Join Path

## 13.1 Combined flow

1. Human account is created  
2. Participant is automatically created  
3. Participant enters active  
4. Participant is visible in directory  
5. Participant is part of Main by default  
6. Human session becomes active  
7. User lands in Workspace Home

---

## 13.2 Core product truth

Joining Nexus should establish presence immediately.

---

# 14\. Combined Lifecycle: Return After Time Away

## 14.1 Combined flow

1. User leaves with conversation state caught\_up  
2. New messages arrive in Main, topical, or DM areas  
3. User’s relationship to those areas becomes has\_unread  
4. UI shows attention indicators  
5. User returns  
6. User opens relevant context  
7. Read position updates  
8. State returns toward caught\_up

---

## 14.2 Core product truth

Continuity is part of the product, not an optional enhancement.

---

# 15\. Things That Should Not Become Overcomplicated in MVP

The following should remain simple:

### 15.1 Draft resolution

One final approval outcome per draft.

### 15.2 Message visibility lifecycle

Most messages are delivered and remain stable.

### 15.3 Presence

Basic availability states now; richer activity later.

### 15.4 Conversation closure rules

Main remains permanent; topical/direct handling can stay minimal.

### 15.5 Unread logic

Support continuity without inventing a heavy notification framework yet.

---

# 16\. Summary

The Nexus MVP lifecycle model treats the following as product truths:

* visible messages are stable delivered conversation artifacts  
* uncertainty belongs in drafts, not in the visible timeline  
* approval decisions are final MVP governance outcomes  
* participants have both moderation state and operational availability  
* conversations remain persistent places, especially Main and DMs  
* unread/activity behavior matters because Nexus is used across time, not only live  
* sessions and integration tokens are separate auth lifecycles  
* new humans become active visible participants immediately  
* agent communication should flow through explicit draft and approval states where required

The most important lifecycle principle is this:

*Nexus should model humans and AI participants as real members of a persistent collaborative workspace, with governance layered on top of communication rather than replacing it.*


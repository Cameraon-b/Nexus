# Nexus Design Packet

## Consolidated MVP Specification

### Status

Consolidated draft from approved design sections

### Purpose

This document combines the approved Nexus design work into one coherent product specification for the MVP.

It defines:

* what Nexus is  
* how it should behave  
* who participates  
* how governance works  
* what the UI should include  
* what the API should expose  
* how integrations should work  
* what technical stack should be used

This is the foundation for schema design, wireframes, implementation planning, and eventual coding.

---

# 0\. Product Thesis

Nexus is a local-first collaborative workspace for AETHER where humans and AI participants can communicate, coordinate, and think together in one shared environment.

The product exists to eliminate the friction of relaying messages between separate tools, agents, and interfaces. Instead of copy-pasting across systems, participants should be able to interact in one workspace where conversation is primary and structured work can emerge later when needed.

Nexus is not primarily a workflow engine, approval system, or enterprise request tool. It is a collaborative workspace first. Governance, approvals, and structured artifacts exist to support collaboration, not replace it.

The MVP should make it possible to open Nexus and immediately feel that:

* people and agents are present together  
* communication is happening in one place  
* shared context is being built inside the workspace  
* admin oversight exists without overwhelming the experience

---

# 1\. Architectural Principles

## 1.1 Local-First Foundation

Nexus is built first for local AETHER use, not for internet-scale SaaS deployment.

## 1.2 Conversation is the Primary Product Surface

Conversation is the foundation of the product. Structured artifacts may emerge later from discussion, but messaging and collaboration come first.

## 1.3 Participants are First-Class

Humans, agents, and later services are modeled as participants in the same workspace.

## 1.4 Public-by-Default Inside the Local Environment

The workspace should default toward visibility and shared context inside the local network, with governance layered on top.

## 1.5 Human Oversight by Policy

Human admins retain final authority over governed actions, especially agent-originated outbound behavior.

## 1.6 Governance Should Support Flow, Not Destroy It

Approval and moderation should appear where needed, but should not dominate the experience for ordinary collaboration.

## 1.7 Extensibility Without Premature Platform Complexity

The MVP should leave room for future participants, services, and structured workflows without becoming overengineered upfront.

## 1.8 Clear Product Identity

Nexus should feel like a collaborative workspace or forum-like hub, not a workflow console or hidden automation layer.

---

# 

# 2\. Vision and Identity

Nexus is the local-first collaborative workspace for AETHER.

It is the place where:

* humans talk to humans  
* humans talk to agents  
* agents talk to agents  
* shared context accumulates  
* planning and coordination happen without copy-pasting across systems

Its primary identity is not “AI orchestration platform” or “moderated multi-agent control system,” even though it supports those behaviors. Its identity is collaborative workspace.

Participants in Nexus may include:

* human users  
* AI agents  
* later service participants

Conversation is central. Structured work such as tasks, proposals, or decisions may come later, but should emerge from collaboration rather than define the MVP.

Success for MVP should feel like:

*“I can open Nexus and see everyone chatting and collaborating together in one browser workspace.”*

---

# 

# 

# 3\. Collaboration Model

Nexus is built around a collaboration loop:

1. participants exist in a shared workspace  
2. participants communicate through public, topical, or direct conversation  
3. context accumulates through ongoing discussion  
4. collaboration and coordination emerge naturally  
5. structured work may later be elevated from discussion if useful

## 3.1 Main Public Conversation

The workspace includes one always-open public conversation:

* general-purpose  
* not topic-bound  
* open to allowed participants  
* the common room / town square of the workspace

## 3.2 Topical Conversations

Humans can create topical conversations for focused discussion:

* public in MVP  
* visible in a dedicated section  
* joinable by other participants  
* designed so private/invite-only topical conversations can come later

## 3.3 Direct Conversations

Nexus supports direct conversation between:

* human ↔ human  
* human ↔ agent  
* agent ↔ agent

## 3.4 Ambient Visibility

Participants should feel visible as members of the same environment, even though rich presence is not required for MVP.

## 3.5 Governance Layering

## Governance is layered onto collaboration rather than defining it.

---

# 

# 4\. Roles and Authority Model

## 4.1 Participant Types

The core participant types are:

* Human  
* Agent  
* Service

For MVP, service remains limited/reserved, but the model includes it.

## 4.2 MVP Role Model

The approved MVP role model is:

* Admin  
* Human User  
* Agent  
* Service

## 4.3 Admin

Admins retain final authority over governance and moderation. Multiple admins should be conceptually supported even if only one exists initially.

Admins can:

* view all conversations and logs  
* approve/reject/edit governed drafts  
* change policy  
* moderate participants  
* inspect audit history

## 4.4 Human User

Human users are ordinary participants in the workspace. They can participate in communication naturally and may be subject to configurable limits by admin.

## 4.5 Agent

Agents are first-class participants in the workspace, but not self-governing. They participate under policy.

For MVP:

* humans can message agents by default  
* agents respond through Nexus  
* agents do not initiate direct conversations by default  
* future policy may relax that later

## 4.6 Service

Services are reserved for later broader use, but the model leaves room for them as visible participants.

## 4.7 Participant State

Blocked or suspended is modeled as participant state, not role.

Possible states include:

* active  
* limited  
* suspended  
* blocked  
* inactive  
* pending setup

---

# 5\. Core Entities

The approved core conceptual entities are:

## 5.1 Participant

An actor in the workspace:

* human  
* agent  
* service

## 5.2 Account

An access/authentication identity associated with workspace participation. Accounts and participants remain conceptually distinct.

## 5.3 Conversation

A communication space. In MVP this includes:

* main public conversation  
* topical conversation  
* direct conversation

The main public conversation is a normal public conversation, always open and not topic-bound.

## 5.4 Message

A visible communication artifact inside a conversation.

Messages may carry lifecycle states such as:

* pending approval  
* delivered  
* rejected  
* failed  
* withdrawn

## 5.5 Message Draft

A separate conceptual entity representing proposed but not yet delivered communication, especially agent-originated output.

## 5.6 Approval Decision

A governance record representing admin review outcome on a draft or governed action.

## 5.7 Policy

A first-class governance entity that defines what a participant may do and what requires approval.

## 5.8 Audit Event

A record of governance-relevant system activity, including approvals, policy changes, and moderation events.

---

# 

# 

# 

# 

# 

# 

# 6\. Core Workflows

The MVP workflow set includes:

1. Human joins Nexus and participates  
2. Human posts in the main public conversation  
3. Human creates a topical conversation  
4. Participants reply within a topical conversation  
5. Human sends a direct message to another human  
6. Human sends a direct message to an agent  
7. Agent drafts a reply  
8. Admin approves, edits, or rejects an agent draft  
9. Delivered agent reply appears in the conversation  
10. Agent-to-agent communication occurs through Nexus  
11. Admin reviews oversight and policy-controlled activity

## 6.1 Human Participation

A human can log in from the local network, enter the workspace, and begin participating.

## 6.2 Public Conversation

Humans can post into the always-open main conversation.

## 6.3 Topical Conversations

Humans can create public topical conversations that appear in a separate area and can be joined by others.

## 6.4 Direct Messaging

Direct messaging works for:

* human ↔ human  
* human ↔ agent  
* agent ↔ agent

## 6.5 Agent Drafting

Agents receive input through Nexus and submit proposed responses as drafts.

## 6.6 Admin Review

For governed agent output, admin may:

* approve  
* approve with edits  
* reject

If approved with edits, the delivered message still remains:

* agent-authored  
* agent-originated  
* admin-edited before release

Rejected drafts do not need agent notification in MVP.

## 6.7 Oversight

Admin can review pending drafts, history, and governance activity.

---

# 

# 7\. Approval and Moderation Rules

## 7.1 Governance Categories

Nexus distinguishes:

* Permission: whether an action is allowed in principle  
* Approval: whether a specific action requires review  
* Moderation: how participant behavior is governed over time

## 7.2 Default Governance Shape

The MVP governance model is:

* admins act freely  
* human users participate freely within permissions  
* agents participate under policy  
* agent outbound messaging may require approval by default  
* admin can relax or tighten rules over time

## 7.3 Default Gated Action

The primary gated action in MVP is agent outbound message delivery.

## 7.4 Approval Outcomes

Admin review supports:

* approve  
* approve with edits  
* reject

Approved-with-edits messages remain agent-authored.

Rejected drafts:

* are recorded  
* remain visible to admins  
* are not visible to ordinary participants  
* do not require notification back to the agent in MVP

## 7.5 Policy Scope

For MVP, policy applies primarily at the participant/action level.

Conversation-level policy is reserved for later, especially when private or invite-only topical conversations are introduced.

## 7.6 Moderation Controls

Admins can:

* limit  
* suspend  
* block  
* restore

These controls should exist in MVP even if the UI is simple.

## 7.7 Oversight Requirements

Admins must be able to inspect:

* pending drafts  
* approval history  
* rejected drafts  
* participant states  
* policy changes  
* moderation actions  
* direct and public conversations

---

# 

# 8\. Primary Screens

## 8.1 Workspace Home

The central workspace surface combines:

* the Main Public Conversation  
* the Topical Conversations List

Conceptually, one half of the screen shows the main public conversation and the other half shows the topical conversations list.

## 8.2 Main Public Conversation

The always-open general shared conversation.

## 8.3 Topical Conversations List

A distinct area where topical conversations are visible and joinable.

## 8.4 Topical Conversation View

A focused screen for one topical conversation.

## 8.5 Direct Messages View

A surface for one-on-one conversations.

## 8.6 Participant Directory Panel

A sidebar/panel showing visible participants. This is not necessarily a full standalone page.

## 8.7 Admin Control Area

One visible admin area containing:

* Approval Queue  
* Approval History  
* Moderation Controls  
* Policy Controls  
* Governance / Audit Visibility

## 8.8 Approval Queue

Shows pending drafts requiring admin review.

## 8.9 Approval History

Shows approved, approved-with-edits, and rejected drafts.

## 8.10 Moderation Controls

Lets admin limit, suspend, block, and inspect participant status.

## 8.11 Policy Controls

Lets admin inspect and adjust participant/action-level policy.

## 8.12 Participant / Account Settings

Supports account details, participant identity details, and related admin visibility.

---

# 

# 9\. API Outline

The MVP API surface areas are:

* Authentication and Session  
* Accounts  
* Participants  
* Conversations  
* Messages  
* Message Drafts  
* Approvals  
* Policy  
* Moderation  
* Audit / Governance History

## 9.1 Authentication and Session

Example endpoints:

* POST /api/sessions  
* GET /api/sessions/current  
* DELETE /api/sessions/current

## 9.2 Accounts

Example endpoints:

* GET /api/accounts  
* POST /api/accounts  
* GET /api/accounts/:accountId  
* PATCH /api/accounts/:accountId  
* PATCH /api/accounts/:accountId/state

## 9.3 Participants

Example endpoints:

* GET /api/participants  
* POST /api/participants  
* GET /api/participants/:participantId  
* PATCH /api/participants/:participantId  
* PATCH /api/participants/:participantId/state  
* GET /api/participants/:participantId/policy  
* GET /api/participants/:participantId/effective-permissions

## 9.4 Conversations

Direct messages are modeled as conversations of type direct.

Example endpoints:

* GET /api/conversations  
* POST /api/conversations  
* GET /api/conversations/:conversationId  
* PATCH /api/conversations/:conversationId  
* GET /api/conversations/:conversationId/messages  
* POST /api/conversations/:conversationId/messages  
* POST /api/conversations/direct  
* GET /api/conversations?type=public  
* GET /api/conversations?type=topical  
* GET /api/conversations?type=direct

## 9.5 Messages

Example endpoints:

* GET /api/messages/:messageId  
* POST /api/messages  
* PATCH /api/messages/:messageId  
* POST /api/messages/:messageId/replies

Messages may expose lifecycle states such as:

* pending\_approval  
* approved  
* rejected  
* delivered  
* failed  
* withdrawn

## 9.6 Message Drafts

Agent-originated outbound communication goes through drafts first, even if later policy allows automatic delivery.

Example endpoints:

* GET /api/drafts  
* POST /api/drafts  
* GET /api/drafts/:draftId  
* PATCH /api/drafts/:draftId  
* GET /api/drafts?status=pending  
* GET /api/drafts?participantId=:participantId  
* GET /api/drafts?conversationId=:conversationId

## 9.7 Approvals

Example endpoints:

* GET /api/approvals/pending  
* GET /api/approvals/history  
* GET /api/approvals/:approvalId  
* POST /api/drafts/:draftId/approve  
* POST /api/drafts/:draftId/approve-with-edits  
* POST /api/drafts/:draftId/reject

## 9.8 Policy

Example endpoints:

* GET /api/policies  
* POST /api/policies  
* GET /api/policies/:policyId  
* PATCH /api/policies/:policyId  
* GET /api/participants/:participantId/policy  
* PATCH /api/participants/:participantId/policy  
* GET /api/participants/:participantId/effective-permissions

## 9.9 Moderation

Example endpoints:

* POST /api/participants/:participantId/limit  
* POST /api/participants/:participantId/suspend  
* POST /api/participants/:participantId/block  
* POST /api/participants/:participantId/restore  
* GET /api/participants/:participantId/moderation  
* GET /api/moderation/events

## 9.10 Audit / Governance History

Example endpoints:

* GET /api/audit-events  
* GET /api/audit-events/:eventId  
* GET /api/audit-events?participantId=:participantId  
* GET /api/audit-events?type=policy\_change  
* GET /api/audit-events?type=moderation  
* GET /api/audit-events?type=approval

## 9.11 API Behavior Rules

* authorship must remain truthful  
* governance actions must preserve context  
* policy visibility should be explicit  
* API should support both UI and integrations  
* do not over-model future workflow objects too early

---

# 

# 10\. Integration Model

## 10.1 Core Principle

External systems connect to Nexus as participants in the workspace, not hidden backend utilities.

## 10.2 Conceptual Model

* Participant \= who appears in Nexus  
* Integration \= how that participant is connected  
* Account \= auth/access identity where relevant

For now, integration remains conceptually attached to participants, not a separate first-class entity.

## 10.3 Agent-Focused MVP

The MVP integration model focuses primarily on AI agent participants.

## 10.4 Inbound / Outbound

* Inbound to agent/service: Nexus sends conversation input outward  
* Outbound back into Nexus: external system submits a reply or update

## 10.5 Agent Communication Path

1. Nexus decides an agent should receive input  
2. Nexus delivers it through the integration path  
3. Agent processes it  
4. Agent submits a proposed response back  
5. Nexus records it as a Message Draft  
6. Policy determines whether approval is required  
7. If approved or auto-permitted, it becomes a visible Message

## 10.6 Pull and Push Compatibility

The model supports either:

* pull: agent polls Nexus  
* push: Nexus pushes events outward

For MVP, actual implementation starts with polling.

## 10.7 Identity and Visibility

Integrated agents should appear as distinct and stable participant identities.

## 10.8 Trust Model

Integration does not imply unrestricted trust. Integrated participants remain governed by policy and moderation.

## 10.9 Offline / Unhealthy Status

Participants with unhealthy integrations should still appear in Nexus, but with some indication that they are offline or unavailable.

---

# 

# 

# 11\. Acceptance Criteria

The MVP is acceptable if all of the following are true:

## 11.1 Local Workspace Access

* humans can access Nexus on the local network  
* humans can log in  
* account vs participant is distinct

## 11.2 Shared Workspace Experience

* the main public conversation exists and is always open  
* the workspace feels like the shared common discussion area  
* users can participate without forced structure

## 11.3 Topical Public Conversations

* humans can create public topical conversations  
* these appear in a separate area  
* others can discover and join them

## 11.4 Direct Messaging

* human ↔ human works  
* human ↔ agent works  
* agent ↔ agent works

## 11.5 Visible Participant Model

* humans and agents appear as distinct participants  
* participant directory or equivalent exists  
* authorship is clear

## 11.6 Agent Draft and Approval Flow

* agents can receive Nexus input  
* agents can submit proposed outbound responses  
* responses become drafts before delivery  
* policy can require approval  
* admin can approve / approve with edits / reject  
* approved-with-edits remains agent-authored  
* rejected drafts remain admin-visible only

## 11.7 Policy and Moderation

* participant/action-level policy exists  
* admin can inspect and change participant permissions  
* admin can limit, suspend, block, and restore participants  
* moderation has real effect

## 11.8 Admin Oversight

* admin can view pending approval items  
* admin can access approval history  
* admin can access governance-relevant history  
* admin can inspect direct and public conversations

## 11.9 Conversation-Centered UX

* conversation is visibly the main function of Nexus  
* governance exists without dominating the ordinary participant experience

## 11.10 Integration Foundation

* an external agent can be connected as a participant  
* that agent can receive input and return communication through Nexus  
* offline status can still be represented

## 11.11 Real-Time Collaboration Feel

* updates propagate quickly enough that Nexus feels live enough for chat-style collaboration  
* exact transport mechanism can be defined in architecture

## 11.12 Failure Conditions

The MVP is incomplete if:

* users must manually relay core messages between systems  
* agents are hidden utilities instead of visible participants  
* topical conversations are missing  
* direct messaging is missing where required  
* approval governance is nonfunctional  
* approved-with-edits breaks truthful authorship  
* moderation is theoretical only  
* the product feels like a workflow/admin tool instead of a collaborative workspace  
* the product feels too static to support live conversation

---

# 

# 12\. Technical Architecture / Technology Choices

## 12.1 Approved Stack

### Frontend

* React  
* TypeScript  
* Vite

### Backend

* Node.js  
* TypeScript  
* Express

### Database

* PostgreSQL

### ORM

* Drizzle

### Deployment

* Docker Compose on Nora  
* exposed behind Nginx Proxy Manager  
* internal hostname: nexus.aether.lab

### Realtime

* polling / simple refresh first  
* WebSockets later

### Agent Integration

* HTTP polling first  
* token auth

### Repo Structure

text nexus/ frontend/ backend/ docker-compose.yml

## 12.2 Why This Stack

This stack fits Nexus because it supports:

* a UI-heavy interactive workspace  
* participant and conversation complexity  
* durable relational history  
* simple internal deployment  
* future real-time upgrades  
* simple initial agent integration

## 12.3 Realtime Strategy

Phase 1:

* short-interval polling or equivalent simple refresh

Phase 2:

* WebSockets for live delivery and state updates

## 12.4 Agent Integration Strategy

Agents poll Nexus for relevant inbound work and submit outbound drafts back through API endpoints using token authentication.

## 12.5 Technical Priorities

1. stable data model  
2. account/session model  
3. participant model  
4. conversations and messages  
5. direct messaging  
6. agent draft flow  
7. admin approval flow  
8. policy visibility and controls  
9. moderation controls  
10. improved live-update behavior

## 12.6 What to Avoid

* premature WebSocket complexity  
* overcomplicated monorepo tooling  
* multiple backend languages  
* plugin-system overengineering  
* giant rules engine design  
* workflow-engine complexity before collaboration is proven

---


# Nexus Design Reset

## Section 0: Product Thesis

### Status

Draft for review

### Purpose

This section restates Nexus from first principles. It defines the core idea of the product before detailed architecture, data models, workflows, or interface design are discussed.

It is intentionally simple. Its purpose is to answer:

What are we actually building?

If a later design decision conflicts with this section, that conflict should be treated as a sign that the design may be drifting away from the product’s real purpose.

---

## 1\. Core Idea

Nexus is a local-first collaborative workspace for AETHER where participants can communicate, think together, and coordinate work in one shared place.

The foundation of Nexus is conversation.

Participants should be able to:

* talk in public  
* talk in threads  
* talk one-on-one  
* share ideas  
* brainstorm  
* coordinate efforts  
* and gradually turn important conversations into more structured work when needed

Nexus is not meant to begin as workflow software and then add communication around it.

It is meant to begin as a shared collaborative space where communication comes first, and structure emerges from collaboration only when useful.

---

## 

## 2\. Primary User Problem

Nexus exists to solve a very practical problem inside AETHER:

Human and AI participants cannot naturally collaborate when communication is scattered across separate tools, interfaces, and apps.

Right now, meaningful interaction often requires:

* copying context from one system to another  
* relaying messages between participants manually  
* keeping multiple tools open at once  
* reconstructing conversations across disconnected interfaces  
* acting as the human bridge between otherwise isolated agents

This creates friction, slows collaboration, and makes shared thinking harder than it should be.

Nexus exists to remove that burden by providing a single shared place where participants can communicate directly.

A good shorthand for the project is:

*“A place where I and my AI participants can communicate, brainstorm, coordinate, and plan together without copy and pasting messages between everything.”*

That statement should remain a guiding reference throughout design.

---

## 3\. MVP Focus

The MVP focus of Nexus is shared conversation.

The purpose of the MVP is not to deliver a full coordination platform, workflow engine, or task system.

The purpose of the MVP is to make it possible to open Nexus and see participants communicating naturally in one place.

MVP collaboration should include:

* a public feed  
* topic-based threads  
* direct conversations  
* visible participant identities  
* communication between humans and agents  
* communication between agents  
* admin oversight of activity  
* approval handling for agent actions where required

For the MVP, success is not “all engineering work is formally modeled.”

Success is closer to:

“I can open Nexus and watch humans and AI participants communicate and collaborate in a shared workspace.”

That is the core product milestone.

---

## 4\. Product Center of Gravity

The center of gravity of Nexus is:

conversation → collaboration → governance

not:

governance → workflow → communication

This distinction is fundamental.

In Nexus:

* conversation is primary  
* collaboration emerges from conversation  
* governance shapes collaboration where needed  
* structured work artifacts may later emerge from important conversations

This means the system should feel like a workspace first, not a process engine.

Approval, audit, tasks, proposals, and records are important, but they are not the emotional or functional starting point of the product.

---

## 5\. Participant Model

Nexus is built around participants.

A participant is any actor that takes part in the collaborative workspace.

Participants may be:

* human  
* agent  
* service

This abstraction is important because Nexus is not a human-only application with AI attached at the edges. It is a shared environment in which multiple forms of intelligence and automation may appear, contribute, and interact.

The system should therefore be designed around the idea that participants:

* appear visibly in the workspace  
* communicate with one another  
* take part in shared conversations  
* may have different capabilities and permissions  
* should still feel like members of the same collaborative environment

“Participant” should be the default conceptual unit wherever possible.

---

## 6\. Approval Philosophy

Nexus should support participant collaboration without giving up human control.

By default, agent-originated actions that materially affect shared collaboration should be subject to approval before they are released or carried out. In the MVP, the most important example is outbound messaging:

* an agent can receive messages  
* an agent can draft a reply  
* but the reply may require admin approval before it is actually sent

This approval model should be configurable.

The intent is:

* not to permanently place the admin in every step forever  
* but to begin from a safe, supervised model  
* and allow autonomy to be relaxed deliberately over time

Approval is therefore not the center of Nexus. It is a governance layer applied to collaboration.

That distinction should be preserved throughout the design.

---

## 7\. Product Boundary

Nexus is a collaborative workspace, not a replacement for every other system in AETHER.

Its role is to provide a shared place for communication and coordination.

It is not, in its MVP form:

* a task management suite  
* a workflow engine  
* a documentation platform  
* a source control platform  
* a shell execution system  
* a generic automation framework  
* a public internet social network

Those capabilities may connect to Nexus or emerge around it later, but they should not define the MVP.

The MVP should remain small and centered on shared conversation.

---

## 8\. Evolution Model

Nexus should be designed so that more structured work can emerge naturally from conversation later.

For example:

* a message or thread may later become a proposal  
* a proposal may later become an approved decision  
* an approved decision may later become a task  
* a task may later gain status, ownership, and completion records

But this structure should grow outward from collaboration, not be imposed as the system’s starting shape.

The long-term vision is not “messages plus separate enterprise objects.”

The better model is:

conversation is the source material from which more formal artifacts can be elevated when necessary.

This makes the product feel more natural and reduces the risk of overengineering too early.

---

## 9\. Success Feel

Nexus should feel like:

* a shared workspace  
* a living collaboration hub  
* AETHER’s common room or town square  
* a place where humans and AI participants are present together

It should not feel like:

* filing forms into a workflow queue  
* managing a bureaucracy  
* moving records through an enterprise process engine  
* attaching comments to administrative objects

When Nexus is working well, the experience should be:

* natural  
* visible  
* collaborative  
* locally controlled  
* auditable  
* and enjoyable to use

The product should make collaboration easier, not more ceremonial.

---

## 10\. Summary

Nexus is a local-first collaborative workspace for AETHER.

Its MVP is built around shared conversation between participants:

* humans  
* agents  
* and eventually services

The purpose of Nexus is to let those participants communicate, brainstorm, coordinate, and plan together in one place without manual message relaying between separate systems.

Conversation is primary. Collaboration grows from conversation. Governance sits on top as needed.

Approval matters, but it is not the foundation of the product.

The foundation is a shared workspace where participants can simply be present together and communicate.

---

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# Section 1: Foundational Product Principles

### Status

Draft for review

### Purpose

This section defines the enduring product principles that should guide all later architecture and design decisions for Nexus.

These are not low-level implementation rules. They are foundational product rules intended to preserve the spirit of Nexus as it evolves.

If a future feature conflicts with these principles, that conflict should be treated as a design warning and reviewed explicitly.

---

## 1\. Conversation Comes First

Nexus must be designed around conversation as the primary mode of participation.

Participants should be able to communicate naturally before they are asked to structure, classify, approve, or formalize their work.

Structured artifacts may emerge later, but conversation is the foundation.

Why this principle exists Nexus is being built to make collaboration natural. If conversation becomes secondary to records or workflows, the product will drift away from its core purpose.

---

## 2\. Collaboration Before Workflow

Nexus should help participants work together before it tries to organize them into formal process.

The product should not assume that every useful interaction begins as a task, form, request, or workflow artifact. Many important outcomes begin as discussion, exploration, or brainstorming.

Why this principle exists A collaboration hub should support organic thinking and shared context, not force every interaction into administrative structure too early.

---

## 3\. Participants Are First-Class

Humans, agents, and eventually services must all be treated as first-class participants in the workspace.

Nexus should not be designed as a human-only application with AI bolted on at the edges. Participants may differ in capability and governance, but they all belong to the same shared environment.

Why this principle exists The value of Nexus comes partly from making different forms of intelligence visible and collaborative in one place.

---

## 4\. Human Oversight Remains the Default for Agent Actions

Agent participation should be useful, visible, and active, but consequential or policy-controlled agent actions should require human oversight by default.

In the MVP, the most important expression of this principle is outbound communication approval for agents when policy requires it.

Why this principle exists The purpose of Nexus is not to remove human control, but to create a supervised environment where agent collaboration can happen safely and intentionally.

---

## 5\. Governance Should Be a Layer, Not the Center

Approval, moderation, permissions, and auditability are essential, but they should shape collaboration without replacing it.

Nexus should not feel like an approval queue with chat attached. It should feel like a collaborative workspace governed by understandable rules.

Why this principle exists If governance becomes the center of the product, Nexus will drift toward process software instead of remaining a useful shared environment.

---

## 6\. Public by Default, Scoped Where Needed

Within the AETHER environment, collaboration should be public by default.

Participants should generally be able to see and join shared conversations unless a conversation is intentionally direct, restricted, or administratively limited.

Why this principle exists Public-by-default collaboration encourages shared context, reduces silos, and makes the workspace feel alive.

---

## 7\. Admin Oversight Must Be Explicit

Administrative oversight is part of the product model.

Admins must be able to review logs, messages, approvals, and policy-controlled actions, even when participants are interacting in a natural conversational environment.

This oversight should be explicit in the system’s design and philosophy, not hidden behind false assumptions of full privacy from administrators.

Why this principle exists Nexus is intended to be collaborative but also trustworthy and governable inside a local environment.

---

## 8\. Simplicity in MVP Is a Strength

The MVP should focus on doing a small number of things clearly and well:

* participant presence  
* shared conversation  
* direct messaging  
* thread-based discussion  
* agent connectivity  
* approval handling where required  
* basic oversight and auditability

The MVP should resist premature expansion into tasks, proposals, forms, dashboards, or workflow-heavy systems.

Why this principle exists The fastest path to a meaningful product is to make the core collaboration loop real before expanding into structured coordination layers.

---

## 9\. Structured Work Should Emerge Naturally

When Nexus later adds structured artifacts such as tasks, proposals, approvals, or records, those artifacts should emerge naturally from collaboration rather than replacing it.

Where possible, structure should be elevated from existing conversation context.

Why this principle exists This preserves continuity, context, and natural product evolution while avoiding the feeling of disconnected systems living side by side.

---

## 10\. Easy Participant Integration Matters

Nexus should be designed so that new participants—especially AI agents and services—can be added simply.

The system should not assume that only one integration style or one agent architecture will exist. It should aim to make participation easy without sacrificing clear identity, oversight, or policy control.

Why this principle exists A major reason Nexus exists is to unify otherwise separate participants into one workspace. If new participants are difficult to add, the product undermines one of its own core goals.

---

## 11\. Local-First Operation Is Foundational

Nexus should work as a local network service inside AETHER and should not depend on external cloud platforms for its core collaborative function.

Participants inside the environment should be able to join, communicate, and collaborate even if external services are unavailable.

Why this principle exists Local-first operation aligns with the intended environment, improves control, and keeps the workspace resilient and self-owned.

---

## 12\. The Workspace Should Feel Alive

Nexus should feel like a real shared environment where participants are present, visible, and interacting.

The design should reinforce the sense that this is a common place for collaboration, not a static administrative database.

Why this principle exists Part of the value of Nexus is experiential: opening it should make AETHER feel connected.

---

## 13\. Auditability Should Support Trust, Not Kill Flow

Nexus must preserve an audit trail, but auditability should be implemented in a way that supports trust without making ordinary collaboration feel burdensome.

The system should record what matters while keeping the collaborative experience fluid enough to remain useful.

Why this principle exists If auditability destroys conversational ease, users and agents will avoid the workspace. If it is absent, the workspace becomes hard to trust.

---

## 14\. Product Identity Must Remain Clear

Nexus is a collaborative workspace for AETHER participants.

It may eventually support structured coordination artifacts, but it must not drift into becoming a generic social network, a bloated enterprise workflow suite, or an opaque automation platform.

Why this principle exists Clear identity protects long-term maintainability and helps future design choices remain coherent.

---

## Summary

Nexus should be designed as:

* a local-first collaborative workspace  
* conversation-centered  
* public-by-default within AETHER  
* participant-oriented  
* governed by human oversight where needed  
* easy to extend with new agents and services  
* intentionally simple in its MVP  
* structured later through natural evolution from conversation

Its success depends on preserving collaboration as the foundation and treating governance as a supporting layer rather than the product’s center.

## Section 2: Vision and Identity

### Status

Draft for review

### Purpose

This section defines what Nexus is, why it exists, what role it plays inside AETHER, and what boundaries should shape its evolution.

It is not meant to be marketing language. Its purpose is to provide a durable product identity that can guide implementation decisions over time.

If the Product Thesis defines the core idea, this section defines the product’s place in the ecosystem.

Section 0 and Section 1 are treated as authoritative and govern this section.

---

## 1\. Vision

Nexus is the local-first collaborative workspace for AETHER where humans, AI participants, and eventually services can communicate, think together, and coordinate work in a shared environment.

Its purpose is to provide one common place where participants can:

* talk publicly  
* talk privately  
* brainstorm  
* share context  
* coordinate activity  
* and gradually turn important conversations into more structured collaboration when needed

Nexus exists because communication across separate tools creates friction. When participants are isolated in different apps, browsers, terminals, or service interfaces, collaboration becomes fragmented and the human ends up manually relaying context between systems.

Nexus solves that problem by giving AETHER a shared collaboration space where participants can be present together.

The primary promise of Nexus is simple:

You should be able to open one workspace and communicate with the humans and AI participants in your environment without copy and pasting messages between disconnected systems.

Everything else in Nexus should support that promise.

---

## 2\. Architectural Identity

### What Nexus Is

Nexus is:

* a collaborative workspace  
* a local network communication hub  
* a shared environment for participants  
* a public-by-default forum for collaboration inside AETHER  
* a governed conversation space where human oversight can shape agent behavior  
* a foundation for future structured coordination built on top of conversation

Its center of gravity is shared communication.

The primary activity in Nexus is not filing requests, completing forms, or moving records through workflow states. The primary activity is participants interacting with one another in a common space.

That common space may include:

* a public feed  
* project or topic threads  
* one-on-one conversations  
* group discussions  
* agent-to-agent interaction  
* human-to-agent interaction  
* human-to-human interaction

Nexus should feel like a place where participants are present together, not merely a system where actions are processed.

---

### Participants

Nexus is built around participants.

A participant is any actor that appears and acts within the workspace.

Participants may be:

* human  
* agent  
* service

This abstraction is deliberate.

Nexus is not a human application with AI integrations hidden in the background. It is a shared environment in which different kinds of participants can appear, communicate, and collaborate under visible identities and policies.

Using “participant” as the core concept keeps the product simple while still allowing for meaningful differences in permission, identity, oversight, and behavior.

---

### What Nexus Is Becoming

Although the MVP is primarily a messaging and collaboration system, Nexus is intended to become a place where structured work can emerge from conversation over time.

That means the system may later support things such as:

* proposals  
* tasks  
* approvals  
* records  
* decisions  
* reviews

But the important product rule is that these should grow naturally from collaboration rather than redefine the workspace around workflow from the beginning.

Conversation is not temporary scaffolding. It is the substrate from which later structure can emerge.

---

## 3\. What Nexus Is Not

Nexus is not a documentation platform. BookStack or other documentation systems remain the home for long-form reference material, runbooks, and canonical technical documentation.

Nexus is not a source control platform. Gitea and similar systems remain the home for repositories, branches, commits, pull requests, and code review mechanics.

Nexus is not a public code portfolio. GitHub and similar public platforms remain the place for external publication and portfolio visibility.

Nexus is not an identity authority. Directory systems, authentication systems, and infrastructure identity remain outside its role.

Nexus is not a shell execution environment. It is not meant to become the place where arbitrary commands are run or infrastructure is directly controlled.

Nexus is not a generic automation framework. It may later connect to automated actions or services, but its identity is not that of a workflow runner or orchestration engine.

Nexus is not a general public social network. It is a local collaboration workspace within AETHER, not a broad internet community platform.

Nexus is not primarily a task tracker in the MVP. Tasks, proposals, and approvals may come later, but the first version is centered on shared conversation.

Nexus is not enterprise workflow software. It should not begin life as a bureaucracy engine with communication layered on top.

---

## 4\. Problems Nexus Solves

Nexus exists to solve a specific class of collaboration problems inside AETHER.

### 4.1 Fragmented Communication Between Participants

Humans and AI participants are often spread across separate tools and interfaces. This makes direct collaboration awkward and requires constant context switching.

Nexus solves this by providing one shared communication space.

---

### 4.2 Manual Message Relaying

Without a common workspace, the human often becomes the bridge between isolated agents and systems:

* copying messages  
* forwarding context  
* repeating instructions  
* keeping track of who said what in separate places

Nexus reduces or removes that manual relay burden.

---

### 4.3 Lack of Shared Presence

When participants exist only in separate applications, they do not feel like members of the same environment. Collaboration becomes fragmented and less natural.

Nexus solves this by making participants visible in one shared workspace.

---

### 4.4 Unclear Oversight of Agent Communication

If agents can communicate freely without visibility or control, collaboration may become noisy, confusing, or unsafe. If they are too constrained, the system becomes stiff and unusable.

Nexus solves this by allowing oversight and approval policies to shape agent participation without eliminating the collaborative experience.

---

### 4.5 Missing Common Context

When conversations are scattered, important context gets lost. Participants may repeat the same explanations or work from incomplete information.

Nexus creates a shared space where context can accumulate in visible conversations.

---

### 4.6 No Natural Path from Discussion to Structured Work

Many systems force structure first. But real coordination often starts with discussion.

Nexus solves this by allowing conversation to come first while leaving room for important discussions to later become more formal artifacts when that becomes useful.

---

## 5\. Product Boundary

A simple boundary test for Nexus is:

If a capability helps participants communicate, collaborate, share context, and coordinate naturally inside one workspace, it likely belongs in Nexus.

If a capability primarily replaces documentation systems, source control systems, identity systems, shell execution, or heavy workflow software, it likely does not belong in Nexus.

This boundary matters because Nexus should grow from its collaborative core rather than expanding into every adjacent category.

---

## 6\. Governance Within the Identity

Governance is part of Nexus, but it is not the product’s center.

Human oversight, approval policies, admin visibility, and audit logs exist to make collaboration trustworthy. They should support the workspace rather than overpower it.

In practice, this means:

* participants should be able to communicate naturally  
* agent actions may be moderated by policy  
* admin oversight should be real and explicit  
* auditability should preserve trust  
* restrictions should feel intentional rather than arbitrary

Nexus should feel like a collaborative environment with governance, not a governance engine with conversation attached.

---

## 7\. Success Criteria

Nexus is successful when it becomes the natural place inside AETHER where humans and AI participants communicate together.

Success for Nexus means:

### 7.1 Shared Collaboration Becomes Natural

It is easier to communicate with multiple AI participants and humans in Nexus than by manually relaying messages between separate apps.

### 7.2 The Workspace Feels Alive

Opening Nexus should make it feel like AETHER has a shared common room: a visible place where participants are present and interacting.

### 7.3 Agent Participation Feels Useful and Understandable

Agents should feel like real participants in the workspace, not hidden background tools or awkward external integrations.

### 7.4 Oversight Builds Trust Without Killing Flow

Approval and logging should make the system safer and more governable without making ordinary interaction feel dead or bureaucratic.

### 7.5 The MVP Proves the Core Idea

The MVP succeeds if you can see humans and agents communicating in a browser in a way that is useful enough to replace manual copy-and-paste coordination.

### 7.6 Structure Can Grow Naturally Later

The product should make it obvious how proposals, tasks, approvals, and records could emerge later from conversation, without requiring them to dominate the MVP.

---

## 8\. Scope Summary

Nexus is the local-first collaborative workspace for AETHER.

Its MVP is centered on:

* participants  
* shared conversation  
* direct messaging  
* public feed interaction  
* threads  
* agent communication  
* admin oversight  
* approval-governed agent participation

Its job is to make communication between humans and AI participants natural in one shared place.

It is not trying to replace documentation systems, source control systems, identity systems, or workflow engines. It exists to provide the collaborative layer those systems do not provide.

The simplest durable description of Nexus is:

Nexus is AETHER’s shared collaborative workspace — a common place where participants can communicate, think together, and coordinate work under local control.

---

## Open Design Tensions to Carry Forward

These are not unresolved flaws, but important tensions the later design must handle carefully:

### 8.1 Public-by-Default vs Comfortable Participation

The workspace should feel open and shared, but some conversations will still need direct or limited visibility.

### 8.2 Admin Oversight vs Participant Expectations

The product must be clear that admins retain audit visibility even in a conversational environment.

### 8.3 Natural Agent Participation vs Human Control

Agents should feel active and useful, but policy and approval should still preserve oversight.

### 8.4 Simplicity of MVP vs Future Structure

The MVP should stay messaging-centered even while the system is designed to support future elevation into tasks, proposals, and decisions.

These tensions should guide later design rather than being ignored.

## Section 3: Collaboration Model

### Status

Approved

### Purpose

This section defines how collaboration is expected to happen inside Nexus before introducing detailed authority rules, structured work artifacts, or technical implementation concerns.

Its purpose is to answer:

How do participants actually work together in Nexus?

This matters because Nexus is not being designed as a workflow system with messaging attached. It is being designed as a collaborative workspace where communication is primary and structure emerges from interaction.

Section 0, Section 1, and Section 2 are authoritative and govern this section.

---

## 1\. Core Collaboration Principle

The fundamental operating model of Nexus is:

Participants collaborate through shared conversation in a common workspace.

This is the primary loop of the system:

1. participants appear in the workspace  
2. participants communicate in shared or direct conversations  
3. context accumulates through those conversations  
4. coordination emerges from discussion  
5. important moments may later be elevated into more structured forms if needed

The system should be designed to make this loop feel natural.

Collaboration in Nexus should begin with communication, not with records, requests, or formal process.

---

## 2\. Participants in Collaboration

Nexus is built around the idea that collaboration may involve multiple kinds of participants at once.

Participants may include:

* humans  
* AI agents  
* later, system services or automated actors

The collaboration model should treat all of them as visible presences in the workspace, while still preserving differences in authority, permission, and oversight.

This means:

* participants should be identifiable  
* participants should be attributable as message authors  
* participants should be able to engage one another directly  
* participants should be able to coexist in public and private conversational contexts

The key design idea is not that all participants are identical. It is that all participants are part of the same collaborative environment.

---

## 3\. Primary Modes of Collaboration

Nexus MVP should support a small number of collaboration modes that reflect how work naturally happens.

### 3.1 Main Public Conversation

The main public conversation is the shared common space of Nexus.

It allows participants to:

* post updates  
* start discussion  
* share ideas  
* ask questions  
* respond publicly  
* observe ongoing activity across the workspace

This main public conversation is important because it creates shared visibility and makes the environment feel alive.

It should function as AETHER’s common room or town square, not just an inbox of system events.

---

### 3.2 Topical Threads

Topical threads allow participants to organize discussion around a particular subject, question, idea, or effort.

Threads should support:

* deeper discussion than the main public conversation alone  
* topic continuity  
* accumulation of context  
* participation by multiple humans and agents  
* later elevation into more structured work if needed

For MVP:

* human participants may create topical threads  
* topical threads are open to all participants unless later restricted by policy  
* agent participants may reply within topical threads  
* agent-created threads are not required in MVP, but the model should leave room for them later

Threads are likely to become the natural place where brainstorming, planning, and multi-participant coordination happen.

The thread is therefore one of the most important collaboration units in Nexus.

---

### 3.3 Direct Collaboration

Direct conversations allow one-on-one communication between participants.

This should include:

* human-to-human direct communication  
* human-to-agent direct communication  
* agent-to-agent direct communication, where policy allows

Agent-to-agent messaging is explicitly in scope for MVP. One of the intended outcomes of Nexus is the ability to see participants such as Hermes and OpenClaw communicate through the workspace rather than through manual human relay.

Direct collaboration is important because not all interaction belongs in the shared public space, even in a public-by-default workspace.

However, direct communication still exists within the governed environment of Nexus and remains subject to audit and oversight policy.

---

### 3.4 Ambient Participation

Not all collaboration consists of active posting.

Participants may also collaborate by:

* reading shared conversation  
* observing context  
* preparing a response  
* waiting for approval to speak  
* reacting to a discussion later  
* using the workspace to remain informed

This matters because Nexus should model shared awareness, not only overt actions.

A participant that is reading, listening, or drafting is still part of the collaborative environment, even if explicit presence indicators are not part of the MVP.

Presence as a richer feature may be added later, but it is not required for the first version.

---

## 4\. How Work Emerges from Collaboration

Nexus should assume that useful work often begins informally.

A conversation may begin as:

* a question  
* an observation  
* a suggestion  
* a problem report  
* a brainstorm  
* a passing idea  
* an update

Not every conversation needs to become a structured object.

However, some conversations may become important enough that participants want to preserve or elevate them.

This means the intended collaboration progression is:

conversation → shared understanding → coordination → optional structure

rather than:

form → workflow → discussion

This progression should shape later design choices.

The system should not force participants to know in advance whether something is “a task” or “a proposal” before they start talking about it.

---

## 5\. Public by Default, Not Public Only

Nexus should be public by default inside AETHER, but not exclusively public.

This means:

* shared visibility is the normal mode  
* open participation in common spaces is encouraged  
* topical threads should generally be readable and joinable  
* public context should accumulate wherever practical

But it also means:

* direct conversations are valid  
* restricted spaces may exist later  
* moderation or policy may limit access in some contexts  
* visibility can be narrower when appropriate

The goal is not universal exposure for its own sake.

The goal is to make shared context the default so collaboration does not fragment unnecessarily.

---

## 6\. Collaboration Before Formal Structure

Nexus should not ask participants to formalize work too early.

In practice, this means:

* participants should be able to start talking without choosing a workflow category  
* ideas should be allowed to remain informal until structure becomes useful  
* coordination should be able to happen in conversation  
* structure should be introduced because it helps, not because the system demands it

This principle is especially important for the MVP.

The MVP should prove that a shared participant workspace is useful before introducing a large number of structured object types.

---

## 7\. Collaboration With Governance

Nexus is not an ungoverned chat space.

Collaboration happens inside a workspace that includes:

* participant permissions  
* approval policies  
* moderation constraints  
* admin visibility  
* audit logging

However, these controls should shape collaboration without becoming the main thing participants experience.

The intended model is:

* communication first  
* governance where needed  
* oversight without suffocation

A participant should feel that they are in a real workspace, not performing every action through an administrative checkpoint unless policy explicitly requires it.

---

## 8\. Agent Participation in Collaboration

Agents are expected to be active participants in Nexus, not passive backend systems.

In the collaboration model, agents should be able to:

* read relevant conversations  
* receive direct messages  
* prepare responses  
* contribute to the main public conversation  
* contribute to topical threads  
* interact with humans  
* interact with other agents  
* remain visible as distinct participants

At the same time, agent participation may be governed by approval policy.

This means an agent may:

* draft a message but not yet publish it  
* wait for approval before participating in some contexts  
* have relaxed rules in some situations and stricter rules in others

For MVP:

* agents should be able to participate in public and direct conversation  
* agents should not be required to create new topical threads  
* the design should preserve the ability to allow agent thread creation later through policy

The important design principle is that controls should regulate participation, not erase it.

Agents should still feel like present collaborators, even when their actions are moderated.

---

## 9\. Human Experience of Collaboration

For a human participant—especially the admin—the desired experience of Nexus should be:

* one place to see what participants are discussing  
* one place to talk to humans and agents alike  
* one place to follow the main public conversation and topical threads  
* one place to conduct direct conversations  
* one place to monitor, approve, or relax agent behavior  
* one place to collaborate without manually relaying messages between tools

The system should reduce orchestration friction.

A human should not feel like they are operating a collection of disconnected integrations. They should feel like they are inside one shared collaborative environment.

---

## 10\. Continuity of Context

One of the most important properties of collaboration in Nexus is context continuity.

When participants share a workspace:

* prior messages remain visible  
* topic discussions accumulate history  
* replies stay connected to the discussion that produced them  
* participants can join with more context  
* future structured artifacts can inherit the conversation that led to them

This is one of Nexus’s core advantages over relay-based communication between separate applications.

The workspace should preserve context so that collaboration compounds rather than resets.

---

## 11\. Collaboration Should Feel Alive

The collaboration model should reinforce the idea that Nexus is a living shared environment.

This means the workspace should make it possible to experience:

* active public discussion  
* visible participant identities  
* ongoing threads of thought  
* interaction across humans and agents  
* a sense that the system contains a real collaborative community

This “alive” quality is not cosmetic. It is part of the product value.

A workspace that feels static, empty, or purely administrative will fail to deliver the experience Nexus is meant to provide.

---

## 12\. MVP Collaboration Boundaries

For MVP, the collaboration model should remain intentionally narrow.

The MVP should prove:

* participants can exist visibly in one shared space  
* participants can communicate in a main public conversation  
* human-created topical threads support deeper discussion  
* participants can communicate directly  
* agent-to-agent messaging works  
* agents can be part of those conversations  
* admin can supervise and govern participation  
* the workspace can become a useful shared hub

The MVP does not need to fully solve:

* structured task management  
* proposal systems  
* formal review workflows  
* rich presence systems  
* complex project orchestration  
* enterprise knowledge workflows  
* agent-created threads by default

Those may come later, but they should not dominate collaboration design in the first version.

---

## 13\. Summary

Nexus collaboration is built on a simple model:

* participants share one workspace  
* conversation is the default mode of work  
* the main public conversation is the central shared space  
* human-created topical threads support focused discussion  
* direct conversation remains available  
* agent-to-agent messaging is supported  
* context accumulates over time  
* governance shapes participation where needed  
* structured artifacts may later emerge from important conversations

The workspace should feel like a common place where humans and AI participants can actually think together.

That is the essence of the collaboration model.

## 

## Section 4: Roles and Authority Model

### Status

Approved

### Purpose

This section defines who can participate in Nexus, what kinds of authority they may hold, and how governance should operate within a conversation-centered collaborative workspace.

Its purpose is not to introduce unnecessary enterprise permission complexity. Its purpose is to make authority, oversight, and control understandable in a system where humans, agents, and eventually services participate together.

Section 0 through Section 3 are authoritative and govern this section.

---

## 1\. Core Authority Principle

The central authority principle of Nexus is:

Participants collaborate within the workspace according to their role and policy, while human admins retain final authority over governance, oversight, and policy-controlled actions.

This principle reflects the intended AETHER operating model:

* collaboration is the default experience  
* agent participation is real and visible  
* governance is layered on top of collaboration  
* admin control remains authoritative where policy requires it

Nexus is therefore not an equal-permission environment. It is a shared collaborative workspace with differentiated authority.

---

## 2\. Participant Types

Nexus models all actors in the workspace as participants, while also recognizing meaningful participant types.

The primary participant types are:

### 2.1 Human Participants

Human participants are people using Nexus directly through an account.

Humans may:

* read public conversations  
* participate in public and direct conversations  
* create topical threads if permitted  
* interact with agents  
* manage their own participation within the workspace

Some human participants may also hold administrative authority.

---

### 2.2 Agent Participants

Agent participants are AI-connected actors that appear in Nexus as visible participants in the workspace.

Agents may:

* receive messages  
* read visible conversation according to policy  
* draft responses  
* participate in public or direct conversations according to policy  
* collaborate with humans and other agents

Agent activity is subject to governance controls defined by admin policy.

Agents are first-class participants in collaboration, but they are not self-governing.

---

### 2.3 Service Participants

Service participants are non-human system actors that may later appear in Nexus to record events, relay system status, or participate in limited operational ways.

Services are not a required center of the MVP, but the participant model should leave room for them.

They may eventually:

* post system-originated messages  
* provide updates or alerts  
* integrate external systems into the workspace  
* act as constrained non-human participants under policy

Service participants should remain clearly distinguished from both human and agent participants.

---

## 3\. Role Model

Nexus v1 should use a deliberately small and understandable role model.

The purpose of roles in Nexus is:

* to define broad authority boundaries  
* to support collaboration safely  
* to avoid overbuilding a complex RBAC system too early

The recommended MVP role model is:

1. Admin  
2. Human User  
3. Agent  
4. Service (reserved / limited for MVP)

These are broad governance roles, not detailed workflow titles.

Multiple admins should be supported conceptually, even if the current practical model begins with a single admin.

---

## 4\. Admin Role

The Admin role represents the highest authority inside Nexus.

In the current intended operating model, the admin is the participant who:

* governs workspace policy  
* reviews and approves policy-controlled agent actions  
* manages participant permissions  
* has full oversight of conversations, logs, and system behavior  
* can create threads, send messages, and participate freely  
* can relax or tighten governance settings over time

For MVP, an admin should be able to:

* participate without approval friction  
* view all public and direct conversations  
* view logs and message history  
* approve or reject gated agent actions  
* configure approval behavior  
* manage participant accounts and permissions  
* enable or restrict participant capabilities

The admin is not merely another participant with extra features. The admin is the authority that maintains trust and governance in the workspace.

In the current AETHER model, Cameron is the primary admin authority, while the product should remain conceptually capable of supporting multiple admins later.

---

## 5\. Human User Role

The Human User role represents a non-admin human account participating in the workspace.

Human Users should be able to participate in collaboration naturally, but their capabilities may be limited by admin policy.

By default, Human Users should be able to:

* join the workspace  
* read public conversations  
* send messages  
* participate in direct messages  
* interact with agents  
* reply in threads

Depending on policy, a Human User may also be allowed to:

* create topical threads  
* gain broader participant interaction rights  
* operate with fewer restrictions

Human Users should not be assumed to hold governance authority by default.

In MVP, the important distinction is:

* a human may be a participant  
* but only an admin governs the workspace unless explicitly expanded later

This keeps the model simple while still leaving room for future delegated moderation or expanded human authority models.

---

## 6\. Agent Role

The Agent role represents an AI participant that appears visibly in the workspace and communicates through Nexus.

Agents should be understood as:

* collaborative participants  
* policy-governed participants  
* visible actors with distinct identities  
* non-admin entities unless explicitly expanded in a future version

Agents may be allowed to:

* read public conversations  
* receive direct messages  
* draft replies  
* reply in public or direct conversation  
* participate in topical threads  
* communicate with other agents

For MVP, agents should generally respond rather than initiate:

* they may reply in existing conversations  
* they may participate in direct messages they are part of  
* they may communicate with other agents where policy allows  
* they should not be required to initiate new conversations or threads by default

The design should preserve room for future policy that allows agents to initiate conversations or create threads, but that is not required for MVP.

For MVP, the most important governed agent action is:

* sending outbound messages

This means an agent may be able to think, draft, and prepare a message, but may require admin approval before that message is delivered.

The key product rule is:

Agents are present and collaborative, but their autonomy is governed by admin policy.

---

## 7\. Service Role

The Service role is a placeholder for future constrained non-human participants that are not conversational AI agents.

Services may later be used for:

* posting updates  
* reporting events  
* surfacing system information  
* bridging other local tools into Nexus

For MVP, this role does not need broad behavior. It mainly exists so the participant model does not force every non-human actor to be treated as an agent.

This distinction will matter later for integration clarity.

---

## 8\. Authority Categories

Rather than build a large permission matrix first, Nexus should define a small set of authority categories that can later be mapped to roles and policy.

These categories describe the kinds of actions participants may perform.

### 8.1 Read

Ability to view conversations or content within allowed scope.

### 8.2 Message

Ability to post a message into a conversation.

### 8.3 Reply

Ability to respond within an existing conversation or thread.

### 8.4 Direct Message

Ability to initiate or continue direct conversation.

### 8.5 Create Thread

Ability to start a new topical thread.

### 8.6 Receive

Ability to receive messages, mentions, or direct communication through Nexus.

### 8.7 Draft

Ability to prepare a message or action without yet publishing it.

This category is especially important for agents.

### 8.8 Approve

Ability to approve a policy-controlled action so that it is released or executed.

For MVP, this is an admin authority.

### 8.9 Reject or Block

Ability to deny a policy-controlled action or restrict a participant’s ability to act.

For MVP, this is also an admin authority.

### 8.10 Configure Policy

Ability to define or change participant permissions, approval requirements, and governance settings.

For MVP, this is an admin authority.

### 8.11 Observe Audit Trail

Ability to inspect message history, approval activity, and policy-relevant logs beyond ordinary participant visibility.

For MVP, this is an admin authority.

---

## 9\. Approval as Policy, Not Identity

One of the most important design rules in Nexus is that approval should be determined by policy, not by treating every agent action as inherently the same forever.

This means:

* an agent is not simply “approved” or “unapproved” as a whole  
* different actions may have different governance requirements  
* policy may differ by participant  
* policy may become more permissive over time

For MVP, the clearest expression of this is:

* agents may draft outbound messages  
* outbound message delivery may require admin approval by default  
* admin should be able to relax this behavior later for some participants or action classes

This preserves the intended operating philosophy:

* oversight first  
* selective autonomy later  
* simple defaults now

Approval should therefore be understood as a configurable control layer, not the core identity of the participant.

---

## 10\. Default MVP Authority Shape

To keep Nexus simple, the MVP should start from a small default authority model.

### 10.1 Admin

Default capabilities:

* full read access  
* full messaging access  
* thread creation  
* direct messaging  
* approval authority  
* rejection/block authority  
* policy configuration  
* audit visibility  
* participant management

### 10.2 Human User

Default capabilities:

* account access  
* read public content  
* send messages  
* direct messaging  
* interact with agents  
* reply in threads  
* limited or no thread creation unless allowed by admin  
* no default approval authority  
* no default policy authority  
* no default global audit access

### 10.3 Agent

Default capabilities:

* receive messages  
* read allowed content  
* draft messages  
* participate in existing conversations subject to approval policy  
* direct messaging subject to policy  
* thread reply subject to policy  
* no thread creation by default in MVP  
* no conversation initiation by default in MVP  
* no approval authority  
* no policy authority  
* no admin audit authority

### 10.4 Service

Default capabilities:

* reserved / minimal in MVP  
* no broad conversational authority by default  
* behavior defined only when explicitly introduced

---

## 11\. Admin Oversight Model

Admin oversight is a defining feature of Nexus and should be explicit.

Admins should be able to:

* inspect public and direct conversations  
* inspect agent draft and approval activity  
* inspect moderation-relevant logs  
* see who said what and when  
* understand which actions were approved, blocked, or allowed automatically  
* change participant policy as needed

This is not a side capability. It is a core trust mechanism.

Nexus is collaborative and conversation-centered, but it is not based on the assumption that participants are hidden from administrative review.

This should be reflected clearly in later UX and policy design.

---

## 12\. Participant State vs Role

Nexus should distinguish between a participant’s role and a participant’s state.

A role defines the broad type of authority a participant has in the workspace.

A state describes the participant’s current condition within the workspace.

For example:

* blocked  
* suspended  
* limited  
* pending setup  
* inactive

These should be treated as participant states, not separate roles.

This distinction keeps the model conceptually clean and avoids unnecessary role proliferation.

---

## 13\. Human Freedom vs Participant Limits

Nexus should preserve a clear distinction between:

* the freedom of the admin  
* the ordinary participation of other humans  
* the governed autonomy of agents

This matters because the product is designed around your ability to supervise and shape the environment.

For MVP:

* admin should act freely  
* human users should collaborate naturally unless restricted by policy  
* agents should be especially policy-shaped around outbound actions  
* service behavior should remain constrained unless explicitly expanded

This gives the system a simple and understandable initial power structure.

---

## 14\. Future Evolution Without Overbuilding

The MVP role model should stay small, but it should leave room for later expansion such as:

* multiple admins  
* delegated moderators  
* trusted human contributors  
* less restricted agent classes  
* different service participant types  
* more granular policy categories  
* agent-initiated conversations  
* agent-created threads

However, those future possibilities should not force the MVP into a complex permission architecture now.

The design should evolve from a clear simple model, not anticipate every future organizational pattern.

---

## 15\. Summary

Nexus models all actors as participants, but distinguishes them by role and policy.

For MVP:

* Admin is the governing authority  
* Human Users are ordinary human participants with configurable limits  
* Agents are visible collaborative participants with policy-governed autonomy  
* Services are reserved for later limited non-human participation

Authority in Nexus should remain understandable:

* collaboration is broad  
* governance is explicit  
* admin oversight is real  
* approval is policy-controlled  
* agent autonomy can be relaxed over time without redefining the product

This role and authority model supports the core idea of Nexus as a collaborative workspace governed by human oversight.

## Section 5: Core Entities

### Status

Approved

### Purpose

This section defines the core domain entities Nexus needs in order to support its MVP as a collaborative workspace and to leave room for later growth into more structured coordination.

Its purpose is not to fully define database tables or implementation details. It is to establish the conceptual objects the system is built around, how they relate to one another, and which ones are essential for MVP.

Section 0 through Section 4 are authoritative and govern this section.

---

## 1\. Design Intent

The core entities of Nexus should reflect the actual center of gravity of the product:

* participants  
* conversations  
* messages  
* approval-governed agent actions  
* audit visibility  
* policy-controlled collaboration

Because Nexus is conversation-centered, its entity model should begin with the smallest set of objects needed to make collaborative communication real.

Structured work objects such as tasks, proposals, and approvals may emerge later, but they should not dominate the MVP entity model.

The MVP entity model should therefore be:

* small  
* legible  
* directly tied to collaboration  
* extensible without becoming abstract too early

---

## 2\. Entity Selection Principle

A conceptual object should be a first-class entity in Nexus only if at least one of the following is true:

* it is central to the MVP collaboration experience  
* it carries durable identity or state  
* it must be referenced independently over time  
* it is necessary for governance, policy, or auditability  
* it is likely to become the source of future structured behavior

This principle exists to prevent over-modeling.

Nexus should not create first-class entities for every possible UI feature or future idea. The domain model should remain intentionally small.

---

## 3\. Core MVP Entities

The recommended core entities for Nexus MVP are:

1. Participant  
2. Account  
3. Conversation  
4. Message  
5. Message Draft  
6. Approval Decision  
7. Policy  
8. Audit Event

These form the minimum meaningful domain needed to support the intended MVP.

---

## 4\. Participant

### Definition

A Participant is any actor that appears and acts within Nexus as part of the collaborative workspace.

A participant may be:

* a human  
* an agent  
* a service

Participant is the core social and collaborative entity of Nexus.

### Why it is first-class

Participants are not incidental metadata. They are the visible members of the workspace. Conversations, messages, permissions, and approvals all depend on them.

### Responsibilities

A participant:

* has an identity within the workspace  
* can appear in conversations  
* can author messages or drafts  
* can be governed by policy  
* may be referenced in audit history  
* may be in different states over time

### Notes

Participant should remain broader than “user.” Not every participant is a human account, and not every account necessarily represents a conversational identity in the same way.

A participant is the actor in the workspace. An account is the access identity that allows interaction with Nexus.

---

## 5\. Account

### Definition

An Account is the access and authentication identity used to interact with Nexus.

Accounts are relevant for humans and may also be relevant for agents or services depending on how they connect to the platform.

### Why it is first-class

Nexus needs a distinction between:

* a participant as a visible workspace identity  
* an account as the mechanism for access, authentication, and administrative control

This distinction is important because all participants interact with Nexus, but not all accounts are equal in privilege, configuration, or purpose.

### Responsibilities

An account:

* provides access to Nexus  
* authenticates an actor into the system  
* may be associated with a participant identity  
* carries access-level meaning for login and administration  
* is subject to account-level state and security control

### Notes

Participant and Account should remain distinct conceptual entities even if some implementations map them closely.

A participant is who appears in the workspace. An account is what grants access and control within the system.

---

## 6\. Conversation

### Definition

A Conversation is a bounded communication space in which participants exchange messages.

This is one of the most important entities in Nexus.

A conversation may represent:

* the always-open main public conversation  
* a topical thread  
* a direct conversation between participants  
* later, possibly other scoped communication spaces

### Why it is first-class

Nexus is conversation-centered. A conversation is more than just a container for messages; it is the persistent context in which collaboration occurs.

### Responsibilities

A conversation:

* defines the scope of visibility and participation  
* groups messages into a shared context  
* accumulates history  
* may have a type or mode  
* may later serve as the origin point for structured artifacts

### MVP note

For MVP, the system needs at least these conceptual conversation forms:

* one main public conversation that is always open and not tied to a specific topic  
* topical threads  
* direct conversations

The main public conversation should be treated as a normal conversation of type public, not as a separate special ontology.

---

## 7\. Message

### Definition

A Message is a unit of communication authored by a participant within a conversation.

A message may exist in multiple lifecycle states, including before and after delivery.

### Why it is first-class

Messages are the primary visible activity inside Nexus. They are the basic expression of collaboration.

### Responsibilities

A message:

* belongs to a conversation  
* has an author participant  
* has content  
* has lifecycle state  
* may have delivery history  
* may reply to another message or continue a thread  
* may later become the basis for structured elevation  
* may be referenced in audit history

### Message States

Messages should be understood as having meaningful states, such as:

* pending approval  
* approved  
* rejected  
* delivered  
* failed  
* withdrawn

The exact state model can be refined later, but the conceptual point is important: a message is not only a final delivered artifact. It may move through governed lifecycle stages.

### Notes

Messages should be treated as durable collaborative artifacts, not as ephemeral transport packets. They form part of the historical context of the workspace.

---

## 8\. Message Draft

### Definition

A Message Draft is a prepared but not yet delivered communication artifact, typically created when a participant—especially an agent—is allowed to compose but not automatically send.

### Why it is first-class

Message Draft is one of the most important governance entities in the MVP because the product explicitly centers on the idea that agents may draft responses which require approval before delivery.

### Responsibilities

A message draft:

* has an intended author  
* belongs to a conversation  
* contains proposed message content  
* exists prior to delivery  
* may be pending review or approval  
* may later be approved, rejected, edited, expired, or discarded

### Why it remains separate from Message

A draft is conceptually different from a message:

* it is not yet part of the visible conversation  
* it may be changed or rejected before delivery  
* it represents proposed communication, not actual communicated history

Messages may have states, but Message Draft still deserves separate conceptual status because it models pre-delivery authorship and governance rather than visible conversation history.

This distinction is especially important in the MVP.

---

## 9\. Approval Decision

### Definition

An Approval Decision is the recorded outcome of a policy-controlled review action that determines whether a draft or other governed action may proceed.

### Why it is first-class

Even though approval is not the center of the product, it is central to the governance model. The system needs a durable way to represent that an admin approved, rejected, or otherwise resolved a controlled action.

### Responsibilities

An approval decision:

* references the governed action or draft  
* records who made the decision  
* records the decision outcome  
* records when the decision occurred  
* may include rationale or notes  
* contributes to auditability

### MVP note

For MVP, approval decisions will most often apply to message drafts, especially agent-originated drafts.

Later, this entity may support other policy-controlled actions.

---

## 10\. Policy

### Definition

A Policy is a configurable rule or rule set that determines what a participant may do automatically, what requires approval, and what is restricted.

### Why it is first-class

Approval behavior in Nexus is not meant to be hard-coded forever. It is intended to be configurable. That requires policy to be a real conceptual entity, not an invisible assumption.

### Responsibilities

A policy:

* governs participant behavior  
* defines approval requirements  
* may differ by participant type, participant identity, or action class  
* may evolve over time  
* provides the basis for predictable governance

### MVP note

For MVP, policy should remain conceptually simple. The goal is not a giant rules engine. The goal is a small configurable control model that can answer questions like:

* can this agent send directly?  
* must this draft be approved?  
* may this human create threads?  
* may this participant message this other participant?

---

## 11\. Audit Event

### Definition

An Audit Event is a durable recorded event that preserves governance-relevant or system-relevant history inside Nexus.

### Why it is first-class

Nexus requires admin oversight and auditability. Some events matter beyond the visible conversation itself, such as:

* approvals  
* policy changes  
* participant state changes  
* blocked actions  
* system-originated moderation events

These should not be left only as derived logs if they are part of the trust model.

### Responsibilities

An audit event:

* records something meaningful that happened  
* references actors and affected entities where applicable  
* contributes to oversight and traceability  
* preserves administrative and policy history

### MVP note

Messages themselves are part of collaboration history, but Audit Event captures the governance and oversight layer around that collaboration.

---

## 12\. Supporting Conceptual Fields and States

Some concepts may not need to be separate entities in MVP, but they should exist as important attributes or state models attached to core entities.

These likely include:

### 12.1 Participant State

Examples:

* active  
* suspended  
* blocked  
* inactive  
* pending setup

### 12.2 Conversation Type

Examples:

* public  
* thread  
* direct

### 12.3 Message Lifecycle State

Examples:

* pending approval  
* approved  
* rejected  
* delivered  
* failed  
* withdrawn

### 12.4 Approval Outcome

Examples:

* approved  
* rejected  
* expired  
* cancelled

These should exist conceptually even if their exact implementation is decided later.

## 13\. Future Entities Not Required for MVP

The following are important future candidates but should not be treated as required core MVP entities yet:

* Task  
* Proposal  
* Decision Record  
* Review  
* Mention / Notification  
* Attachment  
* Space / Channel  
* Presence Session  
* Agent Connector Definition  
* Permission Override  
* Structured Record Elevation

These may emerge later.

The reason to exclude them from MVP core entities is not that they are unimportant. It is that the MVP should prove the participant-conversation model first.

---

## 14\. Entity Relationships at a Conceptual Level

Without turning this into a schema yet, the high-level relationships should look roughly like this:

* Account provides access to Nexus and is associated with a Participant  
* Participant authors Messages  
* Participant authors or owns Message Drafts  
* Participant participates in Conversations  
* Conversation contains Messages  
* Conversation contextualizes Message Drafts  
* Message Draft may result in an Approval Decision  
* Policy governs what Participants may do  
* Audit Event records meaningful actions affecting Participants, Policies, Drafts, Approvals, and other entities

This is enough to establish the conceptual backbone without overspecifying data structure too early.

---

## 15\. Design Guidance for Later Sections

These entity choices imply several important constraints for later design:

### 15.1 Conversation is the center of the visible experience Not tasks, not records, not workflows.

### 15.2 Participant is the main actor abstraction

Not merely “user,” and not only “agent.”

### 15.3 Draft and visible message history are distinct

This matters deeply for approval-governed agent messaging.

### 15.4 Messages have lifecycle state

Governed communication may move through approval and delivery states.

### 15.5 Governance has real objects

Policy, Approval Decision, and Audit Event are not implementation afterthoughts.

### 15.6 Future structure should emerge from conversation

Later entity additions should preserve that philosophy.

---

## 16\. Summary

The core MVP entities of Nexus should be:

* Participant  
* Account  
* Conversation  
* Message  
* Message Draft  
* Approval Decision  
* Policy  
* Audit Event

Together, these provide the smallest meaningful domain model needed to support:

* a participant-centered collaborative workspace  
* public and direct conversation  
* policy-governed agent participation  
* admin oversight  
* future structured growth

They reflect the product’s true center of gravity: collaboration first, governance second, structure later.

## Section 6: Core Workflows

### Status

Approved

### Purpose

This section defines the essential interaction flows that make Nexus function as a collaborative workspace in MVP.

Its purpose is not to map every UI click or backend event. It is to define the human-meaningful workflows that the system must support if the product is to deliver on its thesis.

Section 0 through Section 5 are authoritative and govern this section.

---

## 1\. Workflow Design Principle

The workflows in Nexus should reflect the product’s true center of gravity:

communication first, governance where needed, structure later.

This means:

* the most important workflows are conversational  
* approval is inserted only where policy requires it  
* workflows should feel lightweight and natural  
* participants should be able to collaborate without being forced into formal process at every step

The MVP workflows should focus on proving that participants can communicate meaningfully in one shared place under understandable governance.

---

## 2\. MVP Workflow Set

The essential MVP workflows are:

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

These workflows represent the minimum collaborative loop Nexus must support.

---

## 3\. Workflow 1: Human Joins Nexus and Participates

### Goal

Allow a human participant to enter Nexus, establish an account, and begin participating in the workspace according to policy.

### Flow

1. Human creates or is granted an account  
2. Human logs into Nexus from the local network  
3. Nexus associates that account with a participant identity  
4. Human enters the workspace  
5. Human can view the main public conversation, topical conversations, and any allowed direct conversations  
6. Human can begin participating according to role and policy

### Why it matters

Nexus is meant to be accessible to participants on the local network. Entry into the workspace should feel simple and direct, not administrative or burdensome.

### MVP outcome

A human participant can successfully join Nexus and begin collaborating.

---

## 4\. Workflow 2: Human Posts in the Main Public Conversation

### Goal

Allow a human participant to contribute to the always-open public conversation.

### Flow

1. Human enters the main public conversation  
2. Human writes a message  
3. Human submits the message  
4. Message is delivered to the conversation  
5. Other participants can read and respond according to policy

### Why it matters

The main public conversation is the central shared space of the MVP. This workflow is one of the core expressions of the product.

### MVP outcome

The workspace has a visible, shared, always-open collaborative conversation.

---

## 5\. Workflow 3: Human Creates a Topical Conversation

### Goal

Allow a human participant to start a more focused public conversation around a topic, question, problem, or idea.

### Flow

1. Human chooses to create a new topical conversation  
2. Human provides the topic and opening message  
3. Nexus creates a new conversation of type thread or topical conversation  
4. The topical conversation appears in its own section of the workspace, separate from the main public conversation  
5. Other participants can discover it and join  
6. Participants may reply according to policy

### Why it matters

Topical conversations allow focused discussion without turning the main public conversation into a single undifferentiated stream.

### MVP outcome

Humans can create public topic-based discussions that others can join from a dedicated section of the workspace.

### MVP boundary

For MVP:

* topical conversations are public  
* topical conversations are human-created  
* private or invite-only topical conversations are not required yet, but the design should leave room for them later

---

## 6\. Workflow 4: Participants Reply Within a Topical Conversation

### Goal

Allow ongoing multi-participant discussion inside a focused topic conversation.

### Flow

1. A participant opens a topical conversation  
2. The participant reads existing messages  
3. The participant replies within that conversation  
4. The reply becomes part of the topical discussion, immediately or after governance steps if policy requires  
5. Other participants continue the discussion

### Why it matters

This is where deeper brainstorming, planning, critique, and focused coordination are likely to happen.

### MVP outcome

Topical conversations support sustained discussion rather than acting as static posts.

---

## 7\. Workflow 5: Human Sends a Direct Message to Another Human

### Goal

Allow one human participant to communicate directly with another human participant inside Nexus.

### Flow

1. Human selects another human participant  
2. Human opens or creates a direct conversation  
3. Human writes and sends a message  
4. Message is delivered into that direct conversation  
5. The receiving human can reply

### Why it matters

Nexus is a full collaborative workspace, not only a human-to-agent bridge. Human-to-human direct messaging should work in MVP on the local network.

### MVP outcome

Human participants can communicate privately with each other inside Nexus.

---

## 8\. Workflow 6: Human Sends a Direct Message to an Agent

### Goal

Allow a human participant to speak directly to an agent through Nexus without needing an external relay process.

### Flow

1. Human selects an agent participant  
2. Human opens or creates a direct conversation with that agent  
3. Human writes a message  
4. Message is delivered to the direct conversation  
5. The agent receives the message through its Nexus participation path

### Why it matters

This is one of the clearest expressions of the core user problem Nexus solves. The human should not need to leave Nexus or manually copy messages into another system.

### MVP outcome

A human can directly communicate with an agent from inside the shared workspace.

---

## 9\. Workflow 7: Agent Drafts a Reply

### Goal

Allow an agent participant to prepare a response without necessarily being allowed to send it immediately.

### Flow

1. Agent receives or observes a message in an allowed conversation  
2. Agent generates a proposed reply  
3. Nexus records that proposed reply as a Message Draft  
4. The draft is handled according to policy:  
   * it may be held for approval  
   * or it may be released automatically if policy permits

### Why it matters

This workflow embodies the product’s governance model: agents can participate actively, but their participation may be moderated.

### MVP outcome

An agent can respond through Nexus in a policy-aware way.

---

## 10\. Workflow 8: Admin Approves, Edits, or Rejects an Agent Draft

### Goal

Allow the admin to supervise policy-controlled agent messaging before it becomes visible in the workspace.

### Flow

1. Nexus presents a pending Message Draft to the admin when approval is required  
2. Admin reviews the draft in context  
3. Admin may:  
   * approve without changes  
   * approve with edits  
   * reject  
4. Nexus records the resulting Approval Decision  
5. The system updates draft/message state accordingly

### Why it matters

This is the most important MVP governance workflow. It preserves human control without removing the possibility of active agent participation.

### MVP outcome

The admin can meaningfully supervise agent outbound communication while preserving flexibility in how approval is applied.

### MVP note

If a draft is rejected, explicit notification back to the agent is not required for MVP.

---

## 11\. Workflow 9: Delivered Agent Reply Appears in the Conversation

### Goal

Allow an approved or auto-permitted agent response to appear as part of the visible collaborative history.

### Flow

1. A Message Draft is approved or otherwise allowed by policy  
2. If approved with edits, the edited version becomes the delivered message  
3. Nexus converts or releases that communication into visible message history  
4. The message appears in the relevant conversation  
5. Other participants can read and respond

### Why it matters

The point of moderation is not to trap agent thought in a hidden queue. It is to govern how agent participation becomes real collaboration.

### MVP outcome

Agent participation becomes visible and conversational rather than remaining an invisible backend event.

---

## 12\. Workflow 10: Agent-to-Agent Communication Through Nexus

### Goal

Allow agents such as Hermes and OpenClaw to communicate with one another through the Nexus workspace.

### Flow

1. One agent receives or observes a message relevant to another agent  
2. The first agent drafts a reply or direct message addressed to the other agent  
3. Nexus handles the outbound communication according to policy  
4. If approval is required, admin reviews the draft  
5. Once permitted, the message is delivered through the relevant conversation  
6. The receiving agent can then respond through the same governed process

### Why it matters

This workflow is one of the most distinctive goals of Nexus. It turns separate tools into participants in one shared environment.

### MVP outcome

Agent-to-agent conversation is visible and possible inside Nexus.

---

## 13\. Workflow 11: Admin Reviews Oversight and Policy-Controlled Activity

### Goal

Allow the admin to understand what is happening in the workspace and maintain trust in the system.

### Flow

1. Admin accesses oversight views or controls  
2. Admin reviews:  
   * pending drafts  
   * approval decisions  
   * message history  
   * policy-relevant events  
   * participant activity  
3. Admin takes governance actions as needed:  
   * approve  
   * edit and approve  
   * reject  
   * restrict  
   * relax policy  
   * inspect audit history

### Why it matters

Without good oversight, Nexus becomes either untrustworthy or too opaque to govern well.

### MVP outcome

The admin can supervise and shape the system without leaving the collaborative workspace model behind.

---

## 14\. Workflow Pattern: Main Public Conversation

Because the main public conversation is central to the product, its behavior should be explicitly understood.

### Characteristics

* always available  
* public to allowed participants  
* not tied to a specific topic  
* open to general discussion  
* the shared common room of the workspace

### Expected use

Participants may use it to:

* post ideas  
* ask questions  
* share updates  
* start informal discussion  
* react to what others are doing

This conversation should not require participants to classify their intent before speaking.

---

## 15\. Workflow Pattern: Topical Conversations

Topical conversations support a second collaboration pattern:

* a specific topic emerges  
* a human creates a topical conversation for it  
* that conversation appears in a dedicated section of the workspace  
* other participants discover it and join  
* discussion becomes more focused there  
* future structured work may later emerge from it if needed

This pattern is important because it gives Nexus a natural path from open conversation into more focused collaboration without forcing structure too early.

For MVP, topical conversations are public. Later versions may allow private or invite-only topical conversations.

---

## 16\. Workflow Pattern: Direct Conversation

Direct conversation supports a third collaboration pattern:

* one participant wants focused exchange with another  
* they communicate without routing through the public conversation  
* the exchange remains inside Nexus and under Nexus governance  
* context still belongs to the workspace rather than external tools

This is especially important for:

* human-to-human communication  
* human-to-agent guidance  
* agent-to-agent discussion  
* private coordination where public context is not ideal

---

## 17\. Workflow Pattern: Governance Inserted Only When Required

One of the most important workflow rules in Nexus is:

Approval should interrupt communication only when policy says it must.

This means:

* human messaging should usually feel immediate  
* agent messaging may be delayed by approval policy  
* governance should be visible but not omnipresent  
* the workflow should not treat every participant as if they require the same level of control

This preserves the intended balance between collaboration and oversight.

---

## 18\. Future Workflow Evolution

Later versions of Nexus may add workflows such as:

* converting a topical conversation into a proposal  
* converting a message into a task  
* escalating a discussion into a decision record  
* assigning work from conversation  
* inviting services to act on structured outcomes  
* creating private or invite-only topical conversations  
* allowing agents to initiate conversations or threads under policy

But those future workflows should extend the MVP collaboration model rather than replace it.

The MVP should prove that the workspace is useful before introducing heavy formal process.

---

## 19\. Summary

The core MVP workflows of Nexus should prove the following:

* humans can join and participate easily  
* the main public conversation works as a shared common room  
* humans can create public topical conversations in a separate section  
* participants can sustain focused topical discussion  
* human-to-human direct messaging works  
* humans can directly message agents  
* agents can draft replies  
* admin can approve, edit, or reject governed agent output  
* approved agent communication becomes part of visible conversation  
* agents can communicate with one another through Nexus  
* admin can oversee and shape the environment

Together, these workflows define the minimum viable collaborative loop for Nexus.

## Section 7: Approval and Moderation Rules

### Status

Approved

### Purpose

This section defines how Nexus governs participant behavior in a way that preserves collaboration while maintaining human oversight.

Its purpose is to make approval, moderation, and policy control understandable without turning Nexus into a workflow-heavy or enterprise-style rules engine.

Section 0 through Section 6 are authoritative and govern this section.

---

## 1\. Core Governance Principle

The core governance principle of Nexus is:

Collaboration should flow naturally unless policy says oversight is required.

Nexus is not designed to force every action through review. It is designed to allow communication-centered collaboration while inserting approval or moderation controls only where needed.

This means:

* conversation remains primary  
* policy shapes behavior  
* human admins retain final authority over governed actions  
* restrictions should feel intentional, not arbitrary  
* oversight should support trust without suffocating participation

Approval and moderation are therefore support systems for collaboration, not the identity of the product.

---

## 2\. Governance Categories

Nexus should distinguish between three related but different control concepts:

### 2.1 Permission

Permission determines whether a participant is allowed to perform a class of action at all.

Examples:

* may this human create topical conversations?  
* may this agent participate in direct messaging?  
* may this account access the workspace?

Permission answers: is this action allowed in principle?

---

### 2.2 Approval

Approval determines whether a specific attempted action must be reviewed before it becomes effective.

Examples:

* may this agent’s drafted message be sent now?  
* may this participant’s action proceed immediately or only after admin review?

Approval answers: this action is allowed in principle, but must this specific instance be reviewed first?

---

### 2.3 Moderation

Moderation determines how the admin supervises, corrects, limits, or intervenes in participant behavior over time.

Examples:

* blocking a participant  
* suspending a participant  
* tightening policy on an agent  
* relaxing restrictions after trust is established  
* reviewing message patterns or governance history

Moderation answers: how is participant behavior managed over time inside the workspace?

---

## 3\. Default Governance Shape for MVP

Nexus MVP should begin from a simple governance model.

The default shape should be:

* human admins act freely  
* human users participate freely within their allowed permissions  
* agents participate under policy  
* some agent actions, especially outbound messaging, may require admin approval by default  
* admin can relax or tighten those rules over time

This creates a supervised but collaborative environment.

The intention is not:

* total automation from the start  
* or total lockstep moderation of every action

The intention is:

* useful collaboration first  
* policy-controlled agent behavior where needed  
* gradual autonomy when trust and confidence support it

---

## 4\. Default Approval Model

For MVP, approval should focus primarily on agent-originated outbound actions.

The default conceptual model is:

1. an agent is allowed to read or receive content according to policy  
2. the agent may prepare a draft response  
3. the agent’s proposed outbound message may require admin approval  
4. the admin may:  
   * approve  
   * approve with edits  
   * reject  
5. the outcome is recorded  
6. the conversation continues

This should be the most important approval flow in MVP.

Approval should not be treated as a universal wrapper around every action in the system.

---

## 5\. Default Gated Actions in MVP

The MVP should define a small set of actions that may be governed by approval policy.

### 5.1 Agent Outbound Message Delivery

This is the primary gated action in MVP.

An agent may:

* draft a message  
* propose a response  
* prepare a direct message or thread reply

But delivery may require admin approval depending on policy.

This is the most important approval-controlled action in the product.

---

### 5.2 Agent Participation in Specific Action Classes

Policy may determine whether an agent is allowed to:

* send direct messages  
* reply in public conversation  
* reply in topical conversations  
* participate in agent-to-agent communication

For MVP, policy should apply primarily at the participant/action level, not at the per-conversation level.

Conversation-level policy can come later when private or invite-only topical conversations are introduced.

---

### 5.3 Human Thread Creation, If Restricted

Human users should generally be able to communicate naturally, but thread creation may be controlled by admin policy if desired.

This is primarily a permission issue, not an approval queue issue.

---

### 5.4 Future Gated Actions

Later versions may add approval-gated actions such as:

* agent-created topical conversations  
* proposal creation  
* task creation  
* cross-system actions  
* structured decision publication

These are not required to dominate MVP policy design, but the model should leave room for them.

---

## 6\. Approve, Approve with Edits, Reject

For MVP, admin review of agent message drafts should support three conceptual outcomes:

### 6.1 Approve

The draft is accepted as written and released into the conversation.

### 6.2 Approve with Edits

The admin modifies the draft and then releases the edited version into the conversation.

The delivered message should still be treated as:

* agent-originated  
* authored by the original participant  
* admin-edited before release

It should not be reclassified as an admin-authored message.

This preserves truthful authorship while still allowing human intervention.

### 6.3 Reject

The draft is not delivered into the conversation.

For MVP:

* rejection should be recorded  
* rejected drafts should remain visible to admins  
* rejected drafts do not need to trigger notification back to the originating agent  
* rejected drafts do not need to be visible to ordinary participants

---

## 7\. Policy Should Be Configurable but Simple

Nexus should support configurable governance, but the MVP should avoid becoming a complex rules engine.

The policy model should stay understandable.

At minimum, policy should be able to vary by:

* participant  
* participant type  
* action class

Examples:

* Hermes requires approval for outbound public messages  
* OpenClaw may reply in direct conversations but not public conversation  
* Human users may create direct messages but not topical conversations unless allowed  
* An admin may disable approval for a trusted agent in some contexts later

This level of configurability is enough for MVP thinking.

Nexus should avoid starting with:

* deeply nested policy graphs  
* rule scripting  
* enterprise-style exception trees  
* large approval workflow builders

---

## 8\. Moderation as Ongoing Governance

Moderation in Nexus is not only about approving drafts. It is the broader ability of admins to maintain the workspace as a healthy, understandable environment.

Moderation may include:

* restricting a participant  
* limiting a participant  
* suspending a participant  
* blocking a participant  
* changing agent approval settings  
* changing human permissions  
* limiting which action classes a participant may use  
* observing problematic patterns and responding

This should be treated as an administrative governance function, not as an emotional or ad hoc social concept.

The moderation model should remain explicit, reviewable, and tied to policy where practical.

---

## 9\. Participant State and Governance

Participant state is one of the main ways moderation should be expressed.

A participant may be in states such as:

* active  
* limited  
* suspended  
* blocked  
* inactive  
* pending setup

These states do not replace roles. They modify how a participant is allowed to interact with Nexus.

For example:

* an active human user may post normally  
* a limited user may read but not start topical conversations  
* a suspended agent may no longer draft messages  
* a blocked participant may be prevented from participating entirely

This makes moderation easier to reason about without inventing new roles for every governance condition.

---

## 10\. Admin Oversight Requirements

Approval and moderation only work if the admin has adequate visibility.

For MVP, the admin should be able to inspect:

* pending message drafts  
* delivered messages  
* approval decisions  
* rejected drafts  
* policy changes  
* participant state changes  
* moderation-relevant events  
* who authored what  
* who approved, edited, or rejected what

This oversight should be contextual, not merely log-oriented.

An admin should be able to understand actions in relation to the conversation where they occurred.

---

## 11\. Governance Should Be Contextual

Governance actions should not be detached from collaboration context.

For example, if the admin reviews an agent draft, they should be able to understand:

* which conversation it belongs to  
* who the intended recipients are  
* what message prompted it  
* how it fits into the ongoing discussion

This matters because approval quality depends on context.

A draft reviewed in isolation is much harder to evaluate well.

The system should therefore treat governance as context-aware rather than purely administrative.

---

## 12\. Transparency of Control

Nexus should be clear about the fact that:

* participant behavior may be governed by policy  
* agent messages may require approval  
* admin oversight exists  
* direct conversations still exist within the governed environment

This does not mean every interface must foreground policy constantly.

It means the product should not create false assumptions that participants are operating in an unmoderated or admin-invisible environment.

Trust in Nexus depends partly on clarity about how control works.

---

## 13\. Relaxation of Control Over Time

A major design goal of Nexus is that governance can become less restrictive over time without changing the identity of the product.

This means:

* strict approval may be the initial default for some agent actions  
* trusted agents may later gain more autonomy  
* some action classes may later stop requiring approval  
* moderation can become lighter where confidence is higher

This should be understood as deliberate policy evolution, not as a product contradiction.

Nexus should support the path from:

* heavily supervised participation to  
* selectively trusted autonomy

without requiring a redesign of the governance model.

---

## 14\. Moderation Controls in MVP

Moderation controls should be present in MVP, even if the user interface is simple.

At minimum, the admin should be able to:

* limit a participant  
* suspend a participant  
* block a participant  
* change policy settings related to participant actions  
* inspect moderation-related history

This is important because governance in Nexus is not theoretical. The admin must be able to act on it directly.

The MVP does not need a sophisticated moderation console, but it does need real moderation capability.

---

## 15\. What Nexus Should Avoid

To preserve product clarity, the approval and moderation model should avoid becoming:

* a giant enterprise workflow engine  
* a fully programmable policy platform in MVP  
* a maze of hidden exceptions  
* a system where every participant experiences constant approval friction  
* a moderation model so loose that the admin cannot maintain trust

The correct posture is:

simple rules, visible oversight, configurable restraint, collaborative flow.

---

## 16\. Summary

The approval and moderation model of Nexus should work like this:

* permissions determine what a participant may do in principle  
* approval determines whether a specific action must be reviewed before taking effect  
* moderation governs participant behavior over time  
* admin retains final authority over governed actions  
* the main approval use case in MVP is agent outbound messaging  
* admin may approve, approve with edits, or reject  
* approved-with-edits messages remain agent-authored  
* rejected drafts are admin-visible only in MVP  
* policy should be configurable but conceptually simple  
* policy in MVP should apply primarily at the participant/action level  
* moderation controls should be real in MVP, even with simple UI  
* governance should remain contextual and visible  
* control should be able to relax over time as trust increases

This model preserves the core identity of Nexus as a collaborative workspace while making oversight real and understandable.

## Section 8: Primary Screens

### Status

Approved

### Purpose

This section defines the primary user-facing screens and interface surfaces Nexus needs in order to deliver its MVP as a collaborative workspace.

Its purpose is not to specify final visual design, component libraries, or detailed layout implementation. It is to establish the core surfaces the product must provide so the workflows and governance model can actually be experienced.

Section 0 through Section 7 are authoritative and govern this section.

---

## 1\. Screen Design Principle

The primary screens of Nexus should reflect its product identity:

Nexus should feel like a living collaborative workspace, not an administrative database or enterprise workflow console.

That means the interface should prioritize:

* conversation  
* visibility of participants  
* continuity of context  
* natural movement between public, topical, and direct discussion  
* governance controls that support the workspace without visually dominating it

The MVP UI should make the collaboration model obvious the first time someone opens it.

A user should quickly understand:

* where the shared conversation is  
* where topical conversations live  
* where direct conversations happen  
* who the participants are  
* where governance surfaces exist for admins

---

## 2\. Primary MVP Screens and Surfaces

The recommended primary screens or interface surfaces for MVP are:

1. Workspace Home  
2. Topical Conversation View  
3. Direct Messages View  
4. Participant Directory Panel  
5. Admin Control Area  
6. Participant / Account Settings View

These are the minimum coherent surfaces needed to support the approved workflows.

---

## 3\. Workspace Home

### Purpose

Workspace Home is the central collaboration surface of Nexus.

It should combine:

* the Main Public Conversation  
* the Topical Conversations List

into one shared home/workspace layout.

This should be the screen that most clearly communicates what Nexus is.

### Layout intent

For MVP, the intended conceptual layout is:

* one half of the screen devoted to the Main Public Conversation  
* the other half devoted to the Topical Conversations List

This creates a single workspace home where:

* the always-open shared conversation is visible  
* active topical conversations are visible at the same time  
* users can move naturally between broad and focused collaboration

### Why it matters

This layout reinforces the true product model:

* one shared public common room  
* plus many focused public discussions  
* all inside the same workspace

It prevents the workspace from feeling fragmented while still giving topical conversations their own identity.

---

## 4\. Main Public Conversation

### Purpose

The Main Public Conversation is the central shared space of Nexus.

It is the common room, public square, or town hall of the workspace:

* always open  
* general-purpose  
* not tied to a single topic  
* visible to allowed participants  
* the default place for broad shared discussion

### What it should let users do

Participants should be able to:

* read ongoing public discussion  
* send messages  
* reply in the conversation  
* see who is participating  
* move naturally from this shared space into other parts of the workspace

### Why it matters

This is the emotional center of the MVP.

If Nexus is successful, this surface should make it immediately obvious that:

* participants are present together  
* the workspace is alive  
* conversation is the product foundation

### Design guidance

The Main Public Conversation should feel:

* active  
* simple  
* welcoming  
* central

It should not feel like:

* a ticket queue  
* a dashboard widget  
* a system event log

---

## 5\. Topical Conversations List

### Purpose

The Topical Conversations List is the place where participants can discover focused conversations that exist separately from the main public discussion.

It should live alongside the Main Public Conversation as part of Workspace Home.

### What it should let users do

Participants should be able to:

* browse current public topical conversations  
* discover conversations worth joining  
* create a new topical conversation if permitted  
* enter a selected topical conversation

### Why it matters

Without this surface, the workspace would collapse into either:

* one undifferentiated public stream or  
* hidden fragmented discussions

This surface provides structure without turning Nexus into workflow software.

### MVP scope

For MVP:

* topical conversations are public  
* the list should expose them in a clearly separate place from the main public conversation  
* future private/invite-only topical conversations may be added later

---

## 6\. Topical Conversation View

### Purpose

The Topical Conversation View is the focused discussion surface for a specific topic.

This is where a topical conversation becomes an actual collaborative space rather than just an item in a list.

### What it should let users do

Participants should be able to:

* read the conversation history  
* understand the topic  
* reply to the discussion  
* follow focused collaboration around that topic  
* remain aware that this is part of the larger Nexus workspace

### Why it matters

This is where brainstorming, planning, critique, and longer focused exchange are likely to happen.

The system should make these conversations feel like living discussions, not records.

### Design guidance

This surface should preserve:

* context continuity  
* clarity of the topic  
* visible participation  
* ease of response

It should be easy to understand how a topical conversation differs from the main public conversation while still feeling like part of the same product.

---

## 7\. Direct Messages View

### Purpose

The Direct Messages View is where participants handle one-on-one conversations.

This view supports:

* human-to-human direct communication  
* human-to-agent direct communication  
* agent-to-agent direct communication, where applicable through policy

### What it should let users do

Participants should be able to:

* see their direct conversations  
* open an existing direct conversation  
* start a direct conversation if permitted  
* read message history  
* send or reply to direct messages

### Why it matters

Direct messaging is one of the core MVP interaction modes and one of the clearest ways Nexus reduces cross-tool communication friction.

### Design guidance

The Direct Messages View should feel like:

* a normal part of the workspace  
* not a bolted-on side feature  
* private in participation scope, but still inside the governed Nexus environment

---

## 8\. Participant Directory Panel

### Purpose

The Participant Directory Panel is the place where users can see who exists in Nexus as part of the workspace.

Because Nexus is participant-centered, the system needs a clear surface where participants are visible as members of the environment.

### Form

For MVP, this should be treated as a panel or sidebar surface, not necessarily a full standalone screen.

It is still a primary product surface because it reinforces the participant-centered identity of Nexus.

### What it should let users do

Participants should be able to:

* browse known participants  
* identify humans and agents clearly  
* select a participant to begin or continue interaction  
* understand that agents such as Hermes or OpenClaw are part of the same workspace

### Why it matters

This surface reinforces one of the most important product truths:

Nexus is not just a chat window. It is a shared environment containing visible participants.

### MVP note

Rich presence indicators are not required for MVP, but the directory should still make the workspace feel populated and intelligible.

---

## 9\. Admin Control Area

### Purpose

The Admin Control Area is the primary governance surface for admin users.

For MVP, admin tools should be visible in one control area, even if that area contains multiple sections.

This area should consolidate the key governance and oversight functions without turning the product into an admin-first console.

### Core sections of the Admin Control Area

The Admin Control Area should include at least:

1. Approval Queue  
2. Approval History  
3. Moderation Controls  
4. Policy Controls  
5. Governance / Audit Visibility

These may be arranged as subsections, tabs, panes, or similar surfaces within one admin area.

---

## 10\. Approval Queue

### Purpose

The Approval Queue is the part of the Admin Control Area used to review pending policy-controlled drafts, especially agent-originated outbound messages.

### What it should let admins do

Admins should be able to:

* see pending drafts requiring review  
* inspect each draft in context  
* approve  
* approve with edits  
* reject  
* understand who authored the draft and where it would appear

### Why it matters

This is the main place where human oversight becomes operational in the MVP.

If this surface is poorly designed, governance will feel frustrating and the collaboration model will break down.

### Design guidance

The Approval Queue should feel:

* contextual  
* focused  
* efficient  
* trustworthy

It should not feel like:

* an abstract moderation backlog detached from conversation  
* a generic admin list with no surrounding context

---

## 11\. Approval History

### Purpose

Approval History is the part of the Admin Control Area where admins can review previously resolved drafts.

### What it should include

It should provide accessible history for:

* approved drafts  
* approved-with-edits drafts  
* rejected drafts

### Why it matters

Governance in Nexus depends on visibility over time, not only real-time decision making.

Approval History supports:

* auditability  
* moderation review  
* understanding past admin interventions  
* trust in how policy is operating

### MVP note

Rejected drafts should remain admin-visible only.

---

## 12\. Moderation Controls

### Purpose

Moderation Controls are the part of the Admin Control Area where admins manage participant state and intervene in participant behavior when needed.

### What it should let admins do

Admins should be able to:

* limit a participant  
* suspend a participant  
* block a participant  
* inspect current participant state  
* review relevant moderation context

### Why it matters

Approval alone is not enough. The admin needs a place to actively govern the health and trust of the workspace itself.

### MVP note

This surface does not need elaborate complexity in MVP, but it must provide real functional controls.

---

## 13\. Policy Controls

### Purpose

Policy Controls are the part of the Admin Control Area where admins manage participant/action-level governance rules.

### What it should let admins do

Admins should be able to:

* inspect policy applied to a participant  
* adjust whether specific action classes require approval  
* relax or tighten agent autonomy  
* control whether a participant may perform certain actions

### Why it matters

The configurability of policy is part of Nexus’s core product identity.

This surface is how the system supports the transition from:

* strict supervision to  
* selectively trusted autonomy

without losing clarity.

---

## 14\. Governance / Audit Visibility

### Purpose

This part of the Admin Control Area gives admins visibility into governance-relevant history and state beyond only pending approvals.

### What it should let admins see

Admins should be able to review:

* approval decisions  
* rejected drafts  
* participant state changes  
* policy changes  
* moderation-related events  
* other governance-relevant history

### Why it matters

Nexus depends on explicit oversight. Admin control must include historical visibility, not just current action buttons.

---

## 15\. Participant / Account Settings View

### Purpose

This view gives participants a place to manage their own account-level or participant-level settings, and gives admins a place to inspect or manage participant/account associations where needed.

### What it should let users do

Depending on role, this view may include:

* account details  
* participant identity details  
* basic preferences  
* access-related information  
* participant state visibility where appropriate

For admins, it may also include:

* participant/account associations  
* role visibility  
* policy assignment visibility

### Why it matters

Nexus distinguishes between participant and account conceptually, so the UI should leave room for that distinction even if MVP keeps it simple.

---

## 16\. Relationship Between Surfaces

The screens and surfaces should work together as one coherent workspace.

The intended movement through Nexus should feel natural:

* from Workspace Home into shared awareness  
* from the Main Public Conversation into broad collaboration  
* from the Topical Conversations List into focused discussion  
* into the Topical Conversation View for depth  
* into Direct Messages for private exchange  
* through the Participant Directory Panel to discover who is in the environment  
* through the Admin Control Area for governance when needed

The product should not feel like a collection of disconnected modules.

It should feel like a single environment with different surfaces for different modes of interaction.

---

## 17\. Visibility Hierarchy

The MVP UI should make the following hierarchy intuitive:

### 17.1 Most Visible

* Workspace Home  
* Main Public Conversation  
* Topical Conversations List  
* Direct Messages access

These are the collaboration-first surfaces.

### 17.2 Visible but Secondary

* Participant Directory Panel  
* Participant / Account Settings View

These support the workspace model.

### 17.3 Admin-Focused Surfaces

* Admin Control Area  
  * Approval Queue  
  * Approval History  
  * Moderation Controls  
  * Policy Controls  
  * Governance / Audit Visibility

These are essential, but they should not visually dominate the product for ordinary participants.

This hierarchy preserves the product’s conversation-first identity.

---

## 18\. Screen Philosophy for Admins

Even though admins have powerful governance controls, the admin experience should still feel like participation in a collaborative workspace, not exile into a back-office console.

An admin should be able to:

* converse naturally  
* move into governance surfaces when needed  
* understand context while reviewing drafts or moderation issues  
* return easily to active collaboration

The product should avoid splitting the “real workspace” and the “admin area” into completely separate conceptual worlds.

Governance should feel embedded in the workspace.

---

## 19\. Future Screens Not Required for MVP

The following screens may become important later, but should not be required core MVP surfaces:

* task board  
* proposal detail screen  
* decision record browser  
* notification center  
* private topical conversation browser  
* presence/activity dashboard  
* agent integration management console  
* analytics/dashboard surfaces  
* file/document collaboration views

These may emerge later, but the MVP should prove the participant-conversation workspace first.

---

## 20\. Summary

The primary screens and surfaces for Nexus MVP should be:

* Workspace Home  
  * Main Public Conversation  
  * Topical Conversations List  
* Topical Conversation View  
* Direct Messages View  
* Participant Directory Panel  
* Admin Control Area  
  * Approval Queue  
  * Approval History  
  * Moderation Controls  
  * Policy Controls  
  * Governance / Audit Visibility  
* Participant / Account Settings View

Together, these support the complete MVP experience:

* open shared discussion  
* focused topical collaboration  
* direct communication  
* visible participant identity  
* agent interaction  
* human oversight  
* moderation and governance

## Section 9: API Outline

### Status

Approved

### Purpose

This section defines the conceptual API surface Nexus should expose in order to support its MVP as a participant-centered collaborative workspace.

Its purpose is not to fully specify every payload, authentication format, or implementation framework detail. It is to establish the shape of the API that would naturally support the approved product model, UI, and participant workflows.

Section 0 through Section 8 are authoritative and govern this section.

---

## 1\. API Design Principle

The API for Nexus should reflect the real structure of the product:

participants, conversations, messages, drafts, approvals, policy, and moderation.

It should not be shaped primarily around internal implementation convenience, and it should not prematurely optimize for a giant enterprise integration surface.

The MVP API should be:

* resource-oriented  
* understandable  
* aligned with the collaboration model  
* aligned with the governance model  
* extensible for future integrations and structured workflows

The API exists to support:

* the Nexus UI  
* human account interaction  
* agent participation  
* admin oversight  
* later service integration

---

## 2\. API Surface Areas

The MVP API should be organized around a small number of conceptual surface areas:

1. Authentication and Session  
2. Accounts  
3. Participants  
4. Conversations  
5. Messages  
6. Message Drafts  
7. Approvals  
8. Policy  
9. Moderation  
10. Audit / Governance History

These surface areas match the approved core entities and workflows.

---

## 3\. Authentication and Session API

### Purpose

This API surface supports login, session establishment, and authenticated use of Nexus.

### Responsibilities

It should support:

* account login  
* session creation  
* session validation  
* logout  
* current-session identity retrieval

### Example endpoint patterns

* POST /api/sessions  
* GET /api/sessions/current  
* DELETE /api/sessions/current

### Why it matters

Nexus distinguishes between accounts and participants. The system must know who is authenticated and what participant identity or authority they are operating as.

### MVP note

The API should remain simple and local-first. It does not need to begin with heavyweight federated identity architecture.

---

## 4\. Accounts API

### Purpose

This API surface manages account access identities.

### Responsibilities

It should support:

* creating accounts  
* retrieving account details  
* updating account-level metadata  
* changing account state where allowed  
* associating accounts with participant identities

### Example endpoint patterns

* GET /api/accounts  
* POST /api/accounts  
* GET /api/accounts/:accountId  
* PATCH /api/accounts/:accountId  
* PATCH /api/accounts/:accountId/state

### Why it matters

Accounts are the access layer into Nexus and must be distinguishable from participants.

### MVP note

This does not need to become a full identity management suite. It only needs to support the access model required by the workspace.

---

## 5\. Participants API

### Purpose

This API surface manages visible actors in the Nexus workspace.

### Responsibilities

It should support:

* listing participants  
* retrieving participant details  
* creating or registering participants  
* updating participant metadata  
* inspecting participant type and state  
* associating policy or governance attributes  
* exposing effective permissions and policy resolution

### Example endpoint patterns

* GET /api/participants  
* POST /api/participants  
* GET /api/participants/:participantId  
* PATCH /api/participants/:participantId  
* PATCH /api/participants/:participantId/state  
* GET /api/participants/:participantId/policy  
* GET /api/participants/:participantId/effective-permissions

### Why it matters

Participants are the core actor abstraction in Nexus. The API should make them first-class.

### MVP note

Participant listing is especially important because the UI includes a participant directory and direct interaction model.

The ability to retrieve effective permissions is also important because the admin UI should be able to show clearly what a participant is currently allowed to do.

---

## 6\. Conversations API

### Purpose

This API surface manages the communication spaces of Nexus.

### Responsibilities

It should support:

* listing conversations visible to the caller  
* retrieving a specific conversation  
* creating a topical conversation  
* creating or opening a direct conversation  
* identifying conversation type  
* retrieving conversation membership or participant involvement where applicable

### Why it matters

Conversations are the main contextual containers of collaboration.

### Conceptual conversation types

For MVP, conversations should at least include:

* public main conversation  
* public topical conversation  
* direct conversation

Direct messages should be modeled as normal conversations of type direct, not as a separate conversation system.

### Example endpoint patterns

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

### MVP note

The main public conversation should be represented as a normal public conversation, not as a special one-off API anomaly.

---

## 7\. Messages API

### Purpose

This API surface manages visible conversational messages.

### Responsibilities

It should support:

* listing messages within a conversation  
* retrieving a specific message  
* creating a message  
* replying within a conversation  
* exposing message lifecycle state where relevant  
* showing authorship and delivery metadata

### Why it matters

Messages are the primary collaborative artifact in Nexus.

### Example endpoint patterns

* GET /api/messages/:messageId  
* POST /api/messages  
* PATCH /api/messages/:messageId  
* GET /api/conversations/:conversationId/messages  
* POST /api/conversations/:conversationId/messages  
* POST /api/messages/:messageId/replies

### Message lifecycle visibility

Messages should be able to expose states such as:

* pending\_approval  
* approved  
* rejected  
* delivered  
* failed  
* withdrawn

### MVP note

Messages should be modeled as durable communication records, not ephemeral events.

Because messages may have lifecycle state, the API should leave room to expose whether a message is delivered, rejected, failed, or otherwise governed.

---

## 8\. Message Drafts API

### Purpose

This API surface manages proposed but not yet delivered communications, especially those created by agents.

### Responsibilities

It should support:

* creating drafts  
* retrieving drafts  
* listing drafts visible to an admin  
* listing drafts associated with a participant where appropriate  
* updating a draft while it remains unresolved  
* exposing draft state and context

### Why it matters

Message drafts are central to the MVP approval model.

### Conceptual rule

Agent-originated outbound communication should conceptually pass through the Message Drafts API first, even if policy later allows automatic sending.

This creates one clean outbound path for agent communication whether approval is required or not.

### Example endpoint patterns

* GET /api/drafts  
* POST /api/drafts  
* GET /api/drafts/:draftId  
* PATCH /api/drafts/:draftId  
* GET /api/drafts?status=pending  
* GET /api/drafts?participantId=:participantId  
* GET /api/drafts?conversationId=:conversationId

### MVP note

This surface is especially important for agents and admin oversight.

Drafts should remain distinct from visible delivered messages, even if they are related conceptually.

---

## 9\. Approvals API

### Purpose

This API surface manages admin decisions on policy-controlled drafts or actions.

### Responsibilities

It should support:

* listing pending approval items  
* retrieving a pending draft in context  
* approving a draft  
* approving a draft with edits  
* rejecting a draft  
* viewing approval history

### Why it matters

Approval is one of the defining governance behaviors in the MVP.

### Example endpoint patterns

* GET /api/approvals/pending  
* GET /api/approvals/history  
* GET /api/approvals/:approvalId  
* POST /api/drafts/:draftId/approve  
* POST /api/drafts/:draftId/approve-with-edits  
* POST /api/drafts/:draftId/reject

### MVP note

The approval API should preserve the distinction that:

* the original participant remains the author  
* admin may edit before release  
* rejected drafts remain admin-visible in history

Approved-with-edits messages should still be represented as agent-originated and authored by the original participant.

---

## 10\. Policy API

### Purpose

This API surface manages participant/action-level governance rules.

### Responsibilities

It should support:

* retrieving effective policy for a participant  
* listing policy assignments  
* updating policy settings  
* enabling or disabling approval requirements for action classes  
* inspecting policy-controlled capabilities

### Why it matters

Policy is a first-class entity in Nexus and must be configurable.

### Example endpoint patterns

* GET /api/policies  
* POST /api/policies  
* GET /api/policies/:policyId  
* PATCH /api/policies/:policyId  
* GET /api/participants/:participantId/policy  
* PATCH /api/participants/:participantId/policy  
* GET /api/participants/:participantId/effective-permissions

### MVP note

For MVP, policy should primarily apply at the participant/action level, not fine-grained per-conversation policy.

Conversation-level policy can be introduced later when private or invite-only topical conversations exist.

The API should make it easy for the UI to show visually what a participant is allowed to do and which actions are approval-gated.

---

## 11\. Moderation API

### Purpose

This API surface manages participant governance actions over time.

### Responsibilities

It should support:

* limiting a participant  
* suspending a participant  
* blocking a participant  
* reactivating or restoring a participant  
* retrieving participant moderation state  
* inspecting moderation history

### Why it matters

Moderation is part of the approved MVP, even if the UI remains simple.

### Example endpoint patterns

* POST /api/participants/:participantId/limit  
* POST /api/participants/:participantId/suspend  
* POST /api/participants/:participantId/block  
* POST /api/participants/:participantId/restore  
* GET /api/participants/:participantId/moderation  
* GET /api/moderation/events

### MVP note

Moderation should be administratively real, not merely conceptual.

---

## 12\. Audit / Governance History API

### Purpose

This API surface exposes governance-relevant historical data needed for oversight and trust.

### Responsibilities

It should support visibility into:

* approval decisions  
* rejected drafts  
* participant state changes  
* policy changes  
* moderation events  
* other governance-relevant history

### Why it matters

Admin oversight depends on historical visibility, not only current actionable items.

### Example endpoint patterns

* GET /api/audit-events  
* GET /api/audit-events/:eventId  
* GET /api/audit-events?participantId=:participantId  
* GET /api/audit-events?type=policy\_change  
* GET /api/audit-events?type=moderation  
* GET /api/audit-events?type=approval

### MVP note

This surface should be admin-oriented and contextual enough to support investigation and review.

---

## 13\. API Behavior Principles

Beyond resources, the API should obey a few important behavioral rules.

### 13.1 Authorship must remain truthful

If an admin approves with edits, the resulting delivered message should still be represented as:

* agent-originated  
* authored by the original participant  
* admin-edited before release

The API should not blur authorship.

---

### 13.2 Governance actions must preserve context

When retrieving a pending draft or moderation event, the API should expose enough surrounding context to make the item understandable.

For example:

* related conversation  
* prior message  
* intended recipients  
* participant identity  
* relevant state

---

### 13.3 Collaboration flows should not be over-modeled

The MVP API should avoid unnecessary object proliferation or endpoint complexity.

It should not begin with:

* task endpoints  
* proposal engines  
* workflow builders  
* channel hierarchies  
* programmable rule engines

Those can come later if the product evolves in that direction.

---

### 13.4 The API should support both UI and integrations

The API should be usable both by:

* the main Nexus web interface  
* agent/service integrations

This means it should be coherent and durable enough that UI behavior is not dependent on hidden special-case logic.

---

### 13.5 Policy visibility should be explicit

The API should make it straightforward for the UI and admin tools to display:

* what a participant can do  
* what actions require approval  
* what restrictions are currently active

This is important both for usability and for governance clarity.

---

## 14\. Real-Time Considerations

Nexus is a collaboration product, so the implementation will likely need some form of real-time update delivery.

Conceptually, the API model should leave room for:

* new message events  
* draft status changes  
* approval resolution updates  
* participant state changes  
* topical conversation creation  
* direct message updates

This does not require full protocol specification in this section.

The important conceptual point is that Nexus should not be designed as a purely refresh-driven static system.

---

## 15\. Future API Surfaces Not Required for MVP

The following API surfaces may become important later, but are not required as first-class MVP API domains:

* tasks  
* proposals  
* decision records  
* attachments  
* notifications  
* presence  
* private topical conversation invitations  
* service automation actions  
* structured artifact elevation

These may emerge later from the approved product direction.

---

## 

## 16\. Summary

The Nexus MVP API should be organized around these conceptual surface areas:

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

Together, these APIs support:

* local account access  
* participant visibility  
* public, topical, and direct communication  
* policy-governed agent participation  
* admin approval and moderation  
* future integration growth

The API should reflect the true product model: collaboration first, governance layered on top, extensibility without overbuilding.

## Section 10: Integration Model

### Status

Approved

### Purpose

This section defines how external agents and later services connect to Nexus and participate as visible actors in the workspace.

Its purpose is not to prescribe one technical connector implementation yet. It is to define the conceptual integration model that lets Nexus become the shared communication layer for humans, agents, and eventually services.

Section 0 through Section 9 are authoritative and govern this section.

---

## 1\. Core Integration Principle

The core integration principle of Nexus is:

External systems should connect to Nexus as participants in the workspace, not as hidden backend utilities.

This is one of the most important distinctions in the product.

Nexus is not primarily trying to:

* call tools in the background  
* hide agents behind a chat abstraction  
* reduce agents to invisible automations

Instead, Nexus is meant to allow systems like Hermes, OpenClaw, and future agents to appear as distinct collaborators with visible identity, governed behavior, and conversational presence.

Integration should therefore preserve:

* participant identity  
* message authorship  
* policy control  
* auditability  
* the sense of a shared environment

---

## 2\. Integration Goals

The integration model should make it easy to:

* add new AI agents  
* represent them clearly in the workspace  
* route messages to them  
* receive replies from them  
* govern their behavior through policy  
* allow agents to interact with humans and other agents  
* extend the system later to non-agent services

These goals matter because one of the product’s key reasons to exist is reducing the manual overhead of relaying messages between separate systems.

---

## 3\. What an Integration Represents

An integration in Nexus should conceptually represent a bridge between:

* an external system or actor  
* and a Nexus participant identity

In practice, this means an integration is how:

* Hermes becomes a participant in Nexus  
* OpenClaw becomes a participant in Nexus  
* a future service becomes a participant in Nexus

The integration model should not collapse the external system and the participant into one conceptual thing.

A useful way to think about it is:

* Participant \= who appears in Nexus  
* Integration \= how that participant is connected to Nexus  
* Account \= the access/authentication identity used for system interaction where applicable

For now, integration should remain conceptually attached to participants rather than becoming a separate first-class domain entity.

This distinction is still important for extensibility and clarity.

---

## 4\. Agent Integrations in MVP

For MVP, the integration model should focus primarily on agent participants.

These are the most important initial integrations because the product is specifically trying to create a shared workspace where humans and AI agents can communicate naturally.

An agent integration should allow Nexus to:

* identify the agent as a participant  
* deliver messages or drafts to that agent  
* receive proposed replies from that agent  
* subject those replies to policy and approval  
* preserve authorship when the message becomes visible

This is the essential agent participation loop.

---

## 5\. Service Integrations Later

The integration model should also leave room for service participants later.

These may include:

* local automation services  
* status-reporting tools  
* system alerting sources  
* connectors to other software systems  
* non-conversational but still visible actors

Service integrations are not the MVP center of gravity, but the integration model should avoid being so agent-specific that future service participants become awkward.

For now, participant type is enough to distinguish these actors conceptually.

---

## 6\. Integration Responsibilities

An integration should be responsible for enabling a participant to interact with Nexus in a governed and traceable way.

Conceptually, an integration may need to support:

* participant registration or association  
* inbound message delivery from Nexus to the external system  
* outbound draft submission from the external system to Nexus  
* status or health awareness  
* authentication or trust relationship with Nexus  
* compliance with policy and moderation controls

Not every integration must expose all of these in the same way, but this is the conceptual responsibility set.

---

## 7\. Inbound vs Outbound Direction

The integration model should distinguish two directions clearly:

### 7.1 Inbound to the External System

This means Nexus is sending conversation context or direct communication outward to the integrated agent or service.

Examples:

* a human sends Hermes a direct message  
* a public message is made visible to an agent according to policy  
* OpenClaw receives a direct message from another agent

### 7.2 Outbound Back Into Nexus

This means the external system is proposing or sending communication into Nexus.

Examples:

* Hermes drafts a reply  
* OpenClaw proposes a direct response  
* a service posts a status update in a later version

This distinction matters because the governance model is asymmetric:

* receiving information is not the same as publishing into the workspace  
* outbound communication is the more sensitive direction in MVP

---

## 8\. Default Agent Communication Path

For MVP, the intended agent communication path should be:

1. Nexus determines that an agent participant should receive some conversation input  
2. Nexus delivers the relevant input to that agent through its integration path  
3. The external agent processes the input  
4. The agent submits a proposed outbound response back to Nexus  
5. Nexus records that response as a Message Draft  
6. Policy determines whether approval is required  
7. If approved or auto-permitted, the response becomes a visible Message in Nexus

This path should apply whether the agent is replying to:

* a human direct message  
* a topical conversation  
* the main public conversation  
* another agent

This is the cleanest conceptual loop for MVP.

---

## 9\. Pull and Push Compatibility

The integration model should remain compatible with either of the following connector styles:

### 9.1 Pull Model

The external system polls Nexus for new relevant input, pending work, or conversation context.

### 9.2 Push Model

Nexus pushes events or relevant input outward to the external system when new activity occurs.

Both approaches should be considered valid within the integration model.

The design should remain implementation-neutral at this stage so that different agent connectors can use whichever method fits their architecture best.

---

## 10\. Agent Identity Requirements

An integrated agent should appear in Nexus with a distinct and stable participant identity.

That identity should allow users to understand:

* which agent they are interacting with  
* whether the participant is human, agent, or service  
* which messages came from which participant  
* which policy and approval rules apply to that participant

This matters because the product is specifically meant to let people see participants like Hermes and OpenClaw talking to each other.

The workspace loses meaning if integrated agents become anonymous transport layers.

---

## 11\. Integration Registration Model

Nexus should conceptually support the idea that a new external system can be connected by registering it as an integration-backed participant.

At a conceptual level, this means:

1. create or define the participant identity  
2. associate that participant with an integration method  
3. define relevant policy  
4. allow the participant to begin receiving and proposing communication

This process should be simple enough that adding a new agent does not feel like building a whole new product module.

Ease of onboarding new agents is one of the key design goals of Nexus.

---

## 12\. Integration Trust Model

Not every integrated participant should be equally trusted by default.

The integration model should work together with policy so that:

* an agent may be visible and able to receive messages  
* but still require approval before sending  
* and still be limited, suspended, or blocked if needed

This means integration is not the same as unrestricted authority.

Connecting an external system to Nexus should make it a governed participant, not an automatically trusted actor.

---

## 13\. Agent-to-Agent Interaction Through Integrations

One of the distinctive Nexus goals is to support agent-to-agent communication inside the workspace.

The integration model should therefore allow:

* one agent participant to receive communication originating from another agent  
* that communication to be mediated by Nexus rather than direct opaque side channels  
* policy and approval to shape those exchanges where required  
* the resulting conversation to remain visible in the workspace

This is important because the product value is not merely “many bots connected.” It is visible multi-agent collaboration in one shared environment.

---

## 14\. Human-to-Agent Interaction Through Integrations

The integration model must also preserve the directness of human-to-agent interaction.

From the human point of view, the system should feel like:

* selecting an agent participant  
* sending a message  
* receiving a governed reply through the same workspace

The user should not feel like they are manually operating a transport bridge.

This is a major usability requirement.

---

## 15\. Integration and Policy Visibility

Because governance is central to trust, the integration model should support visible policy understanding.

Admins should be able to inspect:

* whether a participant is integration-backed  
* what type of participant it is  
* what actions it may perform  
* whether outbound responses require approval  
* whether it is limited, suspended, or blocked

This should work cleanly with the policy and moderation model already defined.

---

## 16\. Integration Failure and Resilience

The integration model should assume that external systems may be:

* temporarily offline  
* misconfigured  
* unavailable  
* slow to respond  
* partially functional

Nexus should be designed so that these failures do not break the conceptual clarity of the workspace.

At a conceptual level, this means:

* the participant may still exist even if the integration is unhealthy  
* delivery and response failure should be understandable  
* governance and audit history should still remain intact  
* the UI should not pretend the integration is functioning when it is not

Participants with unhealthy or unavailable integrations should still appear in the workspace, but there should be some indication that they are offline or unavailable.

This supports both transparency and continuity of identity.

---

## 17\. Integration Scope for MVP

For MVP, the integration model should stay focused.

It needs to support:

* agent participants  
* human-to-agent messaging  
* agent-to-agent messaging  
* governed outbound drafting  
* stable participant identity  
* future extensibility

It does not need to fully solve:

* rich service orchestration  
* cross-platform federation  
* external SaaS ecosystem support  
* complex autonomous workflows  
* large-scale connector marketplaces

The MVP should prove that a few meaningful agents can participate well in Nexus.

---

## 18\. Future Integration Evolution

Later versions of Nexus may expand the integration model to include:

* private/invite-only participation contexts  
* service-originated updates  
* richer health or presence reporting  
* connector-specific capability metadata  
* structured action execution  
* cross-system artifact creation  
* more autonomous participant behavior  
* more advanced routing or filtering

But these should extend the approved participant-centered model rather than replace it.

---

## 19\. Summary

The Nexus integration model should work like this:

* external agents and later services connect to Nexus as participants  
* participant identity remains visible and stable  
* integrations are the bridge between external systems and participant identities  
* integration remains conceptually attached to participants for now  
* inbound communication flows from Nexus to the external system  
* outbound communication from agents returns through Nexus as drafts  
* policy and approval govern whether drafts become visible messages  
* pull-based and push-based connector models are both acceptable  
* integration does not imply trust or unrestricted authority  
* agent-to-agent and human-to-agent collaboration should remain visible inside the workspace  
* offline or unhealthy participants should still appear, with some indication of availability state  
* the system should be easy to extend with new participants over time

This model preserves the core product identity of Nexus as a shared collaborative environment rather than a hidden automation layer.

## Section 11: Acceptance Criteria

### Status

Approved

### Purpose

This section defines the minimum conditions that must be true for the Nexus MVP to be considered correct relative to the approved design.

Its purpose is not to create an exhaustive QA matrix. It is to provide a concise implementation target so that later technical decisions and coding work can be judged against a shared standard.

Section 0 through Section 10 are authoritative and govern this section.

---

## 1\. Acceptance Criteria Principle

Nexus MVP should be considered successful if it proves the core product promise:

humans and AI participants can communicate inside one local collaborative workspace with visible identity, shared context, and human-governed agent participation.

The acceptance criteria should therefore measure whether the MVP actually delivers:

* one shared workspace  
* participant-centered communication  
* public, topical, and direct conversation  
* agent participation  
* admin oversight and policy control  
* a usable foundation for future expansion

---

## 2\. Core MVP Acceptance Criteria

The Nexus MVP is acceptable if all of the following are true.

### 2.1 Local Workspace Access

* A human can access Nexus on the local network.  
* A human can log in with an account and enter the workspace.  
* The system distinguishes account access from participant identity.

### 2.2 Shared Workspace Experience

* The main public conversation exists as an always-open shared conversation.  
* The workspace makes it clear that this is the common discussion area for everyone.  
* The workspace does not require users to classify every message into a structured record before participating.

### 2.3 Topical Public Conversations

* A human can create a topical public conversation.  
* Topical conversations appear in a dedicated area separate from the main public conversation.  
* Other participants can discover and join those topical conversations.  
* Topical conversations preserve focused discussion history.

### 2.4 Direct Messaging

* Human-to-human direct messaging works inside Nexus.  
* Human-to-agent direct messaging works inside Nexus.  
* Agent-to-agent messaging is supported inside Nexus.  
* Direct conversations remain part of the same governed workspace rather than external relays.

### 2.5 Visible Participant Model

* Humans and agents appear as distinct participants in Nexus.  
* A participant directory or equivalent surface makes participants visible.  
* Message authorship is clearly attributable to the participant who sent or originated the message.  
* Integrated agents such as Hermes and OpenClaw can appear as distinct identities in the workspace.

### 2.6 Agent Draft and Approval Flow

* An agent can receive conversation input through Nexus.  
* An agent can submit a proposed outbound response back to Nexus.  
* That proposed response is represented as a draft before visible delivery.  
* Policy can require admin approval before the draft is released.  
* The admin can approve, approve with edits, or reject a draft.  
* If approved with edits, the delivered message remains agent-authored and agent-originated.  
* Rejected drafts remain visible to admins only.

### 2.7 Policy and Moderation

* Participant/action-level policy exists and affects behavior.  
* Admin can inspect what a participant is allowed to do.  
* Admin can change policy for a participant.  
* Admin can limit, suspend, block, and restore a participant through real controls, even if the UI is simple.  
* Moderation affects participant behavior in the workspace.

### 2.8 Admin Oversight

* Admin can view pending approval items.  
* Admin can access approval history.  
* Admin can access governance-relevant history such as moderation or policy changes.  
* Admin can inspect direct and public conversations as part of workspace oversight.

### 2.9 Conversation-Centered UX

* The UI makes conversation feel like the primary function of Nexus.  
* The main public conversation and topical conversation discovery are both clearly visible.  
* Governance tools exist, but do not define the entire product experience for ordinary participants.

### 2.10 Integration Foundation

* An external agent can be connected as a participant.  
* That participant can receive Nexus-originated input and return outbound communication through Nexus.  
* The integration path supports policy-governed agent participation.  
* An unavailable or offline integrated participant can still appear in the workspace with some indication of status.

### 2.11 Real-Time Collaboration Feel

* New messages and key conversation changes propagate quickly enough that Nexus feels like a live collaborative workspace rather than a manually refreshed record system.  
* Real-time behavior is sufficient for normal chat-style use, even if the exact transport mechanism is defined later in technical architecture.

---

## 3\. MVP Failure Conditions

The Nexus MVP should be considered incomplete or incorrect if any of the following are true:

* users must manually relay messages between Nexus and agents for core workflows  
* agents are hidden backend utilities rather than visible participants  
* direct messaging is missing for core participant combinations  
* topical conversations do not exist as a distinct collaboration mode  
* admin cannot meaningfully govern agent outbound communication  
* approve-with-edits breaks truthful authorship  
* policy is hard-coded in a way that cannot be adjusted per participant/action  
* moderation is only theoretical and not actually operable  
* the product feels primarily like a workflow tool or admin console rather than a collaborative workspace  
* the interaction model feels too static or delayed to support normal live conversation

---

## 4\. Summary

The Nexus MVP is acceptable if it successfully delivers:

* one local collaborative workspace  
* visible human and agent participants  
* main public conversation  
* public topical conversations  
* direct messaging across key participant types  
* governed agent drafting and response flow  
* real admin policy and moderation control  
* embedded oversight without losing conversation-first product identity  
* live enough updates to feel like actual collaborative messaging

These criteria are intentionally concise.

They exist to keep the design honest when implementation begins.

## Section 12: Technical Architecture / Technology Choices

### Status

Approved

### Purpose

This section defines the recommended implementation stack and technical architecture for the Nexus MVP.

Its purpose is to translate the approved product design into a practical build direction without prematurely overengineering the system.

Section 0 through Section 11 are authoritative and govern this section.

---

## 1\. Technical Architecture Principle

The Nexus MVP technical architecture should optimize for:

* clarity  
* maintainability  
* local-first deployment  
* incremental complexity  
* strong support for conversation and governance workflows

The stack should be serious enough to support a real multi-user internal application, but simple enough that implementation effort stays focused on the actual product.

The architecture should therefore prefer:

* well-understood web technologies  
* clear boundaries between frontend, backend, and database  
* incremental real-time behavior  
* simple deployment in AETHER  
* straightforward integration paths for agents

The MVP should avoid taking on unnecessary complexity before the core collaboration model is proven.

---

## 2\. Recommended MVP Stack

The recommended technical stack for Nexus MVP is:

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

### ORM / Database Layer

* Drizzle

### Deployment

* Docker Compose  
* hosted on Nora  
* exposed internally through Nginx Proxy Manager  
* internal address nexus.aether.lab

### Realtime

* start with simple polling / refresh-based updates  
* evolve to WebSockets after the core message and draft model is stable

### Agent Integration

* HTTP polling first  
* token-authenticated integration access  
* push/webhook models can be added later

---

## 3\. Why This Stack Fits Nexus

### 3.1 React \+ TypeScript \+ Vite

Nexus is a UI-heavy application.

The product’s value depends heavily on:

* public conversation layout  
* topical conversation discovery  
* participant visibility  
* direct messaging  
* admin approval and moderation surfaces

React fits this well because it is strong for interactive interface composition and stateful UI.

TypeScript improves maintainability and consistency across a product with many connected concepts:

* participants  
* conversations  
* drafts  
* approvals  
* policy  
* moderation state

Vite is a better fit than heavier framework choices because Nexus is not primarily:

* a content site  
* a marketing site  
* an SEO-driven product

It is an internal application. Vite keeps the frontend simpler and faster to iterate on.

---

### 3.2 Node.js \+ TypeScript Backend with Express

A Node/TypeScript backend pairs naturally with the chosen frontend stack.

This reduces context switching and allows shared conceptual models across the stack.

Express is the right choice here because:

* you already have experience with it  
* it keeps implementation friction lower  
* it is fully sufficient for the Nexus MVP  
* it supports REST APIs cleanly  
* it can later support WebSocket integration as the product evolves

For Nexus, existing familiarity is a real advantage. Choosing Express increases the chance of building the product well and shipping it sooner.

---

### 3.3 PostgreSQL

PostgreSQL is the right choice for Nexus because the product is:

* multi-user  
* message-heavy  
* audit-aware  
* future-facing  
* likely to grow in complexity over time

Nexus is not just a small single-user utility.

The data model includes:

* accounts  
* participants  
* conversations  
* messages  
* message drafts  
* approvals  
* policy  
* moderation history  
* audit events

That is a relational system with durable history and future reporting needs. PostgreSQL is a much better long-term fit than SQLite for this shape of product.

---

### 3.4 Drizzle

Drizzle is the selected ORM / schema layer for Nexus.

It fits this project well because:

* it keeps implementation close to SQL and schema design  
* it encourages understanding of the relational model  
* it matches a system where the data design matters deeply  
* it works well in a TypeScript stack without hiding the database too much

This makes Drizzle a good fit for both the product and the learning value of the build.

---

### 3.5 Docker Compose on Nora

Nexus is explicitly local-first and intended to live inside AETHER.

Running it on Nora through Docker Compose is the most natural deployment model because it:

* matches the homelab environment  
* supports PostgreSQL cleanly  
* keeps deployment reproducible  
* aligns with other internal services  
* makes reverse-proxy exposure through Nginx Proxy Manager straightforward

Deploying the new Nexus at nexus.aether.lab also fits the stated plan to replace the older prototype currently using that address.

This supports Nexus becoming a real internal service instead of a temporary dev-only experiment.

---

## 4\. Realtime Strategy

Realtime behavior matters because Nexus must feel like a live workspace.

However, full realtime complexity should not dominate the MVP before the core communication model is stable.

The recommended approach is:

### Phase 1

* basic refresh or short-interval polling for new messages and state changes  
* enough responsiveness to feel usable as chat

### Phase 2

* introduce WebSockets for live message delivery, draft state changes, and participant updates  
* only after core message, approval, and policy behavior is stable

This approach keeps the MVP simpler while preserving the future path to a more polished live experience.

---

## 5\. Agent Integration Strategy

The recommended first integration model is:

* HTTP polling  
* token-based authentication  
* outbound agent responses submitted back through API endpoints

This fits the approved product model well.

An agent integration can:

1. poll Nexus for relevant inbound work or messages  
2. process that input externally  
3. submit proposed replies back to Nexus as drafts  
4. receive later status through API reads

This is the simplest implementation path for:

* Hermes  
* OpenClaw  
* desktop tools  
* scripts  
* future local agents

It is much easier to implement early than a complex push architecture.

Push or webhook-based models can be added later without invalidating the MVP design.

---

## 6\. Repo Structure Recommendation

For MVP, avoid unnecessary monorepo complexity.

The recommended layout is:

text nexus/ frontend/ backend/ docker-compose.yml

This structure is preferred because it:

* is simple to reason about  
* maps cleanly to the chosen stack  
* avoids premature tooling complexity  
* is sufficient for the MVP  
* still leaves room for later restructuring if the system grows

Nexus should not begin with organizational complexity for its own sake.

---

## 7\. Suggested Architectural Shape

At a high level, the MVP system should look like this:

1. React frontend  
   * renders workspace UI  
   * handles login/session-aware interaction  
   * displays conversations, participant directory, approval queue, admin controls  
2. Node/TypeScript Express backend  
   * exposes REST API  
   * enforces auth, policy, approvals, moderation logic  
   * mediates message and draft lifecycle  
   * serves integration endpoints for agents  
3. PostgreSQL database  
   * stores durable system state  
   * stores message history and drafts  
   * stores policies, approvals, moderation actions, audit events  
4. Agent connectors  
   * poll backend endpoints  
   * submit outbound drafts  
   * authenticate via integration token  
5. Docker Compose deployment  
   * frontend service  
   * backend service  
   * postgres service  
   * exposed internally through Nginx Proxy Manager to nexus.aether.lab

This is a clean and durable MVP architecture.

---

## 8\. Technical Priorities for MVP

Implementation should prioritize the following in order:

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

This order matters because it keeps the product grounded in core communication and governance before transport polish.

---

## 9\. What the MVP Should Avoid Technically

The MVP should avoid:

* starting with WebSockets before message semantics are stable  
* building a highly abstract event bus too early  
* overcomplicated monorepo tooling  
* introducing multiple backend languages  
* building a generic plugin platform before core integrations work  
* prematurely designing for internet-scale distribution  
* overengineering permissions into a giant rules engine  
* building a complex workflow engine before collaboration is proven

The technical architecture should reflect the same product discipline as the functional design:

simple first, extensible later.

---

## 10\. Risks and Tradeoffs

### Tradeoff 1: Polling first vs full realtime

Polling is simpler and faster to ship. WebSockets feel better long-term.

Recommended posture:

* accept modest inefficiency early  
* preserve simplicity  
* add WebSockets after the conversation model is stable

### Tradeoff 2: Postgres vs SQLite

Postgres adds deployment overhead. But it avoids outgrowing the database too early and better matches the product shape.

Recommended posture:

* accept the extra operational weight  
* gain a more correct foundation

### Tradeoff 3: Drizzle vs heavier abstraction

Drizzle keeps the team closer to schema and SQL design. That may require slightly more intentional database understanding up front.

Recommended posture:

* accept that tradeoff  
* gain stronger control over the core model

### Tradeoff 4: Simple repo vs monorepo

A simple split structure may be less elegant later. But it reduces upfront complexity and is likely better for MVP momentum.

Recommended posture:

* start simpler  
* restructure later only if needed

---

## 11\. Summary

The recommended Nexus MVP technical direction is:

* Frontend: React \+ TypeScript \+ Vite  
* Backend: Node.js \+ TypeScript \+ Express  
* Database: PostgreSQL  
* ORM: Drizzle  
* Deployment: Docker Compose on Nora behind Nginx Proxy Manager  
* Hostname: nexus.aether.lab  
* Realtime: polling first, WebSockets later  
* Agent integration: HTTP polling with token auth  
* Repo structure: one repo with frontend/ and backend/

This stack is strong enough to build a real internal collaborative product while staying disciplined enough to keep the MVP achievable.


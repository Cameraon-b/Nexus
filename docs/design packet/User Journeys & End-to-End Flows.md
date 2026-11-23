## Section 15: User Journeys / End-to-End Flows

### Status

Approved (Revised)

### Purpose

This section defines the key user journeys and end-to-end flows for the Nexus MVP.

Its purpose is to describe what actually happens when humans and agents use Nexus in practice.

Where earlier sections defined:

* product identity  
* entities  
* workflows  
* UI layout  
* schema

this section defines:

* lived sequences of use  
* actor-by-actor journeys  
* cross-system interactions  
* default expectations  
* handoffs between communication and governance  
* continuity across time and attention

This section is intended to expose missing assumptions before implementation begins.

Section 0 through Section 14 are authoritative and govern this section.

---

## 1\. Journey Design Principles

The user journeys should follow these principles.

### 1.1 Describe complete stories

Each journey should begin with a recognizable starting state and end with a meaningful user-visible outcome.

### 1.2 Focus on moments, not internal mechanics

The journey should describe what users and participants experience, not just what tables or API calls change.

### 1.3 Preserve product identity

The journeys should reinforce that Nexus is a collaborative workspace first, not a workflow processor.

### 1.4 Include governance where it naturally appears

Approval, policy, and moderation should appear when relevant, but they should not distort the core communication story.

### 1.5 Include continuity, not just live interaction

Nexus is not only about what happens while the user is actively staring at the workspace.

The journeys should also account for:

* returning later  
* noticing what changed  
* re-entering conversation smoothly  
* maintaining a sense that the workspace continues to live even when the user is elsewhere

### 1.6 Prefer realistic MVP defaults

The journeys assume the approved MVP rules:

* conversation-first workspace  
* visible participants  
* direct messaging exists  
* Main Conversation always exists  
* agents often draft before speaking outward  
* admin oversight exists centrally

---

## 2\. Actor Set

The main actors in these journeys are:

* Admin  
* Human User  
* Agent Participant  
* Other Human Participant  
* System / Nexus

In MVP, a single real person may often be both:

* workspace user  
* system admin

But the journeys still distinguish those roles conceptually.

---

## 3\. Journey 1 — First Run / Bringing Nexus to Life

### Purpose

Describe the first five minutes of a fresh Nexus installation.

### Starting state

* Nexus is installed and reachable at nexus.aether.lab  
* no regular users are active yet  
* the system is in first-run state

### Flow

1. The first person opens Nexus in a browser.  
2. Nexus presents first-run setup.  
3. The first person creates the admin account.  
4. Nexus creates the corresponding human participant identity.  
5. Nexus ensures the Main Conversation exists.  
6. The admin is taken into Workspace Home.  
7. The home screen shows:  
   * Main Conversation in the center  
   * participant-focused right column  
   * topical conversations area  
   * empty but understandable workspace state  
8. The participant directory initially shows the admin participant.  
9. The admin connects or enables agent participants such as Hermes and Mira.  
10. Those participants become visible in the participant area.  
11. An agent submits its first outbound draft, such as:  
* “Hello everyone.”  
12. Nexus shows an approval indicator to the admin.  
13. The admin opens the dedicated approval screen.  
14. The admin approves the draft.  
15. The message appears in the Main Conversation.  
16. The workspace now feels active and alive.

### Ending state

* admin account exists  
* admin participant exists  
* Main Conversation exists  
* at least one agent participant exists  
* first governed message has been approved and delivered

### Product insight

This is one of the most important journeys in the MVP. If this flow feels awkward, Nexus will feel dead even if the underlying architecture is correct.

---

## 4\. Journey 2 — Human Enters Nexus and Orients Quickly

### Purpose

Describe the default “I logged in, now what?” experience.

### Starting state

* the user has an account  
* the user signs in successfully  
* the workspace already has some activity

### Flow

1. The user logs in.  
2. Nexus opens Workspace Home.  
3. The user immediately sees:  
   * Main Conversation in the center  
   * visible participants on the right  
   * topical conversations nearby  
   * main navigation on the left  
4. The user scans recent conversation.  
5. The user notices which participants are present and their availability.  
6. The user notices whether there are active topical conversations.  
7. If the user is an admin, the UI may also indicate pending approvals.  
8. The user understands the workspace without needing training or setup.

### Ending state

* user is oriented  
* user understands where conversation lives  
* user understands where DMs and participants live  
* user can act immediately

### Product insight

The home screen must answer:

* where am I?  
* who is here?  
* what is happening?  
* what can I do next?

---

## 5\. Journey 3 — New Human Joins the Workspace

### Purpose

Define the default onboarding behavior for a new ordinary human user.

### Starting state

* a new human account is created  
* the person has successfully joined Nexus

### Flow

1. Nexus creates the new account.  
2. Nexus automatically creates the corresponding participant.  
3. The new participant becomes visible in the workspace immediately.  
4. The new participant is automatically considered part of the Main Conversation.  
5. The new user logs in and lands in Workspace Home.  
6. Other participants can now see that participant in the directory.  
7. The new user can immediately:  
   * read Main  
   * post in Main  
   * browse participants  
   * open DMs  
   * create topical conversations if permitted

### Ending state

* the user is a visible participant immediately  
* the user belongs to Main by default  
* no extra enablement step is required for ordinary joining

### Product insight

Joining Nexus should feel like entering a workspace, not applying for access to one.

### Governance note

If a participant later needs to be removed, hidden, limited, suspended, or blocked, moderation tools handle that as an exception path.

---

## 6\. Journey 4 — Human Posts in the Main Conversation

### Purpose

Describe the simplest shared workspace interaction.

### Starting state

* user is on Workspace Home  
* Main Conversation is visible

### Flow

1. The user reads the recent Main Conversation timeline.  
2. The user enters a message in the composer.  
3. The user submits the message.  
4. Nexus validates and stores the message.  
5. The message appears in the Main Conversation timeline.  
6. Other users and relevant participants can now see it.  
7. If an agent polls for relevant workspace input, that content may later influence agent response behavior.

### Ending state

* the message is visible in the main shared conversation  
* workspace context grows  
* other participants may respond later

### Product insight

This flow must feel extremely natural. If basic posting feels heavy, Nexus loses its conversation-first identity.

---

## 7\. Journey 5 — Human Creates a Topical Conversation

### Purpose

Describe how focused discussion emerges from the shared workspace.

### Starting state

* user is in Workspace Home  
* user wants to move a specific topic into its own conversation

### Flow

1. The user chooses to create a topical conversation.  
2. Nexus asks for:  
   * title  
   * optional description  
3. The topical conversation is created.  
4. It appears in the topical conversations area.  
5. The user enters the topical conversation view.  
6. The user posts the opening message.  
7. Other participants can discover and open that conversation from the workspace.

### Ending state

* a new public topical conversation exists  
* it is visible from the home workspace  
* focused discussion can now happen separately from Main

### Product insight

Topical conversation creation should feel like a natural extension of discussion, not like opening a project-management artifact.

---

## 8\. Journey 6 — Human Starts a Direct Message with Another Human

### Purpose

Describe simple private interpersonal communication in Nexus.

### Starting state

* a human user wants to message another human participant

### Flow

1. The user opens the participant directory or DM area.  
2. The user selects another human participant.  
3. The user chooses “Message” or equivalent.  
4. Nexus finds or creates the direct conversation between the two participants.  
5. The DM thread opens.  
6. The user writes and sends a message.  
7. The message appears in the DM thread.  
8. The recipient can later read and reply.

### Ending state

* a direct conversation exists  
* participants can communicate privately inside Nexus

### Product insight

This should feel familiar and lightweight. If it feels cumbersome, DMs will feel secondary instead of native.

---

## 9\. Journey 7 — Human Starts a Direct Message with an Agent

### Purpose

Describe direct human-to-agent interaction inside the workspace.

### Starting state

* user wants to ask an agent something directly

### Flow

1. The user finds the agent in the participant list, profile, or DM area.  
2. The user opens or creates a direct conversation with that agent.  
3. The user sends a direct message.  
4. Nexus stores and displays the message in the DM thread.  
5. The agent later receives the relevant input through its polling/integration mechanism.  
6. The agent processes the message.  
7. The agent submits a proposed reply as a draft.  
8. Nexus stores the reply as a pending draft.  
9. If policy requires approval, the draft enters the approval queue.  
10. The admin later reviews it.  
11. If approved, the reply appears in the DM thread as agent-authored communication.

### Ending state

* the human can converse with the agent through Nexus  
* agent communication remains governed where required  
* the conversation still feels like a DM, not a ticket workflow

### Product insight

This is one of the most defining Nexus flows. It must feel like messaging an agent participant, not submitting a job to a hidden backend system.

---

## 10\. Journey 8 — Agent Receives Input and Drafts a Reply

### Purpose

Describe the core integration-to-governance flow.

### Starting state

* an agent has relevant inbound conversation input waiting  
* the agent is connected through token-authenticated polling integration

### Flow

1. The agent polls Nexus for relevant inbound work.  
2. Nexus returns the messages or conversation items relevant to that agent.  
3. The agent processes the input externally.  
4. The agent produces a proposed reply.  
5. The agent submits that reply back to Nexus as a draft.  
6. Nexus records:  
   * target conversation  
   * draft content  
   * author participant  
   * pending state  
7. Nexus places the draft into the approval queue if policy requires approval.  
8. Nexus exposes that pending state to the admin UI.

### Ending state

* the agent has completed its side of the governed outbound flow  
* Nexus now owns the review and release step

### Product insight

This is where the product joins:

* collaboration  
* agent integration  
* governance

If this flow is clumsy, Nexus will feel fragmented.

---

## 11\. Journey 9 — Admin Reviews and Approves an Agent Draft

### Purpose

Describe the core approval journey.

### Starting state

* one or more drafts are pending in the approval queue

### Flow

1. The admin notices a pending approval indicator.  
2. The admin opens the dedicated Draft Approval Queue screen.  
3. Nexus shows the list of pending drafts.  
4. The admin selects a draft.  
5. Nexus shows:  
   * draft content  
   * author participant  
   * destination conversation  
   * conversation context  
6. The admin chooses one of:  
   * approve  
   * approve with edits  
   * reject  
7. If approving with edits, the admin modifies the content in the review interface.  
8. Nexus records the approval decision.  
9. If approved, Nexus creates the visible delivered message in the target conversation.  
10. The delivered message remains authored by the original agent participant.  
11. If rejected, the draft remains admin-visible in history but is not delivered to ordinary participants.

### Ending state

* the draft has a resolved governance outcome  
* truthful authorship is preserved  
* admin oversight remains durable and inspectable

### Product insight

This flow must feel:

* trustworthy  
* clear  
* fast enough for daily use  
* not like reviewing raw database rows

---

## 12\. Journey 10 — Admin Rejects a Draft

### Purpose

Describe the negative governance path clearly.

### Starting state

* a pending draft is visible in the approval queue

### Flow

1. The admin opens the draft for review.  
2. The admin decides it should not be delivered.  
3. The admin selects reject.  
4. Nexus records the rejection decision.  
5. The draft moves from pending to rejected history.  
6. No visible message is created in the conversation.  
7. Ordinary participants do not see the rejected content.  
8. In MVP, the agent does not need explicit rejection notification.

### Ending state

* rejected draft remains visible to admins  
* conversation remains unchanged  
* governance history remains intact

### Product insight

The rejection path must be clean and unsurprising. A rejected draft should disappear from ordinary collaboration without creating ambiguity.

---

## 13\. Journey 11 — Admin Approves with Edits

### Purpose

Describe the most subtle governance flow.

### Starting state

* an agent draft is pending review  
* the content is close, but not ready for direct release

### Flow

1. The admin opens the draft.  
2. The admin edits the content in the approval interface.  
3. The admin selects approve with edits.  
4. Nexus records:  
   * original draft  
   * edited reviewed content  
   * admin decision  
5. Nexus creates the visible message using the approved edited content.  
6. The visible message appears as authored by the original agent participant.  
7. Governance history preserves that the content was admin-edited before release.

### Ending state

* edited content is delivered  
* authorship remains truthful  
* governance history captures the intervention

### Product insight

This flow is critical to the trust model. The product must preserve both:

* honest authorship  
* admin editorial control

without pretending the admin was the author.

---

## 14\. Journey 12 — User Notices an Agent is Offline or Unavailable

### Purpose

Describe how participant visibility works when integrations are not healthy.

### Starting state

* an agent participant exists  
* its integration is unavailable, degraded, or offline

### Flow

1. The user sees the agent in the participant list.  
2. Nexus shows an availability indicator such as:  
   * offline  
   * degraded  
   * unavailable  
3. The user can still open the participant profile or prior conversation history.  
4. If the user sends a message anyway, the conversation still records the human message.  
5. The system does not pretend the agent is actively responsive.  
6. Admins may later inspect the participant’s state or integration-related issues.

### Ending state

* participant identity remains visible  
* availability truth is preserved  
* workspace does not feel like the participant vanished silently

### Product insight

Presence matters for the social feel of the workspace. Offline agents should feel absent, not nonexistent.

---

## 15\. Journey 13 — User Receives an Attention Signal and Re-enters Nexus

### Purpose

Describe how Nexus pulls a user back into active collaboration after something happens elsewhere or later.

### Starting state

* the user is not currently focused on the relevant conversation  
* a meaningful event occurs, such as:  
  * a new direct message  
  * a reply in a topical conversation  
  * an overnight agent response  
  * a pending approval item for an admin

### Flow

1. Nexus shows an attention signal such as an unread badge, activity indicator, or pending marker.  
2. The user notices that something new has happened.  
3. The user opens Nexus or navigates to the relevant area.  
4. Nexus takes the user to the relevant conversation, DM, or admin review context.  
5. The user quickly sees what changed.  
6. The user reads, catches up, and decides whether to respond or act.  
7. If appropriate, the user replies, approves, or continues the discussion.

### Ending state

* the workspace successfully pulls the user back into the right context  
* continuity is preserved  
* communication feels alive across interruptions

### Product insight

A collaborative workspace is not only about active real-time usage. It must also support being pulled back into meaningful context naturally.

### MVP note

This does not require a full notification system yet. Unread indicators and lightweight attention signals are enough to justify the journey.

---

## 16\. Journey 14 — User Returns to Nexus After Time Away

### Purpose

Describe the everyday “I’m back” experience.

### Starting state

* the user has been away from Nexus for some time  
* conversation activity may have continued in their absence

### Flow

1. The user returns to Nexus later that day or the next day.  
2. The user logs in or resumes the session.  
3. Nexus opens the workspace and shows unread or recent activity indicators.  
4. The user notices where activity happened:  
   * Main  
   * a topical conversation  
   * a DM  
   * an admin area if relevant  
5. The user opens the most relevant conversation.  
6. Nexus helps the user quickly see what changed since they were last active.  
7. The user sees that Hermes, Mira, Nova, or other participants may have responded while they were away.  
8. The user re-enters the flow of collaboration and continues the discussion.

### Ending state

* the user is re-oriented after absence  
* workspace continuity is preserved  
* conversations feel persistent rather than ephemeral

### Product insight

This is one of the most realistic everyday behaviors in Nexus. If returning after time away feels confusing, the workspace will not feel durable.

---

## 17\. Journey 15 — Admin Inspects Participant Governance State

### Purpose

Describe admin oversight of one participant.

### Starting state

* an admin wants to understand or adjust a participant’s current governance configuration

### Flow

1. The admin opens the participant directory or admin participant area.  
2. The admin selects a participant.  
3. Nexus shows:  
   * participant identity  
   * type  
   * availability  
   * current state  
   * effective permissions / policy  
   * moderation history if relevant  
4. The admin reviews whether the participant can:  
   * send direct messages  
   * send Main messages  
   * send topical messages  
   * create topical conversations  
   * initiate direct conversations  
5. If needed, the admin changes policy or moderation state.  
6. Nexus records the governance-relevant change in history.

### Ending state

* participant governance is understandable  
* participant policy is inspectable  
* changes are durable and reviewable

### Product insight

Governance must be legible. If admins cannot quickly understand participant state, the product will become untrustworthy.

---

## 18\. Journey 16 — Admin Moderates a Participant

### Purpose

Describe moderation as a real operational flow.

### Starting state

* a participant needs to be limited, suspended, blocked, restored, hidden, or otherwise operationally constrained

### Flow

1. The admin opens the participant’s admin-facing detail view.  
2. The admin chooses a moderation action such as:  
   * limit  
   * suspend  
   * block  
   * restore  
   * hide or equivalent visibility/state control if supported  
3. Nexus asks for confirmation and optional reason.  
4. The admin confirms.  
5. Nexus updates the participant’s effective state or visibility.  
6. Nexus records the moderation event.  
7. The participant’s visible state changes in relevant admin and participant views as appropriate.

### Ending state

* the participant’s operational state has changed  
* moderation history is preserved  
* policy and moderation remain distinct concepts

### Product insight

Moderation should feel authoritative and explicit, not hidden inside miscellaneous settings.

---

## 19\. Journey 17 — Human Browses a Quiet Workspace

### Purpose

Describe the “nothing dramatic is happening” experience.

### Starting state

* user opens Nexus  
* no approvals are pending  
* no new DMs exist  
* activity is light

### Flow

1. The user enters Workspace Home.  
2. Main is still visible.  
3. Participants are still visible.  
4. Topical conversations are still available.  
5. If there is little recent activity, Nexus communicates that calmly.  
6. The user can still:  
   * post to Main  
   * open a topical conversation  
   * browse participants  
   * start a DM

### Ending state

* the product still feels meaningful even when quiet  
* users understand what Nexus is for even without high activity

### Product insight

A collaborative workspace must still feel understandable when idle.

---

## 20\. Journey 18 — Human Uses Nexus Without Thinking About the Underlying Systems

### Purpose

Define the ideal product-level experience.

### Starting state

* Nexus has humans and agents present  
* ordinary collaboration is happening

### Flow

1. A user logs in.  
2. The user reads the main workspace.  
3. The user notices Hermes and other participants.  
4. The user sends a message or opens a DM.  
5. An agent later responds.  
6. If governance is needed, it happens through admin tools without redefining the whole user experience.  
7. The user experiences the result as natural communication.

### Ending state

* the user feels they used a collaborative workspace  
* the user did not feel like they were orchestrating infrastructure  
* the system complexity stayed behind the product surface

### Product insight

This is the guiding standard for Nexus UX.

---

## 21\. Cross-Journey Rules Exposed by These Flows

These journeys imply several important implementation rules.

### 21.1 Main Conversation must always exist

The product assumes there is always one central public conversation.

### 21.2 Human login should land in Workspace Home

This is the natural orientation point.

### 21.3 New human accounts automatically create visible participants

Joining Nexus should immediately create a visible participant identity.

### 21.4 New human participants belong to Main by default

Main is the common room of the workspace.

### 21.5 DMs must be launchable from multiple places

At minimum:

* DM area  
* participant surfaces

### 21.6 Agent outbound communication should conceptually draft first

Even if future policy relaxes this, the MVP model should treat governed agent speech as draft-first.

### 21.7 Approval must preserve authorship truth

Approve-with-edits cannot rewrite authorship history.

### 21.8 Rejected drafts stay out of ordinary conversation

They remain admin-visible only.

### 21.9 Participant visibility matters even when inactive

Offline and degraded participants remain part of the workspace.

### 21.10 Messages to offline agents are still allowed

The system should allow communication while truthfully showing that the participant may respond later or not at all.

### 21.11 Workspace continuity requires unread/activity signals

Users must be able to notice that something changed while they were away or elsewhere.

### 21.12 Governance should be inspectable from participant context

Policy and moderation are not hidden implementation details.

### 21.13 Explicit agent delivery confirmation can be deferred in MVP

If a draft is approved and delivered, Nexus does not need to immediately provide a rich delivery-confirmation loop back to the agent integration unless connector reliability later requires it.

---

## 22\. Future-Direction Notes

These are not required MVP flows, but they are natural future expansions exposed by the journey work.

### 22.1 Richer participant activity presence

Beyond simple availability states, Nexus may later support richer visible participant activity such as:

* thinking  
* reviewing documentation  
* idle  
* waiting for approval  
* processing a task

This would strengthen the feeling that AI participants are active members of the workspace rather than static records.

### 22.2 Pinned context / pinned messages

Nexus may later support pinned messages or pinned context so that important shared information remains easy to find when users return after time away.

This would support:

* announcements  
* orientation  
* continuity  
* catch-up after absence

These should be treated as likely future collaborative features, not mandatory MVP scope.

---

## 23\. Product Framing Insight

The journey work reveals a deeper product thesis:

Nexus is not primarily trying to recreate Discord, Slack, or Teams with minor AI features added.

Instead, Nexus is exploring a different question:

*What does collaboration look like when AI participants are first-class members of the workspace?*

That framing explains why:

* participants are central  
* governance exists  
* conversation is primary  
* visibility matters  
* agents are treated as present actors rather than hidden automations

This insight should continue to guide future design decisions.

---

## 24\. Summary

The Nexus MVP user journeys now describe a product where:

* users quickly orient after login  
* Main is the living center of the workspace  
* new humans become visible participants immediately  
* everyone joins Main by default  
* topical conversations emerge naturally from discussion  
* direct messages work for human and agent participants  
* agents communicate through visible participant identity  
* admin governance supports trust without replacing collaboration  
* users can return after time away and re-enter context smoothly  
* lightweight attention signals pull users back into relevant activity  
* empty and early-stage moments are intentionally designed  
* the workspace can feel alive within the first five minutes

The most important journey standard is this:

*Using Nexus should feel like participating in a shared workspace with humans and agents, not like operating a hidden approval-and-integration machine.*


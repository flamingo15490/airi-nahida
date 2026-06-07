# AIRI Reference Intake Method

This document defines AIRI's long-term method for evaluating reference projects under `D:\参考项目`.
It is intentionally focused on borrow decisions instead of direct implementation planning.
It does not force AIRI to copy external architectures, replace existing ownership boundaries, or commit to a specific phase immediately.

## Summary

The goal is to turn each reference project into one stable output:

- What problem it actually solves
- Which AIRI layer it can improve
- What should be borrowed in the smallest safe way
- What should not be copied
- How the borrowed idea would be accepted without drifting AIRI's current route

This method is evidence-first:

- Do not conclude from README copy alone
- Always cross-check core code structure and runtime boundaries
- Prefer judgement, representation, governance, and observability ideas over wholesale architecture import

## Scope

- Applies to all future reference projects placed under `D:\参考项目`
- Current AIRI route stays intact:
  - External memory source-of-truth remains `D:\AIRI-Memory`
  - Nahida persona stays an independent expression layer
  - Proactive companion sidecar stays externally run unless a separate phase changes that
  - Coordination remains the place where memory, persona, and proactive surfaces are explained and aligned
- Output should be reusable by humans and child agents without inventing new evaluation criteria each time

## Fixed Intake Structure

Every reference project should be analyzed with the same six sections:

1. What problem the project actually solves
2. What its core mechanisms are
3. Which current AIRI layer gets direct value from it
4. Which parts can be borrowed with a minimum absorption strategy
5. Which parts must not be copied directly
6. If absorbed, which AIRI phase or subsystem should own the work

Use this structure even when the project looks small, noisy, or overbuilt.
The purpose is comparability, not praise.

## Evaluation Dimensions

Each reference project should be judged with these five dimensions.
The final rank should be driven by whether the project improves AIRI's current decision quality, not by feature count.

### Architecture Fit

- Does it fit AIRI's current `desktop-only runtime + shared snapshot + renderer store` shape?
- Can the idea be absorbed without rebuilding routing, IPC, or message storage?

### Ownership Boundary Fit

- Does it respect current ownership boundaries?
- Can AIRI borrow the idea without swallowing external memory, sidecar, or persona sovereignty into one monolith?

### Judgement Value

- Does it improve memory judgement, persona boundaries, proactive governance, screen/vision contextualization, or coordination explainability?
- Does it sharpen "when to use", "when not to use", or "why this surface behaved this way"?

### Implementation Cost

- Does the useful part require heavy databases, long-running daemons, full protocol replacement, or a large new internal engine?
- Can the highest-value idea be absorbed as a contract, runtime, UI, or integration refinement instead?

### Acceptance Friendliness

- Can the result be shown and verified in existing settings pages, memory pages, proactive pages, dashboard surfaces, or coordination snapshots?
- Can a user tell that the improvement is real without reading logs or opening devtools?

## Fixed Priority Bands

Every project should end in one of these bands:

- `高价值可吸收`
- `中价值偏产品启发`
- `低价值或仅概念参考`

Banding guidance:

- `高价值可吸收`
  The project contains a judgement layer, representation model, or observability pattern that AIRI can absorb with limited structural change.
- `中价值偏产品启发`
  The project is strong as a product/system inspiration source, but direct code or architecture borrowing would be too heavy or too misaligned.
- `低价值或仅概念参考`
  The project may contain interesting ideas, but the useful parts are too generic, too coupled, or too expensive relative to AIRI's route.

## Borrow / Do Not Borrow Boundaries

### Prefer To Borrow

- Memory candidate stabilization, conflict judgement, evidence accumulation, and dual-summary layering
- Transforming screen or vision observations into structured context instead of raw narration
- Proactive governance patterns such as throttling, suppression reasons, timer explanation, and recent-history visibility
- Clear separation between trusted memory boundaries and persona expression boundaries
- Strong observability, graceful degradation, rollback safety, and acceptance-friendly runtime snapshots

### Do Not Borrow By Default

- Replacing `D:\AIRI-Memory` with a heavy built-in memory engine
- Swallowing external sidecars or services into AIRI as mandatory core dependencies
- Large monolithic companion systems that mix every responsibility into one runtime
- High-frequency autonomous speaking systems as the default route
- Reworking session or message storage only to imitate a reference project's architecture

If a future phase wants one of these forbidden-by-default directions, it should be proposed explicitly as a route change instead of smuggling it in through a "reference optimization" task.

## Fixed Borrow Decision Template

Every analyzed reference project should be summarized in this exact decision shape:

- `结论`
  Is it worth absorbing into AIRI?
- `优先级`
  High / Medium / Low
- `吸收目标`
  Which AIRI layer should improve?
- `最小落地方式`
  Contract / runtime / store / page / supplement / snapshot / integration
- `禁止扩散项`
  What this round must not expand into
- `验收方式`
  Which user-facing page, runtime behavior, or snapshot should make the improvement visible?

Avoid loose conclusions such as "worth considering later".
The output must say:

- Which phase it belongs to
- Whether it is a lead-controller task or a child-task-sized absorption
- Whether it is mostly a contract, runtime, UI, or integration change

## Current First-Batch Defaults

The following four projects are the current first-batch examples for this method.
These are not final implementation commitments; they are default intake conclusions based on the current AIRI route.

### `astrbot_plugin_livingmemory`

- `结论`
  Worth absorbing
- `优先级`
  `高价值可吸收`
- `吸收目标`
  External-memory judgement deepening and candidate lifecycle quality
- `最小落地方式`
  Strengthen candidate ledger policy, dual-summary layering, evidence handling, and retrieval fallback semantics without replacing `D:\AIRI-Memory`
- `禁止扩散项`
  Do not import its full FAISS/BM25/graph engine as AIRI's new core memory system
- `验收方式`
  Memory and coordination surfaces should better explain stable vs tentative vs conflicted memory, and future retrieval should show more trustworthy layering

Recommended AIRI focus:

- Dual factual vs persona-facing summaries
- Candidate lifecycle and decay
- Controlled recall / controlled memorize surfaces
- Retrieval fusion ideas adapted to AIRI's lighter external-memory route

### `astrbot_plugin_screen_companion`

- `结论`
  Worth absorbing
- `优先级`
  `高价值可吸收`
- `吸收目标`
  Vision and screen-usage contextualization
- `最小落地方式`
  Add structured screen usage snapshots, activity summaries, and intent-first visual context instead of copying the whole plugin runtime
- `禁止扩散项`
  Do not turn AIRI into a high-frequency screen monitor or clone the full plugin-style WebUI stack
- `验收方式`
  Vision-related status and future memory/coordination surfaces should show meaningful screen-derived context instead of only raw capture health

Recommended AIRI focus:

- `screen_peek` / `screen_usage_context` style separation
- Activity trajectory summaries
- Intent-first screen assistance
- Screen-derived notes that can safely feed external memory later

### `astrbot_plugin_private_companion`

- `结论`
  Borrow selectively
- `优先级`
  `中价值偏产品启发`
- `吸收目标`
  Companion orchestration concepts and relationship-aware continuity
- `最小落地方式`
  Reuse its layered thinking for later AIRI orchestration design instead of copying its broad monolithic runtime
- `禁止扩散项`
  Do not absorb its all-in-one life-state, schedule, relationship, memory, and action runtime as a single direct blueprint
- `验收方式`
  Future AIRI planning should show cleaner separation between life-state, active decision, passive augmentation, and self-relevance gating

Recommended AIRI focus:

- Life-state vs decision vs reply-enhancement layering
- Relationship continuity
- Self-relevance gating before proactive sharing
- Budgeting and restraint for internal companion reasoning

### `astrbot_plugin_proactive_chat`

- `结论`
  Borrow narrowly
- `优先级`
  `中低价值、治理面板参考`
- `吸收目标`
  Proactive governance visibility and operator-facing explanation
- `最小落地方式`
  Improve proactive observability, timer reasoning, suppression history, and scheduling visibility without copying its wake-the-model architecture
- `禁止扩散项`
  Do not make simulated user-message wakeups or high-frequency proactive loops AIRI's default proactive model
- `验收方式`
  Proactive surfaces should better explain recent events, cooldowns, timers, suppression, and next eligible opportunities

Recommended AIRI focus:

- Recent proactive event explanation
- Timer / reschedule / cancel visibility
- Stronger explanation for why AIRI did or did not speak
- Session/task persistence discipline where it matches AIRI's governance layer

## Acceptance Checklist

This method is working correctly when future project reviews consistently satisfy all of these:

1. The review clearly states which AIRI layer is improved instead of generic admiration
2. The review names a minimum absorption path instead of implying whole-project import
3. The review clearly names what must not be copied so AIRI's route does not drift
4. The review states how a user would accept the change from AIRI's own surfaces
5. Multiple reference projects can be compared side by side with stable priority logic

## Assumptions

- This method is long-term and reusable, not limited to the current four projects
- The output is intentionally a borrow-decision template, not a pure scoring sheet
- AIRI should continue evolving by absorbing judgement, representation, governance, and observability ideas more often than full foreign architectures
- A future phase plan may build directly on the high-priority examples in this document, but that should happen in a separate phase-specific design or implementation plan

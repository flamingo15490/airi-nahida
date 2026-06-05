# External Memory Judgement Contract

This document freezes the phase-nine contract for memory judgement deepening and candidate stabilization.
It is intentionally limited to shared naming, snapshot fields, userData ledger policy, and the minimum callable desktop surface.
It does not implement the full runtime pipeline, page UI, or chat extraction heuristics.

## Scope

- Candidate ledger lives in the AIRI userData directory as JSON
- Candidate ledger does not write into `D:\AIRI-Memory`
- Candidate ledger does not change the external memory repository layout
- Renderer consumes snapshots only
- Existing external-memory write APIs stay intact

## Frozen Shared Names

- `ExternalMemoryObservationSource`
- `ExternalMemoryCandidateKind`
- `ExternalMemoryCandidateStatus`
- `ExternalMemoryCandidateSnapshot`
- `ExternalMemoryConflictSnapshot`
- `ExternalMemoryJudgementSnapshot`
- `ExternalMemoryWriteRecommendation`
- `recordMemoryObservation()`
- `refreshMemoryJudgement()`
- `getMemoryJudgementSnapshot()`
- `clearMemoryCandidateLedger()`

## Frozen Status Semantics

- `tentative`
  Candidate is recorded in the userData ledger but is not yet stable enough for downstream write-back work.
- `stable`
  Candidate is safe for downstream write-review / write-preparation work to treat as stabilized.
- `conflicted`
  Candidate collides with another candidate of the same kind and structured key, so downstream work must not auto-write it.
- `suppressed`
  Candidate is intentionally kept out of stable recommendations, even if it remains visible in the ledger for diagnostics.

## Frozen Judgement Rules

- `user-profile` and `preferences` default to `stable` only after two consistent observations.
- Strong stable phrasing may become `stable` in one observation.
- Actionable `follow-ups` may become `stable` immediately.
- `recent-summary` never enters the stable candidate ledger recommendations.
- `character-knowledge` never participates in stable write-back recommendations.

## Frozen Renderer Snapshot Fields

Renderer-visible access is frozen through `ExternalMemoryUsageSnapshot.judgement` and the direct judgement invokes.

`ExternalMemoryJudgementSnapshot` now freezes:

- `refreshedAt`
- `candidateLedgerPath`
- `summary`
- `reason`
- `statusCounts`
- `candidates`
- `conflicts`
- `recommendations`

`ExternalMemoryCandidateSnapshot` now freezes:

- `id`
- `kind`
- `source`
- `status`
- `text`
- `normalizedText`
- `summary`
- `reason`
- `firstObservedAt`
- `lastObservedAt`
- `observationCount`
- `strongSignal`

`ExternalMemoryConflictSnapshot` now freezes:

- `id`
- `kind`
- `candidateId`
- `structuredKey`
- `existingText`
- `incomingText`
- `summary`
- `reason`

`ExternalMemoryWriteRecommendation` now freezes:

- `kind`
- `candidateIds`
- `addItems`
- `summary`
- `reason`

## Frozen Copy Rules

- `summary` stays one-line and operational.
- `reason` stays user-facing and explains why the current status or recommendation exists.
- Renderer and downstream tasks should reuse snapshot `summary` / `reason` instead of inventing parallel wording.

## Ledger Policy

- Ledger file path is derived from Electron `app.getPath('userData')`
- Current minimal filename: `external-memory-candidate-ledger.json`
- The ledger is AIRI-owned bookkeeping
- The external memory repository remains source-of-truth for actual persisted memory documents

## A/B/C Handoff

### A task can rely on

- Eventa invoke names for the four judgement methods
- `ExternalMemoryUsageSnapshot.judgement`
- `ExternalMemoryJudgementSnapshot.statusCounts`
- `ExternalMemoryJudgementSnapshot.candidates[*].status`
- `ExternalMemoryJudgementSnapshot.candidates[*].reason`
- `ExternalMemoryJudgementSnapshot.conflicts[*]`

### B task can rely on

- `ExternalMemoryJudgementSnapshot.recommendations[*].kind`
- `ExternalMemoryJudgementSnapshot.recommendations[*].candidateIds`
- `ExternalMemoryJudgementSnapshot.recommendations[*].addItems`
- `ExternalMemoryCandidateSnapshot.observationCount`
- `ExternalMemoryCandidateSnapshot.strongSignal`
- `ExternalMemoryJudgementSnapshot.candidateLedgerPath`

### C task can rely on

- Frozen candidate status vocabulary: `tentative`, `stable`, `conflicted`, `suppressed`
- Frozen judgement rules by kind
- `ExternalMemoryCandidateSnapshot.summary`
- `ExternalMemoryCandidateSnapshot.reason`
- `ExternalMemoryWriteRecommendation.summary`
- `ExternalMemoryWriteRecommendation.reason`

## Out Of Scope

- Full runtime stabilization pipeline
- Memory settings page or renderer page implementation
- Direct changes to chat extraction heuristics
- Any write-back that mutates `D:\AIRI-Memory` based on the new judgement snapshot alone

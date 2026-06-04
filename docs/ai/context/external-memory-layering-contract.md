# External Memory Layering Contract

This document freezes the phase-eight contract for external memory layering.
It is intentionally limited to shared types, snapshot fields, and IPC naming.
It does not change chat behavior, memory-root ownership, or renderer page details.

## Scope

- Official external memory root stays `D:\AIRI-Memory`
- No new memory engine
- No directory-layout changes under `D:\AIRI-Memory`
- All values crossing IPC stay JSON-safe
- Renderer consumes snapshots only

## Frozen Layer Order

Highest priority to lowest priority:

1. `stable-profile`
2. `stable-preferences`
3. `active-follow-ups`
4. `recent-context`
5. `character-knowledge`

Source mapping:

- `user-profile` -> `stable-profile`
- `preferences` -> `stable-preferences`
- `follow-ups` -> `active-follow-ups`
- `recent-summary` -> `recent-context`
- `character-knowledge` -> `character-knowledge`

## Frozen Shared Types

Defined in [packages/stage-ui/src/stores/external-memory-shared.ts](/D:/airi-source/airi/packages/stage-ui/src/stores/external-memory-shared.ts:1).

- `ExternalMemoryLayerKind`
- `ExternalMemoryEvidenceSnapshot`
- `ExternalMemoryCitationSnapshot`
- `ExternalMemorySelectionDecision`
- `ExternalMemoryTurnSnapshot`
- `ExternalMemoryWriteCandidate`
- `ExternalMemoryWriteReviewSnapshot`

Re-exported for desktop shared IPC use in [apps/stage-tamagotchi/src/shared/external-memory.ts](/D:/airi-source/airi/apps/stage-tamagotchi/src/shared/external-memory.ts:1).

## Frozen Reason Vocabulary

Shared reason shape:

- `ExternalMemoryReasonSnapshot.code`
- `ExternalMemoryReasonSnapshot.message`

Frozen reason codes:

- `bridge-ready`
- `bridge-degraded`
- `bridge-disabled`
- `bridge-unavailable`
- `document-loaded`
- `document-empty`
- `document-missing`
- `document-read-failed`
- `layer-selected`
- `layer-empty`
- `context-loaded`
- `context-empty`
- `write-written`
- `write-skipped-unavailable`
- `write-skipped-empty`
- `write-skipped-duplicate`
- `write-skipped-not-stable`

Use `createExternalMemoryReasonSnapshot(...)` instead of restating copy in runtime or renderer logic.

## Frozen IPC Surface

Eventa names stay:

- `electronExternalMemoryLoadContext`
- `electronExternalMemoryRefreshContext`
- `electronExternalMemoryGetLastUsage`
- `electronExternalMemoryWriteRecentSummary`
- `electronExternalMemoryWriteFollowUpItems`
- `electronExternalMemoryWriteUserProfilePatch`
- `electronExternalMemoryWritePreferencesPatch`

The new layering contract is carried inside the existing response snapshots.
No new Eventa method is required for phase-eight contract freeze.

## Renderer Snapshot Fields

`ExternalMemoryContextSnapshot` now freezes:

- `reason`
- `layerOrder`
- `usedLayers`
- `turn`

`ExternalMemoryReadSnapshot` now freezes:

- `layer`
- `priority`
- `reason`

`ExternalMemoryWriteResult` now freezes:

- `layer`
- `reason`
- `review`

`ExternalMemoryUsageSnapshot` now freezes:

- `reason`
- `turn`
- `lastWriteReview`

## Memory Page Fields

The future memory page should read only from snapshot fields that already exist in shared types:

- Bridge status: `usage.bridgeState`, `usage.reason`, `usage.summary`
- Turn metadata: `usage.turn.readAt`, `usage.turn.characterName`, `usage.turn.summary`
- Layer ordering: `usage.turn.layerOrder`, `context.usedLayers`, `context.usedKinds`
- Selection decisions: `usage.turn.selections[*]`
- Evidence list: `usage.turn.evidence[*]`
- Citation list: `usage.turn.citations[*]`
- Document diagnostics: `context.documents[*].kind`, `layer`, `priority`, `reason`, `summary`, `available`, `path`, `error`
- Latest write review: `usage.lastWriteReview`
- Recent write history: `usage.lastWrite`, `usage.recentWrites[*]`

## A/B/C Handoff

### A task can rely on

- Layer ordering constants and document-to-layer mapping
- `context.turn`
- `context.usedLayers`
- `documents[*].layer`
- `documents[*].priority`
- `documents[*].reason`

### B task can rely on

- `usage.reason`
- `usage.turn`
- `usage.lastWriteReview`
- `usage.recentWrites`
- `context.documents`

### C task can rely on

- `turn.selections`
- `turn.evidence`
- `turn.citations`
- `writeResult.reason`
- `writeResult.review`

## Safe Areas To Change Next

These areas are safe for subtask work:

- [packages/stage-ui/src/stores/external-memory-shared.ts](/D:/airi-source/airi/packages/stage-ui/src/stores/external-memory-shared.ts:1)
- [apps/stage-tamagotchi/src/shared/external-memory.ts](/D:/airi-source/airi/apps/stage-tamagotchi/src/shared/external-memory.ts:1)
- Renderer memory page or settings page implementation that only reads frozen snapshot fields
- Runtime explanation UI or citation UI that only reads frozen snapshot fields

## Do Not Touch In Parallel

These areas should stay stable while A/B/C branch off:

- [apps/stage-tamagotchi/src/main/services/airi/external-memory/index.ts](/D:/airi-source/airi/apps/stage-tamagotchi/src/main/services/airi/external-memory/index.ts:1)
- Existing Eventa method names in [apps/stage-tamagotchi/src/shared/eventa/index.ts](/D:/airi-source/airi/apps/stage-tamagotchi/src/shared/eventa/index.ts:77)
- External memory root semantics in [apps/stage-tamagotchi/src/shared/external-integrations.ts](/D:/airi-source/airi/apps/stage-tamagotchi/src/shared/external-integrations.ts:23)

If later work needs a behavior change, open a new phase-specific change instead of redefining these field names or reason semantics.

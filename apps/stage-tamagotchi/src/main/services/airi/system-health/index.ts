import type { CompanionCoordinationSnapshot } from '@proj-airi/stage-ui/stores/companion-coordination-shared'
import type { NahidaPersonaSnapshot } from '@proj-airi/stage-ui/stores/nahida-persona-shared'
import type { ProactiveCompanionRuntimeSnapshot } from '@proj-airi/stage-ui/stores/proactive-companion-shared'

import type {
  StartupDiagnosticsItem,
  StartupDiagnosticsResult,
  SubsystemHealthProbe,
  SubsystemHealthStatus,
  SystemHealthSnapshot,
} from '../../../../shared/system-health'
import type { CompanionCoordinationManager } from '../companion-coordination'
import type { ExternalIntegrationsManager } from '../external-integrations'
import type { ExternalMemoryManager } from '../external-memory'
import type { GodotStageManager } from '../godot-stage'
import type { NahidaPersonaManager } from '../nahida-persona'
import type { ProactiveCompanionManager } from '../proactive-companion'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { errorMessageFrom } from '@moeru/std'
import { createDefaultCompanionCoordinationSnapshot } from '@proj-airi/stage-ui/stores/companion-coordination-shared'
import { ipcMain } from 'electron'

import {
  electronSystemHealthGetSnapshot,
  electronSystemHealthRefresh,
  electronSystemHealthRunStartupDiagnostics,
} from '../../../../shared/eventa'
import {
  createDefaultSystemHealthSnapshot,
  deriveOverallHealth,
} from '../../../../shared/system-health'

type MainContext = ReturnType<typeof createContext>['context']

function joinDiagnosticSentences(parts: Array<string | undefined>) {
  return parts
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ')
}

function createProbe(params: {
  kind: SubsystemHealthProbe['kind']
  status: SubsystemHealthStatus
  summary: string
  checkedAt: number
  detail?: string
  actionHint?: string
}): SubsystemHealthProbe {
  return {
    kind: params.kind,
    status: params.status,
    summary: params.summary,
    detail: params.detail,
    actionHint: params.actionHint,
    checkedAt: params.checkedAt,
  }
}

function appendRefreshError(detail: string | undefined, refreshError: string | undefined) {
  if (!refreshError) {
    return detail
  }

  return joinDiagnosticSentences([
    detail,
    `Latest refresh error: ${refreshError}.`,
  ])
}

function downgradeProbeOnRefreshFailure(
  probe: SubsystemHealthProbe,
  refreshError: string | undefined,
  fallback: {
    summary: string
    actionHint?: string
  },
): SubsystemHealthProbe {
  if (!refreshError || probe.status === 'degraded' || probe.status === 'unhealthy') {
    return probe
  }

  return {
    ...probe,
    status: 'degraded',
    summary: fallback.summary,
    actionHint: fallback.actionHint ?? probe.actionHint,
  }
}

function probeMemory(params: {
  checkedAt: number
  refreshError?: string
  usage: ReturnType<ExternalMemoryManager['getLastMemoryUsage']>
}) {
  const detail = appendRefreshError(joinDiagnosticSentences([
    params.usage.summary,
    params.usage.lastReadSummary,
    params.usage.lastReadError ? `Latest read error: ${params.usage.lastReadError}.` : undefined,
    params.usage.lastWrite?.error ? `Latest write error: ${params.usage.lastWrite.error}.` : undefined,
  ]), params.refreshError)

  if (params.usage.bridgeState === 'ready') {
    return downgradeProbeOnRefreshFailure(createProbe({
      kind: 'memory',
      status: 'healthy',
      summary: 'Memory bridge ready.',
      detail,
      checkedAt: params.checkedAt,
    }), params.refreshError, {
      summary: 'Memory bridge needs attention.',
      actionHint: 'Check the memory root path and MCP filesystem bridge in Integrations settings.',
    })
  }

  if (params.usage.bridgeState === 'degraded') {
    return createProbe({
      kind: 'memory',
      status: 'degraded',
      summary: params.usage.context
        ? 'Memory bridge needs attention.'
        : 'Memory bridge unavailable.',
      detail,
      actionHint: 'Check the memory root path and MCP filesystem bridge in Integrations settings.',
      checkedAt: params.checkedAt,
    })
  }

  return createProbe({
    kind: 'memory',
    status: 'unknown',
    summary: 'Memory bridge not active.',
    detail,
    actionHint: params.usage.bridgeState === 'disabled'
      ? 'Enable the memory integration if AIRI should read external memory.'
      : undefined,
    checkedAt: params.checkedAt,
  })
}

function probePersona(params: {
  checkedAt: number
  snapshot: NahidaPersonaSnapshot
}) {
  if (params.snapshot.isActive) {
    return createProbe({
      kind: 'persona',
      status: 'healthy',
      summary: 'Nahida persona active.',
      detail: params.snapshot.summary,
      checkedAt: params.checkedAt,
    })
  }

  if (!params.snapshot.enabled) {
    return createProbe({
      kind: 'persona',
      status: 'unknown',
      summary: 'Nahida persona inactive.',
      detail: params.snapshot.summary,
      actionHint: 'Enable the Nahida persona layer if you want this voice overlay active.',
      checkedAt: params.checkedAt,
    })
  }

  if (!params.snapshot.activeCardName && !params.snapshot.activeDisplayModelName) {
    return createProbe({
      kind: 'persona',
      status: 'unknown',
      summary: 'Nahida persona waiting for target.',
      detail: params.snapshot.summary,
      actionHint: 'Open a Nahida card or choose a Nahida display model to verify this layer.',
      checkedAt: params.checkedAt,
    })
  }

  return createProbe({
    kind: 'persona',
    status: 'degraded',
    summary: 'Nahida persona target mismatch.',
    detail: params.snapshot.summary,
    actionHint: 'Switch to a Nahida card or display model, or disable the persona layer.',
    checkedAt: params.checkedAt,
  })
}

function probeProactive(params: {
  checkedAt: number
  refreshError?: string
  runtime: ProactiveCompanionRuntimeSnapshot
}) {
  const detail = appendRefreshError(joinDiagnosticSentences([
    params.runtime.summary,
    params.runtime.lastFailureReason ? `Latest failure: ${params.runtime.lastFailureReason}.` : undefined,
    params.runtime.sidecarSummary ? `Sidecar: ${params.runtime.sidecarSummary}.` : undefined,
  ]), params.refreshError)

  if (params.runtime.state === 'ready') {
    return downgradeProbeOnRefreshFailure(createProbe({
      kind: 'proactive',
      status: 'healthy',
      summary: 'Proactive companion ready.',
      detail,
      checkedAt: params.checkedAt,
    }), params.refreshError, {
      summary: 'Proactive companion needs attention.',
      actionHint: 'Check the companion-sidecar connection and proactive reminder settings.',
    })
  }

  if (params.runtime.state === 'degraded') {
    return createProbe({
      kind: 'proactive',
      status: 'degraded',
      summary: 'Proactive companion needs attention.',
      detail,
      actionHint: 'Check the companion-sidecar connection and proactive reminder settings.',
      checkedAt: params.checkedAt,
    })
  }

  return createProbe({
    kind: 'proactive',
    status: 'unknown',
    summary: 'Proactive companion not active.',
    detail,
    actionHint: params.runtime.state === 'disabled'
      ? 'Enable proactive companion settings if AIRI should deliver sidecar reminders.'
      : undefined,
    checkedAt: params.checkedAt,
  })
}

function probeCoordination(params: {
  checkedAt: number
  refreshError?: string
  snapshot: CompanionCoordinationSnapshot
}) {
  const detail = appendRefreshError(joinDiagnosticSentences([
    params.snapshot.summary,
    params.snapshot.reason.message,
  ]), params.refreshError)

  if (params.snapshot.status === 'ready') {
    return downgradeProbeOnRefreshFailure(createProbe({
      kind: 'coordination',
      status: 'healthy',
      summary: 'Coordination aligned.',
      detail,
      checkedAt: params.checkedAt,
    }), params.refreshError, {
      summary: 'Coordination needs attention.',
      actionHint: 'Refresh memory, persona, and proactive settings to realign the coordination surfaces.',
    })
  }

  if (params.snapshot.status === 'attention') {
    return createProbe({
      kind: 'coordination',
      status: params.snapshot.attentionCount > 1 ? 'unhealthy' : 'degraded',
      summary: params.snapshot.attentionCount > 1
        ? 'Coordination blocked.'
        : 'Coordination needs attention.',
      detail,
      actionHint: 'Refresh memory, persona, and proactive settings to realign the coordination surfaces.',
      checkedAt: params.checkedAt,
    })
  }

  return createProbe({
    kind: 'coordination',
    status: 'unknown',
    summary: 'Coordination inactive.',
    detail,
    checkedAt: params.checkedAt,
  })
}

function probeIntegrations(params: {
  checkedAt: number
  refreshErrors: string[]
  snapshots: ReturnType<ExternalIntegrationsManager['getSnapshots']>
}) {
  const enabledSnapshots = params.snapshots.filter(snapshot => snapshot.config.enabled)
  const readyCount = enabledSnapshots.filter(snapshot => snapshot.status.state === 'ready').length
  const failingSnapshots = enabledSnapshots.filter((snapshot) => {
    return snapshot.status.state === 'degraded'
      || snapshot.status.state === 'not-configured'
  })
  const unknownSnapshots = enabledSnapshots.filter(snapshot => snapshot.status.state === 'unknown')
  const detail = joinDiagnosticSentences([
    enabledSnapshots.length > 0
      ? enabledSnapshots
          .map(snapshot => `${snapshot.kind}: ${snapshot.status.summary}`)
          .join(' ')
      : 'No external integrations are enabled.',
    ...params.refreshErrors.map(message => `Latest refresh error: ${message}.`),
  ])

  if (enabledSnapshots.length === 0) {
    return createProbe({
      kind: 'integrations',
      status: 'unknown',
      summary: 'External integrations not active.',
      detail,
      actionHint: 'Enable an integration in Settings if AIRI should rely on external bridges.',
      checkedAt: params.checkedAt,
    })
  }

  if (failingSnapshots.length === 0 && unknownSnapshots.length === 0) {
    return createProbe({
      kind: 'integrations',
      status: 'healthy',
      summary: 'External integrations ready.',
      detail,
      checkedAt: params.checkedAt,
    })
  }

  if (readyCount === 0 && (failingSnapshots.length > 0 || params.refreshErrors.length > 0)) {
    return createProbe({
      kind: 'integrations',
      status: 'unhealthy',
      summary: 'External integrations unavailable.',
      detail,
      actionHint: 'Open Integrations settings and probe the failing bridges.',
      checkedAt: params.checkedAt,
    })
  }

  if (failingSnapshots.length > 0 || params.refreshErrors.length > 0) {
    return createProbe({
      kind: 'integrations',
      status: 'degraded',
      summary: 'External integrations partial.',
      detail,
      actionHint: 'Open Integrations settings and probe the failing bridges.',
      checkedAt: params.checkedAt,
    })
  }

  return createProbe({
    kind: 'integrations',
    status: 'unknown',
    summary: 'External integrations not verified.',
    detail,
    checkedAt: params.checkedAt,
  })
}

function probeVision(params: {
  checkedAt: number
  status: ReturnType<GodotStageManager['getStatus']>
}) {
  if (params.status.state === 'running' && !params.status.lastError) {
    return createProbe({
      kind: 'vision',
      status: 'healthy',
      summary: 'Vision runtime ready.',
      detail: 'The desktop vision runtime is running.',
      checkedAt: params.checkedAt,
    })
  }

  if (params.status.state === 'error') {
    return createProbe({
      kind: 'vision',
      status: 'unhealthy',
      summary: 'Vision runtime failed.',
      detail: params.status.lastError ?? 'Vision runtime entered an error state.',
      actionHint: 'Restart the desktop stage or inspect the latest stage error before retrying vision features.',
      checkedAt: params.checkedAt,
    })
  }

  if (params.status.state === 'starting' || params.status.state === 'stopping') {
    return createProbe({
      kind: 'vision',
      status: 'degraded',
      summary: 'Vision runtime changing state.',
      detail: `The desktop vision runtime is currently ${params.status.state}.`,
      actionHint: 'Wait for the desktop stage to settle, then refresh health again.',
      checkedAt: params.checkedAt,
    })
  }

  return createProbe({
    kind: 'vision',
    status: 'unknown',
    summary: 'Vision runtime not active.',
    detail: 'The desktop vision runtime is currently stopped, so capture and processing health cannot be verified yet.',
    actionHint: 'Start the desktop stage before relying on vision features.',
    checkedAt: params.checkedAt,
  })
}

function toDiagnosticsMessage(probe: SubsystemHealthProbe) {
  if (probe.status === 'unhealthy' && probe.detail) {
    return probe.detail
  }

  return probe.summary
}

function buildStartupDiagnosticsItems(
  probes: SubsystemHealthProbe[],
): Pick<StartupDiagnosticsResult, 'warnings' | 'failures' | 'passed'> {
  const warnings: StartupDiagnosticsItem[] = []
  const failures: StartupDiagnosticsItem[] = []

  for (const probe of probes) {
    if (probe.status === 'degraded') {
      warnings.push({
        kind: probe.kind,
        message: probe.summary,
      })
      continue
    }

    if (probe.status === 'unhealthy') {
      failures.push({
        kind: probe.kind,
        message: toDiagnosticsMessage(probe),
      })
    }
  }

  return {
    warnings,
    failures,
    passed: failures.length === 0,
  }
}

/**
 * Desktop system-health manager that reuses existing subsystem runtimes to
 * produce frozen health probes without redefining shared contracts.
 *
 * Use when:
 * - Renderer windows need a unified health snapshot across phase-seven subsystems
 * - Startup diagnostics should reuse the same probe production rules as manual refreshes
 *
 * Expects:
 * - Each subsystem manager already owns its own runtime/config/probe logic
 * - Vision remains renderer-owned until a trustworthy main-process snapshot exists
 *
 * Returns:
 * - One manager that exposes cached reads, live refreshes, and startup diagnostics
 */
export interface SystemHealthManager {
  getSnapshot: () => Promise<SystemHealthSnapshot>
  refresh: () => Promise<SystemHealthSnapshot>
  runStartupDiagnostics: () => Promise<StartupDiagnosticsResult>
}

export function createSystemHealthManager(params: {
  externalIntegrationsManager: ExternalIntegrationsManager
  proactiveCompanionManager: ProactiveCompanionManager
  externalMemoryManager: ExternalMemoryManager
  godotStageManager: GodotStageManager
  nahidaPersonaManager: NahidaPersonaManager
  companionCoordinationManager: CompanionCoordinationManager
}): SystemHealthManager {
  let lastSnapshot = createDefaultSystemHealthSnapshot()
  let startupDiagnosticsComplete = false
  let runningStartupDiagnosticsPromise: Promise<StartupDiagnosticsResult> | undefined

  async function refreshSignals() {
    const integrationRefreshResults = await Promise.allSettled([
      params.externalIntegrationsManager.probeNow('memory'),
      params.externalIntegrationsManager.probeNow('companion-sidecar'),
    ])

    const integrationRefreshErrors = integrationRefreshResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => errorMessageFrom(result.reason) ?? 'Unknown error')

    const memoryRefreshResult = await params.externalMemoryManager.refreshMemoryContext().then(
      () => undefined,
      error => errorMessageFrom(error) ?? 'Unknown error',
    )
    const proactiveRefreshResult = await params.proactiveCompanionManager.refreshRuntime().then(
      () => undefined,
      error => errorMessageFrom(error) ?? 'Unknown error',
    )
    const coordinationRefreshResult = await params.companionCoordinationManager.refresh().then(
      snapshot => ({
        error: undefined,
        snapshot,
      }),
      async error => ({
        error: errorMessageFrom(error) ?? 'Unknown error',
        snapshot: await params.companionCoordinationManager.getSnapshot().catch(() => {
          return createDefaultCompanionCoordinationSnapshot()
        }),
      }),
    )

    return {
      integrationRefreshErrors,
      memoryRefreshError: memoryRefreshResult,
      proactiveRefreshError: proactiveRefreshResult,
      coordinationRefreshError: coordinationRefreshResult.error,
      coordinationSnapshot: coordinationRefreshResult.snapshot,
    }
  }

  function buildSnapshot(paramsForBuild: {
    startupPhase: boolean
    integrationRefreshErrors: string[]
    memoryRefreshError?: string
    proactiveRefreshError?: string
    coordinationRefreshError?: string
    coordinationSnapshot: CompanionCoordinationSnapshot
  }) {
    const checkedAt = Date.now()
    const probes: SubsystemHealthProbe[] = [
      probeMemory({
        checkedAt,
        refreshError: paramsForBuild.memoryRefreshError,
        usage: params.externalMemoryManager.getLastMemoryUsage(),
      }),
      probePersona({
        checkedAt,
        snapshot: params.nahidaPersonaManager.getSnapshot(),
      }),
      probeProactive({
        checkedAt,
        refreshError: paramsForBuild.proactiveRefreshError,
        runtime: params.proactiveCompanionManager.getRuntimeSnapshot(),
      }),
      probeCoordination({
        checkedAt,
        refreshError: paramsForBuild.coordinationRefreshError,
        snapshot: paramsForBuild.coordinationSnapshot,
      }),
      probeIntegrations({
        checkedAt,
        refreshErrors: paramsForBuild.integrationRefreshErrors,
        snapshots: params.externalIntegrationsManager.getSnapshots(),
      }),
      probeVision({
        checkedAt,
        status: params.godotStageManager.getStatus(),
      }),
    ]

    return {
      overall: deriveOverallHealth(probes),
      subsystems: probes,
      startupPhase: paramsForBuild.startupPhase,
      checkedAt,
    } satisfies SystemHealthSnapshot
  }

  async function refresh() {
    const refreshResults = await refreshSignals()
    const snapshot = buildSnapshot({
      startupPhase: !startupDiagnosticsComplete,
      ...refreshResults,
    })

    lastSnapshot = snapshot
    return snapshot
  }

  async function getSnapshot() {
    if (lastSnapshot.subsystems.length > 0) {
      return lastSnapshot
    }

    return await refresh()
  }

  async function runStartupDiagnostics() {
    if (runningStartupDiagnosticsPromise) {
      return await runningStartupDiagnosticsPromise
    }

    const pendingDiagnostics = (async () => {
      const startedAt = Date.now()
      const snapshot = await refresh()
      const startupSnapshot: SystemHealthSnapshot = {
        ...snapshot,
        startupPhase: false,
      }
      const diagnostics = buildStartupDiagnosticsItems(startupSnapshot.subsystems)

      startupDiagnosticsComplete = true
      lastSnapshot = startupSnapshot
      return {
        ...diagnostics,
        duration: Date.now() - startedAt,
      }
    })()

    runningStartupDiagnosticsPromise = pendingDiagnostics

    try {
      return await pendingDiagnostics
    }
    finally {
      if (runningStartupDiagnosticsPromise === pendingDiagnostics) {
        runningStartupDiagnosticsPromise = undefined
      }
    }
  }

  return {
    getSnapshot,
    refresh,
    runStartupDiagnostics,
  }
}

export function createSystemHealthService(params: {
  context?: MainContext
  manager: SystemHealthManager
}) {
  const context = params.context ?? createContext(ipcMain).context

  defineInvokeHandler(context, electronSystemHealthGetSnapshot, async () => {
    return await params.manager.getSnapshot()
  })

  defineInvokeHandler(context, electronSystemHealthRefresh, async () => {
    return await params.manager.refresh()
  })

  defineInvokeHandler(context, electronSystemHealthRunStartupDiagnostics, async () => {
    return await params.manager.runStartupDiagnostics()
  })
}

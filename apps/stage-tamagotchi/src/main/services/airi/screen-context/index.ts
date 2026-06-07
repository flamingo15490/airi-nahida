import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ScreenContextRuntimeSnapshot,
  ScreenContextRuntimeSnapshotEntry,
  ScreenContextSettings,
} from '../../../../shared/screen-context'

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { powerMonitor } from 'electron'
import {
  literal,
  number,
  object,
  picklist,
} from 'valibot'

import {
  electronScreenContextClearHistory,
  electronScreenContextGetRuntimeSnapshot,
  electronScreenContextLoadSettings,
  electronScreenContextRefreshRuntime,
  electronScreenContextSaveSettings,
} from '../../../../shared/eventa'
import {
  createDefaultScreenContextConfigFile,
  createDefaultScreenContextRuntimeSnapshot,
  createDefaultScreenContextSettings,
  normalizeScreenContextSettings,
  SCREEN_CONTEXT_CONFIG_VERSION,
} from '../../../../shared/screen-context'
import { createConfig } from '../../../libs/electron/persistence'

type MainContext = ReturnType<typeof createContext>['context']

const LEDGER_FILE_NAME = 'screen-context-history.json'

/**
 * Screen-context main-process manager that composes system-idle-assisted presence
 * detection with a rolling history ledger.
 *
 * In vision-only mode the main process returns degraded placeholders; the renderer
 * overlays real data via the useScreenContextStore fallback to the vision store.
 *
 * Call stack:
 *
 * createScreenContextManager
 *   -> {@link refreshRuntime}
 *     -> {@link buildRuntimeSnapshot}
 *       -> {@link buildPeek}
 *       -> {@link buildPresenceFromIdle}
 */
export interface ScreenContextManager {
  loadSettings: () => ScreenContextSettings
  saveSettings: (settings: ScreenContextSettings) => ScreenContextSettings
  getRuntimeSnapshot: () => ScreenContextRuntimeSnapshot
  refreshRuntime: () => Promise<ScreenContextRuntimeSnapshot>
  clearHistory: () => Promise<ScreenContextRuntimeSnapshot>
}

interface LedgerFile {
  version: 1
  entries: ScreenContextRuntimeSnapshotEntry[]
}

const screenContextSettingsSchema = object({
  sourceMode: picklist(['vision-only', 'system-idle-assisted']),
  historyLimit: number(),
  staleThresholdMs: number(),
})

const screenContextConfigFileSchema = object({
  version: literal(SCREEN_CONTEXT_CONFIG_VERSION),
  settings: screenContextSettingsSchema,
})

async function readLedgerFile(path: string): Promise<LedgerFile> {
  try {
    if (!existsSync(path))
      return { version: 1, entries: [] }
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<LedgerFile>
    if (parsed.version === 1 && Array.isArray(parsed.entries))
      return { version: 1, entries: parsed.entries }
    return { version: 1, entries: [] }
  }
  catch {
    return { version: 1, entries: [] }
  }
}

async function writeLedgerFile(path: string, ledger: LedgerFile): Promise<void> {
  await writeFile(path, JSON.stringify(ledger, null, 2), 'utf-8')
}

/**
 * Builds a screen peek snapshot.
 *
 * In vision-only mode, the main process cannot directly access vision data,
 * so returns a degraded placeholder. The renderer-side fallback in
 * useScreenContextStore will overlay real vision data from the processing store.
 *
 * In system-idle-assisted mode, derives a basic presence-based summary.
 */
function buildPeek(
  sourceMode: ScreenContextSettings['sourceMode'],
): ScreenContextRuntimeSnapshot['latestPeek'] {
  if (sourceMode === 'system-idle-assisted') {
    try {
      const idleSeconds = powerMonitor.getSystemIdleTime()
      if (idleSeconds < 60) {
        return {
          summary: '用户当前活跃。',
          source: 'system-idle-assisted',
          freshness: 0,
          confidence: 0.6,
          reason: 'system-active',
        }
      }
      if (idleSeconds < 300) {
        return {
          summary: '用户空闲。',
          source: 'system-idle-assisted',
          freshness: idleSeconds,
          confidence: 0.5,
          reason: 'system-idle',
        }
      }
      return {
        summary: '用户离开。',
        source: 'system-idle-assisted',
        freshness: idleSeconds,
        confidence: 0.4,
        reason: 'system-away',
      }
    }
    catch {
      return {
        summary: '系统空闲检测不可用。',
        source: 'system-idle-assisted',
        freshness: -1,
        confidence: 0,
        reason: 'system-idle-unavailable',
      }
    }
  }

  // vision-only: main process returns degraded placeholder;
  // renderer overlays real data via useScreenContextStore fallback
  return {
    summary: '视觉数据需要从渲染进程获取。',
    source: 'vision-only',
    freshness: -1,
    confidence: 0,
    reason: 'vision-delegated-to-renderer',
  }
}

/**
 * Derives a presence state from Electron's system idle time.
 *
 * When sourceMode is 'vision-only', always returns 'unknown'.
 * When sourceMode is 'system-idle-assisted', maps idle seconds to a presence state.
 */
function buildPresenceFromIdle(sourceMode: ScreenContextSettings['sourceMode']): ScreenContextRuntimeSnapshot['presence'] {
  if (sourceMode !== 'system-idle-assisted')
    return 'unknown'

  try {
    const idleSeconds = powerMonitor.getSystemIdleTime()
    if (idleSeconds < 60)
      return 'active'
    if (idleSeconds < 300)
      return 'idle'
    return 'away'
  }
  catch {
    return 'unknown'
  }
}

export function createScreenContextManager(params: {
  userDataPath: string
}): ScreenContextManager {
  const ledgerPath = join(params.userDataPath, LEDGER_FILE_NAME)
  const defaultConfig = createDefaultScreenContextConfigFile()

  const configStore = createConfig('screen-context', 'v1.json', screenContextConfigFileSchema, {
    default: defaultConfig,
    autoHeal: true,
  })

  configStore.setup()

  let cachedSnapshot = createDefaultScreenContextRuntimeSnapshot()

  function getSettings(): ScreenContextSettings {
    const stored = configStore.get()
    if (stored?.settings)
      return normalizeScreenContextSettings(stored.settings)
    return createDefaultScreenContextSettings()
  }

  function saveSettings(next: ScreenContextSettings): ScreenContextSettings {
    const normalized = normalizeScreenContextSettings(next)
    configStore.update({
      version: SCREEN_CONTEXT_CONFIG_VERSION,
      settings: normalized,
    })
    return normalized
  }

  async function buildRuntimeSnapshot(): Promise<ScreenContextRuntimeSnapshot> {
    const settings = getSettings()
    const now = Date.now()
    const peek = buildPeek(settings.sourceMode)
    const presence = buildPresenceFromIdle(settings.sourceMode)

    const presenceLabelMap: Record<ScreenContextRuntimeSnapshot['presence'], string> = {
      active: '用户活跃',
      idle: '用户空闲',
      away: '用户离开',
      unknown: '状态未知',
    }

    const trajectorySummary = peek
      ? `${presenceLabelMap[presence]}。${peek.summary}`
      : presenceLabelMap[presence]

    const recentAppsOrSites: string[] = []
    if (peek && peek.confidence > 0.3) {
      const appMatch = peek.summary.match(/(?:在|using|looking at|viewing)\s+(.{2,40}?)(?:\s+[中with]|$)/i)
      if (appMatch?.[1])
        recentAppsOrSites.push(appMatch[1].trim())
    }

    const usageContext = {
      trajectorySummary,
      recentAppsOrSites,
      presence,
      updatedAt: now,
    }

    const entry: ScreenContextRuntimeSnapshotEntry = {
      timestamp: now,
      sourceMode: settings.sourceMode,
      presence,
      summary: peek?.summary || trajectorySummary,
    }

    const ledger = await readLedgerFile(ledgerPath)
    ledger.entries = [entry, ...ledger.entries].slice(0, settings.historyLimit)
    await writeLedgerFile(ledgerPath, ledger)

    cachedSnapshot = {
      sourceMode: settings.sourceMode,
      presence,
      latestPeek: peek,
      latestUsageContext: usageContext,
      recentHistory: ledger.entries,
      refreshedAt: now,
    }

    return cachedSnapshot
  }

  function getRuntimeSnapshot(): ScreenContextRuntimeSnapshot {
    return cachedSnapshot
  }

  async function refreshRuntime(): Promise<ScreenContextRuntimeSnapshot> {
    return await buildRuntimeSnapshot()
  }

  async function clearHistory(): Promise<ScreenContextRuntimeSnapshot> {
    await writeLedgerFile(ledgerPath, { version: 1, entries: [] })
    cachedSnapshot = {
      ...cachedSnapshot,
      recentHistory: [],
      refreshedAt: Date.now(),
    }
    return cachedSnapshot
  }

  return {
    loadSettings: getSettings,
    saveSettings,
    getRuntimeSnapshot,
    refreshRuntime,
    clearHistory,
  }
}

export function createScreenContextService(params: {
  context: MainContext
  manager: ScreenContextManager
}) {
  defineInvokeHandler(params.context, electronScreenContextLoadSettings, async () => {
    return params.manager.loadSettings()
  })

  defineInvokeHandler(params.context, electronScreenContextSaveSettings, async (settings) => {
    return params.manager.saveSettings(settings)
  })

  defineInvokeHandler(params.context, electronScreenContextGetRuntimeSnapshot, async () => {
    return params.manager.getRuntimeSnapshot()
  })

  defineInvokeHandler(params.context, electronScreenContextRefreshRuntime, async () => {
    return await params.manager.refreshRuntime()
  })

  defineInvokeHandler(params.context, electronScreenContextClearHistory, async () => {
    return await params.manager.clearHistory()
  })
}

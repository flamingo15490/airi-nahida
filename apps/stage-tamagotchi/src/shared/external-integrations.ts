import { safeDestr } from 'destr'
import {
  boolean,
  literal,
  minLength,
  object,
  optional,
  pipe,
  safeParse,
  string,
  union,
} from 'valibot'

export const EXTERNAL_INTEGRATIONS_CONFIG_VERSION = 1

export type ExternalIntegrationKind = 'memory' | 'companion-sidecar'
export type ExternalIntegrationState = 'ready' | 'degraded' | 'disabled' | 'not-configured' | 'unknown'

/**
 * Memory integration settings frozen around the current MCP-backed filesystem workflow.
 *
 * Use when:
 * - AIRI should treat `D:\AIRI-Memory` as the expected external long-term memory root
 * - The desktop integration layer needs to know which MCP servers represent the memory bridge
 *
 * Expects:
 * - `rootPath` points to the external memory directory AIRI already collaborates with
 * - `filesystemServerName` references the MCP filesystem server that exposes that directory
 *
 * Returns:
 * - N/A
 */
export interface ExternalMemoryIntegrationConfig {
  kind: 'memory'
  enabled: boolean
  rootPath: string
  filesystemServerName: string
  obsidianServerName?: string
}

/**
 * Sidecar integration settings for the user's existing companion-sidecar status endpoint.
 *
 * Use when:
 * - AIRI should probe an already-running external companion sidecar
 * - The external sidecar exposes a lightweight HTTP status or health endpoint
 *
 * Expects:
 * - `probeUrl` is the exact status endpoint currently used in the local setup
 * - `probeTimeoutMs` is long enough for a local service but short enough to fail fast
 *
 * Returns:
 * - N/A
 */
export interface ExternalCompanionSidecarConfig {
  kind: 'companion-sidecar'
  enabled: boolean
  moduleName: string
  pluginId: string
  expectedWsUrl?: string
}

export type ExternalIntegrationConfig = ExternalMemoryIntegrationConfig | ExternalCompanionSidecarConfig

/**
 * Persisted desktop-only integration config file.
 */
export interface ExternalIntegrationConfigFile {
  version: typeof EXTERNAL_INTEGRATIONS_CONFIG_VERSION
  integrations: {
    'memory': ExternalMemoryIntegrationConfig
    'companion-sidecar': ExternalCompanionSidecarConfig
  }
}

/**
 * Last known user-facing integration status.
 *
 * Use when:
 * - The settings page needs a stable summary without re-deriving probe output every render
 * - AIRI should explain graceful degradation instead of failing silently
 *
 * Expects:
 * - `checkedAt` is updated whenever a new status was derived
 * - `lastSuccessAt` is only updated after a successful probe
 *
 * Returns:
 * - N/A
 */
export interface ExternalIntegrationStatus {
  kind: ExternalIntegrationKind
  state: ExternalIntegrationState
  summary: string
  checkedAt?: number
  lastSuccessAt?: number
  error?: string
}

/**
 * Detailed result of one manual or automatic probe attempt.
 *
 * Use when:
 * - The settings page needs richer diagnostics than the compact status string
 * - AIRI wants to preserve why a specific integration was considered degraded
 *
 * Expects:
 * - `details` contains JSON-safe values only
 *
 * Returns:
 * - N/A
 */
export interface ExternalIntegrationProbeResult {
  kind: ExternalIntegrationKind
  ok: boolean
  checkedAt: number
  summary: string
  error?: string
  details?: Record<string, unknown>
}

/**
 * Full integration snapshot returned to renderer consumers.
 *
 * Use when:
 * - Settings stores need both the editable config and the latest status in one payload
 *
 * Expects:
 * - `config` reflects the latest persisted config after normalization
 *
 * Returns:
 * - N/A
 */
export interface ExternalIntegrationSnapshot {
  kind: ExternalIntegrationKind
  config: ExternalIntegrationConfig
  status: ExternalIntegrationStatus
  lastProbe?: ExternalIntegrationProbeResult
}

/**
 * Result returned after importing the current desktop AIRI MCP config into the source-build profile.
 *
 * Use when:
 * - The renderer should show where the config came from and where it was written
 * - AIRI should immediately refresh integration status after a deterministic import step
 *
 * Expects:
 * - `sourceProfilePath` is the legacy desktop AIRI data directory that was read
 * - `targetProfilePath` is the current source-build AIRI data directory that was updated
 *
 * Returns:
 * - N/A
 */
export interface ExternalIntegrationImportResult {
  sourceProfilePath: string
  sourceMcpPath: string
  sourceServerChannelConfigPath?: string
  targetProfilePath: string
  targetMcpPath: string
  targetServerChannelConfigPath?: string
  snapshots: ExternalIntegrationSnapshot[]
}

const nonEmptyStringSchema = pipe(string(), minLength(1))

const memoryIntegrationConfigSchema = object({
  kind: literal('memory'),
  enabled: boolean(),
  rootPath: nonEmptyStringSchema,
  filesystemServerName: nonEmptyStringSchema,
  obsidianServerName: optional(nonEmptyStringSchema),
})

const companionSidecarIntegrationConfigSchema = object({
  kind: literal('companion-sidecar'),
  enabled: boolean(),
  moduleName: nonEmptyStringSchema,
  pluginId: nonEmptyStringSchema,
  expectedWsUrl: optional(string()),
})

export const externalIntegrationConfigSchema = union([
  memoryIntegrationConfigSchema,
  companionSidecarIntegrationConfigSchema,
])

export const externalIntegrationConfigFileSchema = object({
  version: literal(EXTERNAL_INTEGRATIONS_CONFIG_VERSION),
  integrations: object({
    'memory': memoryIntegrationConfigSchema,
    'companion-sidecar': companionSidecarIntegrationConfigSchema,
  }),
})

/**
 * Formats Valibot issues into a single readable message.
 *
 * Before:
 * - `[{ path: [{ key: 'integrations' }, { key: 'memory' }, { key: 'rootPath' }], message: 'Invalid type' }]`
 *
 * After:
 * - `"integrations.memory.rootPath: Invalid type"`
 */
export function formatExternalIntegrationIssues(issues: ReadonlyArray<{ message?: string, path?: ReadonlyArray<{ key?: unknown }> }>) {
  return issues
    .map((issue) => {
      const path = issue.path
        ?.map(segment => segment.key)
        .filter((segment): segment is PropertyKey => ['string', 'number', 'symbol'].includes(typeof segment))
        .join('.')

      return `${path || '<root>'}: ${issue.message ?? 'Invalid value'}`
    })
    .join('; ')
}

/**
 * Parses a plain object into the persisted integration config file.
 *
 * Use when:
 * - Main process code loaded JSON from disk
 * - Tests need the same validation logic as production
 *
 * Expects:
 * - `value` is a JSON-safe object
 *
 * Returns:
 * - A validated {@link ExternalIntegrationConfigFile}
 */
export function parseExternalIntegrationConfigFile(value: unknown): ExternalIntegrationConfigFile {
  const parsed = safeParse(externalIntegrationConfigFileSchema, value)
  if (!parsed.success) {
    throw new Error(formatExternalIntegrationIssues(parsed.issues))
  }

  return parsed.output
}

/**
 * Parses JSON text into the persisted integration config file.
 *
 * Use when:
 * - Reading the desktop-only external integration config from disk
 *
 * Expects:
 * - `text` contains valid JSON text
 *
 * Returns:
 * - A validated {@link ExternalIntegrationConfigFile}
 */
export function parseExternalIntegrationConfigText(text: string): ExternalIntegrationConfigFile {
  let parsed: unknown

  try {
    parsed = safeDestr(text, { strict: true })
  }
  catch (error) {
    throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  return parseExternalIntegrationConfigFile(parsed)
}

/**
 * Creates the default desktop integration config file.
 *
 * Use when:
 * - First boot has no saved external integration config yet
 * - Tests need deterministic defaults
 *
 * Expects:
 * - Optional partial overrides already follow the shape of the target config
 *
 * Returns:
 * - A complete {@link ExternalIntegrationConfigFile}
 */
export function createDefaultExternalIntegrationConfigFile(
  overrides?: {
    'memory'?: Partial<ExternalMemoryIntegrationConfig>
    'companion-sidecar'?: Partial<ExternalCompanionSidecarConfig>
  },
): ExternalIntegrationConfigFile {
  return {
    version: EXTERNAL_INTEGRATIONS_CONFIG_VERSION,
    integrations: {
      'memory': {
        kind: 'memory',
        enabled: true,
        rootPath: 'D:\\AIRI-Memory',
        filesystemServerName: 'filesystem',
        obsidianServerName: 'obsidian',
        ...overrides?.memory,
      },
      'companion-sidecar': {
        kind: 'companion-sidecar',
        enabled: false,
        moduleName: 'Proactive Companion',
        pluginId: 'local.proactive-companion',
        expectedWsUrl: 'ws://127.0.0.1:6121/ws',
        ...overrides?.['companion-sidecar'],
      },
    },
  }
}

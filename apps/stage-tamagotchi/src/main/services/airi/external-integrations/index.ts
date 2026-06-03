import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ElectronMcpStdioConfigFile,
  ElectronMcpStdioServerConfig,
} from '../../../../shared/eventa'
import type {
  ExternalCompanionSidecarConfig,
  ExternalIntegrationConfig,
  ExternalIntegrationImportResult,
  ExternalIntegrationKind,
  ExternalIntegrationProbeResult,
  ExternalIntegrationSnapshot,
  ExternalIntegrationStatus,
  ExternalMemoryIntegrationConfig,
} from '../../../../shared/external-integrations'
import type { ServerChannel } from '../channel-server'
import type { McpStdioManager } from '../mcp-servers'

import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { app } from 'electron'

import {
  electronExternalIntegrationsGetSnapshots,
  electronExternalIntegrationsImportLegacyMcp,
  electronExternalIntegrationsProbeNow,
  electronExternalIntegrationsSaveConfig,
} from '../../../../shared/eventa'
import {
  createDefaultExternalIntegrationConfigFile,
  externalIntegrationConfigFileSchema,
  parseExternalIntegrationConfigFile,
} from '../../../../shared/external-integrations'
import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'
import { createConfig } from '../../../libs/electron/persistence'

type MainContext = ReturnType<typeof createContext>['context']

const filesystemServerPackageName = '@modelcontextprotocol/server-filesystem'
const defaultFilesystemServerName = 'filesystem'
const defaultObsidianServerName = 'obsidian'
const legacyDesktopProfileDirectoryName = 'ai.moeru.airi'
const importedBackupSuffix = '.before-import'

/**
 * Shared manager for desktop-only external integrations.
 *
 * Use when:
 * - Electron main should own persisted integration config and probe results
 * - Renderer windows need one stable invoke surface for external collaboration status
 *
 * Expects:
 * - `mcpStdioManager` is already initialized for this app session
 *
 * Returns:
 * - One app-wide manager that can save config and probe integrations
 */
export interface ExternalIntegrationsManager {
  getSnapshots: () => ExternalIntegrationSnapshot[]
  importLegacyMcpConfig: () => Promise<ExternalIntegrationImportResult>
  probeNow: (kind: ExternalIntegrationKind) => Promise<ExternalIntegrationSnapshot>
  saveConfig: (config: ExternalIntegrationConfig) => Promise<ExternalIntegrationSnapshot>
}

function getCurrentUserDataPath() {
  return app.getPath('userData')
}

function getLegacyDesktopProfilePath() {
  return join(app.getPath('appData'), legacyDesktopProfileDirectoryName)
}

function getLegacyMcpConfigPath() {
  return join(getLegacyDesktopProfilePath(), 'mcp.json')
}

function getLegacyServerChannelConfigPath() {
  return join(getLegacyDesktopProfilePath(), 'server-channel-config.json')
}

function getCurrentServerChannelConfigPath() {
  return join(getCurrentUserDataPath(), 'server-channel-config.json')
}

async function backupFileIfExists(path: string) {
  try {
    await access(path)
    const backupPath = `${path}.${Date.now()}${importedBackupSuffix}`
    await copyFile(path, backupPath)
    return backupPath
  }
  catch {
    return undefined
  }
}

function isFilesystemServerConfig(config: ElectronMcpStdioServerConfig) {
  return (config.args ?? []).some(arg => arg.includes(filesystemServerPackageName))
}

function extractFilesystemRootPath(config: ElectronMcpStdioServerConfig) {
  const args = config.args ?? []
  return args.at(-1)
}

function findFilesystemServer(
  mcpConfig: ElectronMcpStdioConfigFile,
  preferredName: string,
): { name: string, config: ElectronMcpStdioServerConfig } | undefined {
  const preferred = mcpConfig.mcpServers[preferredName]
  if (preferred && isFilesystemServerConfig(preferred)) {
    return {
      name: preferredName,
      config: preferred,
    }
  }

  for (const [name, config] of Object.entries(mcpConfig.mcpServers)) {
    if (isFilesystemServerConfig(config)) {
      return {
        name,
        config,
      }
    }
  }

  return undefined
}

/**
 * Freezes the current MCP-backed memory setup into the desktop integration config.
 *
 * Use when:
 * - The external integration config is missing and needs a sane first boot default
 * - AIRI should inherit the real `mcp.json` memory path instead of guessing
 *
 * Expects:
 * - `mcpConfig` already comes from the validated MCP config file
 *
 * Returns:
 * - Partial memory config overrides based on the current MCP setup
 */
export function inferMemoryIntegrationFromMcpConfig(
  mcpConfig: ElectronMcpStdioConfigFile,
): Partial<ExternalMemoryIntegrationConfig> {
  const filesystemServer = findFilesystemServer(mcpConfig, defaultFilesystemServerName)
  const obsidianServer = mcpConfig.mcpServers[defaultObsidianServerName]

  return {
    enabled: filesystemServer?.config.enabled !== false,
    filesystemServerName: filesystemServer?.name ?? defaultFilesystemServerName,
    obsidianServerName: obsidianServer ? defaultObsidianServerName : undefined,
    rootPath: extractFilesystemRootPath(filesystemServer?.config ?? { command: '' }) ?? 'D:\\AIRI-Memory',
  }
}

/**
 * Syncs memory integration edits back into the existing MCP config file without inventing new servers.
 *
 * Use when:
 * - The external integrations page updates the expected memory path or enabled state
 * - AIRI should keep the MCP filesystem bridge aligned with the integration layer
 *
 * Expects:
 * - `config.filesystemServerName` points at an existing filesystem MCP server when one is present
 *
 * Returns:
 * - The updated MCP config plus a `changed` flag
 */
export function syncMemoryIntegrationIntoMcpConfig(
  config: ExternalMemoryIntegrationConfig,
  mcpConfig: ElectronMcpStdioConfigFile,
): { changed: boolean, config: ElectronMcpStdioConfigFile } {
  const nextConfig = structuredClone(mcpConfig)
  let changed = false

  const filesystemServer = nextConfig.mcpServers[config.filesystemServerName]
  if (filesystemServer && isFilesystemServerConfig(filesystemServer)) {
    const args = [...(filesystemServer.args ?? [])]
    const previousRootPath = extractFilesystemRootPath(filesystemServer)

    if (previousRootPath) {
      args[args.length - 1] = config.rootPath
    }
    else {
      args.push(config.rootPath)
    }

    if (JSON.stringify(args) !== JSON.stringify(filesystemServer.args ?? [])) {
      filesystemServer.args = args
      changed = true
    }

    if ((filesystemServer.enabled ?? true) !== config.enabled) {
      filesystemServer.enabled = config.enabled
      changed = true
    }
  }

  if (config.obsidianServerName) {
    const obsidianServer = nextConfig.mcpServers[config.obsidianServerName]
    if (obsidianServer && (obsidianServer.enabled ?? true) !== config.enabled) {
      obsidianServer.enabled = config.enabled
      changed = true
    }
  }

  return {
    changed,
    config: nextConfig,
  }
}

function createUnknownStatus(kind: ExternalIntegrationKind, config: ExternalIntegrationConfig): ExternalIntegrationStatus {
  if (!config.enabled) {
    return {
      kind,
      state: 'disabled',
      summary: 'Integration disabled.',
    }
  }

  if (kind === 'companion-sidecar' && config.kind === 'companion-sidecar' && (!config.moduleName.trim() || !config.pluginId.trim())) {
    return {
      kind,
      state: 'not-configured',
      summary: 'Companion sidecar identification is incomplete.',
    }
  }

  return {
    kind,
    state: 'unknown',
    summary: 'Status has not been checked yet.',
  }
}

function createStatusFromProbe(
  config: ExternalIntegrationConfig,
  result: ExternalIntegrationProbeResult,
  previous?: ExternalIntegrationStatus,
): ExternalIntegrationStatus {
  if (!config.enabled) {
    return {
      kind: result.kind,
      state: 'disabled',
      summary: 'Integration disabled.',
      checkedAt: result.checkedAt,
      lastSuccessAt: previous?.lastSuccessAt,
    }
  }

  if (result.kind === 'companion-sidecar') {
    const sidecarConfig = config as ExternalCompanionSidecarConfig
    if (!sidecarConfig.moduleName.trim() || !sidecarConfig.pluginId.trim()) {
      return {
        kind: result.kind,
        state: 'not-configured',
        summary: result.summary,
        checkedAt: result.checkedAt,
        lastSuccessAt: previous?.lastSuccessAt,
        error: result.error,
      }
    }
  }

  if (result.kind === 'companion-sidecar' && !(config as ExternalCompanionSidecarConfig).enabled) {
    return {
      kind: result.kind,
      state: 'disabled',
      summary: result.summary,
      checkedAt: result.checkedAt,
      lastSuccessAt: previous?.lastSuccessAt,
      error: result.error,
    }
  }

  return {
    kind: result.kind,
    state: result.ok ? 'ready' : 'degraded',
    summary: result.summary,
    checkedAt: result.checkedAt,
    lastSuccessAt: result.ok ? result.checkedAt : previous?.lastSuccessAt,
    error: result.error,
  }
}

async function readValidatedMcpConfig(
  mcpStdioManager: McpStdioManager,
): Promise<{ config: ElectronMcpStdioConfigFile, path: string }> {
  const { path, text } = await mcpStdioManager.readConfigText()
  return {
    path,
    config: parseElectronMcpConfigText(text),
  }
}

async function readValidatedLegacyMcpConfig() {
  const path = getLegacyMcpConfigPath()
  const text = await readFile(path, 'utf-8')

  return {
    path,
    text,
    config: parseElectronMcpConfigText(text),
  }
}

async function readLegacyServerChannelConfigText() {
  const path = getLegacyServerChannelConfigPath()
  const text = await readFile(path, 'utf-8')

  return {
    path,
    text,
  }
}

async function buildDefaultExternalIntegrationConfig(mcpStdioManager: McpStdioManager) {
  try {
    const { config } = await readValidatedMcpConfig(mcpStdioManager)
    return createDefaultExternalIntegrationConfigFile({
      memory: inferMemoryIntegrationFromMcpConfig(config),
    })
  }
  catch {
    return createDefaultExternalIntegrationConfigFile()
  }
}

function buildSnapshot(
  config: ExternalIntegrationConfig,
  status: ExternalIntegrationStatus | undefined,
  lastProbe: ExternalIntegrationProbeResult | undefined,
): ExternalIntegrationSnapshot {
  return {
    kind: config.kind,
    config,
    status: status ?? createUnknownStatus(config.kind, config),
    lastProbe,
  }
}

function stringifyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function buildMemoryProbeDetails(params: {
  rootPathExists: boolean
  rootPathIsDirectory: boolean
  configuredRootPath?: string
  mcpConfigPath?: string
  filesystemRuntimeState?: string
  obsidianRuntimeState?: string
  obsidianConfigured: boolean
}) {
  return {
    mcpConfigPath: params.mcpConfigPath,
    configuredRootPath: params.configuredRootPath,
    rootPathExists: params.rootPathExists,
    rootPathIsDirectory: params.rootPathIsDirectory,
    filesystemRuntimeState: params.filesystemRuntimeState,
    obsidianConfigured: params.obsidianConfigured,
    obsidianRuntimeState: params.obsidianRuntimeState,
  }
}

async function probeMemoryIntegration(
  config: ExternalMemoryIntegrationConfig,
  mcpStdioManager: McpStdioManager,
): Promise<ExternalIntegrationProbeResult> {
  const checkedAt = Date.now()

  if (!config.enabled) {
    return {
      kind: 'memory',
      ok: false,
      checkedAt,
      summary: 'Memory integration is disabled.',
    }
  }

  let rootPathExists = false
  let rootPathIsDirectory = false

  try {
    await access(config.rootPath)
    rootPathExists = true
    rootPathIsDirectory = (await stat(config.rootPath)).isDirectory()
  }
  catch {}

  let mcpConfigPath: string | undefined
  let configuredRootPath: string | undefined
  let filesystemRuntimeState: string | undefined
  let obsidianRuntimeState: string | undefined
  let obsidianConfigured = false
  let summary = 'Memory integration is ready.'
  let error: string | undefined
  let ok = true

  try {
    const { path, config: mcpConfig } = await readValidatedMcpConfig(mcpStdioManager)
    mcpConfigPath = path
    const filesystemServer = findFilesystemServer(mcpConfig, config.filesystemServerName)
    const runtimeStatus = mcpStdioManager.getRuntimeStatus()

    configuredRootPath = extractFilesystemRootPath(filesystemServer?.config ?? { command: '' })
    filesystemRuntimeState = runtimeStatus.servers.find(server => server.name === (filesystemServer?.name ?? config.filesystemServerName))?.state
    obsidianConfigured = Boolean(config.obsidianServerName && mcpConfig.mcpServers[config.obsidianServerName])
    obsidianRuntimeState = config.obsidianServerName
      ? runtimeStatus.servers.find(server => server.name === config.obsidianServerName)?.state
      : undefined

    if (!rootPathExists) {
      ok = false
      summary = 'Memory root path does not exist.'
      error = config.rootPath
    }
    else if (!rootPathIsDirectory) {
      ok = false
      summary = 'Memory root path is not a directory.'
      error = config.rootPath
    }
    else if (!filesystemServer) {
      ok = false
      summary = 'Filesystem MCP server for memory is missing.'
      error = config.filesystemServerName
    }
    else if (configuredRootPath && configuredRootPath !== config.rootPath) {
      ok = false
      summary = 'Memory root path is out of sync with MCP.'
      error = `MCP points to ${configuredRootPath}`
    }
    else if (filesystemRuntimeState && filesystemRuntimeState !== 'running') {
      ok = false
      summary = 'Filesystem MCP server is not running.'
      error = filesystemRuntimeState
    }
    else if (obsidianConfigured && obsidianRuntimeState && obsidianRuntimeState !== 'running') {
      ok = false
      summary = 'Obsidian bridge is configured but not running.'
      error = obsidianRuntimeState
    }
  }
  catch (probeError) {
    ok = false
    summary = 'Unable to inspect the current MCP memory bridge.'
    error = errorMessageFrom(probeError) ?? 'Unknown error'
  }

  return {
    kind: 'memory',
    ok,
    checkedAt,
    summary,
    error,
    details: buildMemoryProbeDetails({
      rootPathExists,
      rootPathIsDirectory,
      configuredRootPath,
      mcpConfigPath,
      filesystemRuntimeState,
      obsidianRuntimeState,
      obsidianConfigured,
    }),
  }
}

function createServerChannelWsUrl(hostname: string) {
  return `ws://${hostname}:6121/ws`
}

async function probeCompanionSidecarIntegration(
  config: ExternalCompanionSidecarConfig,
  serverChannel: ServerChannel,
): Promise<ExternalIntegrationProbeResult> {
  const checkedAt = Date.now()
  const moduleSnapshots = serverChannel.getModuleSnapshot()
  type ServerChannelModuleSnapshot = (typeof moduleSnapshots)[number]

  if (!config.enabled) {
    return {
      kind: 'companion-sidecar',
      ok: false,
      checkedAt,
      summary: 'Companion sidecar integration is disabled.',
    }
  }

  if (!config.moduleName.trim() || !config.pluginId.trim()) {
    return {
      kind: 'companion-sidecar',
      ok: false,
      checkedAt,
      summary: 'Companion sidecar identification is incomplete.',
      error: 'pluginId',
    }
  }

  const matchedModule = moduleSnapshots.find((moduleSnapshot: ServerChannelModuleSnapshot) => {
    return moduleSnapshot.name === config.moduleName
      && moduleSnapshot.identity.kind === 'plugin'
      && moduleSnapshot.identity.plugin?.id === config.pluginId
  })
  const currentHostname = serverChannel.getConnectionHost()[0] ?? '127.0.0.1'
  const currentWsUrl = createServerChannelWsUrl(currentHostname)
  const details = {
    moduleName: config.moduleName,
    pluginId: config.pluginId,
    expectedWsUrl: config.expectedWsUrl,
    currentWsUrl,
    connectedModules: moduleSnapshots.map((moduleSnapshot: ServerChannelModuleSnapshot) => ({
      name: moduleSnapshot.name,
      pluginId: moduleSnapshot.identity.kind === 'plugin' ? moduleSnapshot.identity.plugin?.id : undefined,
      authenticated: moduleSnapshot.authenticated,
      healthy: moduleSnapshot.healthy,
    })),
  }

  if (!matchedModule) {
    return {
      kind: 'companion-sidecar',
      ok: false,
      checkedAt,
      summary: 'Companion sidecar is not connected to the current AIRI server channel.',
      error: config.pluginId,
      details,
    }
  }

  if (!matchedModule.authenticated || !matchedModule.healthy) {
    return {
      kind: 'companion-sidecar',
      ok: false,
      checkedAt,
      summary: 'Companion sidecar is connected but not healthy yet.',
      error: matchedModule.authenticated ? 'unhealthy' : 'unauthenticated',
      details: {
        ...details,
        lastHeartbeatAt: matchedModule.lastHeartbeatAt,
      },
    }
  }

  if (config.expectedWsUrl?.trim() && config.expectedWsUrl.trim() !== currentWsUrl) {
    return {
      kind: 'companion-sidecar',
      ok: false,
      checkedAt,
      summary: 'Companion sidecar expects a different AIRI websocket address.',
      error: `${config.expectedWsUrl.trim()} != ${currentWsUrl}`,
      details: {
        ...details,
        lastHeartbeatAt: matchedModule.lastHeartbeatAt,
      },
    }
  }

  return {
    kind: 'companion-sidecar',
    ok: true,
    checkedAt,
    summary: 'Companion sidecar is connected to the current AIRI server channel.',
    details: {
      ...details,
      lastHeartbeatAt: matchedModule.lastHeartbeatAt,
    },
  }
}

export async function createExternalIntegrationsManager(params: {
  mcpStdioManager: McpStdioManager
  serverChannel: ServerChannel
}): Promise<ExternalIntegrationsManager> {
  const defaultConfig = await buildDefaultExternalIntegrationConfig(params.mcpStdioManager)
  const configStore = createConfig('external-integrations', 'v1.json', externalIntegrationConfigFileSchema, {
    default: defaultConfig,
    autoHeal: true,
  })
  const statusMap = new Map<ExternalIntegrationKind, ExternalIntegrationStatus>()
  const probeMap = new Map<ExternalIntegrationKind, ExternalIntegrationProbeResult>()

  configStore.setup()

  const getConfigFile = () => parseExternalIntegrationConfigFile(configStore.get() ?? defaultConfig)

  const getConfigByKind = (kind: ExternalIntegrationKind) => getConfigFile().integrations[kind]

  const updateProbeState = (config: ExternalIntegrationConfig, probe: ExternalIntegrationProbeResult) => {
    const previousStatus = statusMap.get(config.kind)
    const nextStatus = createStatusFromProbe(config, probe, previousStatus)

    probeMap.set(config.kind, probe)
    statusMap.set(config.kind, nextStatus)
  }

  const getSnapshots = () => {
    const configFile = getConfigFile()
    return [
      buildSnapshot(
        configFile.integrations.memory,
        statusMap.get('memory'),
        probeMap.get('memory'),
      ),
      buildSnapshot(
        configFile.integrations['companion-sidecar'],
        statusMap.get('companion-sidecar'),
        probeMap.get('companion-sidecar'),
      ),
    ]
  }

  const probeNow = async (kind: ExternalIntegrationKind) => {
    if (kind === 'memory') {
      const config = getConfigByKind(kind) as ExternalMemoryIntegrationConfig
      const result = await probeMemoryIntegration(config, params.mcpStdioManager)

      updateProbeState(config, result)

      return buildSnapshot(config, statusMap.get(kind), probeMap.get(kind))
    }

    const config = getConfigByKind(kind) as ExternalCompanionSidecarConfig
    const result = await probeCompanionSidecarIntegration(config, params.serverChannel)

    updateProbeState(config, result)

    return buildSnapshot(config, statusMap.get(kind), probeMap.get(kind))
  }

  const saveConfig = async (config: ExternalIntegrationConfig) => {
    const current = getConfigFile()
    const next = parseExternalIntegrationConfigFile({
      ...current,
      integrations: {
        ...current.integrations,
        [config.kind]: config,
      },
    })

    if (config.kind === 'memory') {
      try {
        const { config: mcpConfig } = await readValidatedMcpConfig(params.mcpStdioManager)
        const syncedMcpConfig = syncMemoryIntegrationIntoMcpConfig(next.integrations.memory, mcpConfig)

        if (syncedMcpConfig.changed) {
          await params.mcpStdioManager.writeConfigText(stringifyJson(syncedMcpConfig.config))
          await params.mcpStdioManager.applyAndRestart()
        }
      }
      catch (error) {
        throw new Error(errorMessageFrom(error) ?? 'Failed to sync memory integration with MCP config.')
      }
    }

    configStore.update(next)

    return await probeNow(config.kind)
  }

  const importLegacyMcpConfig = async (): Promise<ExternalIntegrationImportResult> => {
    const legacy = await readValidatedLegacyMcpConfig()
    const legacyServerChannelConfig = await readLegacyServerChannelConfigText().catch(() => undefined)
    const targetProfilePath = getCurrentUserDataPath()
    const targetMcpPath = join(targetProfilePath, basename(legacy.path))
    const targetServerChannelConfigPath = legacyServerChannelConfig ? getCurrentServerChannelConfigPath() : undefined

    await mkdir(targetProfilePath, { recursive: true })
    await backupFileIfExists(targetMcpPath)
    await params.mcpStdioManager.writeConfigText(legacy.text)
    await params.mcpStdioManager.applyAndRestart()

    if (legacyServerChannelConfig && targetServerChannelConfigPath) {
      await backupFileIfExists(targetServerChannelConfigPath)
      await writeFile(targetServerChannelConfigPath, legacyServerChannelConfig.text, 'utf-8')
    }

    const current = getConfigFile()
    configStore.update(parseExternalIntegrationConfigFile({
      ...current,
      integrations: {
        ...current.integrations,
        memory: {
          ...current.integrations.memory,
          ...inferMemoryIntegrationFromMcpConfig(legacy.config),
          kind: 'memory',
        },
      },
    }))

    await Promise.all([
      probeNow('memory'),
      probeNow('companion-sidecar'),
    ])

    return {
      sourceProfilePath: getLegacyDesktopProfilePath(),
      sourceMcpPath: legacy.path,
      sourceServerChannelConfigPath: legacyServerChannelConfig?.path,
      targetProfilePath,
      targetMcpPath,
      targetServerChannelConfigPath,
      snapshots: getSnapshots(),
    }
  }

  await Promise.allSettled([
    probeNow('memory'),
    probeNow('companion-sidecar'),
  ])

  return {
    getSnapshots,
    importLegacyMcpConfig,
    probeNow,
    saveConfig,
  }
}

export function createExternalIntegrationsService(params: {
  context: MainContext
  manager: ExternalIntegrationsManager
}) {
  defineInvokeHandler(params.context, electronExternalIntegrationsGetSnapshots, async () => {
    return params.manager.getSnapshots()
  })

  defineInvokeHandler(params.context, electronExternalIntegrationsProbeNow, async ({ kind }) => {
    return await params.manager.probeNow(kind)
  })

  defineInvokeHandler(params.context, electronExternalIntegrationsImportLegacyMcp, async () => {
    return await params.manager.importLegacyMcpConfig()
  })

  defineInvokeHandler(params.context, electronExternalIntegrationsSaveConfig, async (config) => {
    return await params.manager.saveConfig(config)
  })
}

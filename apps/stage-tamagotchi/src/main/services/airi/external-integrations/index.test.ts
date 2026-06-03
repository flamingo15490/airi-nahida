import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
}))

describe('external integrations manager', () => {
  function createServerChannelMock(moduleSnapshot: Array<Record<string, unknown>> = []) {
    return {
      getConnectionHost: vi.fn(() => ['127.0.0.1']),
      getModuleSnapshot: vi.fn(() => moduleSnapshot),
      restart: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      updateConfig: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('infers the memory bridge from the current MCP config', async () => {
    const { inferMemoryIntegrationFromMcpConfig } = await import('./index')

    expect(inferMemoryIntegrationFromMcpConfig({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', 'D:\\AIRI-Memory'],
        },
        obsidian: {
          command: 'node',
          args: ['bridge.js', 'https://127.0.0.1:27124/mcp/'],
        },
      },
    })).toEqual({
      enabled: true,
      filesystemServerName: 'filesystem',
      obsidianServerName: 'obsidian',
      rootPath: 'D:\\AIRI-Memory',
    })
  })

  it('keeps MCP filesystem and obsidian entries aligned when memory config is saved', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-external-integrations-'))
    const initialMemoryRoot = join(userDataRoot, 'memory-a')
    const nextMemoryRoot = join(userDataRoot, 'memory-b')

    await mkdir(initialMemoryRoot, { recursive: true })
    await mkdir(nextMemoryRoot, { recursive: true })

    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    let currentMcpConfigText = `${JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', initialMemoryRoot],
        },
        obsidian: {
          command: 'node',
          args: ['bridge.js', 'https://127.0.0.1:27124/mcp/'],
        },
      },
    }, null, 2)}\n`
    const readConfigTextMock = vi.fn(async () => ({
      path: join(userDataRoot, 'mcp.json'),
      text: currentMcpConfigText,
    }))
    const writeConfigTextMock = vi.fn(async (text: string) => {
      currentMcpConfigText = text
      return { path: join(userDataRoot, 'mcp.json'), text }
    })
    const applyAndRestartMock = vi.fn(async () => ({
      path: join(userDataRoot, 'mcp.json'),
      started: [],
      failed: [],
      skipped: [],
    }))
    const getRuntimeStatusMock = vi.fn(() => ({
      path: join(userDataRoot, 'mcp.json'),
      updatedAt: Date.now(),
      servers: [
        { name: 'filesystem', state: 'running', command: 'npx', args: [], pid: 1 },
        { name: 'obsidian', state: 'running', command: 'node', args: [], pid: 2 },
      ],
    }))

    const { createExternalIntegrationsManager } = await import('./index')
    const manager = await createExternalIntegrationsManager({
      mcpStdioManager: {
        applyAndRestart: applyAndRestartMock,
        callTool: vi.fn(),
        ensureConfigFile: vi.fn(),
        getRuntimeStatus: getRuntimeStatusMock,
        listTools: vi.fn(),
        openConfigFile: vi.fn(),
        readConfigText: readConfigTextMock,
        stopAll: vi.fn(),
        testServer: vi.fn(),
        writeConfigText: writeConfigTextMock,
      },
      serverChannel: createServerChannelMock(),
    } as never)

    const snapshot = await manager.saveConfig({
      kind: 'memory',
      enabled: true,
      rootPath: nextMemoryRoot,
      filesystemServerName: 'filesystem',
      obsidianServerName: 'obsidian',
    })

    expect(writeConfigTextMock).toHaveBeenCalledTimes(1)
    const writtenConfig = JSON.parse(writeConfigTextMock.mock.calls[0]?.[0] ?? '{}')
    expect(writtenConfig.mcpServers.filesystem.args.at(-1)).toBe(nextMemoryRoot)
    expect(applyAndRestartMock).toHaveBeenCalledTimes(1)
    expect(snapshot.config.kind).toBe('memory')
    expect((snapshot.config as { rootPath: string }).rootPath).toBe(nextMemoryRoot)
    expect(snapshot.status.state).toBe('ready')
  })

  it('imports the current desktop AIRI mcp.json into the source-build profile', async () => {
    const appDataRoot = await mkdtemp(join(tmpdir(), 'airi-appdata-'))
    const userDataRoot = join(appDataRoot, '@proj-airi', 'stage-tamagotchi')
    const legacyProfileRoot = join(appDataRoot, 'ai.moeru.airi')
    const memoryRoot = join(appDataRoot, 'memory')
    const legacyMcpPath = join(legacyProfileRoot, 'mcp.json')
    const legacyServerChannelConfigPath = join(legacyProfileRoot, 'server-channel-config.json')

    await mkdir(userDataRoot, { recursive: true })
    await mkdir(legacyProfileRoot, { recursive: true })
    await mkdir(memoryRoot, { recursive: true })

    const legacyMcpText = `${JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', memoryRoot],
        },
      },
    }, null, 2)}\n`

    await writeFile(legacyMcpPath, legacyMcpText)
    await writeFile(legacyServerChannelConfigPath, JSON.stringify({
      authToken: 'legacy-token',
      hostname: '127.0.0.1',
      tlsConfig: null,
    }, null, 2))

    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }
      if (name === 'appData') {
        return appDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    let currentMcpConfigText = `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`

    const readConfigTextMock = vi.fn(async () => ({
      path: join(userDataRoot, 'mcp.json'),
      text: currentMcpConfigText,
    }))
    const writeConfigTextMock = vi.fn(async (text: string) => {
      currentMcpConfigText = text
      return { path: join(userDataRoot, 'mcp.json'), text }
    })
    const applyAndRestartMock = vi.fn(async () => ({
      path: join(userDataRoot, 'mcp.json'),
      started: [{ name: 'filesystem' }],
      failed: [],
      skipped: [],
    }))
    const getRuntimeStatusMock = vi.fn(() => ({
      path: join(userDataRoot, 'mcp.json'),
      updatedAt: Date.now(),
      servers: [
        { name: 'filesystem', state: 'running', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', memoryRoot], pid: 1 },
      ],
    }))

    const { createExternalIntegrationsManager } = await import('./index')
    const manager = await createExternalIntegrationsManager({
      mcpStdioManager: {
        applyAndRestart: applyAndRestartMock,
        callTool: vi.fn(),
        ensureConfigFile: vi.fn(),
        getRuntimeStatus: getRuntimeStatusMock,
        listTools: vi.fn(),
        openConfigFile: vi.fn(),
        readConfigText: readConfigTextMock,
        stopAll: vi.fn(),
        testServer: vi.fn(),
        writeConfigText: writeConfigTextMock,
      },
      serverChannel: createServerChannelMock(),
    } as never)

    const result = await manager.importLegacyMcpConfig()

    expect(writeConfigTextMock).toHaveBeenCalledWith(legacyMcpText)
    expect(applyAndRestartMock).toHaveBeenCalledTimes(1)
    expect(result.sourceProfilePath).toBe(legacyProfileRoot)
    expect(result.targetProfilePath).toBe(userDataRoot)
    expect(result.sourceServerChannelConfigPath).toBe(legacyServerChannelConfigPath)
    expect(result.targetServerChannelConfigPath).toBe(join(userDataRoot, 'server-channel-config.json'))
    expect(result.snapshots.find(snapshot => snapshot.kind === 'memory')?.status.state).toBe('ready')
  })

  it('detects the real companion sidecar through the AIRI module registry', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-sidecar-registry-'))

    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createExternalIntegrationsManager } = await import('./index')
    const manager = await createExternalIntegrationsManager({
      mcpStdioManager: {
        applyAndRestart: vi.fn(),
        callTool: vi.fn(),
        ensureConfigFile: vi.fn(),
        getRuntimeStatus: vi.fn(() => ({
          path: join(userDataRoot, 'mcp.json'),
          updatedAt: Date.now(),
          servers: [],
        })),
        listTools: vi.fn(),
        openConfigFile: vi.fn(),
        readConfigText: vi.fn(async () => ({
          path: join(userDataRoot, 'mcp.json'),
          text: `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`,
        })),
        stopAll: vi.fn(),
        testServer: vi.fn(),
        writeConfigText: vi.fn(),
      },
      serverChannel: createServerChannelMock([
        {
          name: 'Proactive Companion',
          index: undefined,
          identity: {
            kind: 'plugin',
            plugin: { id: 'local.proactive-companion' },
            id: 'sidecar-1',
          },
          authenticated: true,
          healthy: true,
          lastHeartbeatAt: 123,
        },
      ]),
    } as never)

    const snapshot = await manager.saveConfig({
      kind: 'companion-sidecar',
      enabled: true,
      moduleName: 'Proactive Companion',
      pluginId: 'local.proactive-companion',
      expectedWsUrl: 'ws://127.0.0.1:6121/ws',
    })

    expect(snapshot.status.state).toBe('ready')
    expect(snapshot.status.summary).toBe('Companion sidecar is connected to the current AIRI server channel.')
  })
})

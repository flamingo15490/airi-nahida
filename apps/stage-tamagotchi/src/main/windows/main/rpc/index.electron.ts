import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { WindowAuthManager } from '../../../services/airi/auth'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { CompanionCoordinationManager } from '../../../services/airi/companion-coordination'
import type { ExternalIntegrationsManager } from '../../../services/airi/external-integrations'
import type { ExternalMemoryManager } from '../../../services/airi/external-memory'
import type { GodotStageManager } from '../../../services/airi/godot-stage'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { NahidaPersonaManager } from '../../../services/airi/nahida-persona'
import type { ProactiveCompanionManager } from '../../../services/airi/proactive-companion'
import type { ScreenContextManager } from '../../../services/airi/screen-context'
import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { NoticeWindowManager } from '../../notice'
import type { OnboardingWindowManager } from '../../onboarding'
import type { SettingsWindowManager } from '../../settings'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronOpenChat, electronOpenMainDevtools, electronOpenSettings, noticeWindowEventa } from '../../../../shared/eventa'
import { createAuthService } from '../../../services/airi/auth'
import { createCompanionCoordinationService } from '../../../services/airi/companion-coordination'
import { createExternalIntegrationsService } from '../../../services/airi/external-integrations'
import { createExternalMemoryService } from '../../../services/airi/external-memory'
import { createGodotStageService } from '../../../services/airi/godot-stage'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createNahidaPersonaService } from '../../../services/airi/nahida-persona'
import { createOnboardingService } from '../../../services/airi/onboarding'
import { createProactiveCompanionService } from '../../../services/airi/proactive-companion'
import { createScreenContextService } from '../../../services/airi/screen-context'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAutoUpdaterService } from '../../../services/electron'
import { toggleWindowShow } from '../../shared'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupMainWindowElectronInvokes(params: {
  window: BrowserWindow
  settingsWindow: SettingsWindowManager
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpStdioManager: McpStdioManager
  externalIntegrationsManager: ExternalIntegrationsManager
  proactiveCompanionManager: ProactiveCompanionManager
  screenContextManager: ScreenContextManager
  externalMemoryManager: ExternalMemoryManager
  nahidaPersonaManager: NahidaPersonaManager
  companionCoordinationManager: CompanionCoordinationManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
  windowAuthManager: WindowAuthManager
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  await setupBaseWindowElectronInvokes({ context, window: params.window, serverChannel: params.serverChannel, i18n: params.i18n })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.window })
  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })
  createMcpServersService({ context, manager: params.mcpStdioManager })
  createExternalIntegrationsService({ context, manager: params.externalIntegrationsManager })
  createProactiveCompanionService({ context, manager: params.proactiveCompanionManager })
  createExternalMemoryService({ context, manager: params.externalMemoryManager })
  createScreenContextService({ context, manager: params.screenContextManager })
  createNahidaPersonaService({ context, manager: params.nahidaPersonaManager })
  createCompanionCoordinationService({ context, manager: params.companionCoordinationManager })
  createGodotStageService({ context, manager: params.godotStageManager, window: params.window })
  createOnboardingService({ context, onboardingWindowManager: params.onboardingWindowManager, mainWindow: params.window })
  createAuthService({ context, window: params.window, windowAuthManager: params.windowAuthManager })

  defineInvokeHandler(context, electronOpenMainDevtools, () => params.window.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenSettings, payload => params.settingsWindow.openWindow(payload?.route))
  defineInvokeHandler(context, electronOpenChat, async () => toggleWindowShow(await params.chatWindow()))
  defineInvokeHandler(context, noticeWindowEventa.openWindow, payload => params.noticeWindow.open(payload))
}

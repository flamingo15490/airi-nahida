import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { app, BrowserWindow as ElectronBrowserWindow, shell } from 'electron'
import { isLinux, isMacOS, isWindows } from 'std-env'

import { electron, electronAppOpenUserDataFolder, electronAppQuit, electronAppReadLegacyFileOriginStorage } from '../../../shared/eventa'

async function readLegacyFileOriginStorage(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) {
    keys = []
  }

  const inspectorHtmlPath = resolve(app.getPath('userData'), '.codex', 'legacy-file-origin-storage-inspector.html')

  const fileOriginWindow = new ElectronBrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
    },
  })

  try {
    await mkdir(dirname(inspectorHtmlPath), { recursive: true })
    await writeFile(
      inspectorHtmlPath,
      '<!doctype html><html><head><meta charset="utf-8"><title>AIRI Legacy Storage Inspector</title></head><body></body></html>',
      'utf8',
    )

    const fileOriginUrl = `file://${inspectorHtmlPath.replace(/\\/g, '/')}`
    await fileOriginWindow.loadURL(fileOriginUrl)

    const values = await fileOriginWindow.webContents.executeJavaScript(`
      (() => {
        const keys = ${JSON.stringify(keys)};
        const values = {};
        if (keys.length === 0) {
          for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key) {
              continue;
            }
            const value = window.localStorage.getItem(key);
            if (value !== null) {
              values[key] = value;
            }
          }
          return values;
        }

        for (const key of keys) {
          const value = window.localStorage.getItem(key);
          if (value !== null) {
            values[key] = value;
          }
        }
        return values;
      })()
    `, true) as Record<string, string>

    return values
  }
  finally {
    if (!fileOriginWindow.isDestroyed()) {
      fileOriginWindow.destroy()
    }
  }
}

export function createAppService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  defineInvokeHandler(params.context, electron.app.isMacOS, () => isMacOS)
  defineInvokeHandler(params.context, electron.app.isWindows, () => isWindows)
  defineInvokeHandler(params.context, electron.app.isLinux, () => isLinux)
  defineInvokeHandler(params.context, electronAppOpenUserDataFolder, async () => {
    const path = app.getPath('userData')
    const openResult = await shell.openPath(path)
    if (openResult) {
      throw new Error(openResult)
    }
    return { path }
  })
  defineInvokeHandler(params.context, electronAppReadLegacyFileOriginStorage, async ({ keys }) => {
    return { values: await readLegacyFileOriginStorage(keys) }
  })
  defineInvokeHandler(params.context, electronAppQuit, () => app.quit())
}

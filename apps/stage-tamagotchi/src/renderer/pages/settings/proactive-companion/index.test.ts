import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

describe('proactive companion settings page copy', () => {
  it('keeps the new proactive settings copy readable in Chinese', async () => {
    const source = await readFile(new URL('./index.vue', import.meta.url), 'utf-8')

    expect(source).toContain('轻量操作台')
    expect(source).toContain('手动 Check-in')
    expect(source).toContain('模拟记忆信号')
    expect(source).toContain('信号来源模式')
    expect(source).toContain('内建规则区')
    expect(source).toContain('导入摘要')
  })
})

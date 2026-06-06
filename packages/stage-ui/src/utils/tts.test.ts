import { describe, expect, it } from 'vitest'

import { stripTextForSpeech } from './tts'

describe('stripTextForSpeech', () => {
  it('removes full-width parentheses and content', () => {
    expect(stripTextForSpeech('你知道吗？（轻轻摇晃嫩叶）知识像泡泡呢~')).toBe('你知道吗？知识像泡泡呢~')
  })

  it('removes half-width parentheses and content', () => {
    expect(stripTextForSpeech('Hello (whisper) world')).toBe('Hello world')
  })

  it('removes square bracket annotations', () => {
    expect(stripTextForSpeech('[思考] 嗯…让我想想')).toBe('嗯…让我想想')
  })

  it('removes Chinese corner bracket annotations', () => {
    expect(stripTextForSpeech('【重要】请注意')).toBe('请注意')
  })

  it('strips markdown bold markers but keeps text', () => {
    expect(stripTextForSpeech('**重要**的话')).toBe('重要的话')
  })

  it('strips markdown italic (asterisk) markers but keeps text', () => {
    expect(stripTextForSpeech('这是*斜体*文字')).toBe('这是斜体文字')
  })

  it('strips markdown italic (underscore) markers but keeps text', () => {
    expect(stripTextForSpeech('这是 _emphasis_ 文字')).toBe('这是 emphasis 文字')
  })

  it('strips markdown inline code markers but keeps text', () => {
    expect(stripTextForSpeech('使用 `console.log` 输出')).toBe('使用 console.log 输出')
  })

  it('removes markdown image links entirely', () => {
    expect(stripTextForSpeech('看图 ![alt text](https://example.com/img.png) 结束')).toBe('看图 结束')
  })

  it('converts markdown links to text only', () => {
    expect(stripTextForSpeech('访问 [Google](https://google.com) 搜索')).toBe('访问 Google 搜索')
  })

  it('strips markdown heading prefixes', () => {
    expect(stripTextForSpeech('## 标题文字')).toBe('标题文字')
  })

  it('strips heading prefixes across multiple lines', () => {
    expect(stripTextForSpeech(`# 一级\n## 二级\n### 三级`)).toBe(`一级\n二级\n三级`)
  })

  it('handles nested full-width parentheses', () => {
    // Non-greedy match removes innermost first; iterative pass handles the rest.
    const result = stripTextForSpeech('你好（轻轻（摇晃）嫩叶）世界')
    expect(result).toBe('你好世界')
  })

  it('handles nested half-width parentheses', () => {
    // Non-greedy match removes innermost first; iterative pass handles the rest.
    const result = stripTextForSpeech('Hello (outer (inner) end) world')
    expect(result).toBe('Hello world')
  })

  it('removes empty full-width parentheses', () => {
    expect(stripTextForSpeech('你好（）世界')).toBe('你好世界')
  })

  it('removes empty half-width parentheses', () => {
    expect(stripTextForSpeech('Hello () world')).toBe('Hello world')
  })

  it('removes empty square brackets', () => {
    expect(stripTextForSpeech('Hello [] world')).toBe('Hello world')
  })

  it('preserves plain text without annotations', () => {
    expect(stripTextForSpeech('这是一段普通文字，没有任何标记。')).toBe('这是一段普通文字，没有任何标记。')
  })

  it('preserves Chinese punctuation and emoji', () => {
    expect(stripTextForSpeech('你好！世界？😊')).toBe('你好！世界？😊')
  })

  it('handles multiple patterns in one string', () => {
    expect(stripTextForSpeech('**你好**（摇晃）[思考] _斜体_ `code`'))
      .toBe('你好 斜体 code')
  })

  it('strips from empty string', () => {
    expect(stripTextForSpeech('')).toBe('')
  })

  it('strips whitespace-only result after removing content', () => {
    expect(stripTextForSpeech('(only content)')).toBe('')
  })

  it('normalizes consecutive spaces after stripping', () => {
    expect(stripTextForSpeech('Hello (removed)  world')).toBe('Hello world')
  })
})

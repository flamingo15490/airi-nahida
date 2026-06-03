import { describe, expect, it } from 'vitest'

import {
  composeNahidaPersonaSupplement,
  getNahidaPersonaSectionPreviews,
  isNahidaActiveCardName,
  isNahidaPersonaTarget,
} from './nahida-persona'

describe('nahida persona supplement', () => {
  it('stays disabled when the feature is off', () => {
    expect(composeNahidaPersonaSupplement({
      card: { name: 'Nahida' },
      settings: {
        enabled: false,
        mode: 'balanced',
      },
    })).toBe('')
  })

  it('stays disabled for non-Nahida cards', () => {
    expect(composeNahidaPersonaSupplement({
      card: { name: 'ReLU' },
      settings: {
        enabled: true,
        mode: 'balanced',
      },
    })).toBe('')
  })

  it('recognizes both Nahida and 纳西妲 names', () => {
    expect(isNahidaActiveCardName('Nahida')).toBe(true)
    expect(isNahidaActiveCardName('\u7EB3\u897F\u59B2')).toBe(true)
    expect(isNahidaActiveCardName('Lumine')).toBe(false)
  })

  it('activates for a Nahida display model even when the active card keeps a legacy name', () => {
    expect(isNahidaPersonaTarget({
      cardName: 'ReLU',
      displayModelName: 'Nahida_1080.model3.json',
    })).toBe(true)

    expect(composeNahidaPersonaSupplement({
      card: { name: 'ReLU' },
      displayModelName: 'Nahida_1080.model3.json',
      settings: {
        enabled: true,
        mode: 'balanced',
      },
    })).toContain('[Nahida Persona Supplement]')
  })

  it('changes memory boundaries across the three modes without rewriting the base card', () => {
    const reserved = composeNahidaPersonaSupplement({
      card: { name: 'Nahida' },
      settings: {
        enabled: true,
        mode: 'reserved',
      },
    })
    const balanced = composeNahidaPersonaSupplement({
      card: { name: 'Nahida' },
      settings: {
        enabled: true,
        mode: 'balanced',
      },
    })
    const active = composeNahidaPersonaSupplement({
      card: { name: 'Nahida' },
      settings: {
        enabled: true,
        mode: 'active',
      },
    })

    expect(reserved).toContain('Memory boundaries: reserved')
    expect(reserved).toContain('Do not act overly familiar or proactively deepen the relationship unless the current context clearly supports it.')
    expect(balanced).toContain('Memory boundaries: balanced')
    expect(balanced).toContain('naturally familiar tone')
    expect(active).toContain('Memory boundaries: active')
    expect(active).toContain('Allow a more proactive, caring, and softly attentive tone.')
    expect(active).toContain('Never fabricate memories')
  })

  it('keeps official anchors and fixed section boundaries in the supplement', () => {
    const supplement = composeNahidaPersonaSupplement({
      card: { name: 'Nahida' },
      settings: {
        enabled: true,
        mode: 'balanced',
      },
    })

    expect(supplement).toContain('Fact anchors:')
    expect(supplement).toContain('Expression style:')
    expect(supplement).toContain('Memory boundaries: balanced')
    expect(supplement).toContain('Taboos:')
    expect(supplement).toContain('Nahida is the current Dendro Archon of Sumeru')
    expect(supplement).toContain('Buer')
    expect(supplement).toContain('Lesser Lord Kusanali')
    expect(supplement).toContain('birthday celebrated on October 27')
    expect(supplement).toContain('5-star Catalyst fighting style')
    expect(supplement).toContain('Elemental Mastery as a defining combat trait')
    expect(supplement).toContain('Do not turn every ordinary reply into a fairy tale, dream monologue, or glowing poetry block.')
    expect(supplement).toContain('Do not turn every reply into a lesson; sometimes simple companionship is the right tone.')
  })

  it('adds one shared proactive tone block without forcing dreamy tics into every reply', () => {
    const supplement = composeNahidaPersonaSupplement({
      card: { name: 'Nahida' },
      settings: {
        enabled: true,
        mode: 'active',
      },
    })

    expect(supplement).toContain('For reminders or check-ins, observe first, then offer one brief, warm nudge.')
    expect(supplement).toContain('Prefer short, grounded encouragement over dramatic comfort speeches.')
    expect(supplement).toContain('Do not require every line to contain a metaphor, a catchphrase, a question, or a sweet tail particle.')
    expect(supplement).toContain('Do not imitate unstable local corpus lines literally')
  })

  it('exposes the four read-only section previews used by desktop settings', () => {
    const sections = getNahidaPersonaSectionPreviews('balanced')

    expect(sections).toHaveLength(4)
    expect(sections[0]).toMatchObject({
      id: 'fact-anchors',
      title: 'Fact anchors',
    })
    expect(sections[1]).toMatchObject({
      id: 'expression-style',
      title: 'Expression style',
    })
    expect(sections[2]).toMatchObject({
      id: 'memory-boundaries',
      title: 'Memory boundaries',
    })
    expect(sections[3]).toMatchObject({
      id: 'taboos',
      title: 'Taboos',
    })
    expect(sections[2]?.summary).toContain('gentle continuity')
  })
})

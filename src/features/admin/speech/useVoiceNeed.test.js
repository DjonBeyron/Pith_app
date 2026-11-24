import { describe, it, expect } from 'vitest'
import { voiceNeedOf } from './useVoiceNeed.js'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { MIA_LINES } from '../../pitrace/mia/miaLines.js'
import { CAT_LINES } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { CODE_TEXT_OF } from '../../rehearsal/rehearsalLines.js'

const ids = [...RACE_LINES, ...MIA_LINES].map(l => l.id)
const textOf = id => { const d = CAT_LINES.find(x => x.id === id); return CODE_TEXT_OF[id] ?? d.text }
const full = () => Object.fromEntries(ids.filter(id => !textOf(id).includes('{')).map(id => [id, { text: textOf(id), said: textOf(id), url: 'u', duration: 1 }]))

describe('счётчик «нужно переозвучить»', () => {
  it('всё озвучено текущим текстом — 0', () => { expect(voiceNeedOf({ lines: full() }).total).toBe(0) })
  it('текст в коде изменился после озвучки — реплика считается и попадает в подсказку', () => {
    const lines = full(); lines.mia_push = { ...lines.mia_push, said: 'старый текст' }
    const n = voiceNeedOf({ lines })
    expect(n).toMatchObject({ total: 1, stale: 1 })
    expect(n.text).toMatch(/mia_push/)
  })
  it('нет настроек вообще — все реплики «новые»', () => { expect(voiceNeedOf({ lines: {} }).fresh).toBeGreaterThan(10) })
})

import { describe, it, expect } from 'vitest'
import { SCENES_HELP, SCENES_HELP_KEYS, helpContent } from './scenesHelp.js'

// Компоненты подвкладки «Сцены» (и подпапок, например voice/) ссылаются на ключи через <ScTip help="ключ" /> (или tip="ключ" у Seg)
const sources = import.meta.glob(['./*.jsx', './*/*.jsx'], { query: '?raw', import: 'default', eager: true })
const used = new Set()
for (const text of Object.values(sources)) {
  for (const m of text.matchAll(/\b(?:help|tip)=["']([a-z_]+)["']/g)) used.add(m[1])
}

describe('пояснялки «?» конструктора сцен', () => {
  it('у каждой записи непустые title и body', () => {
    for (const k of SCENES_HELP_KEYS) {
      expect(SCENES_HELP[k].title?.trim(), k).toBeTruthy()
      expect(SCENES_HELP[k].body?.trim(), k).toBeTruthy()
    }
  })
  it('компоненты ссылаются только на существующие ключи, лишних записей нет', () => {
    expect(used.size).toBeGreaterThan(10)
    for (const k of used) expect(SCENES_HELP_KEYS, `нет текста для «${k}»`).toContain(k)
    expect(SCENES_HELP_KEYS.filter(k => !used.has(k))).toEqual([])
  })
  it('helpContent: неизвестный ключ → null', () => {
    expect(helpContent('нет')).toBeNull()
    expect(helpContent('slot')).toBe(SCENES_HELP.slot)
  })
})

import { describe, it, expect } from 'vitest'
import { HELP, HELP_KEYS, helpFor, statusHelpKey, groupHelpKey, signalHelp } from './helpTexts.js'
import { GROUPS, signalMeta } from '../../../shared/lib/ranking/signalRegistry.js'
import { STATUS_LABEL } from './signalTexts.js'

// Исходники компонентов окна: ищем, на какие ключи они ссылаются
const sources = import.meta.glob('./*.{js,jsx}', { query: '?raw', import: 'default', eager: true })
const usedLiteral = new Set()
for (const [file, text] of Object.entries(sources)) {
  if (/helpTexts|\.test\.js/.test(file)) continue
  for (const m of text.matchAll(/\bhelp(?:=\{?\s*|:\s*)['"]([a-z0-9_]+)['"]/g)) usedLiteral.add(m[1])
}
// Ключи, которые компоненты строят из данных реестра
const dynamic = [
  ...Object.keys(STATUS_LABEL).map(statusHelpKey),
  ...Object.keys(GROUPS).map(groupHelpKey),
]

describe('справочник пояснялок', () => {
  it('у каждой записи есть непустые title и body', () => {
    for (const k of HELP_KEYS) {
      expect(HELP[k].title?.trim(), k).toBeTruthy()
      expect(HELP[k].body?.trim(), k).toBeTruthy()
      if (HELP[k].example !== undefined) expect(HELP[k].example.trim(), k).toBeTruthy()
    }
  })

  it('компоненты ссылаются только на существующие ключи', () => {
    expect(usedLiteral.size).toBeGreaterThan(20)
    for (const k of [...usedLiteral, ...dynamic]) expect(HELP_KEYS, `нет текста для «${k}»`).toContain(k)
  })

  it('нет неизвестных (неиспользуемых) записей', () => {
    const used = new Set([...usedLiteral, ...dynamic])
    expect(HELP_KEYS.filter(k => !used.has(k))).toEqual([])
  })

  it('helpFor: неизвестный ключ → null', () => {
    expect(helpFor('нет_такого')).toBeNull()
    expect(helpFor('weight_slider')).toBe(HELP.weight_slider)
  })

  it('пояснение сигнала берётся из реестра, без копий', () => {
    for (const meta of signalMeta()) {
      const h = signalHelp(meta)
      expect(h.title).toBe(meta.title)
      expect(h.body).toBe(meta.description)
    }
  })

  it('тексты короткие: не больше 5 предложений в body', () => {
    for (const k of HELP_KEYS) expect(HELP[k].body.split(/[.!?…](?:\s|$)/).filter(Boolean).length, k).toBeLessThanOrEqual(5)
  })
})

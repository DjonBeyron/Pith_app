import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Большие панели разнесены по файлам (правило 400 строк из CLAUDE.md). Разбор
// был механическим — код переехал как есть, — но именно поэтому легко
// разойтись: фабрика ждёт один набор полей, а панель передаёт другой, и
// молчаливо получится undefined вместо setState. Здесь сверяем стыки.
//
// Проверяем ИМЕНА в объекте-параметре: у фабрик их по два десятка, и опечатка
// в одном не даст ни ошибки сборки, ни падения линта — только мёртвую кнопку
// в проде.
function paramNames(src, fnName) {
  const at = src.indexOf(fnName)
  if (at === -1) return []
  const open = src.indexOf('{', src.indexOf('(', at))
  const close = src.indexOf('})', open)
  return src.slice(open + 1, close)
    .split('\n')
    .flatMap(l => l.replace(/\/\/.*$/, '').split(','))
    .map(s => s.trim().split(':')[0].trim())
    .filter(s => /^[a-zA-Z_$][\w$]*$/.test(s))
}

describe('стыки разнесённых панелей', () => {
  const manual   = read('./table-manual/TableManualPanel.jsx')
  const check    = read('./table-manual/manualCheck.js')
  const dictator = read('./table-dictator/TableDictatorPanel.jsx')
  const slide    = read('./table-dictator/dictatorSlideDown.js')
  const reset    = read('./table-dictator/dictatorRunReset.js')
  const legacy   = read('./table-dictator/useDictatorLegacyAssemble.js')

  it('ручная таблица зовёт свою проверку и отдаёт ей всё, что та ждёт', () => {
    expect(manual).toContain("import { makeManualCheck } from './manualCheck.js'")
    expect(manual).toContain('const check = makeManualCheck({')
    const wants = paramNames(check, 'export function makeManualCheck')
    const gives = paramNames(manual, 'const check = makeManualCheck')
    expect(wants.length).toBeGreaterThan(5)
    expect(wants.filter(n => !gives.includes(n))).toEqual([])
  })

  it('диктант зовёт свои закрытие/сброс/легаси-сборку с полным набором полей', () => {
    for (const [name, mod, callSite] of [
      ['makeDictatorSlideDown',      slide,  'const slideDown = makeDictatorSlideDown'],
      ['resetDictatorRun',           reset,  'resetDictatorRun('],
      ['useDictatorLegacyAssemble',  legacy, 'useDictatorLegacyAssemble('],
    ]) {
      const wants = paramNames(mod, `export function ${name}`)
      const gives = paramNames(dictator, callSite)
      expect(wants.length, `${name}: параметры не разобрались`).toBeGreaterThan(5)
      expect(wants.filter(n => !gives.includes(n)), `${name}: панель не передаёт`).toEqual([])
    }
  })

  it('переехавший код нигде не остался в двух экземплярах', () => {
    // Дубль страшнее пропажи: работать будет, но чинить придётся дважды
    expect(manual).not.toContain('normalizeAnswerText(phrase)')
    expect(dictator).not.toContain('const leave = () => {')
    expect(dictator).not.toContain('rfxPhaseRef.current       = false')
    expect(dictator).not.toContain('const staggerEnd =')
  })

  it('полёт панели в чат разнесён, но обе половины на месте', () => {
    const fly   = read('./flyPanelToChat.js')
    const parts = read('./flyPanelParts.js')
    expect(fly).toContain("from './flyPanelParts.js'")
    // Всё, что импортируется, действительно экспортировано
    const line = fly.split('\n').find(l => l.includes("from './flyPanelParts.js'"))
    const imported = line.slice(line.indexOf('{') + 1, line.indexOf('}'))
    for (const name of imported.split(',').map(s => s.trim()).filter(Boolean)) {
      expect(parts, `flyPanelParts не экспортирует ${name}`)
        .toMatch(new RegExp(`export (const|function) ${name}\\b`))
    }
    // Сам сценарий полёта остался в flyPanelToChat.js
    expect(fly).toContain('export function flyPanelToChat(')
    expect(parts).not.toContain('export function flyPanelToChat(')
  })
})

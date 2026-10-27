import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import SayAloudResult from './SayAloudResult.jsx'
import { roundResult } from './sayAloudRound.js'

const html = el => renderToStaticMarkup(el)
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const result = roundResult([{ word: 'cat', translation: 'кот', ok: true }, { word: 'dog', translation: 'собака', ok: false }])

describe('SayAloudResult — строка «+N XP»', () => {
  it('xp > 0 — одна строка «+N XP»', () => {
    const out = html(<SayAloudResult result={result} xp={3} onClose={() => {}} />)
    expect(out).toContain('data-testid="say-xp"')
    expect(out).toContain('+3 XP')
  })
  it('xp = 0 или не передан — строки нет, и цель XP не объявляется', () => {
    for (const el of [<SayAloudResult result={result} xp={0} onClose={() => {}} />, <SayAloudResult result={result} onClose={() => {}} />]) {
      const out = html(el)
      expect(out).not.toContain('say-xp')
      expect(out).not.toContain('XP')
    }
  })
})

describe('третье место запуска — итог повторения (связка по исходникам)', () => {
  it('ReviewSummary ставит ReviewSayAloud в нижний блок, ReviewScreen отдаёт curricula', () => {
    const summary = read('../../review/ReviewSummary.jsx')
    expect(summary).toContain('<ReviewSayAloud memory={memory} curricula={curricula} />')
    expect(summary.indexOf('<ReviewSayAloud')).toBeGreaterThan(summary.indexOf('className="reviewSumFoot"'))
    expect(read('../../review/ReviewScreen.jsx')).toContain('curricula={r.info.curricula}')
  })
  it('кнопка — «Пит нашёл игру на минутку», слова из списка, а не из view', () => {
    const src = read('../../review/ReviewSayAloud.jsx')
    expect(src).toContain('label="Пит нашёл игру на минутку"')
    expect(src).toContain('pool={pool}')
    expect(src).not.toContain('view=')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import Game2Howto from './Game2Howto.jsx'
import { HOWTO_STEPS, HOWTO_INTRO, HOWTO_HITS, HOWTO_DUE, HOWTO_VOICE, HOWTO_PHONES, HOWTO_DEBUG, HOWTO_SHADOW_TITLE, HOWTO_SHADOW_INTRO, HOWTO_SHADOW_ROWS, HOWTO_SHADOW_NOTE, shadowTableMarkdown, howtoMarkdown } from './game2Howto.js'
import { MODES } from './game2Modes.js'
import { GAME2_LINES } from './game2Modes.js'

describe('инструкция «Как играть»', () => {
  it('раздел блока открыт по умолчанию, шаги по всем режимам, попадания, «к повтору», что озвучить, наушники', () => {
    const html = renderToStaticMarkup(<Game2Howto />)
    expect(html).toContain('<details class="g2Howto" open=""')
    for (const s of HOWTO_STEPS) expect(html).toContain(`data-testid="g2-howto-${s.id}"`)
    for (const id of ['shadow', 'hits', 'due', 'voice', 'phones']) expect(html).toContain(`data-testid="g2-howto-${id}"`)
  })
  it('«Тень: как говорить»: таблица-пример на «I\'m trying to learn» — Пит и ты, всегда на полслова позади; пять строк со временем', () => {
    expect(HOWTO_SHADOW_ROWS.map(r => r[0])).toEqual(['0,0 с', '0,3 с', '0,8 с', '1,0 с', '1,6 с'])
    expect(HOWTO_SHADOW_ROWS.map(r => r[1])).toEqual(["I'm", 'trying', 'to', 'learn', 'тишина'])
    expect(HOWTO_SHADOW_ROWS.map(r => r[2].split(' ')[0])).toEqual(['—', "I'm", 'trying', 'to', 'learn'])
    const html = renderToStaticMarkup(<Game2Howto />)
    expect(html).toContain('<table class="g2HowtoTable">'); expect(html).toContain(HOWTO_SHADOW_TITLE); expect(html).toContain('Пит не ждёт, ты не ждёшь')
    expect(shadowTableMarkdown().split('\n')).toHaveLength(2 + HOWTO_SHADOW_ROWS.length)
  })
  it('строки-инструкции режимов на экране — те же слова, что в шагах', () => {
    const text = HOWTO_STEPS.map(s => s.title).join('\n')
    for (const id of ['listen', 'catch', 'shadow', 'recall', 'speed']) expect(text).toContain(MODES[id].instr)
    expect(MODES.shadow.instr).toBe('Повторяй за Питом с отставанием на полслова, не жди конца фразы') // та же строка в «Тени» и «Скорости»
  })
  it('все реплики rh2_* названы в тексте про озвучку', () => {
    for (const id of GAME2_LINES) expect(HOWTO_VOICE).toContain(id)
  })
  it('тот же текст лежит в CONCEPT_GAME2.md («Как пользоваться»)', () => {
    const md = readFileSync(new URL('../../../CONCEPT_GAME2.md', import.meta.url), 'utf8')
    expect(md).toContain('## 5. Как пользоваться')
    for (const t of [HOWTO_INTRO, HOWTO_HITS, HOWTO_DUE, HOWTO_VOICE, HOWTO_PHONES, HOWTO_DEBUG, ...HOWTO_STEPS.map(s => `**${s.title}.** ${s.text}`)]) expect(md).toContain(t)
    expect(md).toContain(shadowTableMarkdown()); expect(md).toContain(`**${HOWTO_SHADOW_TITLE}.** ${HOWTO_SHADOW_INTRO}`); expect(md).toContain(HOWTO_SHADOW_NOTE)
    expect(howtoMarkdown()).toContain(HOWTO_PHONES)
  })
})

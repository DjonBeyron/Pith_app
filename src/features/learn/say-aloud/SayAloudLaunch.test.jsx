import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildLadder } from '../memoryLadder.js'
import SayAloudLaunch from './SayAloudLaunch.jsx'
import SayAloudResult from './SayAloudResult.jsx'
import { roundResult } from './sayAloudRound.js'

vi.mock('../../../shared/lib/analytics/track.js', () => ({ track: vi.fn() }))

// Нет jsdom: разметку смотрим через renderToStaticMarkup, связку мест запуска — сторожами по исходникам
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const html = el => renderToStaticMarkup(el)

const WORDS = [['cat', 'кот'], ['dog', 'собака'], ['sun', 'солнце'], ['cup', 'чашка']]
const viewOf = n => {
  const rows = WORDS.slice(0, n)
  return { ladder: buildLadder(rows.map(([word]) => ({ word, step: 1, due_on: '2026-10-28' })), { wordHome: new Map(rows.map(([w, t]) => [w, { translation: t }])) }) }
}

describe('SayAloudLaunch — видимость', () => {
  it('видна при ≥ 3 подходящих слов', () => {
    const out = html(<SayAloudLaunch view={viewOf(3)} />)
    expect(out).toContain('data-testid="say-aloud-launch"')
    expect(out).toContain('Скажи вслух')
    expect(out).toContain('sayLaunch--tab')
  })
  it('при двух словах и без данных — ничего', () => {
    expect(html(<SayAloudLaunch view={viewOf(2)} />)).toBe('')
    expect(html(<SayAloudLaunch view={null} />)).toBe('')
  })
  it('в окне слова: свой вариант, только если слово годится', () => {
    expect(html(<SayAloudLaunch view={viewOf(4)} withWord="cat" variant="sheet" />)).toContain('sayLaunch--sheet')
    expect(html(<SayAloudLaunch view={viewOf(4)} withWord="нет-такого" variant="sheet" />)).toBe('')
  })
  it('слой игры не открыт до тапа (в разметке нет портала)', () => {
    expect(html(<SayAloudLaunch view={viewOf(4)} />)).not.toContain('data-testid="say-aloud"')
  })
})

describe('SayAloudResult — «Я услышал N слов»', () => {
  it('заголовок текстом и список слов', () => {
    const r = roundResult([{ word: 'cat', translation: 'кот', ok: true }, { word: 'dog', translation: 'собака', ok: false }, { word: 'sun', translation: 'солнце', ok: true }])
    const out = html(<SayAloudResult result={r} onClose={() => {}} />)
    expect(out).toContain('Я услышал 2 слова')
    expect(out).toContain('✓ cat')
    expect(out).toContain('✗ dog')
    expect(out).toContain('Готово')
  })
  it('пустой раунд не падает', () => {
    const out = html(<SayAloudResult result={roundResult([])} onClose={() => {}} />)
    expect(out).toContain('Я услышал 0 слов')
  })
})

describe('места запуска (связка по исходникам)', () => {
  it('вкладка «Память»: кнопка в трёх состояниях шапки, но не в отпуске и не в пустой памяти', () => {
    const src = read('../LearnMainAction.jsx')
    expect(src.match(/<SayAloudLaunch view=\{view\} \/>/g)).toHaveLength(3) // «Повторить», «Закрепить фразу», «Памяти пора отдыхать»
    const vacation = src.slice(src.indexOf('if (view.vacation)'), src.indexOf('if (view.empty)'))
    expect(vacation).not.toContain('SayAloudLaunch')
  })
  it('окно слова получает view от LearnTab и ставит кнопку со словом', () => {
    expect(read('../LearnWordSheet.jsx')).toContain('<SayAloudLaunch view={view} withWord={word.word} variant="sheet" />')
    expect(read('../LearnTab.jsx')).toContain('view={view}')
  })
  it('тап по кнопке микрофон НЕ просит: слой грузится лениво, готовность Vosk проверяется первой', () => {
    const src = read('./SayAloudLaunch.jsx')
    expect(src).toContain("lazy(() => import('./SayAloudOverlay.jsx'))")
    expect(src).not.toMatch(/ensureMicAccess|openGameMic|getUserMedia/)
  })
  it('микрофон просим только по тапу «Начать» на готовой модели, до любых await', () => {
    const src = read('./SayAloudOverlay.jsx')
    const begin = src.slice(src.indexOf('const begin = () =>'), src.indexOf('const finished'))
    expect(begin).toContain('const asked = openGameMic()') // на всех платформах один поток без эхо/шумоподавления (gameMic)
    expect(begin).not.toMatch(/await /)
    expect(src.match(/ensureMicAccess\(\)|openGameMic\(\)/g)).toHaveLength(1) // одно место запроса
    // порядок экрана: итог → не готов Vosk → «Начать» (idle) → ожидание → нет микрофона → игра
    const order = ['result', "vosk.status !== 'ready'", "mic === 'idle'", "mic === 'pending'", "mic !== 'granted'"].map(k => src.indexOf(k, src.indexOf('let body')))
    expect(order).toEqual([...order].sort((x, y) => x - y))
    expect(order.every(i => i > 0)).toBe(true)
    expect(src).toContain('data-testid="say-begin"')
  })
  it('итог раунда: событие say_aloud_round с words/hits/ms, затем итог уходит в память через sayAloudApi', () => {
    const src = read('./SayAloudOverlay.jsx')
    expect(src).toContain('track(SAY_ALOUD_ROUND, { words: r.words, hits: r.hits, ms })')
    expect(src).toContain('sendSayAloudResult(r.items)')
    expect(src).not.toMatch(/memoryApi|reviewApi|addXp|xpApi/)
    expect(read('../../../shared/lib/analytics/eventNames.js')).toContain("SAY_ALOUD_ROUND = 'say_aloud_round'")
    expect(read('../../../../supabase/migrations/20261027190000_say_aloud_event.sql')).toContain("'say_aloud_round'")
  })
})

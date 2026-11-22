import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import TimelinePauseCard from './TimelinePauseCard.jsx'
import TimelinePausesTab, { PAGE } from './TimelinePausesTab.jsx'
import TimelineCard from './TimelineCard.jsx'
import { buildTimeline } from './timelineModel.js'
import { buildPauses } from './timelinePauses.js'
import { sortPauses, pauseTotals, pauseGroups, pauseWhere, pauseBlock } from './timelinePauseList.js'
import { sideLine, insideOf } from './timelinePauseSides.js'
import { reportLines, rows } from './timelineReport.js'
import { reverseEvents } from './timelineFixtureServer.js'
import { longFixture } from './timelineFixture.js'

const m = buildTimeline(reverseEvents(), { seed: 'r7' }), pauses = buildPauses(m, 1500), long = sortPauses(pauses)
const rev = long.find(p => p.sid === 'catch-rev'), count = (s, re) => (s.match(re) ?? []).length
const strip = s => s.replace(/<[^>]+>/g, '')

describe('карточка паузы: что прозвучало перед тишиной и что после', () => {
  it('разворот конвейера: длина крупно, «на 0:51», этап по-человечески, полный текст реплики Пита перед тишиной, «отсчёт — три ноты» после, id — отдельно', () => {
    expect(rev).toMatchObject({ ms: 5500, stage: 'Разворот конвейера', act: 'catch', before: { who: 'pit', id: 'race_reverse', text: 'А теперь наоборот: я говорю слово по-английски, а ты — перевод' }, after: { who: 'game', text: 'отсчёт — три ноты' } })
    expect(rev.saidAfter).toMatchObject({ who: 'dictor', text: 'meet', ago: 3600 }); expect(rev.saidBefore).toBeNull()
    const s = renderToStaticMarkup(<TimelinePauseCard p={rev} onGo={() => {}} />)
    expect(s).toContain('<b class="tlPMs">5,5 с</b>'); expect(s).toMatch(/<span class="tlPAt"[^>]*>на 0:51<\/span>/)
    expect(s).toMatch(/<span class="tlPStage">Разворот конвейера<i class="tlPId"> catch-rev<\/i>/)
    expect(s).toMatch(/<div class="tlPSide" data-who="pit"><span class="tlPCap">Перед тишиной<\/span><span class="tlPLine"><b class="tlPWho">Пит<\/b> <span class="tlPText">«А теперь наоборот: я говорю слово по-английски, а ты — перевод»<\/span><\/span><span class="tlPId">race_reverse<\/span>/)
    expect(s).toMatch(/data-who="game"><span class="tlPCap">После тишины<\/span><span class="tlPLine"><b class="tlPWho">Игра<\/b> <span class="tlPText">отсчёт — три ноты<\/span>/)
    expect(strip(s)).toContain('следующая реплика (3,6 с после паузы): Диктор «meet»')
    expect(s).toContain('data-testid="tl-pause-go"'); expect(renderToStaticMarkup(<TimelinePauseCard p={rev} />)).not.toContain('tl-pause-go')
    expect(s.indexOf('race_reverse')).toBeGreaterThan(s.indexOf('А теперь наоборот')) // id — после текста и мелко, не главным
  })

  it('пометка анимации: «внутри: идёт разворот конвейера (анимация без речи)» — карточка другого цвета; обычная пауза без пометки', () => {
    expect(rev.inside).toEqual(['идёт разворот конвейера (анимация без речи)'])
    const s = renderToStaticMarkup(<TimelinePauseCard p={rev} />)
    expect(s).toContain('data-anim="1"'); expect(strip(s)).toContain('внутри: идёт разворот конвейера (анимация без речи)')
    const plain = long.find(p => p.stage === 'до первой стадии'), t = renderToStaticMarkup(<TimelinePauseCard p={plain} />)
    expect(plain.inside).toEqual(['началась стадия «Плашка: Конвейер слов»']); expect(t).toContain('data-anim="0"')
    const cer = long.find(p => p.sid === 'sprint'); expect(cer.inside).toEqual(['началась стадия «Допрос у Мии — заставка»', 'началась стадия «Допрос у Мии — церемония (Мия забирает Пита)»: идёт церемония Мии: она приходит и забирает Пита (анимация без речи)'])
    expect(insideOf({ sid: 'sprint' }, [])).toEqual([]); expect(insideOf(null, [{ sid: 'x9', title: '' }])).toEqual(['началась стадия «x9»'])
  })

  it('кто перед тишиной: Мия, диктор (слово), игрок («не успел «bring»», «ответ … принят»), игра (стадия, пауза) — словами, а не id', () => {
    expect(long.map(p => sideLine(p.before))).toEqual([
      'Пит: «А теперь наоборот: я говорю слово по-английски, а ты — перевод» [race_reverse]', 'Пит: «звучит очень хорошо» [race_good_2]', 'игрок: ответ «early» принят',
      'Пит: «Ой, эти два слова я, кажется, забыл» [pit_forgot]', 'Пит: «Финиш! Завтра ещё заезд?» [race_done]', 'Пит: «Отлично» [race_good_ok]', 'Пит: «Встряхнём память: я говорю перевод, а ты — слово по-английски» [race_start]'])
    expect(long.map(p => sideLine(p.after))).toContain('Мия: «Так, Пит, ты идёшь со мной. Проверим, что ты забыл» [mia_take]'); expect(sideLine(long.find(p => p.sid === 'summary').after)).toBe('игра: конец игры')
    const fail = buildPauses(buildTimeline([{ t: 0, k: 'stage-in', sid: 'sprint', act: 'sprint', type: 'student' }, { t: 10, k: 'pill', idx: 0, word: 'bring' }, { t: 3000, k: 'answer', res: 'fail', idx: 0, word: 'bring', final: true }, { t: 6000, k: 'line-start', who: 'dictor', id: 'рано', text: 'рано', ms: 500 }, { t: 6500, k: 'end' }]), 1500).find(p => p.long)
    expect(sideLine(fail.before)).toBe('игрок: не успел «bring»'); expect(sideLine(fail.after)).toBe('Диктор: «рано»'); expect(sideLine(null)).toBe('—')
  })

  it('карточка отрезка на ленте для паузы — та же карточка с текстами', () => {
    const s = renderToStaticMarkup(<TimelineCard sel={{ kind: 'pause', ref: rev }} />)
    expect(s).toContain('data-kind="pause"'); expect(s).toContain('Пауза — игра молчит'); expect(s).toContain('data-testid="tl-pause"'); expect(s).toContain('«А теперь наоборот: я говорю слово по-английски, а ты — перевод»'); expect(s).toContain('+51,720 с — +57,220 с')
  })
})

describe('вкладка «Паузы»: все долгие паузы, итог, сортировка, этапы', () => {
  it('итог «долгих пауз N, всего X с из Y с игры»; по умолчанию самые долгие сверху; чипы этапов с суммой молчания', () => {
    const s = renderToStaticMarkup(<TimelinePausesTab pauses={pauses} total={m.dur} onGo={() => {}} />)
    expect(strip(s)).toContain('Долгих пауз 7, всего 21,4 с из 73,8 с игры')
    expect([...s.matchAll(/<b class="tlPMs">([^<]+)</g)].map(x => x[1])).toEqual(['5,5 с', '3,4 с', '3,2 с', '2,9 с', '2,6 с', '2,3 с', '1,6 с'])
    expect([...s.matchAll(/data-testid="tl-act-chip">([^<]+)</g)].map(x => x[1])).toEqual(['до первой стадии · 1,6 с', 'Конвейер слов · 9,5 с (3)', 'Конвейер слов — реверс · 7,8 с (2)', 'Итог · 2,6 с'])
    expect(s).toMatch(/aria-checked="true" class="tlChip"[^>]*data-testid="tl-sort-long">самые долгие</); expect(s).toContain('>по времени<'); expect(count(s, /data-testid="tl-pause-go"/g)).toBe(7)
  })

  it('сортировка и фильтр — чистые функции: по времени, только этап; итог и группы', () => {
    expect(sortPauses(pauses, 'time').map(p => p.ms)).toEqual([1600, 3400, 2900, 3180, 5500, 2250, 2600])
    expect(sortPauses(pauses, 'long', 'catch').map(p => p.ms)).toEqual([5500, 2250]); expect(sortPauses(pauses, 'long', 'нет')).toEqual([])
    expect(pauseTotals(pauses)).toEqual({ n: 7, ms: 21430 }); expect(pauseGroups(pauses).map(g => [g.act, g.n, g.ms])).toEqual([['', 1, 1600], ['sprint', 3, 9480], ['catch', 2, 7750], ['summary', 1, 2600]])
    expect(pauseTotals(buildPauses(m, 2000)).n).toBe(6)
  })

  it('30+ пауз: не «топ-10», а все — порциями по PAGE; пауз нет — понятный текст', () => {
    const lm = buildTimeline(longFixture(600)), lp = buildPauses(lm, 1000), n = pauseTotals(lp).n
    expect(n).toBeGreaterThan(PAGE)
    const s = renderToStaticMarkup(<TimelinePausesTab pauses={lp} total={lm.dur} onGo={() => {}} />)
    expect(count(s, /data-testid="tl-pause"/g)).toBe(PAGE); expect(s).toContain(`Показать ещё (${n - PAGE})`)
    const none = renderToStaticMarkup(<TimelinePausesTab pauses={[]} total={1000} onGo={() => {}} />)
    expect(none).toContain('data-testid="tl-pauses-none"'); expect(none).not.toContain('tl-sort-long')
  })

  it('на телефоне список читается без горизонтальной прокрутки: одна колонка, длинный текст переносится', () => {
    const css = readFileSync(new URL('../../styles/timeline-pauses.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.tlPList \{[^}]*grid-template-columns: minmax\(0, 1fr\)/); expect(css).toMatch(/\.tlPSides \{[^}]*grid-template-columns: minmax\(0, 1fr\)/)
    expect(css).toMatch(/\.tlPLine \{[^}]*overflow-wrap: anywhere/); expect(css).toMatch(/\.tlPStage \{[^}]*min-width: 0/)
    expect(css.split('\n').length).toBeLessThanOrEqual(250)
  })
})

describe('текстовый отчёт: долгие паузы в человеческом формате', () => {
  const text = reportLines(m, { threshold: 1500 })
  it('раздел долгих пауз: все паузы блоками «перед / после / внутри» с полным текстом, самые долгие сверху, итог в заголовке', () => {
    const i = text.indexOf('== ДОЛГИЕ ПАУЗЫ «ИГРА МОЛЧИТ»: 7, всего 21,4 с из 73,8 с игры (самые долгие сверху) ==')
    expect(i).toBeGreaterThan(0)
    expect(text.slice(i + 1, i + 6)).toEqual([
      '1. 5,5 с на 0:51 (+51,720 с) — этап: Разворот конвейера [catch-rev]',
      '   перед:  Пит: «А теперь наоборот: я говорю слово по-английски, а ты — перевод» [race_reverse]',
      '   после:  игра: отсчёт — три ноты',
      '           следующая реплика: Диктор: «meet» — 3,6 с после паузы',
      '   внутри: идёт разворот конвейера (анимация без речи)'])
    expect(text.filter(l => /^\d+\. /.test(l))).toHaveLength(7)
    expect(pauseBlock(rev, 0)).toEqual(text.slice(i + 1, i + 6))
  })

  it('хронология: стадии с названием и sid, пауза одной строкой «перед: …; после: …; этап: …; внутри: …»; этапы — по-человечески', () => {
    expect(text).toContain('   +47,770 с  ── стадия Разворот конвейера [catch-rev] (catch, announce, реплика race_reverse) — 11,9 с')
    expect(text).toContain(`   +51,720 с  ⚠ пауза 5,5 с — игра молчит: ${pauseWhere(rev)}`)
    expect(pauseWhere(rev)).toBe('перед: Пит: «А теперь наоборот: я говорю слово по-английски, а ты — перевод» [race_reverse]; после: игра: отсчёт — три ноты; этап: Разворот конвейера; внутри: идёт разворот конвейера (анимация без речи)')
    expect(text.some(l => l.includes('Конвейер слов — реверс [catch]: 21,3 с'))).toBe(true)
    expect(rows(m, pauses).find(r => r.kind === 'stage' && r.ref.sid === 'sprint3-ann').text).toContain('стадия Допрос у Мии — церемония (Мия забирает Пита) [sprint3-ann]')
  })
})

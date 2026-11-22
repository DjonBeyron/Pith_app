import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import TimelineScreen from './TimelineScreen.jsx'
import TimelineList, { PAGE } from './TimelineList.jsx'
import TimelineCard from './TimelineCard.jsx'
import { fixtureEvents, longFixture } from './timelineFixture.js'
import { buildTimeline } from './timelineModel.js'
import { buildPauses } from './timelinePauses.js'
import { rows } from './timelineReport.js'
import { visible, windowOf, fitScale, zoom, axisTicks, scrollFor, MAX_SCALE } from './timelineView.js'
import { timelineFile, lastRunFile } from './timelineLog.js'
import { collectLogs } from '../../shared/lib/logUpload.js'

const run = (events, id = 1) => ({ id, at: 0, meta: { game: 'race', only: 'stages' }, events, dropped: 0 })
const html = (props = {}) => renderToStaticMarkup(<TimelineScreen runs={[run(fixtureEvents())]} {...props} />)
const count = (s, re) => (s.match(re) ?? []).length

describe('экран «Таймлайн игры»', () => {
  it('пустое состояние: игр в сеансе не было (или в трассе нет сцены)', () => {
    for (const runs of [[], [run([{ t: 0, k: 'run' }, { t: 5, k: 'note' }])]]) {
      const s = renderToStaticMarkup(<TimelineScreen runs={runs} />)
      expect(s).toContain('Игр в этом сеансе ещё не было — сыграй и вернись'); expect(s).not.toContain('data-testid="tl-ribbon"')
    }
  })

  it('лента: все дорожки, реплики с текстом и говорящим, пилюли с исходом, красная долгая пауза с длиной цифрами', () => {
    const s = html()
    for (const row of ['stages', 'pit', 'mia', 'dictor', 'turns', 'answers', 'waits', 'pauses']) expect(s, row).toContain(`data-row="${row}"`)
    for (const label of ['Этапы', 'Пит', 'Мия', 'Диктор', 'Пилюли', 'Игрок', 'Ждёт', 'Паузы']) expect(s).toContain(`<div class="tlLabel">${label}</div>`)
    expect(s).toMatch(/class="tlSeg tlLine"[^>]*data-who="pit"[^>]*>Встряхнём память, я говорю слова, а ты переводишь вслух</)
    expect(s).toMatch(/class="tlSeg tlStage"[^>]*>Конвейер слов</)
    expect(s).toMatch(/class="tlSeg tlPill"[^>]*data-res="win"[^>]*>meet</)
    expect(s).toMatch(/data-long="1" data-testid="tl-dead-long">3,4 с</) // первая долгая пауза видна в первом окне ленты
    expect(s).toContain('долгих пауз 3'); expect(s).toContain('Прохождение <b>91,9 с</b>')
  })

  it('под лентой: «Самые долгие паузы» (после чего — до чего) и сводка по этапам; порог 1 / 1,5 / 2 с', () => {
    const s = html()
    expect(count(s, /class="tlTopRow"/g)).toBe(3)
    expect(s).toContain('после ответа «не успел» «bring» до реплики Пита race_catch, этап sprint1')
    expect(s).toContain('<span class="tlActName">Слушай и лови</span>')
    for (const t of ['1,0 с', '1,5 с', '2,0 с']) expect(s).toContain(`>${t}</button>`)
    expect(s).toMatch(/aria-checked="true" class="tlChip">1,5 с</)
  })

  it('вкладка «Список»: хронология текстом, долгая пауза — отдельной строкой, у реплики — тишина перед ней', () => {
    const s = html({ tab0: 'list' })
    expect(s).toContain('data-testid="tl-list"'); expect(s).not.toContain('data-testid="tl-ribbon"')
    expect(s).toMatch(/data-kind="line" data-who="mia"[^>]*><span class="tlItemT">\+46,620 с<\/span><span class="tlItemWho">Мия<\/span>/)
    expect(count(s, /class="tlItem" data-kind="pause"/g)).toBe(3)
    expect(s).toContain('тишина перед: ')
  })

  it('несколько прохождений — выбор; кнопка «В GitHub» есть только с send', () => {
    const many = renderToStaticMarkup(<TimelineScreen runs={[run(longFixture(5), 1), run(fixtureEvents(), 2)]} send={async () => 'ok'} onClose={() => {}} />)
    expect(count(many, /<option /g)).toBe(2); expect(many).toContain('data-testid="tl-send"'); expect(many).toContain('📤 В GitHub'); expect(many).toContain('Прохождение <b>91,9 с</b>') // открыто последнее
    expect(html()).not.toContain('tl-send')
  })

  it('длинная игра: в DOM не тысячи узлов — только окно времени, список — порциями', () => {
    const events = longFixture(600), s = renderToStaticMarkup(<TimelineScreen runs={[run(events)]} />)
    expect(events.length).toBeGreaterThan(2500)
    expect(count(s, /class="tlSeg/g)).toBeLessThan(300)
    const m = buildTimeline(events), p = buildPauses(m), list = renderToStaticMarkup(<TimelineList rows={rows(m, p)} pauses={p} />)
    expect(count(list, /class="tlItem"/g)).toBe(PAGE); expect(list).toContain('Показать ещё')
  })

  it('карточка реплики: кто, полный текст, id, начало, длина, что до и после, строка-источник', () => {
    const m = buildTimeline(fixtureEvents()), list = rows(m, buildPauses(m)), l = m.lines.find(x => x.id === 'race_good_3'), i = list.findIndex(r => r.ref === l)
    const s = renderToStaticMarkup(<TimelineCard sel={{ kind: 'line', ref: l }} near={{ prev: list[i - 1], next: list[i + 1] }} />)
    for (const t of ['<b>Пит</b>', 'вот это да, чисто', 'race_good_3', '+25,240 с', '1,4 с', 'игрок: верно «street»', 'Диктор: «приносить»', '[scene] {&quot;t&quot;:30240,&quot;k&quot;:&quot;line-start&quot;']) expect(s, t).toContain(t)
    expect(renderToStaticMarkup(<TimelineCard sel={null} />)).toBe('')
  })
})

describe('геометрия ленты (timelineView)', () => {
  it('visible: вне окна не рисуется; узкие соседние сливаются в блок ×N; keep не даёт слить долгую паузу', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ t: i * 1000, end: i * 1000 + 600, long: i === 500 }))
    expect(visible(items, { from: 10000, to: 20000 }, 0.1).length).toBe(11)
    const far = visible(items, { from: 0, to: 1e6 }, 0.001)
    expect(far.length).toBe(1); expect(far[0].n).toBe(1000)
    const kept = visible(items, { from: 0, to: 1e6 }, 0.001, undefined, x => x.long)
    expect(kept.map(v => v.n ?? 'one')).toEqual([500, 'one', 499]); expect(kept[1].item).toBe(items[500])
  })

  it('масштаб: «всё прохождение» помещается в ширину; зум в пределах [fit, MAX_SCALE]; окно и прокрутка к моменту', () => {
    const fit = fitScale(90000, 313); expect(90000 * fit).toBeLessThanOrEqual(313)
    expect(zoom(fit, -1, fit)).toBe(fit); expect(zoom(0.3, 1, fit)).toBe(MAX_SCALE); expect(zoom(0.04, 1, fit)).toBe(0.08)
    expect(windowOf(1000, 300, 0.1)).toEqual({ from: 7000, to: 16000 })
    expect(scrollFor(30000, 300, 0.04)).toBe(1100); expect(scrollFor(10, 300, 0.04)).toBe(0)
    const ax = axisTicks({ from: 0, to: 10000 }, 0.04, 8000); expect(ax.step).toBe(2000); expect(ax.ticks).toEqual([0, 2000, 4000, 6000, 8000])
  })
})

describe('отчёт таймлайна в отправке логов', () => {
  it('collectLogs: файл отчёта (extra) идёт рядом с журналом; без логов (только комментарий) — не идёт', async () => {
    const at = new Date('2026-11-22T10:00:00Z'), file = timelineFile('== ТАЙМЛАЙН ИГРЫ ==', at)
    expect(file.name).toBe('pithy-timeline-2026-11-22-10-00-00.txt')
    const out = await collectLogs({ journal: { name: 'j.txt', text: 'журнал' }, debugLines: [], last: null, at, extra: [file] })
    expect(out.map(f => f.name)).toEqual(['j.txt', file.name]); expect(out[1].text).toBe('== ТАЙМЛАЙН ИГРЫ ==')
    expect(await collectLogs({ journal: { name: 'j.txt', text: 'журнал' }, debugLines: [], last: null, at, comment: 'к', withLogs: false, extra: [file] })).toHaveLength(1)
  })

  it('lastRunFile: отчёт последнего прохождения со сценой; сцены не было — null', () => {
    expect(lastRunFile([run([{ t: 0, k: 'run' }])])).toBeNull()
    expect(lastRunFile([run(fixtureEvents()), run([{ t: 0, k: 'note' }], 2)]).text).toContain('долгих пауз «игра молчит»: 3')
  })
})

describe('вход из админки и стили', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('блок таймлайна стоит в Админ → «Голос» сразу после режима запуска, не в «Старом»', () => {
    const tab = read('../admin/speech/AdminSpeechTab.jsx')
    expect(tab.indexOf('<StartModeBlock />')).toBeLessThan(tab.indexOf('<TimelineOpenButton />')); expect(tab.indexOf('<TimelineOpenButton />')).toBeLessThan(tab.indexOf('<details className="aspOld"'))
    expect(read('./TimelineOpenButton.jsx')).toContain('🎬 Таймлайн последней игры')
  })
  it('страница не едет по горизонтали: прокрутка только внутри ленты, подписи дорожек закреплены', () => {
    const css = read('../../styles/timeline.css'), rib = read('../../styles/timeline-ribbon.css')
    expect(css).toMatch(/\.tlBody \{[^}]*overflow-x: hidden/); expect(rib).toMatch(/\.tlScroll \{[^}]*overflow-x: auto/); expect(rib).toMatch(/\.tlLabel \{[^}]*position: sticky; left: 0/)
    for (const f of [css, rib]) expect(f.split('\n').length).toBeLessThanOrEqual(250)
  })
})

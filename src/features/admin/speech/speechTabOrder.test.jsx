import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceBlock from './RaceBlock.jsx'
import { RaceOldSlot } from './raceOldSlot.js'
import TimelineScreen from '../../timeline/TimelineScreen.jsx'
import { statusLine, noteServerCount, readServerCount, SERVER_COUNT_KEY } from '../../timeline/timelineServerNote.js'
import { fixtureEvents } from '../../timeline/timelineFixture.js'

// v3.3.344 (владелец: «режимы запуска звука закинь тоже в олд, встряхни память в самом верху, а таймлайн под ним компактно. так кстати два олда объедини»):
// порядок блоков вкладки «Голос», одно «Старое» (в нём старая часть «Встряхни память» и режим запуска) и компактная шапка экрана таймлайна.
vi.mock('../../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) })) // фоновая загрузка Vosk в разметке без браузера не нужна
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
afterEach(() => vi.unstubAllGlobals())

describe('вкладка «Голос»: порядок блоков', () => {
  const src = read('./AdminSpeechTab.jsx')
  const at = s => { const i = src.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i }
  it('«Встряхни память» — в самом верху, сразу под ним таймлайн, потом ОДНО «Старое»', () => {
    const race = at('<RaceBlock />'), tl = at('<TimelineOpenButton />'), old = at('<details className="aspOld"'), end = at('</details>')
    expect(race).toBeLessThan(tl); expect(tl).toBeLessThan(old)
    expect(src.slice(0, race)).not.toMatch(/<[A-Z]\w*Block\b/) // над «Встряхни память» других блоков нет
    expect(src.match(/<details/g)).toHaveLength(1)
    expect(end).toBeGreaterThan(old)
  })
  it('в «Старое» первым стоит место старой части «Встряхни память», за ним режим запуска звука, дальше прежние блоки', () => {
    const old = at('<details className="aspOld"'), end = at('</details>'), home = at('data-testid="race-old-home"'), slot = at('ref={setOldSlot}'), start = at('<StartModeBlock />')
    expect(old).toBeLessThan(home); expect(home).toBeLessThan(slot); expect(slot).toBeLessThan(start); expect(start).toBeLessThan(at('<GameVolumeBlock />')); expect(start).toBeLessThan(end)
    expect(src).toContain('Встряхни память — старое (old), не в прод'); expect(src).toContain('<RaceOldSlot.Provider value={oldSlot}>')
  })
  it('RaceBlock во вкладке (есть место в общем «Старое») своего раздела «Старое (old)» не рисует; сам по себе — рисует, как раньше', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(['race-old']), setItem() {} })
    const inTab = renderToStaticMarkup(<RaceOldSlot.Provider value={null}><RaceBlock /></RaceOldSlot.Provider>)
    expect(inTab).toContain('data-testid="race-run-main"'); expect(inTab).toContain('data-testid="race-voice"')
    for (const k of ['Старое (old), не в прод', 'data-testid="race-old"', 'race-run-stages', 'race-run-full', 'race-export', 'race-settings']) expect(inTab, k).not.toContain(k)
    const alone = renderToStaticMarkup(<RaceBlock />)
    for (const k of ['Старое (old), не в прод', 'race-run-stages', 'race-run-full', 'race-export', 'race-settings']) expect(alone, k).toContain(k)
    const block = read('./RaceBlock.jsx')
    expect(block).toContain('oldSlot ? createPortal(old, oldSlot) : null'); expect(block).toContain('const oldSlot = useContext(RaceOldSlot)')
  })
  it('таймлайн — одной строкой: заголовок, кнопка «🎬 Таймлайн игры» и короткий статус, без абзаца-подсказки', () => {
    const btn = read('../../timeline/TimelineOpenButton.jsx')
    expect(btn).toContain('className="aspBlock aspTlRow"'); expect(btn).toContain('>🎬 Таймлайн игры</button>'); expect(btn).toContain('data-testid="timeline-status"'); expect(btn).not.toContain('aspHint')
    expect(read('../../../styles/admin-speech.css')).toMatch(/\.aspBlock\.aspTlRow \{ flex-direction: row/)
  })
  it('статус: «последняя игра: время, длина · на сервере N»; число игр на сервере — запомненное экраном, без запроса', () => {
    const mem = {}, store = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v } }
    expect(readServerCount(store)).toBeNull(); noteServerCount(3, store); expect(mem[SERVER_COUNT_KEY]).toBe('3'); expect(readServerCount(store)).toBe(3)
    const at0 = new Date(2026, 10, 22, 12, 41).getTime()
    expect(statusLine([{ id: 1, at: at0, events: fixtureEvents() }], 3)).toBe('последняя игра: 12:41, 1:31 · на сервере 3')
    expect(statusLine([], null)).toBe('в этом сеансе игр не было · на сервере — покажет экран')
    expect(read('../../timeline/useTimelineServer.js')).toContain('noteServerCount(r?.runs?.length ?? 0)')
  })
})

describe('экран таймлайна: компактная шапка', () => {
  const run = { id: 1, at: 0, meta: { game: 'race' }, events: fixtureEvents(), dropped: 0 }
  const server0 = { status: 'ready', runs: [], error: '' }
  it('первая строка — название, выбор прохождения с сервером, «В GitHub», «Закрыть»; вторая — вкладки, порог и сводка; отдельных строк источников и сводки нет', () => {
    const s = renderToStaticMarkup(<TimelineScreen runs={[run, { ...run, id: 2 }]} tab0="montage" send={async () => 'ok'} onClose={() => {}} server0={server0} />)
    const head = s.slice(s.indexOf('<header'), s.indexOf('</header>')), bar = s.slice(s.indexOf('data-testid="tl-bar"'), s.indexOf('data-testid="tl-montage"'))
    for (const k of ['🎬 Таймлайн игры', 'data-testid="tl-src"', 'data-testid="tl-run-select"', 'data-testid="tl-reload"', 'data-testid="tl-send"', 'data-testid="tl-close"']) expect(head, k).toContain(k)
    for (const k of ['role="tablist"', 'aria-label="Порог долгой паузы"', 'data-testid="tl-sum"', 'Прохождение <b>']) expect(bar, k).toContain(k)
    expect(s.indexOf('data-testid="tl-src"')).toBeLessThan(s.indexOf('class="tlBody"')) // строка источников — в шапке, а не отдельной строкой в теле
  })
  it('панель монтажа — одна строка; легенда и «как читать» свёрнуты под «?»', () => {
    const s = renderToStaticMarkup(<TimelineScreen runs={[run]} tab0="montage" />)
    expect(s).toContain('data-testid="mtg-help"'); expect(s).toMatch(/aria-expanded="false"[^>]*data-testid="mtg-help"/)
    for (const k of ['mtgLegend', 'mtg-how', 'Как читать']) expect(s, k).not.toContain(k)
    const css = read('../../../styles/timeline-block.css')
    expect(css).toMatch(/\.mtg \.mtgBar \{ flex-direction: row; flex-wrap: wrap/); expect(css).toMatch(/\.tlHead \{ padding: 6px 12px/); expect(css.split('\n').length).toBeLessThanOrEqual(250)
  })
})

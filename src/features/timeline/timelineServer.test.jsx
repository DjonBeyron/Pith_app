import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import TimelineScreen from './TimelineScreen.jsx'
import { fixtureEvents } from './timelineFixture.js'
import { reverseEvents, serverRuns } from './timelineFixtureServer.js'
import { sourceList, packRun, serverId, sameRun, deviceLabel, savedWhen, hasScene } from './timelineStore.js'
import { TIMELINE_MAX_EVENTS } from '../../shared/api/timelineApi.js'
import { APP_VERSION } from '../../shared/lib/version.js'

const NOW = new Date(2026, 10, 22, 13, 0, 0)
const local = (id = 2, events = fixtureEvents()) => ({ id, at: new Date(2026, 10, 22, 12, 41).getTime(), meta: { game: 'race', only: 'stages' }, events, dropped: 0 })
const server = { read: async () => ({ runs: [], error: null }), save: async () => ({ ok: true }) }
const ready = runs => ({ status: 'ready', runs, error: '' })
const html = props => renderToStaticMarkup(<TimelineScreen {...props} />)
const options = s => [...s.matchAll(/<option value="([^"]+)"( selected="")?>([^<]+)</g)].map(x => ({ key: x[1], on: !!x[2], label: x[3] }))

describe('прохождения из двух источников: это устройство и сервер (timelineStore)', () => {
  it('упаковка для сервера: id, savedAt (ISO), устройство, версия приложения, мета, события (копия), dropped', () => {
    const r = local(), p = packRun(r, { now: new Date('2026-11-22T10:00:00Z'), device: 'iPhone 390×844' })
    expect(p).toMatchObject({ id: serverId(r), savedAt: '2026-11-22T10:00:00.000Z', at: r.at, device: 'iPhone 390×844', appVersion: APP_VERSION, meta: { game: 'race', only: 'stages' }, dropped: 0 })
    expect(Object.keys(p).sort()).toEqual(['appVersion', 'at', 'device', 'dropped', 'events', 'id', 'meta', 'savedAt'])
    expect(p.events).toEqual(r.events); expect(p.events).not.toBe(r.events)
    expect(serverId(local(3))).not.toBe(serverId(local(2)))
  })

  it('устройство коротко: платформа и размер экрана', () => {
    const env = (userAgent, width, height, maxTouchPoints = 0) => ({ navigator: { userAgent, maxTouchPoints }, screen: { width, height } })
    expect(deviceLabel(env('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', 390, 844, 5))).toBe('iPhone 390×844')
    expect(deviceLabel(env('Mozilla/5.0 (Linux; Android 11; SM-A505F)', 412, 915, 5))).toBe('Android 412×915')
    expect(deviceLabel(env('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 1920, 1080))).toBe('Windows 1920×1080')
    expect(deviceLabel(env('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 1440, 900))).toBe('Mac 1440×900'); expect(deviceLabel(env('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 820, 1180, 5))).toBe('iPad 820×1180')
    expect(deviceLabel({})).toBe('устройство')
  })

  it('общий список: сначала сервер, потом это устройство; источник подписан; одинаковые не дублируются (id или первый t и число событий)', () => {
    const mine = local(), srv = serverRuns(NOW.getTime()), same = packRun(mine, { now: NOW, device: 'iPhone 390×844' })
    const list = sourceList([mine], [...srv, same, srv[1]], NOW)
    expect(list.map(e => e.src)).toEqual(['server', 'server', 'local'])
    expect(list[0].label).toMatch(/^сервер · Android 412×915 · 21\.11 \d\d:\d\d · v3\.3\.338 · race\/stages · \d+ соб\.$/)
    expect(list[1].label).toBe(`сервер · iPhone 390×844 · 12:46 · v3.3.339 · race/pingpong · ${reverseEvents().length} соб.`)
    expect(list[2].label).toBe(`это устройство · №2 · 12:41 · race/stages · ${mine.events.length} соб. · ☁ на сервере`); expect(list[2].saved).toBe(true)
    expect(new Set(list.map(e => e.key)).size).toBe(3)
    expect(sameRun(mine, { id: 'другой', events: mine.events.slice() })).toBe(true); expect(sameRun(mine, { id: 'другой', events: mine.events.slice(1) })).toBe(false)
    expect(sourceList([{ id: 1, events: [{ t: 0, k: 'run' }] }], [{ id: 'x', savedAt: '', events: [{ t: 0, k: 'note' }] }])).toEqual([]) // без сцены — не показываем
    expect(hasScene(mine)).toBe(true); expect(savedWhen('мусор')).toBe('')
  })

  it('размер одной игры на сервере: фикстуры — единицы килобайт; потолок 3000 событий держит строку из трёх игр в пределах ~1 МБ', () => {
    const one = JSON.stringify(packRun(local(), { now: NOW, device: 'iPhone 390×844' })).length, rev = JSON.stringify(packRun(local(1, reverseEvents()), { now: NOW, device: 'iPhone 390×844' })).length
    expect(one).toBeGreaterThan(5000); expect(one).toBeLessThan(12000); expect(rev).toBeLessThan(9000)
    const perEvent = one / fixtureEvents().length
    expect(perEvent * TIMELINE_MAX_EVENTS * 3).toBeLessThan(1_000_000)
  })
})

describe('экран: выбор «сервер / это устройство» и состояния сервера', () => {
  it('открыт на ПК (своих игр нет): показано последнее прохождение с сервера, в выборе подписан источник', () => {
    const s = html({ runs: [], server, server0: ready(serverRuns()) }), o = options(s)
    expect(o).toHaveLength(2); expect(o.map(x => x.on)).toEqual([false, true])
    expect(o[0].label).toContain('сервер · Android 412×915'); expect(o[1].label).toContain('сервер · iPhone 390×844'); expect(o[1].label).toContain('v3.3.339')
    expect(s).toContain('Прохождение <b>73,8 с</b>'); expect(s).toContain('Разворот конвейера')
    expect(s).toMatch(/data-testid="tl-src-state" data-status="ready">на сервере сохранённых игр: 2</)
    expect(s).toContain('data-testid="tl-reload"'); expect(s).toContain('↻ Обновить с сервера'); expect(s).not.toContain('data-testid="tl-save"') // серверное прохождение сохранять незачем
  })

  it('на телефоне после игры: и своё прохождение, и серверные; открыто своё, есть «☁ Сохранить на сервер»', () => {
    const s = html({ runs: [local()], server, server0: ready(serverRuns()) }), o = options(s)
    expect(o.map(x => x.label.split(' · ')[0])).toEqual(['сервер', 'сервер', 'это устройство']); expect(o[2].on).toBe(true)
    expect(s).toContain('Прохождение <b>91,9 с</b>'); expect(s).toMatch(/data-testid="tl-save">☁ Сохранить на сервер</)
  })

  it('загрузка: экран работает на своих прохождениях, статус «загружаю…», «Обновить» выключена; без своих игр — «Загружаю сохранённые игры с сервера…»', () => {
    const s = html({ runs: [local()], server })
    expect(s).toMatch(/data-status="loading">сервер: загружаю сохранённые игры…</); expect(s).toMatch(/<button type="button" class="tlBtn" disabled="" data-testid="tl-reload">/); expect(s).toContain('data-testid="tl-pauses"')
    const e = html({ runs: [], server })
    expect(e).toMatch(/data-testid="tl-empty" data-status="loading"><p>Загружаю сохранённые игры с сервера…</); expect(e).not.toContain('tl-reload')
  })

  it('ошибка сети: понятный текст, экран при этом работает на локальных данных; без своих игр — текст и кнопка «Обновить»', () => {
    const err = { status: 'error', runs: [], error: 'TypeError: Failed to fetch' }
    const s = html({ runs: [local()], server, server0: err })
    expect(s).toMatch(/class="tlSrcState tlRed" data-testid="tl-src-state" data-status="error">сервер недоступен: TypeError: Failed to fetch — показаны только игры этого устройства</)
    expect(s).toContain('Прохождение <b>91,9 с</b>'); expect((s.match(/data-testid="tl-pause"/g) ?? []).length).toBe(3)
    const e = html({ runs: [], server, server0: err })
    expect(e).toContain('Игр в этом сеансе ещё не было, а сервер недоступен: TypeError: Failed to fetch'); expect(e).toContain('data-testid="tl-reload"')
  })

  it('пусто: на сервере игр нет — строка статуса; своих тоже нет — «…на сервере сохранённых игр тоже нет»; без сервера — прежний текст и ни одной серверной кнопки', () => {
    expect(html({ runs: [local()], server, server0: ready([]) })).toMatch(/data-status="ready">на сервере сохранённых игр пока нет</)
    expect(html({ runs: [], server, server0: ready([]) })).toContain('Игр в этом сеансе ещё не было, на сервере сохранённых игр тоже нет — сыграй и вернись.')
    const plain = html({ runs: [local()] })
    expect(plain).not.toContain('tl-reload'); expect(plain).not.toContain('tl-save'); expect(plain).not.toContain('tl-src-state'); expect(html({ runs: [] })).toContain('Игр в этом сеансе ещё не было — сыграй и вернись.')
  })

  it('сервер читается только экраном таймлайна: старт приложения и игра строку не читают; кнопка админки передаёт экрану чтение и запись', () => {
    const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
    expect(read('./TimelineOpenButton.jsx')).toMatch(/const SERVER = \{ read: \(\) => readTimelines\(\), save: run => saveTimeline\(packRun\(run\)\) \}/)
    expect(read('./timelineAutosave.js')).not.toContain('readTimelines'); expect(read('../../app/App.jsx')).not.toContain('timelineApi')
    expect(read('./useTimelineServer.js')).toMatch(/useEffect\(\(\) => \{ if \(server && !initial\) fetchNow\(\) \}/)
  })
})

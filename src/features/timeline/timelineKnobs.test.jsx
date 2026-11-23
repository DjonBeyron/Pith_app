import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { collectKnobs, gapKnobs, gapKnobText, gapKnobReport, gapKnobMark, knobUsage, shorterBy, knobForEdit, overridesText } from './timelineKnobs.js'
import { effective, draftValue, sourceName, setDraft, changes, changesText, deviceSet, dInit, dPush, dUndo, dRedo, loadPauseDraft, savePauseDraft, applyDevice, applyServer, MIGRATION_NOTE } from './pauseDraft.js'
import { knobEvents } from './timelineFixtureKnobs.js'
import { realEvents } from './timelineFixtureReal.js'
import { buildTimeline } from './timelineModel.js'
import { buildPauses } from './timelinePauses.js'
import { buildMontage } from './montage/montageModel.js'
import { makeEdit } from './montage/montageEdits.js'
import { reportText } from './timelineReport.js'
import { blockContext } from './timelineBlockContext.js'
import TimelineScreen from './TimelineScreen.jsx'
import TimelineCard from './TimelineCard.jsx'
import MontageKnobHint from './montage/MontageKnobHint.jsx'
import MontageGap from './montage/MontageGap.jsx'
import { validatePauses, PAUSE_DEFAULTS } from '../../shared/lib/scenePauses.js'

// Настройки пауз на экране таймлайна: какая настройка дала тишину, оценка «короче на X с», черновик с отменой, проба на устройстве и применение всем, перенос правки монтажа в настройку, отчёт.
const ev = knobEvents(), m = buildTimeline(ev, {}), k = collectKnobs(ev, {}), mont = buildMontage(m)
const old = realEvents(), mOld = buildTimeline(old, {}), kOld = collectKnobs(old, {})
const gapAt = t => mont.gaps.find(g => Math.abs(g.t - t) < 2)
const mem = () => { const o = new Map(); return { get: x => o.get(x) ?? null, set: (x, v) => { o.set(x, v); return true }, del: x => o.delete(x), keys: () => [...o.keys()] } }
// подставные сервер и память устройства; deny — запись для всех отклонена
const fakeApi = ({ deny = false, server = null } = {}) => { const s = { server, device: {}, saves: 0 }; s.api = { readServer: async () => ({ ok: true, value: s.server, error: null }), saveServer: async p => { if (deny) return { ok: false, error: 'сервер не подтвердил запись (нужны права админа)' }; s.server = { v: 1, pauses: validatePauses(p).pauses }; s.saves++; return { ok: true } }, readDevice: () => ({ pauses: s.device }), saveDevice: o => { s.device = validatePauses(o).pauses; return { ok: true } } }; return s }

describe('какая настройка дала тишину', () => {
  it('событие knob во время зазора: «Похвала после верного слова» 0,5 с и остаток, который настройкой не является', () => {
    const r = gapKnobs(gapAt(12118), k)
    expect(r.parts.map(p => [p.key, p.ms, p.set, p.how])).toEqual([['good.delay', 500, false, 'knob']]); expect(r.covered).toBeGreaterThan(450); expect(r.rest).toBeGreaterThan(50); expect(r.rest).toBeLessThan(160)
    expect(gapKnobText(r)).toMatch(/^зазор 0,61 с = настройка «Похвала после верного слова» 0,5 с \+ остальное 0,11 с \(анимация, кадры, длина звука — в трассе не записано\)$/)
    expect(gapKnobText(gapKnobs(gapAt(14485), k))).toBe('зазор 0,35 с = настройка «Следующее слово после похвалы» 0,35 с'); expect(gapKnobMark(r)).toBe('def')
  })
  it('pauses стадии: несколько настроек в одном зазоре (минимум плашки и плашка после слов Пита) — место отсчёта оценено, помечено how: stage', () => {
    const r = gapKnobs(gapAt(3484), k)
    expect(r.parts.map(p => [p.key, p.how])).toEqual([['race.announce', 'stage'], ['plate.hold', 'stage']])
    expect(r.parts[1]).toMatchObject({ ms: 1200, part: 1200 }); expect(r.parts[0].part).toBeLessThan(200) // минимум плашки отсчитывается от начала стадии — в эту тишину попал только его хвост
    expect(gapKnobText(r)).toContain('настройка «Плашка этапа: сколько держится минимум» 1,7 с — в этой тишине 0,13 с + настройка «Плашка этапа после слов Пита» 1,2 с + остальное 0,25 с')
  })
  it('зазор, который настройкой не задан: «ждём игрока», отсчёт — так и написано; изменённая настройка помечена', () => {
    expect(gapKnobText(gapKnobs(gapAt(8885), k))).toBe('настройками не задана: 3,23 с — ждём игрока'); expect(gapKnobMark(gapKnobs(gapAt(8885), k))).toBeNull()
    expect(gapKnobText(gapKnobs(gapAt(4929), k))).toBe('настройками не задана: 2,5 с — отсчёт нотами')
    const mia = k.spans.find(s => s.key === 'mia.gap'), r = gapKnobs({ t: mia.t, end: mia.end, kind: 'dead' }, k)
    expect(mia.set).toBe(true); expect(gapKnobMark(r)).toBe('set'); expect(gapKnobText(r)).toContain('(изменена)')
    expect(k.overrides).toEqual({ 'mia.gap': mia.ms }); expect(overridesText(k.overrides)).toBe(`Пауза между репликами Мии и Пита ${String(mia.ms / 1000).replace('.', ',')} с (по умолчанию 0,35 с)`)
  })
  it('старое прохождение (до v3.3.351, без knob и pauses): «настройки не записаны — сыграй заново»; модель таймлайна от событий knob не меняется', () => {
    expect(kOld.recorded).toBe(false); expect(kOld.spans).toEqual([]); expect(k.recorded).toBe(true)
    const g = buildMontage(mOld).gaps[0], r = gapKnobs(g, kOld)
    expect(r).toMatchObject({ recorded: false, parts: [], rest: Math.max(0, g.end - g.t) }); expect(gapKnobText(r)).toBe('в этой игре настройки не записаны (игра до v3.3.351) — сыграй заново'); expect(gapKnobMark(r)).toBeNull()
    expect(m.kinds.knob).toBeGreaterThan(10); expect(mOld.kinds.knob).toBeUndefined()
    expect(m.lines.map(l => [l.id, l.t, l.end])).toEqual(mOld.lines.map(l => [l.id, l.t, l.end])); expect(buildPauses(m).map(p => [p.t, p.ms, p.kind])).toEqual(buildPauses(mOld).map(p => [p.t, p.ms, p.kind])); expect(m.dur).toBe(mOld.dur)
    expect(collectKnobs([], {})).toEqual({ recorded: false, spans: [], overrides: {} }); expect(collectKnobs([{ t: 0, k: 'knob', key: 'нет.такой', ms: 5 }], {}).spans).toEqual([]) // неизвестный ключ не ломает
    expect(collectKnobs(old, { pauses: { 'mia.gap': 500, 'x': 1 } }).overrides).toEqual({ 'mia.gap': 500 }) // мета объектом (как в тесте игровой части) и строкой — одинаково
  })
  it('сколько раз настройка сработала и оценка «эта игра стала бы короче на X с»', () => {
    const u = knobUsage(k)
    expect(u['good.delay']).toEqual({ n: 4, ms: 2000 }); expect(u['preSay.gap']).toEqual({ n: 5, ms: 2250 }); expect(u['stage.exit']).toEqual({ n: 0, ms: 0 }); expect(Object.keys(u)).toHaveLength(13)
    expect(shorterBy(k, 'good.delay', 300)).toBe(800); expect(shorterBy(k, 'good.delay', 700)).toBe(-800); expect(shorterBy(k, 'stage.exit', 300)).toBe(0); expect(shorterBy(kOld, 'good.delay', 300)).toBe(0)
  })
})

describe('черновик настроек', () => {
  const eff0 = effective({}, {})
  it('что действует: сервер, поверх него это устройство; источник значения словами', () => {
    const e = effective({ 'good.delay': 300, 'stage.exit': 2000 }, { 'good.delay': 700 })
    expect(e.values['good.delay']).toBe(700); expect(e.from).toEqual({ 'good.delay': 'device', 'stage.exit': 'server' }); expect(e.overrides).toEqual({ 'good.delay': 700, 'stage.exit': 2000 }); expect(e.values['mia.gap']).toBe(PAUSE_DEFAULTS['mia.gap'])
    expect(sourceName(null, e, 'good.delay')).toBe('это устройство'); expect(sourceName(null, e, 'stage.exit')).toBe('сервер'); expect(sourceName(null, e, 'mia.gap')).toBe('по умолчанию')
    expect(sourceName({ 'mia.gap': 500 }, e, 'mia.gap')).toBe('черновик — ещё не применён'); expect(draftValue(null, e, 'good.delay')).toBe(700); expect(draftValue({}, e, 'good.delay')).toBe(500)
    expect(effective({ 'good.delay': 300 }, { 'good.delay': 500 }).from).toEqual({}) // умолчание на устройстве отменяет серверное значение
  })
  it('значение вне пределов не принимается — причина словами; шаг 50 мс; «по умолчанию» убирает настройку из черновика', () => {
    expect(setDraft(null, eff0, 'good.delay', 100).error).toBe('«Похвала после верного слова»: 0,1 с не принимается — можно от 0,15 с до 2,0 с (меньше нельзя: сцена сломается)')
    expect(setDraft(null, eff0, 'good.delay', 9000).error).toContain('не принимается — можно от'); expect(setDraft(null, eff0, 'good.delay', NaN).error).toBe('нужно число (секунды)'); expect(setDraft(null, eff0, 'нет', 1).error).toBe('нет такой настройки')
    expect(setDraft(null, eff0, 'good.delay', 320).draft).toEqual({ 'good.delay': 300 })
    expect(setDraft({ 'good.delay': 300, 'mia.gap': 500 }, eff0, 'good.delay', 500).draft).toEqual({ 'mia.gap': 500 })
    expect(changesText(changes({ 'good.delay': 300 }, {}))).toBe('Похвала после верного слова: 0,5 с → 0,3 с'); expect(changes({}, {})).toEqual([])
  })
  it('отмена и возврат — весь стек; черновик переживает закрытие экрана (хранилище)', () => {
    let h = dInit()
    h = dPush(h, { 'good.delay': 300 }); h = dPush(h, { 'good.delay': 300, 'mia.gap': 500 }); h = dPush(h, { 'good.delay': 300, 'mia.gap': 500 }) // тот же набор — не шаг
    expect(h.past).toHaveLength(2)
    h = dUndo(h); expect(h.now).toEqual({ 'good.delay': 300 }); h = dUndo(h); expect(h.now).toBeNull(); h = dUndo(h); expect(h.now).toBeNull()
    h = dRedo(dRedo(h)); expect(h.now).toEqual({ 'good.delay': 300, 'mia.gap': 500 })
    const st = mem(); savePauseDraft(st, h)
    expect(loadPauseDraft(st)).toEqual({ past: [null, { 'good.delay': 300 }], now: { 'good.delay': 300, 'mia.gap': 500 }, future: [] })
    expect(loadPauseDraft(mem())).toEqual(dInit()); const bad = mem(); bad.set('pithy.timeline.pauseDraft.v1', '{мусор'); expect(loadPauseDraft(bad)).toEqual(dInit())
  })
})

describe('применение: это устройство и все игроки', () => {
  it('«попробовать на этом устройстве»: пишется только то, что отличается от сервера; умолчание пишется явно, если отменяет серверное', () => {
    expect(deviceSet({ 'good.delay': 300, 'mia.gap': 500 }, { 'mia.gap': 500, 'stage.exit': 2000 })).toEqual({ 'good.delay': 300, 'stage.exit': 1300 })
    const s = fakeApi(), r = applyDevice(s.api, { 'good.delay': 300 }, {})
    expect(r.ok).toBe(true); expect(r.text).toContain('действует со следующей игры ТОЛЬКО здесь'); expect(s.device).toEqual({ 'good.delay': 300 }); expect(s.server).toBeNull()
    expect(applyDevice({ saveDevice: () => ({ ok: false }) }, { 'good.delay': 300 }, {})).toMatchObject({ ok: false })
  })
  it('«применить для всех»: запись на сервер, чтение обратно — «сохранено на сервере», подсказка про миграцию; свои значения устройства снимаются', async () => {
    const s = fakeApi(); s.device = { 'good.delay': 300 }
    const r = await applyServer(s.api, { 'good.delay': 300, 'stage.exit': 2000 })
    expect(r.ok).toBe(true); expect(s.server.pauses).toEqual({ 'good.delay': 300, 'stage.exit': 2000 }); expect(r.server).toEqual(s.server.pauses); expect(s.device).toEqual({})
    expect(r.text).toContain('🌍 Сохранено на сервере (прочитано обратно): изменено настроек — 2'); expect(r.text).toContain(MIGRATION_NOTE); expect(MIGRATION_NOTE).toContain('миграция scene_pauses_public_key')
  })
  it('отказ записи (не админ, сеть) — понятный текст, черновик и сервер целы; сброс на сервере — пустой набор', async () => {
    const s = fakeApi({ deny: true, server: { v: 1, pauses: { 'mia.gap': 500 } } }), r = await applyServer(s.api, { 'good.delay': 300 })
    expect(r).toEqual({ ok: false, text: '✗ Для всех не сохранилось: сервер не подтвердил запись (нужны права админа). Запись для всех игроков проходит только у админа и при работающей сети. Черновик остался, у игроков ничего не изменилось.' })
    expect(s.server.pauses).toEqual({ 'mia.gap': 500 })
    expect((await applyServer({ ...s.api, saveServer: async () => { throw new Error('Failed to fetch') } }, {})).text).toContain('Failed to fetch')
    const ok = fakeApi({ server: { v: 1, pauses: { 'mia.gap': 500 } } }), z = await applyServer(ok.api, {})
    expect(ok.server.pauses).toEqual({}); expect(z.text).toContain('все паузы по умолчанию')
  })
})

describe('правка монтажа → настройка', () => {
  const key = 'dictor:пытаюсь#1', grp = mont.groups.find(g => Math.abs(g.t - 14485) < 2), span = { t: grp.t, end: grp.end, kind: 'dead' }
  it('зазор целиком задан одной настройкой: «зазор 0,35 → 0,1 с» превращается в «Следующее слово после похвалы: 0,3 с → 0,1 с»; упёрлось в предел — помечено', () => {
    const r = gapKnobs(span, k), edit = makeEdit(mont, key, 'ripple', 100)
    expect(knobForEdit(r, grp.flex, edit)).toEqual({ key: 'afterGood.gap', title: 'Следующее слово после похвалы', from: 350, to: 100, clamped: false })
    expect(knobForEdit(r, grp.flex, makeEdit(mont, key, 'ripple', 0))).toMatchObject({ to: 100, clamped: true }); expect(knobForEdit(r, grp.flex, null)).toBeNull()
  })
  it('несколько настроек или настройка покрывает мало — переноса нет, показано разложение', () => {
    const g0 = mont.groups[0], r0 = gapKnobs({ t: g0.t, end: g0.end, kind: 'dead' }, k)
    expect(knobForEdit(r0, g0.flex, { from: 4000, to: 2000 })).toBeNull() // две настройки
    expect(knobForEdit(gapKnobs(span, k), 5000, { from: 350, to: 100 })).toBeNull() // настройка — меньше 80 % сдвигаемой части
    expect(knobForEdit(gapKnobs(span, kOld), grp.flex, { from: 350, to: 100 })).toBeNull()
  })
  it('подсказка под правкой зазора: одна настройка — кнопка «перенести в настройки»; старая игра — «не записаны»', () => {
    const knobs = kk => ({ can: true, of: s => gapKnobs(s, kk), set: () => '', show() {}, value: x => PAUSE_DEFAULTS[x], eff: { values: PAUSE_DEFAULTS }, usage: knobUsage(kk), source: () => 'по умолчанию', shorter: () => 0 })
    const h = renderToStaticMarkup(<MontageKnobHint base={mont} sel={key} edit={makeEdit(mont, key, 'ripple', 100)} knobs={knobs(k)} revert={() => {}} />)
    expect(h).toMatch(/data-mode="one"/); expect(h).toContain('Этот зазор задаёт настройка <b>«Следующее слово после похвалы»</b> — изменить настройку: <b>0,35 с → 0,1 с</b>'); expect(h).toContain('data-testid="mtg-knob-move"')
    expect(renderToStaticMarkup(<MontageKnobHint base={mont} sel={key} edit={null} knobs={knobs(k)} revert={() => {}} />)).toMatch(/data-mode="many"/)
    expect(renderToStaticMarkup(<MontageKnobHint base={buildMontage(mOld)} sel={key} edit={null} knobs={knobs(kOld)} revert={() => {}} />)).toContain('настройки пауз не записаны (игра до v3.3.351)')
  })
})

describe('экран и отчёт', () => {
  const run = { id: 6, at: 0, meta: { game: 'race' }, events: ev, dropped: 0 }
  it('шапка: кнопка «⚙ Настройки пауз» во второй строке; пометка «в этой игре изменены паузы»; у зазора на столе — значок ⚙', () => {
    const s = renderToStaticMarkup(<TimelineScreen runs={[run]} tab0="montage" store={mem()} />)
    const bar = s.slice(s.indexOf('data-testid="tl-bar"'), s.indexOf('data-testid="tl-montage"'))
    expect(bar).toContain('data-testid="tl-knobs-btn"'); expect(bar).toContain('в этой игре изменены паузы: Пауза между репликами Мии и Пита'); expect(s).not.toContain('data-testid="tl-knobs"')
    expect(s).toMatch(/data-testid="mtg-gap"[^>]*data-knob="def"/); expect(s).toContain('class="mtgGapKnob"')
    expect(renderToStaticMarkup(<MontageGap g={mont.gaps[0]} scale={0.05} knob="set" />)).toContain('в этой игре она была изменена'); expect(renderToStaticMarkup(<MontageGap g={mont.gaps[0]} scale={0.05} />)).not.toContain('mtgGapKnob')
  })
  it('панель: 13 настроек по этапам, простое объяснение, состояние, два разных применения с подсказкой про миграцию; без api — только показ', () => {
    const s = renderToStaticMarkup(<TimelineScreen runs={[run]} tab0="pauses" store={mem()} knobs0 pauseApi={fakeApi().api} />)
    expect((s.match(/data-testid="tl-knob" /g) ?? []).length).toBe(13)
    for (const t of ['Настройка — это пауза в сценарии игры', '📱 на этом устройстве изменено: <b>0</b>', '🎬 в этой игре действовало:', 'Конвейер слов', 'Допрос у Мии', '📱 Попробовать на этом устройстве', '🌍 Применить для всех игроков', 'Только этот телефон или компьютер', 'Игра изменится <b>у всех</b>', 'миграция scene_pauses_public_key', 'data-testid="tl-knobs-only"', 'в этой игре сработала 4 раза, всего 2,0 с']) expect(s, t).toContain(t)
    expect(s).toMatch(/data-testid="tl-knob-chip">⚙ /) // карточка паузы на вкладке «Паузы»: строка с настройкой
    const ro = renderToStaticMarkup(<TimelineScreen runs={[run]} tab0="pauses" store={mem()} knobs0 />)
    expect(ro).toContain('Здесь только показ'); expect(ro).not.toContain('tl-knob-range'); expect(ro).not.toContain('tl-apply-device')
  })
  it('карточка зазора: «Чем задана эта тишина» с управлением; старая игра — честная строка', () => {
    const knobs = kk => ({ can: true, of: s => gapKnobs(s, kk), show() {}, set: () => '', value: x => (x === 'good.delay' ? 300 : PAUSE_DEFAULTS[x]), eff: { values: PAUSE_DEFAULTS }, usage: knobUsage(kk), source: () => 'черновик — ещё не применён', shorter: (x, to) => shorterBy(kk, x, to) })
    const s = renderToStaticMarkup(<TimelineCard sel={{ kind: 'gap', ref: gapAt(12118) }} knobs={knobs(k)} />)
    for (const t of ['Чем задана эта тишина', '⚙ Похвала после верного слова', 'пилюля взлетела → Пит хвалит', 'было 0,5 с → стало 0,3 с', 'по умолчанию 0,5 с', 'черновик — ещё не применён', 'с таким значением эта игра стала бы короче на 0,8 с', 'data-testid="tl-knob-range"', 'data-testid="tl-knob-default"']) expect(s, t).toContain(t)
    expect(renderToStaticMarkup(<TimelineCard sel={{ kind: 'gap', ref: buildMontage(mOld).gaps[0] }} knobs={knobs(kOld)} />)).toContain('в этой игре настройки не записаны (игра до v3.3.351) — сыграй заново')
  })
  it('отчёт в GitHub: в шапке — действовавшие переопределения, у долгой паузы — строка «настройки: …»; файл-контекст блока — то же', () => {
    const t = reportText(m, { knobs: k })
    expect(t).toContain('настройки пауз в этой игре: ИЗМЕНЕНЫ — Пауза между репликами Мии и Пита'); expect(t).toMatch(/\n {3}настройки: Плашка этапа: сколько держится минимум 1,7 с \(по умолчанию\) \[race\.announce\] \+ /)
    expect(reportText(mOld, { knobs: kOld })).toContain('настройки пауз в этой игре: не записаны (игра до v3.3.351)'); expect(reportText(m)).not.toContain('настройки')
    expect(gapKnobReport(gapKnobs(gapAt(12118), k))).toBe('настройки: Похвала после верного слова 0,5 с (по умолчанию) [good.delay]; остальное 0,11 с — анимация, кадры, длина звука — в трассе не записано')
    const c = blockContext({ sel: { kind: 'gap', ref: gapAt(12118) }, m, run, entry: { rid: 'r', src: 'local' }, knobs: k })
    expect(c.text).toContain('настройки: Похвала после верного слова 0,5 с (по умолчанию) [good.delay]')
  })
})

import { describe, it, expect } from 'vitest'
import { buildPack, readPackJson, packName, utf8Len, JSON_MARK, WARN_BYTES } from './pillStandReport.js'
import { resolveSpan, sliceEvents, parseJournal, inAudio, targetAt, recentTargets } from './pillStandSpan.js'
import { fixtureEvents, fixtureFrames, fixtureJournal, JOURNAL_T0 } from './pillStandPackFixture.js'

// Отчёт «📤 Отправить»: отрезки режут правильно, шапка, комментарий, метки кадров, звук, имя файла, JSON-блок, предупреждение о размере
const NOW = new Date(2026, 10, 9, 14, 3, 27)
const meta = { version: '3.3.179', device: 'iPhone iOS 18.1 375×812 @3', seed: 'abc', mode: 'words', lang: 'en', len: 'any', auto: true, autoMs: 1200 }
const base = { topics: ['all'], at: 9500, comment: '', marks: [], meta, events: fixtureEvents(), frames: fixtureFrames(), journal: { lines: fixtureJournal(), t0abs: JOURNAL_T0, dropped: 0 }, now: NOW }
const ts = p => readPackJson(p.text).events.map(e => e.t)

describe('отправка по теме: отрезки', () => {
  it('текущая цель — с 1 с до её появления до следующей; в плеере — цель кадра', () => {
    const ev = fixtureEvents()
    expect(resolveSpan({ kind: 'target', events: ev, at: 9500 })).toMatchObject({ from: 6000, to: 9500 })
    expect(resolveSpan({ kind: 'target', events: ev, at: 1500 })).toMatchObject({ from: -900, to: 6999.9 })
    expect(targetAt(ev, 50).n).toBe(0) // до первой цели — первая
    const p = buildPack({ ...base, span: { kind: 'target' } })
    expect(Math.min(...ts(p))).toBe(100) // цель #1 — хвост до отрезка (контекст), остальное — с 6,000 с
    expect(ts(p).filter(t => t !== 100).every(t => t >= 6000)).toBe(true)
    expect(p.text).toContain('отрезок: текущая цель #2 «cat» 6,000–9,500 с')
    expect(p.text).toContain('(только хвост до отрезка)')
    expect(readPackJson(p.text).targets.map(t => t.n)).toEqual([0, 1])
  })
  it('авто: в текущей цели ещё ничего — с прошлой, где был голос / исход (при «авто» отправили уже на следующей); выбор цели из последних 5', () => {
    const ev = [...fixtureEvents(), { t: 10000, k: 'target', n: 2, mode: 'word', lang: 'en', say: 'interesting' }, { t: 10010, k: 'run', mode: 'word', n: 2 }, { t: 10500, k: 'level', rms: 0.001 }]
    const s = resolveSpan({ kind: 'target', events: ev, at: 11000 })
    expect(s).toMatchObject({ from: 6000, to: 11000 })
    expect(s.label).toBe('цели #2 «cat» ✓ (последняя с голосом) + #3 «interesting» (текущая) 6,000–11,000 с')
    expect(recentTargets(ev, 11000).map(g => `${g.n + 1}${g.mark}`)).toEqual(['3—', '2✓', '1✓'])
    const pick = resolveSpan({ kind: 'target', events: ev, at: 11000, pick: 100 })
    expect(pick).toMatchObject({ from: -900, to: 6999.9 })
    expect(pick.label).toContain('цель #1 «Nice to meet you» ✓ (выбрана)')
    const p = buildPack({ ...base, events: ev, at: 11000, span: { kind: 'target', pick: 7000 } })
    expect(p.text).toContain('отрезок: цель #2 «cat» ✓ (выбрана) 6,000–10,000 с')
  })
  it('A–B: события и кадры внутри; цель, начатая раньше, — первой', () => {
    const p = buildPack({ ...base, span: { kind: 'ab' }, ab: [1200, 1800] })
    const j = readPackJson(p.text)
    expect(j.events[0]).toMatchObject({ t: 100, k: 'target' })
    expect(j.events.slice(1).every(e => e.t >= 1200 && e.t <= 1800)).toBe(true)
    expect(j.frames.every(f => f.t >= 1200 && f.t <= 1800)).toBe(true)
    expect(j.frames.length).toBeGreaterThan(30)
    expect(p.text).toContain('отрезок: отрезок A–B из плеера 1,200–1,800 с (0,600 с)')
    expect(sliceEvents(fixtureEvents(), { from: 1200, to: 1800 })[0].k).toBe('target')
  })
  it('последние N секунд — до «сейчас»; A–B без отмеченного — как вся сессия', () => {
    const p = buildPack({ ...base, span: { kind: 'last', sec: 10 }, at: 12000 })
    expect(ts(p).filter(t => t !== 100).every(t => t >= 2000 && t <= 12000)).toBe(true)
    expect(p.text).toContain('отрезок: последние 10 с 2,000–12,000 с')
    expect(resolveSpan({ kind: 'ab', events: fixtureEvents(), at: 9500, ab: null }).kind).toBe('session')
  })
  it('журнал игры: метка performance.now → мс сессии; звук: место отрезка в файле', () => {
    const j = parseJournal(fixtureJournal(), JOURNAL_T0)
    expect(j[1]).toEqual({ t: 1400, day: '14:03:28.000', text: '[fill] +1300 мс: слово 1 «nice» черновик → цель 0,25, экран 0,05' })
    expect(inAudio({ startMs: 900 }, { from: 1200, to: 1800 })).toEqual([0.3, 0.9])
    expect(inAudio({ startMs: 900 }, { from: 100, to: 800 })).toBe(null)
  })
})

describe('отправка по теме: шапка, комментарий, метки, файл', () => {
  const marks = [{ t: 1500, i: 30 }, { t: 2300, i: null }]
  const p = buildPack({ ...base, topics: ['anim', 'ear'], span: { kind: 'session' }, comment: 'на «meet» заливка дёрнулась раньше голоса', marks })
  const head = p.text.split('\n').slice(0, 10).join('\n')
  it('шапка: темы, версия, устройство, дата, режим / язык / сид, отрезок, цели с номерами, метки, звук, состав', () => {
    expect(head).toContain('Pithy · стенд пилюль · замечание: Анимация + Распознавание (Vosk)')
    expect(head).toContain('версия 3.3.179 · iPhone iOS 18.1 375×812 @3 · 2026-11-09 14:03:27')
    expect(head).toContain('режим По словам (проход 1) · язык EN · длина любые · сид abc · авто 1,2 с')
    expect(head).toContain('цели в файле: #1 «Nice to meet you» По словам (проход 1) EN с 0,100 с ✓ · #2 «cat» (на пилюле «кот») Вертикальная (слово) EN с 7,000 с ✓')
    expect(head).toContain('микрофон: без сбоев')
    expect(head).toContain('метки кадров: ◆1 1,500 с (кадр 31) · ◆2 2,300 с')
    expect(head).toContain('звук: записи со звуком не было')
    expect(head).toMatch(/состав: событий \d+ \(в хронике \d+\), кадров \d+ \(в таблице \d+\), строк журнала \d+/)
  })
  it('комментарий отдельным блоком; метки — в хронике и в таблице кадров (все кадры ±300 мс вокруг метки)', () => {
    expect(p.text).toContain('== Комментарий ==\nна «meet» заливка дёрнулась раньше голоса')
    expect(p.text).toContain('◆ МЕТКА 1 (кадр 31)')
    expect(p.text).toMatch(/\s31\s{2}0,25\s{2}0,25 .* ◆ МЕТКА 1/)
    const rows = p.text.split('\n').filter(l => /^\s+\+\d+\s+\d+\s{2}\d,\d\d/.test(l)).map(l => Number(l.trim().split(/\s+/)[1]))
    for (let k = 14; k <= 48; k++) expect(rows).toContain(k) // кадры 1200…1800 мс — все
    expect(readPackJson(p.text).marks).toEqual([{ t: 1500, i: 30, n: 1 }, { t: 2300, i: null, n: 2 }])
  })
  it('JSON-блок парсится и повторяет шапку; имя файла по темам и дате', () => {
    const j = readPackJson(p.text)
    expect(j).toMatchObject({ kind: 'pithy-stand-pack', v: 1, comment: 'на «meet» заливка дёрнулась раньше голоса', header: { version: '3.3.179', topics: ['anim', 'ear'], seed: 'abc' } })
    expect(p.text.indexOf(JSON_MARK)).toBeGreaterThan(p.text.indexOf('== Журнал игры'))
    expect(p.name).toBe('pithy-stand-anim-vosk-2026-11-09_14-03-27.txt')
    expect(packName(['honesty'], NOW)).toBe('pithy-stand-honesty-2026-11-09_14-03-27.txt')
    expect(packName(['all', 'anim'], NOW)).toBe('pithy-stand-all-2026-11-09_14-03-27.txt')
    expect(p.copy).not.toContain(JSON_MARK)
  })
  it('звук: имя как у отчёта, место отрезка в звуке; без галочки — не прикладывается', () => {
    const audio = { blob: new Blob(['x']), type: 'audio/mp4', startMs: 900 }
    const a = buildPack({ ...base, topics: ['ear'], span: { kind: 'ab' }, ab: [1200, 1800], audio, sound: true })
    expect(a.audioName).toBe('pithy-stand-vosk-2026-11-09_14-03-27.m4a')
    expect(a.text).toContain('звук: файл pithy-stand-vosk-2026-11-09_14-03-27.m4a (audio/mp4), вся запись; отрезок в звуке 0,3–0,9 с')
    const b = buildPack({ ...base, topics: ['anim'], audio, sound: false })
    expect(b.audioName).toBe(null)
    expect(b.text).toContain('звук: не прикладывается')
  })
  it('размер: предупреждение больше 2 МБ (для «Всё» — больше 15 МБ); байты — в UTF-8', () => {
    expect(utf8Len('аб c')).toBe(6)
    const big = 'ж'.repeat(WARN_BYTES / 2 + 10)
    expect(buildPack({ ...base, topics: ['logic'], comment: big }).warn).toMatch(/больше 2 МБ/)
    expect(buildPack({ ...base, topics: ['all'], comment: big }).warn).toBe('')
  })
})

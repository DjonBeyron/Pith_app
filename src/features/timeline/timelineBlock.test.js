import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { realEvents } from './timelineFixtureReal.js'
import { buildTimeline } from './timelineModel.js'
import { buildPauses } from './timelinePauses.js'
import { rows } from './timelineReport.js'
import { buildMontage } from './montage/montageModel.js'
import { describeBlock, blockAddr, blockHuman, blockHead, aroundRows, clipKey, addrTime } from './timelineBlock.js'
import { blockContext, AROUND_N } from './timelineBlockContext.js'
import { blockFile, runEventsFile, timelineFile } from './timelineLog.js'
import { collectLogs } from '../../shared/lib/logUpload.js'

// Комментарий к блоку таймлайна в GitHub: строка-адрес, человеческая строка, файл-контекст (до / после, звуки рядом, сырые события) — для реплики, пилюли, зазора и этапа. Данные — вырезка настоящей игры.
const ev = realEvents(), m = buildTimeline(ev, { game: 'race', only: 'stages' })
const run = { id: 3, at: 1795000000000, meta: { game: 'race', only: 'stages' }, events: ev, dropped: 0 }
const entry = { rid: 'mwx1-3', src: 'local', label: 'это устройство · №3' }
const ctx = (sel, extra = {}) => blockContext({ sel, m, run, entry, device: 'iPhone 390×844', appVersion: '3.3.344', now: new Date('2026-11-22T10:00:00Z'), ...extra })
const line = id => m.lines.find(l => l.id === id)

describe('строка-адрес и человеческая строка блока', () => {
  it('реплика: run:<id> t=+…s clip=кто:id#N; N — номер появления реплики в игре', () => {
    const l = line('race_reverse'), b = describeBlock({ kind: 'line', ref: l }, m)
    expect(addrTime(62059)).toBe('+62,059s')
    expect(blockAddr(b, 'mwx1-3')).toBe('run:mwx1-3 t=+32,728s clip=pit:race_reverse#1')
    expect(blockHuman(b)).toBe('Блок: Пит «теперь наоборот, секунду, переключаюсь на русский», +0:32, этап «Разворот конвейера»')
    const twice = m.lines.filter(x => x.who === 'dictor' && x.id === m.lines.findLast(y => y.who === 'dictor').id)
    expect(clipKey(m, twice[twice.length - 1])).toBe(`dictor:${twice[0].id}#${twice.length}`)
  })
  it('пилюля, ответ, этап, зазор, отсчёт — у каждого своё поле адреса; пробелы в значении заменены на «_»', () => {
    const u = m.turns.find(x => x.word === 'учиться'), a = m.answers[0], s = m.stages.find(x => x.sid === 'catch-rev'), g = buildMontage(m).gaps.find(x => x.long)
    expect(describeBlock({ kind: 'turn', ref: u }, m).part).toBe('pill=0:учиться')
    expect(describeBlock({ kind: 'answer', ref: a }, m).part).toBe('answer=win:учиться')
    expect(describeBlock({ kind: 'stage', ref: s }, m).part).toBe('stage=catch-rev#1')
    expect(describeBlock({ kind: 'gap', ref: g }, m).part).toBe(`gap=${g.kind}:${Math.round(g.ms)}ms`)
    expect(describeBlock({ kind: 'count', ref: m.counts[0] }, m).part).toBe('count=2501ms')
    expect(describeBlock({ kind: 'line', ref: { ...line('race_start'), id: 'a b', who: 'dictor' } }, m).part).toMatch(/^clip=dictor:a_b#/)
    expect(blockHead({ kind: 'stage', ref: s }, m, 'r1').split('\n')).toEqual(['run:r1 t=+32,104s stage=catch-rev#1', 'Блок: этап «Разворот конвейера», +0:32, этап «Разворот конвейера»'])
    expect(blockHead(null, m, 'r1')).toBe('')
  })
  it('«до» и «после»: соседи по хронологии без самого блока; блока в хронологии нет (зазор) — граница по времени', () => {
    const list = rows(m, buildPauses(m)), l = line('race_reverse'), ar = aroundRows(list, { kind: 'line', ref: l }, 3)
    expect(ar.before).toHaveLength(3); expect(ar.after).toHaveLength(3)
    expect(ar.before.every(r => r.t <= l.t && r.ref !== l)).toBe(true); expect(ar.after.every(r => r.t >= l.t && r.ref !== l)).toBe(true)
    const g = aroundRows(list, { kind: 'gap', ref: { t: 36000, end: 37900 } }, 2)
    expect(g.before.every(r => r.t < 36000)).toBe(true); expect(g.after.every(r => r.t >= 35999)).toBe(true)
  })
})

describe('файл-контекст блока', () => {
  it('реплика: прохождение, блок, до / после, звуки рядом (±5 с), сырые события окна, правки, JSON', () => {
    const l = line('race_reverse'), c = ctx({ kind: 'line', ref: l }, { edits: 'ЧЕРНОВИК МОНТАЖА — список правок\n1. …' })
    const t = c.text
    expect(t.split('\n').slice(0, 3)).toEqual(['== БЛОК ТАЙМЛАЙНА — контекст комментария ==', 'run:mwx1-3 t=+32,728s clip=pit:race_reverse#1', c.human])
    expect(c.head).toBe(`${c.addr}\n${c.human}`)
    for (const s of ['id: mwx1-3', 'устройство: iPhone 390×844 · версия приложения: 3.3.344', 'игра: game=race, only=stages', 'время от начала игры: +32,728 с (0:32,7)', 'этап: Разворот конвейера [catch-rev]',
      'id реплики: race_reverse', 'длина озвучки (ms из line-start): 3187 мс', 'сыграно (played из line-end): 3202 мс', 'озвучена: да', 'как найти в журнале: строка «[scene]» с "t":32728',
      `== ЧТО БЫЛО ДО (${AROUND_N}) ==`, `== ЧТО ПОСЛЕ (${AROUND_N}) ==`, '◀ ЭТОТ БЛОК', '[scene] {"t":32728,"k":"line-start","who":"pit","id":"race_reverse"', '[scene] {"t":34122,"k":"wait"', 'ЧЕРНОВИК МОНТАЖА — список правок']) expect(t, s).toContain(s)
    expect(t).toMatch(/== ЗВУКИ В ЭТОТ МОМЕНТ И РЯДОМ \(±5 с\): \d+ ==\n[\s\S]*?Диктор: «помнить» \[dictor:помнить#1\]/)
    expect(t).not.toContain('"t":7,"k":"line-start"') // событие вне окна ±5 с в файл не попало
    const j = JSON.parse(t.split('== JSON ==\n')[1])
    expect(j.addr).toBe(c.addr); expect(j.block).toMatchObject({ kind: 'line', who: 'pit', id: 'race_reverse', key: 'pit:race_reverse#1', sid: 'catch-rev', t: 32728 })
    expect(j.before).toHaveLength(AROUND_N); expect(j.after).toHaveLength(AROUND_N); expect(j.sounds.find(s => s.id === 'race_reverse').during).toBe(true); expect(j.run.id).toBe('mwx1-3'); expect(j.hasEdits).toBe(true)
  })
  it('пилюля — слово, дорожка, исход; зазор — причина и длина; этап — sid и вид; без правок — «(правок нет)»', () => {
    const u = m.turns.find(x => x.word === 'учиться'), p = ctx({ kind: 'turn', ref: u }).text
    for (const s of ['pill=0:учиться', 'слово: учиться', 'дорожка: 0', 'исход: верно', '(правок нет)']) expect(p, s).toContain(s)
    const g = buildMontage(m).gaps.find(x => x.long), gt = ctx({ kind: 'gap', ref: g }).text
    expect(gt).toContain(`gap=${g.kind}:${Math.round(g.ms)}ms`); expect(gt).toContain('причина: '); expect(gt).toContain('долгая (игра молчит дольше порога): ДА'); expect(gt).toContain('как найти в журнале: события «[scene]» с t от ')
    const pz = buildPauses(m).find(x => x.long), pt = ctx({ kind: 'pause', ref: pz }).text
    expect(pt).toContain('перед тишиной: '); expect(pt).toContain('после тишины: ')
    const st = ctx({ kind: 'stage', ref: m.stages.find(x => x.sid === 'catch-rev') }).text
    for (const s of ['stage=catch-rev#1', 'sid: catch-rev', 'акт / вид: catch / announce', 'реплика стадии: race_reverse']) expect(st, s).toContain(s)
    expect(ctx(null)).toBeNull()
  })
  it('игра с сервера: источник назван, устройство и версия — из записи сервера; все события уходят отдельным файлом', () => {
    const srv = { ...run, id: 'abc-1', device: 'Android 412×915', appVersion: '3.3.340', savedAt: '2026-11-22T09:00:00Z' }
    const t = blockContext({ sel: { kind: 'line', ref: line('race_start') }, m, run: srv, entry: { rid: 'abc-1', src: 'server', label: 'сервер · Android' }, device: 'iPhone', appVersion: '3.3.344' }).text
    expect(t).toContain('источник: сервер (сохранённая игра — живого журнала этой игры на устройстве нет)'); expect(t).toContain('устройство: Android 412×915 · версия приложения: 3.3.340')
    const f = runEventsFile(srv, { label: 'сервер · Android', at: new Date('2026-11-22T10:00:00Z') })
    expect(f.name).toBe('pithy-timeline-run-2026-11-22-10-00-00.txt'); expect(f.text.split('\n')).toHaveLength(ev.length + 2); expect(f.text).toContain(`[scene] ${JSON.stringify(ev[1])}`)
    expect(runEventsFile({ events: [] })).toBeNull()
  })
})

describe('отправка комментария к блоку', () => {
  const at = new Date('2026-11-22T10:00:00Z'), block = blockFile('контекст', at), rep = timelineFile('отчёт', at)
  it('файл блока идёт сразу за комментарием, потом журнал и отчёт; при снятой галочке «Отправить логи» уходят комментарий и файл блока', async () => {
    expect(block.name).toBe('pithy-timeline-block-2026-11-22-10-00-00.txt')
    const base = { journal: { name: 'j.txt', text: 'журнал' }, debugLines: [], last: null, at, comment: 'run:x t=+1,000s clip=pit:a#1\nБлок: …\nтут тишина', extra: [rep], pinned: [block] }
    const all = await collectLogs(base)
    expect(all.map(f => f.name)).toEqual(['pithy-comment-2026-11-22-10-00-00.txt', block.name, 'j.txt', rep.name]); expect(all[0].text).toContain('run:x t=+1,000s clip=pit:a#1\nБлок: …\nтут тишина')
    expect((await collectLogs({ ...base, withLogs: false })).map(f => f.name)).toEqual(['pithy-comment-2026-11-22-10-00-00.txt', block.name])
  })
  it('окно комментария: адрес подставляется в начало текста (SendLogButton prefill), кнопка блока передаёт его и шлёт файлы блока закреплёнными', () => {
    const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
    expect(read('../../shared/ui/SendLogButton.jsx')).toContain('if (prefill) setDraft(d => (d.startsWith(prefill) ? d : `${prefill}\\n${d}`))')
    expect(read('./TimelineBlockComment.jsx')).toContain('prefill={block.head(sel)}')
    expect(read('./TimelineOpenButton.jsx')).toContain('pinned })')
    expect(read('./TimelineScreen.jsx')).toContain("[c && blockFile(c.text), cur.src === 'server' && runEventsFile(run, { label: cur.label })].filter(Boolean)")
  })
})

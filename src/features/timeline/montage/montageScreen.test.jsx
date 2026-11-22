import { describe, it, expect, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import TimelineScreen, { WIDE_PX } from '../TimelineScreen.jsx'
import TimelineMontage from './TimelineMontage.jsx'
import { useMontageDraft } from './useMontageDraft.js'
import { buildTimeline } from '../timelineModel.js'
import { buildMontage } from './montageModel.js'
import { applyEdits, makeEdit, editsSummary } from './montageEdits.js'
import { editsText, editsFile, editLine, editShort, summaryText, gapText } from './montageEditsText.js'
import { hInit, hPush, serialize, draftKey } from './montageHistory.js'
import { montageEvents } from './montageFixture.js'
import { serverId } from '../timelineStore.js'
import { collectLogs } from '../../../shared/lib/logUpload.js'

const run = { id: 1, at: 0, meta: { game: 'race', only: 'stages' }, events: montageEvents(), dropped: 0 }
const base = () => buildMontage(buildTimeline(montageEvents()))
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { get: k => m.get(k) ?? null, set: (k, v) => { m.set(k, v); return true }, del: k => m.delete(k), keys: () => [...m.keys()] } }
const screen = (props = {}) => renderToStaticMarkup(<TimelineScreen runs={[run]} store={mem()} {...props} />)
const fakeDraft = (edits = [], extra = {}) => ({ edits, pending: null, steps: 0, srv: '', canUndo: edits.length > 0, canRedo: false, set() {}, undo() {}, redo() {}, reset() {}, accept() {}, discard() {}, flush() {}, ...extra })
const montage = (edits, props = {}) => renderToStaticMarkup(<TimelineMontage base={base()} draft={fakeDraft(edits)} scale0={0.05} {...props} />)
const clips = s => [...s.matchAll(/<button type="button" class="mtgClip" style="left:([\d.]+)px;width:([\d.]+)px"[^>]*data-key="([^"]+)"[^>]*>/g)].map(x => ({ left: +x[1], width: +x[2], key: x[3], tag: x[0], ms: +x[0].match(/data-ms="(\d+)"/)[1] }))
const tabs = s => [...s.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>([^<]+)</g)].map(x => `${x[2]}:${x[1]}`)

afterEach(() => { delete globalThis.window })

describe('вкладка «Монтаж»', () => {
  it('на ПК (ширина окна от 900 px) экран открывается на «Монтаже», на телефоне — как раньше на «Паузах»', () => {
    expect(WIDE_PX).toBe(900)
    expect(tabs(screen())).toEqual(['Монтаж:false', 'Паузы:true', 'Лента:false', 'Список:false'])
    globalThis.window = { innerWidth: 1440 }
    expect(tabs(screen())).toEqual(['Монтаж:true', 'Паузы:false', 'Лента:false', 'Список:false'])
    expect(screen()).toContain('data-testid="tl-montage"')
    globalThis.window = { innerWidth: 375 }
    expect(tabs(screen())[1]).toBe('Паузы:true'); expect(screen()).not.toContain('data-testid="tl-montage"')
  })

  it('слои сверху вниз: время, этапы, Пит, Мия, Диктор, пилюли / игрок, ноты и ожидания; легенда и подсказка «как читать»', () => {
    const s = screen({ tab0: 'montage' })
    expect([...s.matchAll(/class="mtgRow" data-row="([a-z]+)"/g)].map(x => x[1])).toEqual(['ruler', 'stages', 'pit', 'mia', 'dictor', 'pills', 'marks'])
    for (const label of ['Этапы', 'Пит', 'Мия', 'Диктор']) expect(s).toContain(`<div class="mtgLabel">${label}</div>`)
    expect(s).toContain('клип = сколько реально звучало аудио; зазор = тишина')
    for (const t of ['игра молчит', 'ждём игрока', 'анимация без речи', 'без озвучки (подпись)']) expect(s).toContain(t)
    expect(s).toMatch(/class="mtgStage"[^>]*data-act="sprint"[^>]*><span>Конвейер слов — круг<em> · 16,0 с<\/em>/)
    expect(s).toContain('data-testid="mtg-mini"'); expect(s).toContain('data-testid="mtg-playhead"'); expect(s).toContain('В этот момент — 0:00,0')
    expect(s).not.toContain('data-testid="mtg-edits"') // правка выключена
    expect(s).not.toContain('class="tlActs"') // таблица этапов не отнимает высоту у стола
  })

  it('ширина клипа строго пропорциональна тому, сколько звучало аудио; на клипе текст и длительность', () => {
    const s = screen({ tab0: 'montage' }), list = clips(s), scale = +s.match(/data-scale="([\d.]+)"/)[1]
    expect(list.map(c => c.key)).toEqual(['pit:a#1', 'pit:b#1', 'pit:a#2', 'pit:c#1', 'mia:m#1', 'dictor:w1#1']) // по дорожкам: Пит, Мия, Диктор
    const b = base()
    for (const c of list) {
      const src = b.clips.find(x => x.key === c.key)
      expect(c.ms).toBe(src.sound); expect(c.left).toBeCloseTo(src.t * scale, 1); expect(c.width).toBeCloseTo((src.end - src.t) * scale, 1)
    }
    expect(list.find(c => c.key === 'pit:b#1').width / list.find(c => c.key === 'pit:c#1').width).toBeCloseTo(3, 1) // 1,5 с втрое шире 0,5 с
    expect(s).toMatch(/data-key="pit:a#1"[^>]*>.*?<span class="mtgClipText"[^>]*>А<\/span><b class="mtgClipDur">2,0 с<\/b>/)
    expect(s).toMatch(/title="Пит: «А» — звучало 2,0 с, хвост 50 мс"/)
  })

  it('зазоры с числом секунд и причиной: долгая «игра молчит» помечена, «ждём игрока» подписано', () => {
    const s = screen({ tab0: 'montage' })
    expect(s).toMatch(/data-testid="mtg-gap" data-kind="dead" data-long="1" data-ms="3000"[^>]*><i class="mtgGapBr"><\/i><b>3,0 с<\/b><span>игра молчит<\/span>/)
    expect(s).toMatch(/data-testid="mtg-gap" data-kind="player" data-ms="2000"[^>]*><i class="mtgGapBr"><\/i><b>2,0 с<\/b><span>ждём игрока<\/span>/)
    expect((s.match(/data-testid="mtg-gap"/g) ?? []).length).toBe(9)
  })
})

describe('режим «Правка»', () => {
  it('включён: честная надпись, способ сдвига, отмена / возврат, список правок пуст', () => {
    const s = screen({ tab0: 'montage', edit0: true })
    expect(s).toContain('data-testid="tl-montage" data-edit="1"')
    expect(s).toContain('Это черновик монтажа: игра от него не меняется. Список правок уходит разработчику.')
    expect(s).toMatch(/aria-checked="true"[^>]*data-testid="mtg-mode-ripple"[^>]*>сдвиг со шлейфом</); expect(s).toMatch(/aria-checked="false"[^>]*data-testid="mtg-mode-solo"[^>]*>только этот клип</)
    expect(s).toMatch(/<button[^>]*disabled=""[^>]*data-testid="mtg-undo"/); expect(s).toMatch(/<button[^>]*disabled=""[^>]*data-testid="mtg-redo"/)
    expect(s).toContain('игра 0:16 — правок нет'); expect(s).toContain('Правок пока нет.')
    expect(clips(s).every(c => c.tag.includes('data-edit="1"'))).toBe(true) // клипы можно тянуть
  })

  it('с правками: клипы стоят по-новому, правленые обведены, наложение помечено, список и итог сверху', () => {
    const b = base(), edits = [makeEdit(b, 'dictor:w1#1', 'ripple', 1000), makeEdit(b, 'mia:m#1', 'ripple', -300)]
    const s = montage(edits, { edit0: true }), list = clips(s), scale = +s.match(/data-scale="([\d.]+)"/)[1], ed = applyEdits(b, edits)
    for (const c of list) expect(c.left).toBeCloseTo(ed.clips.find(x => x.key === c.key).t * scale, 1)
    expect(list.filter(c => c.tag.includes('data-moved="1"')).map(c => c.key)).toEqual(['mia:m#1', 'dictor:w1#1'])
    expect(list.find(c => c.key === 'mia:m#1').tag).toContain('data-warn="1"')
    expect(s).toMatch(/data-testid="mtg-sum" data-removed="2800">игра 0:16 → 0:13, убрано 2,8 с тишины</)
    expect((s.match(/data-testid="mtg-edit"/g) ?? []).length).toBe(2)
    expect(s).toContain('зазор перед Диктор «w1» 3,0 с → 1,0 с (−2,0 с)'); expect(s).toContain('зазор перед Мия «М» 0,5 с → наложение 0,3 с (−0,8 с)'); expect(s).toContain('⚠ звучат одновременно')
    expect((s.match(/data-testid="mtg-edit-del"/g) ?? []).length).toBe(2); expect(s).toContain('data-testid="mtg-reset"'); expect(s).toContain('data-testid="mtg-copy"')
    expect(s).toContain('✎ Правка · 2')
    expect(montage(edits, { edit0: true, send: async () => 'ok' })).toContain('📤 Правки в GitHub'); expect(s).not.toContain('📤 Правки в GitHub') // нет отправки (стенд) — нет кнопки
  })

  it('восстановление: в хранилище лежит черновик — он не применяется молча, экран спрашивает «продолжить / сбросить»', () => {
    const b = base(), h = hPush(hPush(hInit(), [makeEdit(b, 'dictor:w1#1', 'ripple', 1000)]), [makeEdit(b, 'dictor:w1#1', 'ripple', 1000), makeEdit(b, 'pit:c#1', 'ripple', 0)])
    const store = mem({ [draftKey(serverId(run))]: JSON.stringify(serialize(h, serverId(run), new Date(2026, 10, 22, 12, 41))) })
    const s = screen({ tab0: 'montage', store })
    expect(s).toMatch(/data-testid="mtg-pending"><b>Есть черновик из 2 правок<\/b> \(записан [^)]*12:41\):/)
    expect(s).toContain('data-testid="mtg-pending-accept">продолжить<'); expect(s).toContain('data-testid="mtg-pending-discard">сбросить<')
    expect(s).toMatch(/<button[^>]*disabled=""[^>]*data-testid="mtg-edit-toggle"/) // пока не ответили — править нельзя
    expect(clips(s).some(c => c.tag.includes('data-moved'))).toBe(false) // игра показана как была
    expect(screen({ tab0: 'montage', store: mem() })).not.toContain('mtg-pending')
  })

  it('черновик (useMontageDraft): из устройства и сервера берётся записанный позже; пустой черновик с историей возвращается без вопроса', () => {
    const e = (key, to) => ({ key, mode: 'ripple', from: 1000, to })
    const see = props => { let out = null; const Probe = () => { out = useMontageDraft(props); return null }; renderToStaticMarkup(<Probe />); return out }
    const local = serialize(hPush(hInit(), [e('a', 1)]), 'r', new Date('2026-11-22T10:00:00Z')), store = mem({ [draftKey('r')]: JSON.stringify(local) })
    expect(see({ runId: 'r', store }).pending.h.now).toEqual([e('a', 1)]); expect(see({ runId: 'r', store }).edits).toEqual([])
    const newer = { v: 1, savedAt: '2026-11-22T11:00:00.000Z', edits: [e('b', 2), e('c', 3)] }
    expect(see({ runId: 'r', store, serverEdits: newer }).pending.h.now).toEqual(newer.edits) // сервер новее — «последний записавший прав»
    expect(see({ runId: 'r', store, serverEdits: { ...newer, savedAt: '2026-11-22T09:00:00.000Z' } }).pending.h.now).toEqual([e('a', 1)])
    expect(see({ runId: 'other', store }).pending).toBeNull() // у другого прохождения свой черновик
    const undone = serialize({ past: [], now: [], future: [[e('a', 1)]] }, 'u'), d = see({ runId: 'u', store: mem({ [draftKey('u')]: JSON.stringify(undone) }) })
    expect(d.pending).toBeNull(); expect(d.canRedo).toBe(true); expect(d.canUndo).toBe(false)
  })
})

describe('выгрузка списка правок', () => {
  const b = base(), edits = [makeEdit(b, 'pit:b#1', 'ripple', 2000), makeEdit(b, 'mia:m#1', 'solo', 100)], ed = applyEdits(b, edits), sum = editsSummary(b, ed)

  it('строка правки читается без кода: кто до → кто после, этап, зазор было → стало, что внутри не меняется', () => {
    expect(editLine(edits[0])).toBe('после Диктор «w1» → перед Пит «Б» [b], этап «Конвейер слов — круг» [sprint]: зазор 2,65 с → 2,0 с (−0,65 с), сдвиг со шлейфом; внутри не меняется: ждём игрока 2,0 с; в игре на 0:09')
    expect(editLine(edits[1])).toBe('после Пит «Б» [b] → перед Мия «М» [m], этап «Конвейер слов — круг» [sprint]: зазор 0,5 с → 0,1 с (−0,4 с), только этот клип; в игре на 0:11')
    expect(editLine(makeEdit(b, 'pit:a#1', 'ripple', 0))).toContain('после начало игры → перед Пит «А» [a]')
    expect(editShort(edits[0])).toBe('зазор перед Пит «Б» 2,65 с → 2,0 с (−0,65 с)')
    expect(gapText(0)).toBe('встык'); expect(gapText(-300)).toBe('наложение 0,3 с'); expect(summaryText(sum)).toBe('игра 0:16 → 0:15, убрано 0,7 с тишины')
    expect(summaryText(editsSummary(b, applyEdits(b, [])))).toBe('игра 0:16 — правок нет')
  })

  it('файл для GitHub: заголовок, итог, честная строка, нумерованный список; уходит вместе с журналом (collectLogs, extra)', async () => {
    const text = editsText(edits, sum, { label: 'это устройство · №1', missing: [edits[1]] })
    expect(text.split('\n').slice(0, 4)).toEqual(['ЧЕРНОВИК МОНТАЖА — список правок', 'это устройство · №1', 'Правок: 2 · игра 0:16 → 0:15, убрано 0,7 с тишины',
      'Это черновик монтажа: игра от него не меняется. Каждая строка — «какую тишину сделать какой»; якоря (id реплик, стадия) — чтобы найти место в коде и в другой игре.'])
    expect(text).toContain(`\n1. ${editLine(edits[0])}\n2. ${editLine(edits[1])} — В ЭТОЙ ИГРЕ ТАКОГО КЛИПА НЕТ (правка не применена)`)
    expect(editsText([], editsSummary(b, applyEdits(b, [])))).toContain('(правок нет)')
    const file = editsFile(text, new Date('2026-11-22T10:20:30Z'))
    expect(file).toEqual({ name: 'pithy-timeline-edits-2026-11-22-10-20-30.txt', text })
    const files = await collectLogs({ journal: { name: 'j.txt', text: 'журнал' }, debugLines: [], last: null, extra: [{ name: 'pithy-timeline-x.txt', text: 'отчёт' }, file] })
    expect(files.map(f => f.name)).toEqual(['j.txt', 'pithy-timeline-x.txt', file.name]); expect(files[2].text).toBe(text)
  })

  it('кнопка админки прикладывает файл правок к отправке и умеет сохранять черновик на сервер; игровой код о монтаже не знает', () => {
    const src = readFileSync(new URL('../TimelineOpenButton.jsx', import.meta.url), 'utf8')
    expect(src).toContain("extra: [timelineFile(report), ...(edits ? [editsFile(edits)] : [])]"); expect(src).toContain('saveEdits: (run, draft) => saveTimelineEdits(')
    for (const dir of ['../../pitrace', '../../player', '../../rehearsal']) expect(readFileSync(new URL('../TimelineScreen.jsx', import.meta.url), 'utf8')).not.toContain(dir.slice(3))
  })
})

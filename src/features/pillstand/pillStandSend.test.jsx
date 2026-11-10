import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PillStandSend from './PillStandSend.jsx'
import { emptyForm, toggleTopic, setSound, spanKind, markAt, canSend, sentForm, setPick, SENT_HOW } from './pillStandSendForm.js'
import { sendPack, textFile } from './standSend.js'
import { buildPack } from './pillStandReport.js'
import { colorWords, wordStateAt, wordState } from './pillStandColor.js'
import { fixtureEvents, fixtureFrames } from './pillStandPackFixture.js'

// Окно «📤 Отправить»: темы, отрезок, комментарий, метки, звук и вызов saveDebugFile с нужным именем (мок). В проекте нет DOM-среды — окно без хуков: вызываем функцию компонента и жмём «кнопки» в дереве.
const kids = el => (el == null || typeof el !== 'object' ? [] : Array.isArray(el) ? el : [el])
function find(el, id) {
  for (const x of kids(el).flat(Infinity)) {
    if (!x || typeof x !== 'object') continue
    if (x.props?.['data-testid'] === id) return x
    const got = find(x.props?.children, id)
    if (got) return got
  }
  return null
}
const sheet = (props = {}) => {
  const onForm = vi.fn()
  const p = { ctx: { from: 'player', at: 1500, frame: 30 }, form: emptyForm(), onForm, onMark: vi.fn(), onUnmark: vi.fn(), onSend: vi.fn(), onCopy: vi.fn(), onSendAudio: vi.fn(), onClose: vi.fn(), ...props }
  return { el: PillStandSend(p), p, onForm }
}

describe('окно «Отправить»: форма', () => {
  it('темы, отрезки, комментарий, метка, звук; без темы отправить нельзя; A–B без отметки — неактивен', () => {
    const html = renderToStaticMarkup(<PillStandSend ctx={{ at: 1500, frame: 30 }} form={emptyForm()} onForm={() => {}} />)
    for (const t of ['Анимация', 'Распознавание (Vosk)', 'Зачёт и логика', 'Честность', 'Всё', 'вся сессия', 'текущая цель', 'A–B из плеера (не отмечен)', 'последние', 'Отметить кадр 31', 'Выберите тему', 'записи со звуком нет']) expect(html).toContain(t)
    expect(find(sheet().el, 'ps-send-span-ab').props.disabled).toBe(true)
    expect(find(sheet({ ab: [1200, 1800] }).el, 'ps-send-span-ab').props.children.join('')).toContain('1,200–1,800 с')
    expect(find(sheet().el, 'ps-send-go').props.disabled).toBe(true)
  })
  it('галочки тем: несколько; «Всё» поглощает; звук по умолчанию — вкл. для Распознавания, выкл. для Анимации, пока не тронут', () => {
    const { el, onForm } = sheet()
    find(el, 'ps-send-topic-anim').props.onClick()
    const f1 = onForm.mock.calls[0][0]
    expect(f1).toMatchObject({ topics: ['anim'], sound: false })
    const f2 = toggleTopic(f1, 'ear')
    expect(f2).toMatchObject({ topics: ['anim', 'ear'], sound: true })
    expect(toggleTopic(f2, 'all').topics).toEqual(['all'])
    expect(toggleTopic(toggleTopic(f2, 'all'), 'logic').topics).toEqual(['logic'])
    const own = setSound(f2, false)
    expect(toggleTopic(own, 'all').sound).toBe(false) // тронул сам — больше не меняем
    expect(canSend(f1)).toBe(true)
  })
  it('отрезок «последние» — с выбором 10 / 30 / 60 с; комментарий; метка и её снятие', () => {
    const { el, onForm, p } = sheet({ form: { ...emptyForm(), topics: ['anim'], span: 'last' }, marks: [{ t: 1500, i: 30 }] })
    find(el, 'ps-send-sec-10').props.onClick()
    expect(onForm.mock.calls[0][0]).toMatchObject({ span: 'last', sec: 10 })
    find(el, 'ps-send-comment').props.onChange({ target: { value: 'рывок на «meet»' } })
    expect(onForm.mock.calls[1][0].comment).toBe('рывок на «meet»')
    find(el, 'ps-send-mark').props.onClick(); expect(p.onMark).toHaveBeenCalled()
    find(el, 'ps-send-mark-1').props.onClick(); expect(p.onUnmark).toHaveBeenCalledWith(0)
    find(el, 'ps-send-go').props.onClick(); expect(p.onSend).toHaveBeenCalled()
    expect(spanKind({ span: 'ab' }, null)).toBe('target')
  })
  it('метка: кадр плеера; на живом экране — ближайший кадр записи (если рядом) или просто миг', () => {
    const fr = fixtureFrames()
    expect(markAt(0, fr, 30)).toEqual({ t: fr[30].t, i: 30 })
    expect(markAt(fr[10].t + 5, fr).i).toBe(10)
    expect(markAt(5000, fr)).toEqual({ t: 5000, i: null })
  })
})

describe('окно «Отправить»: отправка файлом (saveDebugFile — мок)', () => {
  const pack = (topics, extra = {}) => buildPack({ topics, span: { kind: 'session' }, at: 9500, comment: 'не так', marks: [], meta: { version: '3.3.179' }, events: fixtureEvents(), frames: fixtureFrames(), now: new Date(2026, 10, 9, 14, 3, 27), ...extra })
  const audio = { blob: new Blob(['snd'], { type: 'audio/mp4' }), type: 'audio/mp4', startMs: 900 }
  it('один основной файл .txt с именем по теме; текст — тот же отчёт', async () => {
    const save = vi.fn(async () => 'share')
    const p = pack(['anim'])
    const got = await sendPack(p, null, save)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].name).toBe('pithy-stand-anim-2026-11-09_14-03-27.txt')
    expect(await save.mock.calls[0][0].blob.text()).toBe(p.text)
    expect(got).toEqual({ how: 'share', audioHow: null, later: null })
  })
  it('звук: на компьютере — сразу вторым файлом; на iPhone («Поделиться») — вторым нажатием; отмена — без звука', async () => {
    const p = pack(['ear'], { audio, sound: true })
    const dl = vi.fn(async () => 'download')
    expect((await sendPack(p, audio, dl)).audioHow).toBe('download')
    expect(dl.mock.calls.map(c => c[0].name)).toEqual(['pithy-stand-vosk-2026-11-09_14-03-27.txt', 'pithy-stand-vosk-2026-11-09_14-03-27.m4a'])
    const sh = vi.fn(async () => 'share')
    const got = await sendPack(p, audio, sh)
    expect(sh).toHaveBeenCalledTimes(1)
    expect(got.later.name).toBe('pithy-stand-vosk-2026-11-09_14-03-27.m4a')
    expect((await sendPack(p, audio, vi.fn(async () => 'cancelled'))).later).toBe(null)
  })
  it('файл — с именем и типом text/plain', () => {
    const f = textFile('a.txt', 'привет')
    expect(f.name).toBe('a.txt')
    expect(f.blob.type).toMatch(/^text\/plain/)
    expect(f.size).toBe(12)
  })
})

describe('раскраска слов Vosk', () => {
  it('засчитано — ok, слово цели — по виду (итог / черновик), нет в цели — extra, откат — back', () => {
    const state = wordState([{ t: 1, text: 'nice' }, { t: 2, text: 'to' }, { t: 3, text: 'to', gone: true }])
    expect(colorWords('nice to the meet', { kind: 'partial', say: 'Nice to meet you', ...state })).toEqual([{ w: 'nice', c: 'ok' }, { w: 'to', c: 'back' }, { w: 'the', c: 'extra' }, { w: 'meet', c: 'partial' }])
    expect(colorWords('meet you', { kind: 'final', say: 'Nice to meet you' }).map(x => x.c)).toEqual(['final', 'final'])
    expect(colorWords('', { say: 'x' })).toEqual([])
  })
  it('состояние слов к моменту t — по своей цели (вертикальная пилюля — по счёту слушателя)', () => {
    const ev = fixtureEvents()
    expect([...wordStateAt(ev, 1712).counted]).toEqual(['nice', 'to', 'meet'])
    expect([...wordStateAt(ev, 1305).counted]).toEqual([])
    expect([...wordStateAt(ev, 9000).counted]).toEqual(['cat'])
  })
})

describe('окно «Отправить»: после отправки — с чистого листа; выбор цели', () => {
  it('ушло (файлом / текстом) — комментарий и выбор цели пусты, темы и отрезок остаются; отмена «Поделиться» — не «ушло»', () => {
    const f = { ...toggleTopic(emptyForm(), 'all'), comment: 'заливка дёрнулась', pick: 7000 }
    expect(sentForm(f)).toMatchObject({ topics: ['all'], span: 'target', comment: '', pick: null })
    expect([...SENT_HOW].sort()).toEqual(['download', 'share', 'tab'])
    expect(SENT_HOW.has('cancelled')).toBe(false)
    const html = renderToStaticMarkup(<PillStandSend ctx={{ at: 1500 }} form={sentForm(f)} onForm={() => {}} />)
    expect(html).toContain('></textarea>') // поле пустое
  })
  it('отрезок «цель»: «авто» и последние цели с исходом; выбор — setPick', () => {
    const recent = [{ t: 10000, n: 4, say: 'interesting', mark: '—' }, { t: 7000, n: 3, say: 'wonderful', mark: '✓' }]
    const { el, onForm } = sheet({ recent })
    expect(find(el, 'ps-send-pick-auto').props['aria-checked']).toBe(true)
    expect(find(el, 'ps-send-pick-4').props.children.join('')).toBe('#4 wonderful ✓')
    find(el, 'ps-send-pick-4').props.onClick()
    expect(onForm.mock.calls[0][0]).toMatchObject({ span: 'target', pick: 7000 })
    expect(setPick(emptyForm(), null).pick).toBe(null)
  })
})

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { voiceOf, voiceKey, dictorKeys, NO_VOICE, FROM_NOW } from './timelineVoice.js'
import { createClipPlayer, IDLE } from './clipPlayer.js'
import TimelineCard from './TimelineCard.jsx'
import TimelineMontage from './montage/TimelineMontage.jsx'
import { buildTimeline } from './timelineModel.js'
import { buildMontage } from './montage/montageModel.js'
import { montageEvents } from './montage/montageFixture.js'

// Звук клипа таймлайна: откуда берётся файл (Пит, Мия — настройки реплик; диктор — библиотека слов; нет озвучки — подсказка) и логика проигрывателя (один звук за раз, повторное нажатие — стоп).
const src = { status: 'ready', lines: { race_start: { text: 'Встряхнём', url: 'https://r2/pit.mp3', duration: 3.4 }, mia_hello: { text: 'Привет', url: 'https://r2/mia.mp3', duration: 1 }, race_good_ok: { text: 'Отлично', url: null } },
  lib: new Map([['ru:учиться', { url: 'https://r2/ru.mp3', duration: 1 }], ['meet', { url: 'https://r2/meet.mp3' }], ['phrase:nice to meet you', { url: 'https://r2/phrase.mp3' }]]) }
const l = (who, id, text = id, t = 1000) => ({ who, id, text, t, end: t + 1000, ms: 1000 })

describe('выбор озвучки клипа', () => {
  it('Пит и Мия — url из настроек реплик (rotate_cat_lines); нет файла — «нет озвучки (подпись)»', () => {
    expect(voiceOf(l('pit', 'race_start'), src)).toMatchObject({ url: 'https://r2/pit.mp3', from: 'настройки реплик', duration: 3.4 })
    expect(voiceOf(l('mia', 'mia_hello'), src).url).toBe('https://r2/mia.mp3')
    expect(voiceOf(l('pit', 'race_good_ok'), src)).toEqual({ url: null, why: NO_VOICE }); expect(voiceOf(l('pit', 'нет_такой'), src).why).toBe('нет озвучки (подпись)')
    expect(voiceOf(l('pit', 'race_start', 'Другой текст'), src).changed).toBe(true)
  })
  it('диктор — библиотека слов по тексту: перевод (ru:…), английское слово, фраза целиком (phrase:…); записи нет — подсказка', () => {
    expect(voiceOf(l('dictor', 'учиться'), src)).toMatchObject({ url: 'https://r2/ru.mp3', from: 'библиотека слов', key: 'ru:учиться' })
    expect(voiceOf(l('dictor', 'Meet'), src).url).toBe('https://r2/meet.mp3')
    expect(voiceOf(l('dictor', 'Nice to meet you'), src).url).toBe('https://r2/phrase.mp3')
    expect(dictorKeys('Nice to meet you')).toEqual(['ru:nice to meet you', 'nice to meet you', 'phrase:nice to meet you'])
    expect(voiceOf(l('dictor', 'пытаюсь'), src).why).toContain('в библиотеке слов нет записи')
  })
  it('озвучка не подключена / грузится / не загрузилась — проиграть нечего, причина словами; ключ проигрывания — реплика в свой момент игры', () => {
    expect(voiceOf(l('pit', 'race_start'), null).why).toContain('не подключена')
    expect(voiceOf(l('pit', 'race_start'), { status: 'loading' }).why).toBe('загружаю озвучку…')
    expect(voiceOf(l('pit', 'race_start'), { status: 'error', error: 'сеть' }).why).toBe('озвучка не загрузилась: сеть')
    expect(voiceKey(l('pit', 'a', 'a', 1000.4))).toBe('pit:a@1000'); expect(voiceKey(l('pit', 'a', 'a', 5000))).not.toBe(voiceKey(l('pit', 'a', 'a', 1000)))
  })
})

describe('проигрыватель клипа (обычный <audio>, один звук за раз)', () => {
  const fake = () => { const made = []; const make = url => { const on = {}; const a = { url, paused: false, duration: 2, currentTime: 0, addEventListener: (e, f) => { on[e] = f }, removeEventListener: (e, f) => { if (on[e] === f) delete on[e] }, play: () => Promise.resolve(), pause() { a.paused = true }, fire: e => on[e]?.() }; made.push(a); return a }; return { made, make } }
  it('играть → «loading», событие playing → «playing» с длиной файла; конец файла → покой', () => {
    const f = fake(), st = [], p = createClipPlayer({ make: f.make, onState: s => st.push(s) })
    p.play('k1', 'u1'); f.made[0].fire('playing'); f.made[0].fire('ended')
    expect(st).toEqual([{ key: 'k1', status: 'loading' }, { key: 'k1', status: 'playing', dur: 2, at: 0 }, IDLE]); expect(p.current()).toBeNull()
  })
  it('повторное нажатие на тот же клип — стоп; другой клип — прежний останавливается, играет новый', () => {
    const f = fake(), st = [], p = createClipPlayer({ make: f.make, onState: s => st.push(s) })
    p.toggle('k1', 'u1'); p.toggle('k1', 'u1')
    expect(f.made[0].paused).toBe(true); expect(st.at(-1)).toEqual(IDLE)
    p.toggle('k1', 'u1'); p.toggle('k2', 'u2')
    expect(f.made).toHaveLength(3); expect(f.made[1].paused).toBe(true); expect(f.made[2].paused).toBe(false); expect(p.current()).toBe('k2')
    f.made[1].fire('playing'); expect(st.at(-1)).toEqual({ key: 'k2', status: 'loading' }) // события остановленного звука не слушаются
    expect(p.stop()).toBe(true); expect(p.stop()).toBe(false)
  })
  it('файл не загрузился или браузер не дал проиграть — ошибка текстом', async () => {
    const f = fake(), st = [], p = createClipPlayer({ make: f.make, onState: s => st.push(s) })
    p.play('k1', 'u1'); f.made[0].fire('error')
    expect(st.at(-1)).toMatchObject({ key: 'k1', status: 'error' }); expect(st.at(-1).error).toContain('не загрузился')
    const p2 = createClipPlayer({ make: () => ({ addEventListener() {}, removeEventListener() {}, pause() {}, play: () => Promise.reject(new Error('NotAllowedError')) }), onState: s => st.push(s) })
    p2.play('k2', 'u2'); await Promise.resolve(); await Promise.resolve()
    expect(st.at(-1)).toEqual({ key: 'k2', status: 'error', error: 'браузер не дал проиграть: NotAllowedError' })
  })
})

describe('карточка и клип: кнопки ▶ и «Комментарий в GitHub»', () => {
  const m = buildTimeline(montageEvents()), line = m.lines[0]
  const audio = (state = IDLE, has = true) => ({ state, toggle() {}, stop() {}, key: voiceKey, of: () => (has ? { url: 'u', from: 'настройки реплик', duration: 2 } : { url: null, why: NO_VOICE }) })
  const block = { head: () => 'run:r1 t=+1,000s clip=pit:a#1\nБлок: Пит «А», +0:01', send: async () => 'Отправлено' }
  it('реплика: «▶ Слушать», честная строка про текущие настройки, «💬 Комментарий в GitHub»; играет — «■ Стоп» и полоска хода', () => {
    const s = renderToStaticMarkup(<TimelineCard sel={{ kind: 'line', ref: line }} audio={audio()} block={block} />)
    expect(s).toMatch(/data-testid="tl-play-btn">▶ Слушать</); expect(s).toContain(FROM_NOW); expect(s).toMatch(/data-testid="tl-block-comment"[^>]*>💬 Комментарий в GitHub</)
    const on = renderToStaticMarkup(<TimelineCard sel={{ kind: 'line', ref: line }} audio={audio({ key: voiceKey(line), status: 'playing', dur: 2, at: 0 })} block={block} />)
    expect(on).toContain('■ Стоп'); expect(on).toContain('animation-duration:2.00s')
  })
  it('нет озвучки — кнопка серая и подсказка «нет озвучки (подпись)»; без звука и отправки (стенд) кнопок нет', () => {
    const s = renderToStaticMarkup(<TimelineCard sel={{ kind: 'line', ref: line }} audio={audio(IDLE, false)} block={block} />)
    expect(s).toMatch(/<button[^>]*disabled=""[^>]*data-testid="tl-play-btn"/); expect(s).toContain('нет озвучки (подпись)')
    const bare = renderToStaticMarkup(<TimelineCard sel={{ kind: 'line', ref: line }} />)
    expect(bare).not.toContain('tl-play'); expect(bare).not.toContain('tl-block-comment')
  })
  it('комментарий есть у любого блока: этап, пилюля, ответ, зазор, пауза, отсчёт; «▶» — только у реплики', () => {
    const mont = buildMontage(m)
    for (const sel of [{ kind: 'stage', ref: m.stages[0] }, { kind: 'turn', ref: m.turns[0] }, { kind: 'answer', ref: m.answers[0] }, { kind: 'gap', ref: mont.gaps[0] }, { kind: 'wait', ref: { t: 0, end: 500, text: 'техника' } }]) {
      const s = renderToStaticMarkup(<TimelineCard sel={sel} audio={audio()} block={block} />)
      expect(s, sel.kind).toContain('tl-block-comment'); expect(s, sel.kind).not.toContain('tl-play-btn')
    }
    expect(renderToStaticMarkup(<TimelineCard sel={{ kind: 'gap', ref: mont.gaps.find(g => g.long) }} />)).toContain('Тишина — игра молчит')
  })
  it('монтаж: выбранный клип — карточка в боковой панели; клип, который звучит, помечен и заполняется по ходу звука; у клипов значок ▶', () => {
    const base = buildMontage(m), draft = { edits: [], pending: null, steps: 0, srv: '', canUndo: false, canRedo: false, set() {}, undo() {}, redo() {}, reset() {}, accept() {}, discard() {}, flush() {} }
    const s = renderToStaticMarkup(<TimelineMontage base={base} draft={draft} scale0={0.05} audio={audio({ key: voiceKey(line), status: 'playing', dur: 2, at: 0 })} block={block} pick0={{ kind: 'line', ref: line }} />)
    expect(s).toMatch(/class="tlCard tlCardSide" data-testid="tl-card" data-kind="line"/); expect(s).toMatch(/data-key="pit:a#1"[^>]*data-on="1"[^>]*data-play="playing"/)
    expect(s).toContain('class="mtgClipPlay"'); expect(s).toContain('■ 2,0 с'); expect(s).toContain('▶ 1,5 с')
    for (const k of ['stage', 'turn', 'answer']) expect(s, k).toContain(`data-pick="${k}"`)
    expect(renderToStaticMarkup(<TimelineMontage base={base} draft={draft} scale0={0.05} />)).not.toContain('▶')
  })
})

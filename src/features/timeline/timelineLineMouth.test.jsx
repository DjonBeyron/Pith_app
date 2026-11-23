import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { mouthState, mouthDone } from './timelineLineEdit.js'
import { createLineEdit } from './useLineEdit.js'
import TimelineLineEditor from './TimelineLineEditor.jsx'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { auditVoice } from '../admin/speech/voiceAudit.js'
import { setLineFile, realignLine, markMouth } from '../admin/speech/raceLineActions.js'
import { buildAlign } from '../../shared/lib/vosk/voskAlign.js'
import { RACE_LINES } from '../pitrace/raceLines.js'

// Своя озвучка реплики: разметка рта по словам при загрузке файла (admin/speech/raceLineActions.js + shared/lib/vosk/voskAlign.js), «разметить рот заново», статус «👄 …» в карточке таймлайна.
const ID = 'race_start', TEXT = RACE_LINES.find(d => d.id === ID).text
const KEYS = TEXT.split(/\s+/).filter(w => /[а-яё]/i.test(w))
const vosk = (skip = () => false) => KEYS.map((w, i) => ({ word: w.toLowerCase().replace(/[^а-яё]/g, ''), start: 0.2 + i * 0.4, end: 0.5 + i * 0.4 })).filter((_, i) => !skip(i))
const DUR = 0.4 * KEYS.length + 0.6
const good = (skip, extra = {}) => ({ ...buildAlign({ text: TEXT, vosk: vosk(skip), spans: [{ from: 0.2, to: DUR - 0.3 }], duration: DUR }), ...extra })
const server = (line = {}) => { const s = { raw: { lines: { [ID]: { text: TEXT, url: 'https://r2/a.mp3', duration: DUR, words: null, said: TEXT, ...line } } }, saves: 0 }; s.deps = { load: async () => s.raw, save: async v => { s.raw = v; s.saves++; return v } }; return s }
const fileDeps = (s, align) => ({ ...s.deps, upload: async () => 'https://r2/own.mp3', probe: async () => DUR, align })
const file = new Blob(['x'])
const html = (st, core) => renderToStaticMarkup(<TimelineLineEditor line={{ who: 'pit', id: ID, text: TEXT, t: 0, end: 1000, ms: 1000 }} edit={{ ...st, ...core, copy: async () => true }} />)
const editOf = async api => { const st = { busy: null, error: null, done: null, undo: null }, seen = []; const core = createLineEdit(api, p => { if (p.busy) seen.push(p.busy.what); Object.assign(st, p) }); await core.reload(); return { st, core, seen } }
const apiOf = (s, extra) => ({ load: s.deps.load, normalize: normalizeLines, audit: raw => auditVoice(raw).byId, ...extra })

describe('свой файл: рот размечается при загрузке', () => {
  it('разметка сохраняется в запись реплики одной записью вместе с файлом; шаги идут по порядку', async () => {
    const s = server(), steps = []
    let res = null
    const lines = await setLineFile(ID, file, { ...fileDeps(s, async (_f, text, o) => { expect(text).toBe(TEXT); o.onStep('слушаю запись (Vosk)…'); return good() }), onStep: t => steps.push(t), onAlign: r => { res = r } })
    expect(s.saves).toBe(1)
    const saved = s.raw.lines[ID]
    expect(saved).toMatchObject({ url: 'https://r2/own.mp3', duration: DUR, said: TEXT }); expect(saved.words).toHaveLength(KEYS.length); expect(saved.words.every(w => w.a === 'v')).toBe(true)
    expect(lines[ID].words).toEqual(saved.words); expect(res.method).toBe('vosk')
    expect(steps).toEqual(['загружаю файл…', 'слушаю запись (Vosk)…', 'сохраняю…'])
    expect(auditVoice(s.raw).byId[ID].status).toBe('ok')
  })
  it('разметка упала / модель недоступна — файл всё равно сохраняется (words = null, рот по тексту), причина доходит до человека', async () => {
    const s = server()
    let res = null
    await setLineFile(ID, file, { ...fileDeps(s, async () => { throw new Error('файл не декодируется как звук') }), onAlign: r => { res = r } })
    expect(s.raw.lines[ID]).toMatchObject({ url: 'https://r2/own.mp3', words: null, said: TEXT }); expect(s.saves).toBe(1)
    expect(res.failed).toBe(true); expect(mouthDone(res)).toBe('👄 рот не размечен (идёт по тексту): разметка рта не вышла: файл не декодируется как звук')
    const s2 = server() // движок не сработал, но слова разложились по громкости — сохраняются
    await setLineFile(ID, file, fileDeps(s2, async () => buildAlign({ text: TEXT, vosk: null, why: 'Vosk не сработал: модель Vosk не скачалась: нет сети', spans: [{ from: 0.2, to: DUR - 0.3 }], duration: DUR })))
    expect(s2.raw.lines[ID].words.every(w => w.a === 'l')).toBe(true)
    const s3 = server() // голоса не видно: разметка была бы равномерной — тайминги не пишем
    await setLineFile(ID, file, fileDeps(s3, async () => buildAlign({ text: TEXT, vosk: null, spans: [], duration: DUR })))
    expect(s3.raw.lines[ID].words).toBeNull()
    expect((await markMouth(file, TEXT, { align: async () => { throw new Error('x') } })).words).toBeNull() // сама разметка наружу не бросает
  })
  it('без подставной разметки (jsdom: Web Audio нет) загрузка файла работает как раньше — words = null', async () => {
    const s = server()
    await setLineFile(ID, file, { ...s.deps, upload: async () => 'https://r2/own.mp3', probe: async () => 1.5 })
    expect(s.raw.lines[ID]).toMatchObject({ url: 'https://r2/own.mp3', duration: 1.5, words: null })
  })
})

describe('«разметить рот заново» по уже загруженному файлу', () => {
  const fetchOk = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  it('файл скачивается по url, размечается, тайминги дописываются к той же записи (url и длительность не меняются)', async () => {
    const s = server(), urls = []
    await realignLine(ID, { ...s.deps, fetchFile: async u => { urls.push(u); return fetchOk() }, align: async () => good() })
    expect(urls).toEqual(['https://r2/a.mp3']); expect(s.raw.lines[ID]).toMatchObject({ url: 'https://r2/a.mp3', duration: DUR }); expect(s.raw.lines[ID].words).toHaveLength(KEYS.length); expect(s.saves).toBe(1)
  })
  it('CORS / сеть, нет файла, устаревший звук, неудачная разметка — понятная ошибка, настройки не тронуты', async () => {
    const s = server()
    await expect(realignLine(ID, { ...s.deps, fetchFile: async () => { throw new TypeError('Failed to fetch') }, align: async () => good() })).rejects.toThrow('файл озвучки не скачался (Failed to fetch): нет сети или хранилище не отдаёт файл этой странице (CORS)')
    await expect(realignLine(ID, { ...s.deps, fetchFile: async () => ({ ok: false, status: 404 }), align: async () => good() })).rejects.toThrow('ответ 404')
    await expect(realignLine(ID, { ...s.deps, fetchFile: fetchOk, align: async () => { throw new Error('файл не декодируется как звук') } })).rejects.toThrow('не декодируется')
    await expect(realignLine(ID, { ...server({ url: null }).deps, fetchFile: fetchOk })).rejects.toThrow('нет файла озвучки')
    await expect(realignLine(ID, { ...server({ said: 'Старое', custom: true }).deps, fetchFile: fetchOk })).rejects.toThrow('прежний текст')
    expect(s.saves).toBe(0)
  })
  it('реплику поменяли, пока шла разметка — не перезаписываем', async () => {
    const s = server()
    await expect(realignLine(ID, { ...s.deps, fetchFile: fetchOk, align: async () => { s.raw = { lines: { [ID]: { ...s.raw.lines[ID], url: 'https://r2/other.mp3' } } }; return good() } })).rejects.toThrow('изменили')
    expect(s.saves).toBe(0)
  })
})

describe('статус разметки рта в карточке', () => {
  const rec = words => ({ text: TEXT, url: 'u', duration: DUR, words })
  it('строки статуса: Vosk целиком / частично / приблизительно / по громкости / нет разметки / ElevenLabs; без файла строки нет', () => {
    const n = KEYS.length
    expect(mouthState(rec(good().words))).toEqual({ text: `👄 рот размечен: ${n} слов из ${n} (Vosk)`, kind: 'ok', redo: false })
    const part = mouthState(rec(good(i => i === 1).words))
    expect(part.text).toBe(`👄 рот размечен: найдено ${n - 1} из ${n}, остальные расставлены по записи (не найдены: «${KEYS[1]}»)`); expect(part).toMatchObject({ kind: 'ok', redo: true })
    const few = mouthState(rec(good(i => i > 0).words))
    expect(few.text).toContain(`рот размечен приблизительно: найдено 1 из ${n}`); expect(few.kind).toBe('approx')
    expect(mouthState(rec(good(() => true).words))).toEqual({ text: '👄 рот по громкости записи: Vosk не узнал слова', kind: 'approx', redo: true })
    expect(mouthState(rec(null))).toEqual({ text: '👄 разметки нет', kind: 'none', redo: true })
    expect(mouthState(rec([{ w: 'Поехали!', t: 0.1, e: 0.7 }]))).toEqual({ text: '👄 рот размечен (озвучка ElevenLabs)', kind: 'ok', redo: false })
    expect(mouthState({ text: TEXT, url: null, words: null })).toBeNull(); expect(mouthState(undefined)).toBeNull()
  })
  it('карточка: после загрузки файла — статус «👄 …», ход разметки в строке «занято», итог в сообщении; статус переживает перечитывание настроек', async () => {
    const s = server()
    const { st, core, seen } = await editOf(apiOf(s, { setFile: (id, f) => setLineFile(id, f, fileDeps(s, async (_f, _t, o) => { o.onStep('слушаю запись (Vosk)…'); return good() })) }))
    expect(html(st, core)).toContain('data-testid="tl-le-mouth">👄 разметки нет<') // файл был загружен до разметки
    expect(html(st, core)).not.toContain('tl-le-realign') // у подставного api без realign кнопки нет
    expect(await core.setFile(ID, file)).toBe(true)
    // подставной api вызывает setLineFile со своими onStep по умолчанию → шаги приходят подпиской watchMouth
    expect(seen).toEqual(['file', 'загружаю файл…', 'слушаю запись (Vosk)…', 'сохраняю…'])
    expect(st.done.text).toBe(`Файл загружен — можно слушать. 👄 рот размечен: ${KEYS.length} слов из ${KEYS.length} (Vosk)`)
    const h = html(st, core)
    expect(h).toContain(`data-kind="ok" data-testid="tl-le-mouth">👄 рот размечен: ${KEYS.length} слов из ${KEYS.length} (Vosk)<`)
    await core.reload(); expect(html(st, core)).toContain('(Vosk)<') // «перезагрузка»: статус читается из самих таймингов
    expect(html({ ...st, busy: { id: ID, what: 'слушаю запись (Vosk)…' } }, core)).toContain('data-testid="tl-le-busy">слушаю запись (Vosk)…<')
  })
  it('кнопка «🔁 Разметить рот заново»: есть у файла без разметки, запускает разметку, после полной разметки пропадает; ошибка — текстом', async () => {
    const s = server()
    let fail = true
    const realign = id => realignLine(id, { ...s.deps, fetchFile: async () => { if (fail) throw new TypeError('Failed to fetch'); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } }, align: async () => good() })
    const { st, core } = await editOf(apiOf(s, { realign }))
    expect(html(st, core)).toMatch(/<button[^>]*data-testid="tl-le-realign">🔁 Разметить рот заново</)
    expect(await core.realign(ID)).toBe(false); expect(st.error.text).toContain('Рот не размечен: файл озвучки не скачался'); expect(html(st, core)).toContain('tl-le-realign')
    fail = false
    expect(await core.realign(ID)).toBe(true); expect(st.done.text).toContain('👄 рот размечен:'); expect(html(st, core)).not.toContain('tl-le-realign')
  })
  it('загрузка файла с неудачной разметкой: файл загружен, причина — в сообщении', async () => {
    const s = server()
    const { st, core } = await editOf(apiOf(s, { setFile: (id, f) => setLineFile(id, f, fileDeps(s, async () => { throw new Error('в этом браузере нет Web Audio — файл не разобрать') })) }))
    expect(await core.setFile(ID, file)).toBe(true)
    expect(st.done.text).toBe('Файл загружен — можно слушать. 👄 рот не размечен (идёт по тексту): разметка рта не вышла: в этом браузере нет Web Audio — файл не разобрать')
    expect(html(st, core)).toContain('👄 разметки нет')
  })
})

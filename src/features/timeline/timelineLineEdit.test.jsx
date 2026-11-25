import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { lineVoiceState, voiceMarks, voiceTodo, saveError } from './timelineLineEdit.js'
import { createLineEdit } from './useLineEdit.js'
import TimelineLineEditor from './TimelineLineEditor.jsx'
import TimelineVoiceTodo from './TimelineVoiceTodo.jsx'
import TimelineCard from './TimelineCard.jsx'
import MontageClip from './montage/MontageClip.jsx'
import { normalizeLines, linesToSave } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { auditVoice } from '../admin/speech/voiceAudit.js'
import { saveLineText } from '../admin/speech/raceLineText.js'
import { setLineFile, restoreLine } from '../admin/speech/raceLineActions.js'
import { voicePitLines } from '../rehearsal/rehearsalVoice.js'
import { lineRows } from '../admin/speech/raceVoiceTable.js'
import { RACE_LINES } from '../pitrace/raceLines.js'

// Правка реплики из карточки таймлайна: копирование, текст (через ту же функцию, что таблица «Озвучка Пита»), статус «нужно озвучить», список, отказ записи без прав, «вернуть прежний текст», диктор — только чтение.
const TXT = Object.fromEntries(RACE_LINES.map(d => [d.id, d.text]))
const ID = 'race_start', ID2 = 'race_good_1'
const rawOf = () => ({ lines: { [ID]: { text: TXT[ID], url: 'https://r2/a.mp3', duration: 3.4, words: null, said: TXT[ID] }, [ID2]: { text: TXT[ID2], url: 'https://r2/b.mp3', duration: 1.6, words: null, said: TXT[ID2] } } })
// подставной сервер: настройки в памяти; deny — запись отклонена (RLS), как у не-админа
const server = (deny = false) => { const s = { raw: rawOf(), saves: 0 }; s.deps = { load: async () => s.raw, save: async v => { if (deny) throw new Error('Сохранение не применилось: сервер не подтвердил запись'); s.raw = v; s.saves++; return v } }; return s }
const apiOf = (s, extra = {}) => ({ load: s.deps.load, normalize: normalizeLines, audit: raw => auditVoice(raw).byId, saveText: (id, t) => saveLineText(id, t, s.deps),
  voice: id => voicePitLines({ ids: [id], ...s.deps, speak: async t => ({ file: new Blob([t]), wordTimings: [] }), upload: async () => 'https://r2/new.mp3', probe: async () => 2, loadVoice: async () => {} }),
  setFile: (id, f) => setLineFile(id, f, { ...s.deps, upload: async () => 'https://r2/own.mp3', probe: async () => 1.5 }), restore: (id, prev) => restoreLine(id, prev, s.deps), copy: async () => true, ...extra })
const edit = async (s, extra) => { const st = { busy: null, error: null, done: null, undo: null }; const core = createLineEdit(apiOf(s, extra), p => Object.assign(st, p)); await core.reload(); return { st, core } }
const line = (who, id, text = TXT[id] ?? id, t = 1000) => ({ who, id, text, t, end: t + 1000, ms: 1000 })
const m = { lines: [line('pit', ID, TXT[ID], 0), line('dictor', 'учиться', 'учиться', 2000), line('pit', ID2, TXT[ID2], 4000), line('pit', ID2, TXT[ID2], 9000), line('pit', 'race_good_ok', 'Отлично', 12000)] }
const html = (l, e) => renderToStaticMarkup(<TimelineLineEditor line={l} edit={e} />)
const view = (st, core, extra = {}) => ({ ...st, ...core, copy: async () => true, ...extra })

describe('сохранение текста реплики из карточки', () => {
  it('идёт через ту же функцию, что таблица «Озвучка Пита» (saveLineText), и даёт тот же объект настроек', async () => {
    const a = server(), b = server(), { st, core } = await edit(a)
    expect(await core.saveText(ID, '  Новый старт  ')).toBe(true)
    await saveLineText(ID, 'Новый старт', b.deps) // так сохраняет таблица: useRaceVoiceTable → d.saveText = saveLineText
    expect(a.raw).toEqual(b.raw)
    expect(a.raw.lines[ID]).toEqual({ text: 'Новый старт', url: 'https://r2/a.mp3', duration: 3.4, words: null, custom: true, said: TXT[ID] })
    expect(st.done).toMatchObject({ id: ID }); expect(st.undo).toMatchObject({ id: ID, prev: { text: TXT[ID], url: 'https://r2/a.mp3' } })
    const api = readFileSync(new URL('./timelineLineApi.js', import.meta.url), 'utf8'), table = readFileSync(new URL('../admin/speech/useRaceVoiceTable.js', import.meta.url), 'utf8')
    expect(api).toContain('saveText: (id, text) => saveLineText(id, text)'); expect(api).toContain('voice: id => voicePitLines({ ids: [id] })'); expect(api).toContain('audit: raw => auditVoice(raw).byId')
    expect(table).toContain('saveText: saveLineText'); expect(table).toContain('voiceLines: voicePitLines'); expect(table).toContain('auditVoice(raw, raceCatalog(), CAT_LINES)') // v3.3.356: таблица аудитит только «Встряхни память»; таймлайн — весь каталог (его реплики — этой же игры)
  })
  it('пустой текст не сохраняется; отказ записи без прав админа — понятная ошибка, настройки не тронуты, отмены нет', async () => {
    const s = server(true), { st, core } = await edit(s)
    expect(await core.saveText(ID, '   ')).toBe(false); expect(st.error.text).toBe('Пустой текст не сохраняется.')
    expect(await core.saveText(ID, 'Другой текст')).toBe(false)
    expect(st.error).toEqual({ id: ID, text: 'Не сохранилось: запись в настройки реплик проходит только у админа (Сохранение не применилось: сервер не подтвердил запись). Текст в поле остался — ничего не потеряно.' })
    expect(s.raw).toEqual(rawOf()); expect(st.undo).toBeNull(); expect(st.busy).toBeNull()
    expect(saveError(new Error('сеть'))).toBe('Не сохранилось: сеть. Текст в поле остался — ничего не потеряно.')
  })
})

describe('статус «нужно озвучить»', () => {
  it('после изменения текста — красный (тот же статус stale, что показывает таблица); после «Озвучить заново» — зелёный и новый файл', async () => {
    const s = server(), { st, core } = await edit(s)
    expect(lineVoiceState(line('pit', ID), st.audit)).toMatchObject({ status: 'ok', mark: 'green', label: '🟢 озвучено' })
    await core.saveText(ID, 'Новый старт')
    const red = lineVoiceState(line('pit', ID), st.audit)
    expect(red).toMatchObject({ status: 'stale', mark: 'red', label: '🔴 нужно озвучить: текст изменён, звук старый', now: 'Новый старт', was: TXT[ID], differs: true })
    expect(lineRows(RACE_LINES.filter(d => d.id === ID), st.lines, st.audit)[0].status).toBe('stale') // строка таблицы «Озвучка Пита» по тем же данным
    expect(await core.voice(ID)).toBe(true)
    expect(lineVoiceState(line('pit', ID, 'Новый старт'), st.audit)).toMatchObject({ status: 'ok', mark: 'green', differs: false })
    expect(st.lines[ID]).toMatchObject({ text: 'Новый старт', url: 'https://r2/new.mp3', duration: 2, said: 'Новый старт' }); expect(st.done.text).toBe('Озвучено — можно слушать.')
  })
  it('нет озвучки — белый «без озвучки (подпись)»; ошибка озвучки — текстом; диктор и неизвестная реплика статуса не имеют', async () => {
    const s = server(), { st, core } = await edit(s, { voice: async id => ({ done: 0, failed: { [id]: 'ElevenLabs 402' } }) })
    expect(lineVoiceState(line('pit', 'race_good_ok'), st.audit)).toMatchObject({ mark: 'white', label: '⚪ без озвучки (подпись)' })
    expect(await core.voice(ID)).toBe(false); expect(st.error).toEqual({ id: ID, text: 'Не озвучилось: ElevenLabs 402' })
    expect(lineVoiceState(line('dictor', 'учиться'), st.audit).known).toBe(false); expect(lineVoiceState(line('pit', 'нет_такой'), st.audit).known).toBe(false)
  })
  it('свой файл: url и длительность из файла, said = текущий текст — статус зелёный; файл без длительности не принимается', async () => {
    const s = server(), { st, core } = await edit(s)
    await core.saveText(ID, 'Новый старт'); expect(await core.setFile(ID, new Blob(['x']))).toBe(true)
    expect(s.raw.lines[ID]).toEqual({ text: 'Новый старт', url: 'https://r2/own.mp3', duration: 1.5, words: null, custom: true, said: 'Новый старт', saidTts: 'Новый старт.' }) // saidTts — нынешний текст диктора: у своего файла «можно переозвучить с интонацией» не горит
    expect(lineVoiceState(line('pit', ID), st.audit).status).toBe('ok')
    await expect(setLineFile(ID, new Blob(['x']), { ...s.deps, upload: async () => 'u', probe: async () => 0 })).rejects.toThrow('длительность')
    await expect(setLineFile('нет', new Blob(['x']), s.deps)).rejects.toThrow('нет реплики')
  })
})

describe('«вернуть прежний текст»', () => {
  it('возвращает текст и прежнюю озвучку — настройки как до правки', async () => {
    const s = server(), { st, core } = await edit(s)
    await core.saveText(ID, 'Новый старт'); expect(await core.restore(st.undo)).toBe(true)
    expect(linesToSave(normalizeLines(s.raw))).toEqual(linesToSave(normalizeLines(rawOf()))); expect(st.undo).toBeNull()
    expect(lineVoiceState(line('pit', ID), st.audit).status).toBe('ok')
  })
  it('озвучку уже перезаписали — возвращается только текст, новый файл остаётся (статус «нужно озвучить»)', async () => {
    const s = server(), { st, core } = await edit(s)
    await core.saveText(ID, 'Новый старт'); await core.voice(ID); expect(st.undo).not.toBeNull()
    await core.restore(st.undo)
    expect(s.raw.lines[ID]).toMatchObject({ text: TXT[ID], url: 'https://r2/new.mp3', said: 'Новый старт' }); expect(lineVoiceState(line('pit', ID), st.audit).status).toBe('stale')
  })
})

describe('список «Нужно озвучить» и метки на клипах', () => {
  it('реплики текущих настроек, которые звучат в этой игре и требуют озвучки: красные первыми, с первым появлением и числом повторов', async () => {
    const s = server(), { st, core } = await edit(s)
    expect(voiceTodo(m, st.audit).map(x => x.id)).toEqual(['race_good_ok']) // озвучки нет
    await core.saveText(ID2, 'ещё лучше')
    const todo = voiceTodo(m, st.audit)
    expect(todo.map(x => [x.id, x.mark, x.n, x.line.t])).toEqual([[ID2, 'red', 2, 4000], ['race_good_ok', 'white', 1, 12000]])
    expect(voiceMarks(m, st.audit)).toEqual({ [ID2]: 'red', race_good_ok: 'white' })
    const h = renderToStaticMarkup(<TimelineVoiceTodo todo={todo} onGo={() => {}} open0 />)
    expect(h).toContain('🎙 Нужно озвучить (2)'); expect(h).toMatch(/data-mark="red"[^>]*><b>Пит<\/b> «ещё лучше»/); expect(h).toContain('в игре 2 раза, впервые на +4,000 с')
    expect(renderToStaticMarkup(<TimelineVoiceTodo todo={[]} onGo={() => {}} />)).toContain('🎙 всё озвучено'); expect(renderToStaticMarkup(<TimelineVoiceTodo todo={null} onGo={() => {}} />)).toBe('')
  })
  it('клип монтажа: красная метка «нужно озвучить», пустая — «без озвучки»; у озвученного метки нет', () => {
    const c = { key: 'pit:a#1', who: 'pit', id: 'a', text: 'А', t: 0, end: 2000, sound: 2000, tail: 0 }
    expect(renderToStaticMarkup(<MontageClip c={c} scale={0.05} mark="red" />)).toMatch(/data-mark="red"[^>]*>.*class="mtgClipMark" title="нужно озвучить/s)
    expect(renderToStaticMarkup(<MontageClip c={c} scale={0.05} mark="white" />)).toContain('title="без озвучки (подпись)"'); expect(renderToStaticMarkup(<MontageClip c={c} scale={0.05} />)).not.toContain('mtgClipMark')
    const scr = readFileSync(new URL('./TimelineScreen.jsx', import.meta.url), 'utf8')
    expect(scr).toContain('<TimelineVoiceTodo todo={todo} onGo={goLine}'); expect(scr).toContain("setTab('ribbon'); setSel({ kind: 'line', ref: l })")
  })
})

describe('карточка реплики: копирование и редактор', () => {
  it('копирование: «📋 Копировать текст» и «📋 id»; буфер — через общий copyText (clipboard с запасным вариантом через выделение)', async () => {
    const s = server(), { st, core } = await edit(s), h = html(line('pit', ID), view(st, core))
    expect(h).toMatch(/data-testid="tl-le-copy">📋 Копировать текст</); expect(h).toMatch(/data-testid="tl-le-copy-id">📋 id</)
    expect(readFileSync(new URL('./timelineLineApi.js', import.meta.url), 'utf8')).toContain('copy: copyText')
    expect(readFileSync(new URL('../admin/speech/copyText.js', import.meta.url), 'utf8')).toContain("document.execCommand('copy')")
    expect(html(line('pit', ID), null)).toContain('tl-le-copy'); expect(html(line('pit', ID), null)).not.toContain('tl-le-text') // правки нет (стенд без настроек) — копирование остаётся
  })
  it('Пит / Мия: статус, поле с текстом ИЗ НАСТРОЕК, «Озвучить заново», «Выбрать файл…»; звучал другой текст — показаны оба; после сохранения — «↶ Вернуть прежний текст»', async () => {
    const s = server(), { st, core } = await edit(s)
    await core.saveText(ID, 'Новый старт')
    const h = html(line('pit', ID), view(st, core))
    expect(h).toMatch(/data-mark="red" data-testid="tl-le-status">🔴 нужно озвучить: текст изменён, звук старый/); expect(h).toMatch(/<textarea[^>]*data-testid="tl-le-text">Новый старт<\/textarea>/)
    expect(h).toContain(`в этой игре звучало: «${TXT[ID]}» · сейчас в настройках: «Новый старт»`)
    for (const k of ['tl-le-voice', 'tl-le-file', 'tl-le-undo', 'tl-le-done']) expect(h, k).toContain(`data-testid="${k}"`)
    expect(h).toMatch(/<input type="file" accept="audio\/\*"/); expect(h).not.toContain('tl-le-save') // «Сохранить» появляется, когда текст правили
    const busy = html(line('pit', ID), view({ ...st, busy: { id: ID, what: 'voice' } }, core))
    expect(busy).toContain('озвучиваю…'); expect(busy).toMatch(/<button[^>]*disabled=""[^>]*data-testid="tl-le-voice"/)
    const src = readFileSync(new URL('./TimelineLineEditor.jsx', import.meta.url), 'utf8')
    expect(src).toContain('Текст изменится везде и сразу у всех игроков.'); expect(src).toContain('Эта реплика звучит: {st.when'); expect(lineVoiceState(line('pit', ID), st.audit).when).toContain('стартов')
  })
  it('диктор — только чтение: копирование и пояснение, без поля и кнопок озвучки; карточка блока показывает редактор только у реплики', async () => {
    const s = server(), { st, core } = await edit(s), e = view(st, core), h = html(line('dictor', 'учиться'), e)
    expect(h).toContain('tl-le-copy'); expect(h).toContain('Слово диктора — из библиотеки слов урока'); for (const k of ['tl-le-text', 'tl-le-voice', 'tl-le-file', 'tl-le-copy-id']) expect(h, k).not.toContain(k)
    expect(renderToStaticMarkup(<TimelineCard sel={{ kind: 'line', ref: line('pit', ID) }} edit={e} />)).toContain('data-testid="tl-le"')
    expect(renderToStaticMarkup(<TimelineCard sel={{ kind: 'stage', ref: { t: 0, end: 1000, sid: 'sprint' } }} edit={e} />)).not.toContain('tl-le')
  })
})

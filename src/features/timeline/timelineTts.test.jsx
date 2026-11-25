import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TimelineLineEditor from './TimelineLineEditor.jsx'
import { createLineEdit } from './useLineEdit.js'
import { lineVoiceState } from './timelineLineEdit.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { auditVoice } from '../admin/speech/voiceAudit.js'
import { saveLineText, saveLineTts } from '../admin/speech/raceLineText.js'
import { voicePitLines } from '../rehearsal/rehearsalVoice.js'
import { RACE_LINES } from '../pitrace/raceLines.js'

// Карточка реплики: поле «Текст для диктора (со знаками)» — что уходит в ElevenLabs; своя правка хранится в настройках реплики, проверяется «только знаки и регистр», после правки реплика помечена «переозвучить».
const L = RACE_LINES.find(l => l.id === 'race_good_3') // «вот это да, чисто» → «Вот это да! Чисто!»
const server = () => { const s = { raw: { lines: { [L.id]: { text: L.text, url: 'https://r2/a.mp3', duration: 1.4, words: null, said: L.text } } }, spoken: [] }; s.deps = { load: async () => s.raw, save: async v => { s.raw = v; return v } }; return s }
const apiOf = s => ({ load: s.deps.load, normalize: normalizeLines, audit: raw => auditVoice(raw).byId, saveText: (id, t) => saveLineText(id, t, s.deps), saveTts: (id, t) => saveLineTts(id, t, s.deps), copy: async () => true,
  voice: id => voicePitLines({ ids: [id], ...s.deps, speak: async t => { s.spoken.push(t); return { file: new Blob([t]), wordTimings: [] } }, upload: async () => 'https://r2/new.mp3', probe: async () => 2, loadVoice: async () => {} }) })
const edit = async (s, api = apiOf(s)) => { const st = { busy: null, error: null, done: null, undo: null }; const core = createLineEdit(api, p => Object.assign(st, p)); await core.reload(); return { st, core } }
const line = { who: 'pit', id: L.id, text: L.text, t: 0, end: 1000, ms: 1000 }
const html = (st, core) => renderToStaticMarkup(<TimelineLineEditor line={line} edit={{ ...st, ...core, copy: async () => true }} />)
globalThis.URL.createObjectURL ??= () => 'blob:x'; globalThis.URL.revokeObjectURL ??= () => {}

describe('поле «Текст для диктора (со знаками)» в карточке реплики', () => {
  it('поле под текстом реплики; пусто — показано, что уйдёт диктору из каталога; старая озвучка помечена мягко «можно переозвучить с интонацией»', async () => {
    const s = server(), { st, core } = await edit(s), h = html(st, core)
    expect(h).toContain('Текст для диктора (со знаками)'); expect(h).toContain('data-testid="tl-le-tts-text"'); expect(h.indexOf('tl-le-tts-text')).toBeGreaterThan(h.indexOf('data-testid="tl-le-text"'))
    expect(h).toContain('диктору уйдёт: «Вот это да! Чисто!»'); expect(h).toContain('data-tone="can"'); expect(h).toContain('🎭 можно переозвучить с интонацией')
    expect(h).toContain('data-status="ok"'); expect(lineVoiceState(line, st.audit)).toMatchObject({ status: 'ok', mark: 'green', tone: 'can', dictor: 'Вот это да! Чисто!' }) // статус озвучки не краснеет
  })
  it('своя правка сохраняется в настройки реплики и уходит диктору при «Озвучить заново»; после озвучки пометки нет', async () => {
    const s = server(), { st, core } = await edit(s)
    expect(await core.saveTts(L.id, 'Вот это да… Чисто!')).toBe(true)
    expect(s.raw.lines[L.id]).toEqual({ text: L.text, url: 'https://r2/a.mp3', duration: 1.4, words: null, said: L.text, tts: 'Вот это да… Чисто!' }) // текст, файл и said не тронуты
    expect(st.done.text).toContain('Текст для диктора сохранён'); expect(html(st, core)).toContain('диктору уйдёт: «Вот это да… Чисто!»')
    expect(await core.voice(L.id)).toBe(true); expect(s.spoken).toEqual(['Вот это да… Чисто!'])
    expect(s.raw.lines[L.id]).toMatchObject({ said: L.text, saidTts: 'Вот это да… Чисто!', url: 'https://r2/new.mp3' }); expect(lineVoiceState(line, st.audit).tone).toBeNull()
    await core.saveTts(L.id, 'Вот это да! Чисто.'); expect(lineVoiceState(line, st.audit)).toMatchObject({ status: 'ok', tone: 'redo' }); expect(html(st, core)).toContain('🎭 нужно переозвучить: текст для диктора изменён')
    await core.saveTts(L.id, ''); expect(s.raw.lines[L.id].tts).toBeUndefined(); expect(lineVoiceState(line, st.audit)).toMatchObject({ tone: 'redo', dictor: 'Вот это да! Чисто!' }) // пусто — снова из каталога
  })
  it('другие слова — понятная ошибка, настройки не тронуты; api без saveTts — поля нет, но видно, что уйдёт диктору', async () => {
    const s = server(), { st, core } = await edit(s), before = JSON.stringify(s.raw)
    expect(await core.saveTts(L.id, 'Вот это да — чисто!')).toBe(false)
    expect(st.error.text).toContain('Текст для диктора не подходит: знак «—» стоит отдельно'); expect(JSON.stringify(s.raw)).toBe(before)
    expect(await core.saveTts(L.id, 'Вот так да! Чисто!')).toBe(false); expect(st.error.text).toContain('слово № 2: в реплике «это», у диктора «так»')
    const { saveTts: _no, ...bare } = apiOf(s), b = await edit(s, bare), h = html(b.st, b.core) // api без правки текста диктора
    expect(b.core.saveTts).toBeNull(); expect(h).not.toContain('tl-le-tts-text'); expect(h).toContain('диктору уйдёт: «Вот это да! Чисто!»')
  })
})

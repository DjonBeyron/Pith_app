import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildScenario } from '../../timeline/check/scenarioBuild.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { voicePitLines, voiceMissingPitLines } from '../rehearsalVoice.js'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { CHAINS, neighborsOf, contextOf, contextOn, setContextOn } from './ttsContext.js'
import { TTS_OF } from './ttsText.js'

// Контекст соседних реплик (ElevenLabs previous_text / next_text) и то, что реально уходит в запрос озвучки. Настоящий ElevenLabs не зовётся: speak и fetch подставные.
const fake = () => { const calls = []; return { calls, speak: async (...a) => { calls.push(a); return { file: new Blob(['x']), wordTimings: a[0].split(/\s+/).map((w, i) => ({ w, t: i * 0.3, e: i * 0.3 + 0.2 })) } }, upload: async () => 'https://r2/new.mp3', probe: async () => 2, loadVoice: async () => null } }
beforeEach(() => { globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {} })
afterEach(() => { setContextOn(true) })

describe('цепочки соседей совпадают со сценарием игры', () => {
  it('каждая цепочка — подряд идущие реплики одной последовательной части сценария; реплика стоит не больше чем в одной цепочке', () => {
    const seqs = buildScenario().blocks.flatMap(b => b.parts.filter(p => p.kind === 'seq').map(p => p.items.map(i => i.id).join(' > ')))
    for (const c of CHAINS) expect(seqs.some(s => s.includes(c.join(' > '))), c.join(' > ')).toBe(true)
    const all = CHAINS.flat(); expect(new Set(all).size).toBe(all.length)
    expect(neighborsOf('mia_push')).toEqual({ prev: 'pit_forgot', next: 'pit_panic' }); expect(neighborsOf('boss_mia_go')).toEqual({ prev: 'boss_pit_no', next: null }); expect(neighborsOf('race_good_1')).toEqual({ prev: null, next: null })
  })
})

describe('контекст для запроса', () => {
  const lines = normalizeLines(null)
  it('соседи — текстом для диктора (со знаками); у последней реплики сцены next нет; выключатель убирает контекст', () => {
    expect(contextOf('mia_push', lines, true)).toEqual({ previousText: TTS_OF.pit_forgot, nextText: TTS_OF.pit_panic })
    expect(contextOf('boss_mia_go', lines, true)).toEqual({ previousText: TTS_OF.boss_pit_no })
    expect(contextOf('pit_forgot', lines, true)).toEqual({ nextText: TTS_OF.mia_push })
    expect(contextOf('race_good_1', lines, true)).toBeNull(); expect(contextOf('mia_push', lines, false)).toBeNull()
    expect(contextOn()).toBe(true); setContextOn(false); expect(contextOn()).toBe(false); expect(contextOf('mia_push', lines)).toBeNull(); setContextOn(true); expect(contextOf('mia_push', lines)).not.toBeNull()
  })
})

describe('что уходит в ElevenLabs при озвучке реплики', () => {
  it('voicePitLines: текст для диктора + голос + соседи; в настройки — чистый said, saidTts и тайминги слов со знаками', async () => {
    const f = fake(); let saved = null
    const r = await voicePitLines({ ids: ['boss_mia_bye', 'race_good_ok'], ...f, load: async () => ({ lines: {} }), save: async v => { saved = v }, context: true })
    expect(r).toEqual({ done: 2, failed: {} })
    expect(f.calls[0]).toEqual(['Коробка мне ещё пригодится. Пока!', expect.objectContaining({ account: 'mia' }), { previousText: TTS_OF.boss_mia_free, nextText: TTS_OF.boss_pit_well }])
    expect(f.calls[1]).toEqual(['Отлично!']) // соседей нет, голос по умолчанию — как раньше, один аргумент
    expect(saved.lines.boss_mia_bye).toMatchObject({ text: 'Коробка мне ещё пригодится, пока', said: 'Коробка мне ещё пригодится, пока', saidTts: 'Коробка мне ещё пригодится. Пока!', url: 'https://r2/new.mp3', duration: 2 })
    expect(saved.lines.boss_mia_bye.words.map(w => w.w)).toEqual(['Коробка', 'мне', 'ещё', 'пригодится.', 'Пока!'])
  })
  it('своя правка диктора из настроек главнее каталога; контекст выключен — третьего аргумента нет; «Озвучить недостающие» шлёт то же', async () => {
    const f = fake(), raw = { lines: { boss_mia_bye: { text: 'Коробка мне ещё пригодится, пока', tts: 'Коробка мне ещё пригодится… Пока.' } } }
    await voicePitLines({ ids: ['boss_mia_bye'], ...f, load: async () => raw, save: async () => {}, context: false })
    expect(f.calls[0]).toEqual(['Коробка мне ещё пригодится… Пока.', expect.objectContaining({ account: 'mia' })])
    const g = fake(); let saved = null
    await voiceMissingPitLines({ list: RACE_LINES.filter(l => l.id === 'race_demo_2'), ...g, load: async () => ({ lines: {} }), save: async v => { saved = v }, context: true })
    expect(g.calls[0]).toEqual(['Затем второе.', null, { previousText: 'Смотри: начинаем с первого слова.', nextText: 'Потом третье.' }])
    expect(saved.lines.race_demo_2).toMatchObject({ said: 'затем второе', saidTts: 'Затем второе.' })
  })
})

describe('запрос к edge-функции и сама функция', () => {
  it('generateSpeech кладёт previousText / nextText в тело запроса; без контекста полей нет', async () => {
    vi.resetModules(); vi.doMock('../../../shared/lib/r2.js', () => ({ authHeaders: async () => ({ Authorization: 'Bearer t' }) }))
    const { generateSpeech } = await import('../../../shared/lib/ttsApi.js')
    const bodies = []
    globalThis.fetch = vi.fn(async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ audioBase64: btoa('x'), contentType: 'audio/mpeg', wordTimings: [] }) } })
    await generateSpeech('Допустим.', { account: 'mia' }, { previousText: ' Раз. ', nextText: 'Три.' }); await generateSpeech('Отлично!'); await generateSpeech('Мимо.', null, { nextText: '  ' })
    expect(bodies[0]).toEqual({ text: 'Допустим.', account: 'mia', previousText: 'Раз.', nextText: 'Три.' }); expect(bodies[1]).toEqual({ text: 'Отлично!' }); expect(bodies[2]).toEqual({ text: 'Мимо.' })
    vi.doUnmock('../../../shared/lib/r2.js')
  })
  it('функция: previousText / nextText → previous_text / next_text, не для eleven_v3, отказ ElevenLabs — повтор без них; старая функция лишние поля не читает', () => {
    const src = readFileSync('supabase/functions/tts-elevenlabs/index.ts', 'utf8')
    expect(src).toContain('out.previous_text = cut(body.previousText)'); expect(src).toContain('out.next_text = cut(body.nextText)'); expect(src).toContain('const NO_CONTEXT_MODELS = ["eleven_v3"]')
    expect(src).toContain('if (!elRes.ok && contextUsed && (elRes.status === 400 || elRes.status === 422))'); expect(src).toContain('elRes = await call({})')
    expect(src).toContain('text = (body.text ?? "").trim()') // тело читается по именам полей: незнакомые поля прежняя версия функции просто не видит
  })
})

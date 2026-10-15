import { describe, it, expect, vi } from 'vitest'
import { generateLineAudio, ttsRequest, isOrphanUrl, removeOrphan, clearAudioPatch, fmtDuration } from './voiceGenerate.js'
import { VOICE_PRESETS, defaultVoiceFor, voiceName, selectValue, presetOf, charCost, sumChars, PREVIEW_PHRASE, CUSTOM_VOICE } from './voicePresets.js'
import { lineVoiceStatus, STATE_LABEL } from './voiceStatus.js'
import { audioHash, voiceSpec, DEFAULT_VOICE_ID, TTS_MODEL } from '../../../scene/v2/sceneVoice.js'
import { validateSceneV2 } from '../../../scene/v2/sceneSchemaV2.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import { updateLine } from '../timelineOps.js'

// Клиентский слой генерации — с моками ttsApi/r2/длительности, без сети
const file = { name: 'tts.mp3', type: 'audio/mpeg', size: 10 }
const deps = (over = {}) => ({
  tts: vi.fn(async () => ({ file, wordTimings: [{ w: 'Привет', t: 0, e: 0.41 }, { w: 'мир.', t: 0.5, e: 0.93 }], voiceId: 'pNInz6obpgDQGcFmaJgB' })),
  upload: vi.fn(async () => 'https://pub-1.r2.dev/chat/new.mp3'),
  remove: vi.fn(async () => {}),
  probeDuration: vi.fn(async () => 1.2),
  ...over,
})

describe('generateLineAudio', () => {
  const cat = { gender: 'male', name: 'Кот', voice: { pitch: 1, rate: 1, voiceId: 'pNInz6obpgDQGcFmaJgB', speed: 1.1 } }

  it('TTS → R2 → patch { audioUrl, wordTimings, audioMeta } с hash текущего голоса и длительностью', async () => {
    const d = deps()
    const patch = await generateLineAudio(' Привет мир. ', cat, d)
    expect(d.tts).toHaveBeenCalledWith('Привет мир.', { voiceId: 'pNInz6obpgDQGcFmaJgB', modelId: TTS_MODEL, voiceSettings: { stability: 0.5, similarity_boost: 0.75, speed: 1.1 } })
    expect(d.upload).toHaveBeenCalledWith(file)
    expect(patch).toEqual({
      audioUrl: 'https://pub-1.r2.dev/chat/new.mp3',
      wordTimings: [{ word: 'Привет', start: 0, end: 0.41 }, { word: 'мир.', start: 0.5, end: 0.93 }],
      audioMeta: { hash: audioHash('Привет мир.', voiceSpec(cat)), voiceId: 'pNInz6obpgDQGcFmaJgB', durationMs: 1200 },
    })
    // Результат проходит валидатор сцены как есть
    const s = JSON.parse(JSON.stringify(demoOfficeScene))
    s.timeline[0] = { ...s.timeline[0], text: 'Привет мир.', ...patch }
    s.characters.a = cat
    expect(validateSceneV2(s)).toEqual([])
  })
  it('без длительности файла — из последнего слова; без таймингов — поля wordTimings нет', async () => {
    const d = deps({ probeDuration: vi.fn(async () => null) })
    expect((await generateLineAudio('x', cat, d)).audioMeta.durationMs).toBe(930)
    const d2 = deps({ tts: vi.fn(async () => ({ file, wordTimings: [] })), probeDuration: vi.fn(async () => { throw new Error('no audio') }) })
    const p = await generateLineAudio('x', cat, d2)
    expect(p.wordTimings).toBeUndefined()
    expect(p.audioMeta.durationMs).toBeUndefined()
    expect(p.audioMeta.voiceId).toBe('pNInz6obpgDQGcFmaJgB') // из spec, когда сервер не вернул
  })
  it('пустой текст — ошибка без вызова TTS; ошибка TTS/R2 всплывает, файл не загружается', async () => {
    const d = deps()
    await expect(generateLineAudio('  ', cat, d)).rejects.toThrow(/пустая/)
    expect(d.tts).not.toHaveBeenCalled()
    const bad = deps({ tts: vi.fn(async () => { throw new Error('403 Forbidden') }) })
    await expect(generateLineAudio('x', cat, bad)).rejects.toThrow('403 Forbidden')
    expect(bad.upload).not.toHaveBeenCalled()
  })
  it('ttsRequest: голос проекта (default) — voiceId не шлём, сервер берёт секрет', () => {
    expect(ttsRequest(voiceSpec({ voice: {} }))).toEqual({ modelId: TTS_MODEL, voiceSettings: { stability: 0.5, similarity_boost: 0.75, speed: 1 } })
    expect(ttsRequest(voiceSpec({ voice: { voiceId: 'abc' } })).voiceId).toBe('abc')
  })
})

describe('файлы-сироты и очистка', () => {
  const tl = [{ audioUrl: 'u1' }, { audioUrl: 'u1' }, { audioUrl: 'u2' }]
  it('isOrphanUrl: файл, на который ссылается другая реплика, — не сирота', () => {
    expect(isOrphanUrl(tl, 'u1', 0)).toBe(false)
    expect(isOrphanUrl(tl, 'u2', 2)).toBe(true)
    expect(isOrphanUrl(tl, null, 0)).toBe(false)
  })
  it('removeOrphan: удаляет только сироту, ошибка удаления глушится (best effort)', async () => {
    const d = deps()
    expect(await removeOrphan(tl, 'u1', 0, d)).toBe(false)
    expect(d.remove).not.toHaveBeenCalled()
    expect(await removeOrphan(tl, 'u2', 2, d)).toBe(true)
    expect(d.remove).toHaveBeenCalledWith('u2')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fail = deps({ remove: vi.fn(async () => { throw new Error('R2 500') }) })
    expect(await removeOrphan(tl, 'u2', 2, fail)).toBe(false)
    warn.mockRestore()
  })
  it('clearAudioPatch через updateLine снимает все поля озвучки', () => {
    const line = { who: 'a', text: 'x', emotion: 'neutral', pose: 'talk', audioUrl: 'u', wordTimings: [], audioMeta: { hash: 'h' } }
    expect(updateLine([line], 0, clearAudioPatch())[0]).toEqual({ who: 'a', text: 'x', emotion: 'neutral', pose: 'talk' })
  })
  it('fmtDuration', () => {
    expect(fmtDuration(2400)).toBe('2,4 с')
    expect(fmtDuration(0)).toBe('')
    expect(fmtDuration(undefined)).toBe('')
  })
})

describe('пресеты голосов и стоимость', () => {
  it('голоса различаются по полу; подсказка по умолчанию — первый пресет своего пола', () => {
    expect(VOICE_PRESETS.filter(v => v.gender === 'male').length).toBeGreaterThanOrEqual(3)
    expect(VOICE_PRESETS.filter(v => v.gender === 'female').length).toBeGreaterThanOrEqual(3)
    expect(new Set(VOICE_PRESETS.map(v => v.id)).size).toBe(VOICE_PRESETS.length)
    expect(presetOf(defaultVoiceFor('male')).gender).toBe('male')
    expect(presetOf(defaultVoiceFor('female')).gender).toBe('female')
    expect(defaultVoiceFor('male')).not.toBe(defaultVoiceFor('female'))
  })
  it('voiceName / selectValue / presetOf', () => {
    expect(voiceName('')).toBe('Голос проекта')
    expect(voiceName(DEFAULT_VOICE_ID)).toBe('Голос проекта')
    expect(voiceName('pNInz6obpgDQGcFmaJgB')).toBe('Adam')
    expect(voiceName('abcdefghijklmnop')).toBe('свой: abcdefgh…')
    expect(selectValue(undefined)).toBe(DEFAULT_VOICE_ID)
    expect(selectValue('zzz')).toBe(CUSTOM_VOICE)
  })
  it('charCost — символы текста без краёв; sumChars; тестовая фраза короткая', () => {
    expect(charCost('  Привет, мир! ')).toBe(12)
    expect(sumChars(['ab', ' c '])).toBe(3)
    expect(charCost(PREVIEW_PHRASE)).toBeLessThan(60)
  })
  it('lineVoiceStatus: runtime busy/error поверх схемного статуса', () => {
    const c = { voice: {} }
    expect(lineVoiceStatus({ text: 'x' }, c, undefined)).toBe('none')
    expect(lineVoiceStatus({ text: 'x' }, c, { busy: true })).toBe('busy')
    expect(lineVoiceStatus({ text: 'x', audioUrl: 'u' }, c, { error: 'boom' })).toBe('error')
    expect(lineVoiceStatus({ text: 'x', audioUrl: 'u', audioMeta: { hash: 'old' } }, c)).toBe('stale')
    expect(Object.keys(STATE_LABEL).sort()).toEqual(['busy', 'empty', 'error', 'none', 'ready', 'stale'])
  })
})

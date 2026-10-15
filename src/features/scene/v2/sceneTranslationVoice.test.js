import { describe, it, expect } from 'vitest'
import {
  voiceSpec, audioHash, translationVoiceSpec, translationAudioHash, translationAudioState, sceneVoiceStats, audioPartOf,
  DEFAULT_VOICE_ID, TRANSLATION_AUDIO_FIELDS, AUDIO_SETS,
} from './sceneVoice.js'
import { validateSceneV2, normalizeSceneV2 } from './sceneSchemaV2.js'
import { lintScene } from './sceneLint.js'
import { sceneLegendText, sceneLegend } from './sceneLegend.js'
import { sceneByteSize, SCENE_MAX_BYTES } from './sceneNode.js'
import { demoOfficeScene } from './demoScenes.js'

const clone = s => JSON.parse(JSON.stringify(s))
const URL_OK = 'https://pub-045dc128a8954174a6d82f218e0836b9.r2.dev/scene/tr.mp3'
const cat = (voice = {}) => ({ gender: 'male', name: 'Кот', voice })
// Реплика с переводом и актуальной озвучкой перевода
const trVoiced = (text, translation, character, scene) => ({
  who: 'a', text, emotion: 'neutral', pose: 'talk', translation,
  translationAudioUrl: URL_OK,
  translationWordTimings: [{ word: translation.split(' ')[0], start: 0, end: 0.4 }],
  translationAudioMeta: { hash: translationAudioHash(translation, translationVoiceSpec(character, scene)), voiceId: 'tv', durationMs: 400 },
})

describe('translationVoiceSpec / translationAudioHash', () => {
  it('голос перевода: translationVoiceId персонажа → options.translationVoiceId сцены → default; настройки как у персонажа', () => {
    const scene = { options: { translationVoiceId: 'scene-tr' } }
    expect(translationVoiceSpec(cat({ voiceId: 'v1', translationVoiceId: 'char-tr', speed: 1.1 }), scene)).toMatchObject({ voiceId: 'char-tr', speed: 1.1 })
    expect(translationVoiceSpec(cat({ voiceId: 'v1' }), scene).voiceId).toBe('scene-tr')
    expect(translationVoiceSpec(cat({ voiceId: 'v1' }), {}).voiceId).toBe(DEFAULT_VOICE_ID)
    expect(translationVoiceSpec(null, null).voiceId).toBe(DEFAULT_VOICE_ID)
    // voiceId оригинала на голос перевода не влияет
    expect(translationVoiceSpec(cat({ voiceId: 'v1' }), {})).toEqual(translationVoiceSpec(cat({ voiceId: 'v2' }), {}))
  })
  it('hash перевода — как audioHash по тексту перевода и голосу перевода', () => {
    const spec = translationVoiceSpec(cat({ translationVoiceId: 't1' }), {})
    expect(translationAudioHash(' Привет. ', spec)).toBe(audioHash('Привет.', spec))
    expect(translationAudioHash('Привет.', spec)).not.toBe(translationAudioHash('Привет.', translationVoiceSpec(cat({ translationVoiceId: 't2' }), {})))
    expect(translationAudioHash('Привет.', spec)).not.toBe(audioHash('Привет.', voiceSpec(cat({ voiceId: 't2' }))))
  })
})

describe('translationAudioState / sceneVoiceStats', () => {
  const scene = { options: { translationVoiceId: 'tr' } }
  const c = cat({ voiceId: 'v1' })
  it('none / ready / stale по переводу / по голосу / перевод убрали / файл без meta — актуален', () => {
    expect(translationAudioState({ text: 'x', translation: 'икс' }, c, scene)).toBe('none')
    const l = trVoiced('Hi.', 'Привет.', c, scene)
    expect(translationAudioState(l, c, scene)).toBe('ready')
    expect(translationAudioState({ ...l, translation: 'Пока.' }, c, scene)).toBe('stale')
    expect(translationAudioState(l, c, { options: { translationVoiceId: 'other' } })).toBe('stale')
    expect(translationAudioState(l, cat({ voiceId: 'v1', translationVoiceId: 'own' }), scene)).toBe('stale')
    expect(translationAudioState({ ...l, translation: undefined }, c, scene)).toBe('stale')
    expect(translationAudioState({ ...l, translationAudioMeta: undefined }, c, scene)).toBe('ready')
    // текст оригинала и его озвучка на статус перевода не влияют
    expect(translationAudioState({ ...l, text: 'Changed.', audioUrl: URL_OK }, c, scene)).toBe('ready')
  })
  it('статистика: оригинал и перевод считаются отдельно', () => {
    const s = clone(demoOfficeScene)
    s.options.translationVoiceId = 'tr'
    s.timeline[0] = trVoiced('One.', 'Раз.', s.characters.a, s)
    s.timeline[1] = { ...trVoiced('Two.', 'Два.', s.characters.a, s), translation: 'Изменили.' }
    s.timeline[2].translation = 'Три.'
    const st = sceneVoiceStats(s)
    expect(st).toMatchObject({ total: 6, ready: 0, stale: 0, none: 6 })
    expect(st.translation).toEqual({ total: 6, ready: 1, stale: 1, none: 4, withText: 3 })
  })
  it('audioPartOf: перевод как реплика с одним комплектом (для audioLine); оригинал — сама реплика', () => {
    const l = { who: 'b', text: 'Hi.', audioUrl: 'https://r2.dev/a.mp3', translation: 'Привет.', translationAudioUrl: URL_OK, translationWordTimings: [{ start: 0, end: 1 }], translationAudioMeta: { hash: 'h' } }
    expect(audioPartOf(l, 'original')).toBe(l)
    expect(audioPartOf(l, 'translation')).toEqual({ who: 'b', text: 'Привет.', audioUrl: URL_OK, wordTimings: [{ start: 0, end: 1 }], audioMeta: { hash: 'h' } })
    expect(TRANSLATION_AUDIO_FIELDS).toEqual([AUDIO_SETS.translation.url, AUDIO_SETS.translation.timings, AUDIO_SETS.translation.meta])
  })
})

describe('валидатор и нормализация полей озвучки перевода', () => {
  const withLine = patch => { const s = clone(demoOfficeScene); s.timeline[0] = { ...s.timeline[0], ...patch }; return validateSceneV2(s) }
  it('те же домены и лимиты, что у оригинала, с путями translation*', () => {
    const hash = audioHash('x', voiceSpec(null))
    expect(withLine({ translation: 'Да.', translationAudioUrl: URL_OK, translationWordTimings: [{ word: 'Да', start: 0, end: 0.3 }], translationAudioMeta: { hash, voiceId: 'v', durationMs: 300 } })).toEqual([])
    expect(withLine({ translationAudioUrl: 'https://cdn.example.com/a.mp3' })).toEqual(['timeline[0].translationAudioUrl — https-адрес файла на домене R2 проекта (…r2.dev)'])
    expect(withLine({ translationAudioUrl: URL_OK, translationWordTimings: Array.from({ length: 81 }, (_, i) => ({ start: i, end: i + 1 })) })[0]).toMatch(/translationWordTimings — не больше 80/)
    expect(withLine({ translationAudioUrl: URL_OK, translationWordTimings: [{ start: 1, end: 0.5 }] })[0]).toMatch(/translationWordTimings\[0\]/)
    expect(withLine({ translationAudioUrl: URL_OK, translationAudioMeta: { hash: 'abc' } })[0]).toMatch(/translationAudioMeta\.hash/)
    expect(withLine({ translationAudioMeta: { hash } })[0]).toMatch(/translationWordTimings\/translationAudioMeta без translationAudioUrl/)
    // поля оригинала и перевода независимы: tайминги оригинала без audioUrl — своя ошибка
    expect(withLine({ translationAudioUrl: URL_OK, wordTimings: [{ start: 0, end: 1 }] })[0]).toMatch(/wordTimings\/audioMeta без audioUrl/)
  })
  it('голос персонажа: translationVoiceId — строка', () => {
    const s = clone(demoOfficeScene)
    s.characters.b.voice.translationVoiceId = 'tr-1'
    expect(validateSceneV2(s)).toEqual([])
    s.characters.b.voice.translationVoiceId = 5
    expect(validateSceneV2(s)).toEqual(['characters.b.voice.translationVoiceId — строка'])
  })
  it('нормализация сохраняет оба комплекта; 12 реплик × 47 слов × два комплекта таймингов — в 64 КБ', () => {
    const s = clone(demoOfficeScene)
    s.options = { ...s.options, display: 'both', voice: { original: true, translation: true } }
    const text = Array.from({ length: 47 }, () => 'да').join(' ').slice(0, 140)
    const timings = text.split(' ').map((w, k) => ({ word: w, start: Math.round(k * 31) / 100, end: Math.round(k * 31 + 30) / 100 }))
    s.timeline = Array.from({ length: 12 }, (_, i) => ({
      ...trVoiced(text, text, s.characters[i % 2 ? 'b' : 'a'], s), who: i % 2 ? 'b' : 'a',
      audioUrl: URL_OK, wordTimings: timings, audioMeta: { hash: audioHash(text, voiceSpec(s.characters.a)), voiceId: 'v1', durationMs: 14600 },
      translationWordTimings: timings,
    }))
    expect(validateSceneV2(s)).toEqual([])
    const n = normalizeSceneV2(s)
    expect(n.timeline[0].translationAudioMeta).toEqual(s.timeline[0].translationAudioMeta)
    expect(n.timeline[0].translationWordTimings).toHaveLength(47)
    expect(n.timeline[0].wordTimings).toHaveLength(47)
    expect(n.options).toMatchObject({ display: 'both', voice: { original: true, translation: true } })
    expect(sceneByteSize(n)).toBeLessThan(SCENE_MAX_BYTES)
  })
})

describe('линтер и легенда: озвучка перевода и режим показа', () => {
  it('устарела — предупреждение с путём; включена, но файлов нет у части реплик; both без translation; без translation вовсе', () => {
    const s = clone(demoOfficeScene)
    s.options.voice = { original: true, translation: true }
    s.options.display = 'both'
    let t = lintScene(s).map(x => x.text)
    expect(t).toContain('options.voice.translation — включена озвучка перевода, но ни у одной реплики нет translation: озвучивать нечего')
    expect(t).toContain('options.display — режим «текст + перевод» (both), но у реплик нет translation: покажется только оригинал')
    s.timeline.forEach((l, i) => { l.translation = `Перевод ${i}.` })
    s.timeline[0] = { ...trVoiced(s.timeline[0].text, 'Было так.', s.characters.a, s), who: 'a', emotion: 'surprised', translation: 'Стало иначе.' }
    s.timeline[1] = { ...trVoiced(s.timeline[1].text, 'Перевод 1.', s.characters.b, s), who: 'b', emotion: 'tired' }
    t = lintScene(s).map(x => x.text)
    expect(t).toContain('timeline[0].translationAudioUrl — озвучка перевода устарела: перевод или голос изменили после генерации (или перевод убрали), переозвучьте')
    expect(t).toContain('options.voice.translation — включена озвучка перевода, но файлы перевода есть у 2 из 6 реплик: остальные прозвучат синтезом устройства или промолчат')
    expect(t.some(x => x.startsWith('options.display'))).toBe(false)
    expect(lintScene(s).every(x => x.level === 'warn')).toBe(true)
    // озвучка перевода выключена — про файлы перевода тишина (только «устарело» у реплики 0)
    s.options.voice.translation = false
    t = lintScene(s).map(x => x.text)
    expect(t.filter(x => x.includes('перевод'))).toEqual([expect.stringMatching(/^timeline\[0\]\.translationAudioUrl/)])
    // старые сцены без новых полей — как раньше: ничего нового
    expect(lintScene(demoOfficeScene)).toEqual([])
  })
  it('легенда: поля перевода «НЕ ЗАПОЛНЯТЬ», display/voice описаны, правило про перевод есть', () => {
    const text = sceneLegendText()
    expect(text).toMatch(/translationAudioUrl \/ translationWordTimings \/ translationAudioMeta: НЕ ЗАПОЛНЯТЬ/)
    expect(text).toContain('display — режим показа текста: none')
    expect(text).toContain('voice: { original')
    expect(text).toContain('translationVoiceId — НЕ ЗАПОЛНЯТЬ')
    expect(sceneLegend().rules.some(r => r.includes('display "both"'))).toBe(true)
  })
})

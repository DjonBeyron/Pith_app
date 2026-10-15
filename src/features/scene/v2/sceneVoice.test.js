import { describe, it, expect } from 'vitest'
import {
  voiceSpec, audioHash, lineAudioState, sceneVoiceStats, isSceneAudioUrl, timingsFromTts, durationMsFromTimings, DEFAULT_VOICE_ID, TTS_MODEL,
} from './sceneVoice.js'
import { validateSceneV2, normalizeSceneV2 } from './sceneSchemaV2.js'
import { lintScene } from './sceneLint.js'
import { sceneLegendText } from './sceneLegend.js'
import { sceneByteSize, SCENE_MAX_BYTES } from './sceneNode.js'
import { demoOfficeScene } from './demoScenes.js'

const clone = s => JSON.parse(JSON.stringify(s))
const URL_OK = 'https://pub-045dc128a8954174a6d82f218e0836b9.r2.dev/chat/abc.mp3'
const cat = (voice = {}) => ({ gender: 'male', name: 'Кот', voice })
// Готовая реплика с актуальным hash
const voiced = (text, character, extra = {}) => ({
  who: 'a', text, emotion: 'neutral', pose: 'talk', audioUrl: URL_OK,
  wordTimings: [{ word: text.split(' ')[0], start: 0, end: 0.4 }],
  audioMeta: { hash: audioHash(text, voiceSpec(character)), voiceId: 'v1', durationMs: 400 }, ...extra,
})

describe('voiceSpec / audioHash', () => {
  it('voiceSpec: пустой voiceId → default, настройки по умолчанию и обрезка по диапазону', () => {
    expect(voiceSpec(cat())).toEqual({ voiceId: DEFAULT_VOICE_ID, stability: 0.5, similarity: 0.75, speed: 1, model: TTS_MODEL })
    expect(voiceSpec(cat({ voiceId: ' abc ', speed: 5, stability: -1 }))).toMatchObject({ voiceId: 'abc', speed: 1.2, stability: 0 })
    expect(voiceSpec(null).voiceId).toBe(DEFAULT_VOICE_ID)
  })
  it('hash стабилен и не зависит от пробелов по краям; меняется от текста, голоса и настроек', () => {
    const spec = voiceSpec(cat({ voiceId: 'v1' }))
    const h = audioHash('Привет.', spec)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(audioHash('  Привет. ', spec)).toBe(h)
    expect(audioHash('Привет!', spec)).not.toBe(h)
    expect(audioHash('Привет.', voiceSpec(cat({ voiceId: 'v2' })))).not.toBe(h)
    expect(audioHash('Привет.', voiceSpec(cat({ voiceId: 'v1', speed: 1.1 })))).not.toBe(h)
    expect(audioHash('Привет.', { ...spec, model: 'other' })).not.toBe(h)
    // pitch/rate (запасной синтез устройства) на hash не влияют
    expect(audioHash('Привет.', voiceSpec(cat({ voiceId: 'v1', pitch: 0.5, rate: 2 })))).toBe(h)
  })
})

describe('lineAudioState / sceneVoiceStats', () => {
  it('нет файла / актуально / устарело по тексту / устарело по голосу / старый файл без meta — актуален', () => {
    const c = cat({ voiceId: 'v1' })
    expect(lineAudioState({ text: 'x' }, c)).toBe('none')
    const l = voiced('Привет.', c)
    expect(lineAudioState(l, c)).toBe('ready')
    expect(lineAudioState({ ...l, text: 'Пока.' }, c)).toBe('stale')
    expect(lineAudioState(l, cat({ voiceId: 'v2' }))).toBe('stale')
    expect(lineAudioState({ audioUrl: URL_OK, text: 'x' }, c)).toBe('ready')
  })
  it('статистика по сцене', () => {
    const s = clone(demoOfficeScene)
    s.timeline[0] = voiced('Первая.', s.characters.a)
    s.timeline[1] = { ...voiced('Вторая.', s.characters.a), text: 'Изменили.' }
    expect(sceneVoiceStats(s)).toMatchObject({ total: 6, ready: 1, stale: 1, none: 4 }) // комплект перевода — ключ translation (см. sceneTranslationVoice.test.js)
  })
})

describe('isSceneAudioUrl', () => {
  it('только https на r2.dev', () => {
    expect(isSceneAudioUrl(URL_OK)).toBe(true)
    expect(isSceneAudioUrl('https://r2.dev/a.mp3')).toBe(true)
    expect(isSceneAudioUrl('http://pub-1.r2.dev/a.mp3')).toBe(false)
    expect(isSceneAudioUrl('https://evil.com/a.mp3')).toBe(false)
    expect(isSceneAudioUrl('https://r2.dev.evil.com/a.mp3')).toBe(false)
    expect(isSceneAudioUrl('https://media.pithyapp.com/chat/a.mp3')).toBe(true)
    expect(isSceneAudioUrl('https://mediaevil.com/a.mp3')).toBe(false)
    expect(isSceneAudioUrl('blob:https://x')).toBe(false)
    expect(isSceneAudioUrl('/local.mp3')).toBe(false)
    expect(isSceneAudioUrl(null)).toBe(false)
  })
})

describe('timingsFromTts', () => {
  it('{w,t,e} → {word,start,end} с округлением до сотых; без e — до следующего слова, последнее — до конца файла', () => {
    expect(timingsFromTts([{ w: 'Привет', t: 0.123, e: 0.456 }, { w: 'мир', t: 0.5, e: 0.9 }])).toEqual([
      { word: 'Привет', start: 0.12, end: 0.46 }, { word: 'мир', start: 0.5, end: 0.9 },
    ])
    expect(timingsFromTts([{ w: 'a', t: 0 }, { w: 'b', t: 1 }], 1.8)).toEqual([{ word: 'a', start: 0, end: 1 }, { word: 'b', start: 1, end: 1.8 }])
    expect(timingsFromTts([{ w: 'a', t: 0 }])).toEqual([{ word: 'a', start: 0, end: 0.4 }])
    expect(timingsFromTts(null)).toEqual([])
    // end никогда не меньше start
    expect(timingsFromTts([{ w: 'a', t: 1, e: 0.5 }])[0].end).toBe(1)
  })
  it('durationMsFromTimings: из длительности файла, иначе из последнего слова', () => {
    expect(durationMsFromTimings([{ start: 0, end: 1.23 }], 2.5)).toBe(2500)
    expect(durationMsFromTimings([{ start: 0, end: 1.234 }])).toBe(1234)
    expect(durationMsFromTimings([])).toBeNull()
  })
})

describe('валидатор полей озвучки', () => {
  const withLine = patch => { const s = clone(demoOfficeScene); s.timeline[0] = { ...s.timeline[0], ...patch }; return validateSceneV2(s) }
  it('audioUrl — только https на домене R2', () => {
    expect(withLine({ audioUrl: URL_OK })).toEqual([])
    expect(withLine({ audioUrl: 'https://cdn.example.com/a.mp3' })).toEqual(['timeline[0].audioUrl — https-адрес файла на домене R2 проекта (…r2.dev)'])
    expect(withLine({ audioUrl: '/a.mp3' })).toHaveLength(1)
  })
  it('wordTimings — порядок, пары start/end, word строкой, не больше 80 слов; без audioUrl — ошибка', () => {
    expect(withLine({ audioUrl: URL_OK, wordTimings: [{ word: 'a', start: 0, end: 0.3 }, { start: 0.3, end: 0.6 }] })).toEqual([])
    expect(withLine({ audioUrl: URL_OK, wordTimings: [{ start: 0.5, end: 0.6 }, { start: 0.2, end: 0.9 }] })[0]).toMatch(/^timeline\[0\]\.wordTimings\[1\]/)
    expect(withLine({ audioUrl: URL_OK, wordTimings: [{ word: 7, start: 0, end: 1 }] })[0]).toMatch(/wordTimings\[0\]\.word/)
    expect(withLine({ audioUrl: URL_OK, wordTimings: Array.from({ length: 81 }, (_, i) => ({ start: i, end: i + 1 })) })[0]).toMatch(/не больше 80 слов/)
    expect(withLine({ wordTimings: [{ start: 0, end: 1 }] })[0]).toMatch(/без audioUrl/)
  })
  it('audioMeta — hash sha-256, voiceId, durationMs целое, лишних полей нет', () => {
    const hash = audioHash('x', voiceSpec(null))
    expect(withLine({ audioUrl: URL_OK, audioMeta: { hash, voiceId: 'v', durationMs: 1200 } })).toEqual([])
    expect(withLine({ audioUrl: URL_OK, audioMeta: { hash: 'abc' } })[0]).toMatch(/audioMeta\.hash/)
    expect(withLine({ audioUrl: URL_OK, audioMeta: { hash, durationMs: 1.5 } })[0]).toMatch(/durationMs/)
    expect(withLine({ audioUrl: URL_OK, audioMeta: { hash, extra: 1 } })[0]).toMatch(/лишнее поле/)
    expect(withLine({ audioUrl: URL_OK, audioMeta: 'x' })[0]).toMatch(/audioMeta — объект/)
  })
  it('настройки голоса ElevenLabs у персонажа проверяются по диапазону', () => {
    const s = clone(demoOfficeScene)
    s.characters.a.voice = { pitch: 1, rate: 1, stability: 0.3, similarity: 1, speed: 0.7 }
    expect(validateSceneV2(s)).toEqual([])
    s.characters.a.voice.speed = 2
    expect(validateSceneV2(s)).toEqual(['characters.a.voice.speed — число 0.7…1.2'])
  })
  it('нормализация сохраняет audioMeta и голос, 12 реплик по 140 символов с таймингами укладываются в 64 КБ', () => {
    const s = clone(demoOfficeScene)
    const text = Array.from({ length: 47 }, () => 'да').join(' ').slice(0, 140) // 140 символов, 47 коротких слов — худший случай по числу таймингов
    s.timeline = Array.from({ length: 12 }, (_, i) => {
      const l = voiced(text, s.characters.a)
      l.who = i % 2 ? 'b' : 'a'
      l.wordTimings = text.split(' ').map((w, k) => ({ word: w, start: k * 0.31, end: k * 0.31 + 0.3 }))
      l.translation = text
      return l
    })
    expect(validateSceneV2(s)).toEqual([])
    const n = normalizeSceneV2(s)
    expect(n.timeline[0].audioMeta).toEqual(s.timeline[0].audioMeta)
    expect(n.timeline[0].wordTimings).toHaveLength(47)
    expect(sceneByteSize(n)).toBeLessThan(SCENE_MAX_BYTES)
  })
})

describe('линтер и легенда: озвучка', () => {
  it('устаревшая озвучка — предупреждение с путём audioUrl; частично озвучена — «озвучено X из N»; всё озвучено — тихо', () => {
    const s = clone(demoOfficeScene)
    s.timeline[0] = { ...voiced('Было так.', s.characters.a), text: 'Стало иначе.' }
    const t = lintScene(s).map(x => x.text)
    expect(t).toContain('timeline[0].audioUrl — озвучка устарела: текст или голос изменили после генерации, переозвучьте')
    expect(t.some(x => x.includes('озвучено 1 из 6 реплик'))).toBe(true)
    expect(lintScene(s).every(x => x.level === 'warn')).toBe(true)
    s.timeline = s.timeline.map(l => voiced(l.text, s.characters.a, { who: l.who, emotion: l.emotion }))
    expect(lintScene(s).filter(x => /озвуч/.test(x.text))).toEqual([])
    // Битый адрес — ошибка (из валидатора)
    s.timeline[1].audioUrl = 'https://cdn.example.com/a.mp3'
    expect(lintScene(s).some(x => x.level === 'error' && x.text.startsWith('timeline[1].audioUrl'))).toBe(true)
  })
  it('легенда: поля озвучки помечены «НЕ ЗАПОЛНЯТЬ», правило для нейросети есть', () => {
    const text = sceneLegendText()
    expect(text).toMatch(/timeline\[\]\.audioMeta: НЕ ЗАПОЛНЯТЬ/)
    expect(text).toMatch(/timeline\[\]\.audioUrl: НЕ ЗАПОЛНЯТЬ/)
    expect(text).toContain('их ставит сборщик после генерации ElevenLabs')
  })
})

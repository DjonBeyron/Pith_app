import { describe, it, expect } from 'vitest'
import { splitTemplate, hasLetters, hasVarParts, templateSegments, setSegmentAudio, segmentUrls } from './sceneVarsSegments.js'
import { segmentParts, segmentsStatus } from './sceneSegmentsVoice.js'
import { fillSceneVars } from './sceneVars.js'
import { uniformTimings, wordSegment, pendingWordTexts, attachWordAudio } from './sceneWordSegments.js'
import { audioHash, voiceSpec, sceneVoiceStats } from './sceneVoice.js'
import { sceneAudioUrls, sceneNodeAudioUrls } from './sceneNode.js'
import { lintScene } from './sceneLint.js'
import { validateSceneV2 } from './sceneValidate.js'
import { normalizeSceneV2 } from './sceneSchemaV2.js'
import { demoTemplateScene } from './demoScenes.js'

// Озвучка шаблонных реплик по частям (шаг 4б): разбиение, статус, подстановка слова из word_audio, прогрев, линтер
const clone = o => JSON.parse(JSON.stringify(o))
const char = demoTemplateScene.characters.a
const spec = voiceSpec(char)
const aud = (text, n, extra = {}) => ({ text, audioUrl: `https://r2/${n}.mp3`, wordTimings: [{ word: text, start: 0.1, end: 0.6 }], audioMeta: { hash: audioHash(text, spec), durationMs: 800 }, ...extra })
const tpl = (text, segments, extra = {}) => ({ who: 'a', text, emotion: 'happy', ...(segments ? { segments } : {}), ...extra })
const sceneWith = (timeline, extra = {}) => ({ ...clone(demoTemplateScene), timeline, ...extra })
const lib = { cheese: { url: 'https://r2/w-cheese.mp3', duration: 0.6 }, 'ice cream': { url: 'https://r2/w-ic.mp3', duration: 1.2, voice_id: 'v1' } }

describe('splitTemplate — границы частей', () => {
  it('слово в середине: части без пробелов по краям', () => {
    expect(splitTemplate('Can I have {food}, please?')).toEqual([{ text: 'Can I have' }, { var: 'food' }, { text: ', please?' }])
  })
  it('плейсхолдер в начале и в конце: пустых частей нет', () => {
    expect(splitTemplate('{food} looks great.')).toEqual([{ var: 'food' }, { text: 'looks great.' }])
    expect(splitTemplate('I want {food}')).toEqual([{ text: 'I want' }, { var: 'food' }])
  })
  it('два плейсхолдера подряд и одни плейсхолдеры', () => {
    expect(splitTemplate('{a} {b}')).toEqual([{ var: 'a' }, { var: 'b' }])
    expect(splitTemplate('{a}{b}!')).toEqual([{ var: 'a' }, { var: 'b' }, { text: '!' }])
    expect(splitTemplate('{a}')).toEqual([{ var: 'a' }])
  })
  it('{{ }} — литеральные скобки внутри части, а не плейсхолдер', () => {
    expect(splitTemplate('Use {{x}} with {food}.')).toEqual([{ text: 'Use {x} with' }, { var: 'food' }, { text: '.' }])
    expect(hasVarParts('Use {{x}} only')).toBe(false)
  })
  it('части без букв/цифр не озвучиваются (hasLetters)', () => {
    expect(hasLetters('?')).toBe(false)
    expect(hasLetters(', please?')).toBe(true)
    expect(hasLetters('3')).toBe(true)
  })
})

describe('каркас segments и статус озвучки частей', () => {
  const text = 'Can I have {food}, please?'
  const full = [aud('Can I have', 1), { var: 'food' }, aud(', please?', 2)]
  it('templateSegments: озвучка остаётся у частей с тем же текстом, у изменённых пропадает', () => {
    expect(templateSegments(tpl(text, full)).map(s => s.audioUrl)).toEqual(['https://r2/1.mp3', undefined, 'https://r2/2.mp3'])
    expect(templateSegments(tpl('May I have {food}, please?', full)).map(s => s.audioUrl)).toEqual([undefined, undefined, 'https://r2/2.mp3'])
  })
  it('setSegmentAudio кладёт patch в нужную часть, не трогая остальные', () => {
    const segs = setSegmentAudio(tpl(text, [full[0]]), 2, { audioUrl: 'https://r2/9.mp3', audioMeta: { hash: 'h' } })
    expect(segs).toHaveLength(3)
    expect(segs[0].audioUrl).toBe('https://r2/1.mp3')
    expect(segs[2]).toMatchObject({ text: ', please?', audioUrl: 'https://r2/9.mp3' })
  })
  it('статус: none / partial / ready / stale (hash) / leftover / empty', () => {
    expect(segmentsStatus(tpl(text), char)).toMatchObject({ state: 'none', total: 2, ready: 0 })
    expect(segmentsStatus(tpl(text, [full[0]]), char)).toMatchObject({ state: 'partial', ready: 1, total: 2 })
    expect(segmentsStatus(tpl(text, full), char)).toMatchObject({ state: 'ready', ready: 2, total: 2 })
    const stale = [{ ...full[0], audioMeta: { hash: 'old' } }, full[1], full[2]]
    expect(segmentsStatus(tpl(text, stale), char)).toMatchObject({ state: 'stale', stale: 1, ready: 1 })
    // другой голос персонажа → hash не сходится → устарело
    expect(segmentsStatus(tpl(text, full), { voice: { voiceId: 'other' } }).state).toBe('stale')
    // текст правили: файл прежней части остался без пары
    expect(segmentsStatus(tpl('May I have {food}, please?', full), char)).toMatchObject({ state: 'stale', leftover: 1 })
    expect(segmentsStatus(tpl('{food}'), char).state).toBe('empty')
    expect(segmentsStatus(tpl('{food}?'), char).state).toBe('empty') // «?» без букв — озвучивать нечего
  })
  it('segmentParts: индекс k совпадает с индексом сегмента каркаса, hash по обрезанному тексту и голосу', () => {
    const { parts } = segmentParts(tpl(text, full), char)
    expect(parts.map(p => p.k)).toEqual([0, 2])
    expect(parts[1].hash).toBe(audioHash(', please?', spec))
  })
  it('segmentUrls — только ссылки сегментов', () => {
    expect(segmentUrls(tpl(text, full))).toEqual(['https://r2/1.mp3', 'https://r2/2.mp3'])
    expect(segmentUrls({ text: 'x', audioUrl: 'https://r2/z.mp3' })).toEqual([])
  })
})

describe('слово из библиотеки word_audio', () => {
  it('uniformTimings: без пауз, покрывает 0…duration, доли по длине слов', () => {
    const t = uniformTimings('ice cream', 1.2)
    expect(t).toHaveLength(2)
    expect(t[0].start).toBe(0)
    expect(t[1].end).toBeCloseTo(1.2, 1)
    expect(t[1].start).toBeCloseTo(t[0].end, 1)
    expect(uniformTimings('cheese', null)).toBeNull()
  })
  it('wordSegment: url и тайминги из записи; нет записи/кириллица — без аудио; ключ по wordKey («Cheese,»)', () => {
    expect(wordSegment('Cheese,', lib)).toMatchObject({ text: 'Cheese,', word: true, audioUrl: 'https://r2/w-cheese.mp3' })
    expect(wordSegment('cheese', lib).wordTimings).toEqual([{ word: 'cheese', start: 0, end: 0.6 }])
    expect(wordSegment('bread', lib).audioUrl).toBeUndefined()
    expect(wordSegment('сыр', lib).audioUrl).toBeUndefined()
    expect(wordSegment('cheese', null).audioUrl).toBeUndefined()
    expect(wordSegment('cheese', new Map([['cheese', { url: 'https://r2/m.mp3' }]])).audioUrl).toBe('https://r2/m.mp3')
    expect(wordSegment('cheese', k => (k === 'cheese' ? 'https://r2/f.mp3' : null)).audioUrl).toBe('https://r2/f.mp3')
  })
})

describe('fillSceneVars с wordAudio', () => {
  const base = () => sceneWith([tpl('Can I have {food}, please?', [aud('Can I have', 1), { var: 'food' }, aud(', please?', 2)], { audioUrl: 'https://r2/whole.mp3', translation: 'Можно {food:ru}?', translationAudioUrl: 'https://r2/tr.mp3' }), tpl('Ok.')])
  it('{var} → сегмент-слово с аудио из карты; части сохраняют озвучку; текст собран; озвучки целой реплики нет', () => {
    const out = fillSceneVars(base(), { food: { text: 'cheese', translation: 'сыр' } }, { wordAudio: lib })
    const l = out.timeline[0]
    expect(l.text).toBe('Can I have cheese, please?')
    expect(l.segments.map(s => s.text)).toEqual(['Can I have', 'cheese', ', please?'])
    expect(l.segments[0].audioUrl).toBe('https://r2/1.mp3')
    expect(l.segments[1]).toMatchObject({ word: true, audioUrl: 'https://r2/w-cheese.mp3' })
    expect(l.segments[2].audioUrl).toBe('https://r2/2.mp3')
    expect(l.audioUrl).toBeUndefined()
    expect(l.translation).toBe('Можно сыр?')
    expect(l.translationAudioUrl).toBeUndefined() // перевод шаблонной реплики не озвучивается
    expect(out.vars).toBeUndefined()
  })
  it('режим «просто показать» (wordAudio: null) и слово не из библиотеки — сегмент-слово без audioUrl', () => {
    expect(fillSceneVars(base(), {}, { wordAudio: null }).timeline[0].segments[1]).toEqual({ text: 'a sandwich', word: true })
    expect(fillSceneVars(base(), { food: { text: 'bread' } }, { wordAudio: lib }).timeline[0].segments[1].audioUrl).toBeUndefined()
  })
  it('старый вызов fillSceneVars(scene) / (scene, values) работает; сцена без vars — та же ссылка; реплика без segments их не получает', () => {
    const s = base()
    s.timeline.push(tpl('Plain {food}.'))
    const out = fillSceneVars(s)
    expect(out.timeline[0].text).toBe('Can I have a sandwich, please?')
    expect(out.timeline[1].segments).toBeUndefined()
    const plain = { ...s, vars: undefined }
    expect(fillSceneVars(plain)).toBe(plain)
  })
  it('пересобранные сегменты валидны, нормализация сохраняет word и аудио', () => {
    const out = fillSceneVars(base(), { food: { text: 'ice cream' } }, { wordAudio: lib })
    expect(validateSceneV2(out)).toEqual([])
    const n = normalizeSceneV2(out).timeline[0].segments
    expect(n[1]).toMatchObject({ word: true, audioUrl: 'https://r2/w-ic.mp3' })
    expect(n[1].wordTimings).toHaveLength(2)
  })
  it('attachWordAudio / pendingWordTexts: дотягивает аудио слов после прогрева библиотеки, без изменений — та же ссылка', () => {
    const out = fillSceneVars(base(), { food: { text: 'cheese' } }, { wordAudio: null })
    expect(pendingWordTexts(out)).toEqual(['cheese'])
    const next = attachWordAudio(out, lib)
    expect(next).not.toBe(out)
    expect(next.timeline[0].segments[1].audioUrl).toBe('https://r2/w-cheese.mp3')
    expect(pendingWordTexts(next)).toEqual([])
    expect(attachWordAudio(next, lib)).toBe(next)
    expect(attachWordAudio(out, {})).toBe(out)
  })
})

describe('прогрев: ссылки озвучки сцены', () => {
  const raw = () => sceneWith([tpl('Can I have {food}, please?', [aud('Can I have', 1), { var: 'food' }, aud(', please?', 2)], { audioUrl: 'https://r2/whole.mp3' }), tpl('Hello {food}.', null, { audioUrl: 'https://r2/stale.mp3' }), { who: 'a', text: 'Plain.', emotion: 'happy', audioUrl: 'https://r2/plain.mp3' }])
  it('шаблонная реплика: только файлы сегментов (audioUrl целой реплики не берётся), шаблон без segments — ничего, обычная — как раньше', () => {
    expect(sceneAudioUrls(raw())).toEqual(['https://r2/1.mp3', 'https://r2/2.mp3', 'https://r2/plain.mp3'])
    expect(sceneNodeAudioUrls({ scene: raw() })).toEqual(['https://r2/1.mp3', 'https://r2/2.mp3', 'https://r2/plain.mp3'])
  })
  it('после подстановки в список попадают и файлы слов из библиотеки', () => {
    const filled = fillSceneVars(raw(), { food: { text: 'cheese' } }, { wordAudio: lib })
    expect(sceneAudioUrls(filled)).toEqual(['https://r2/1.mp3', 'https://r2/w-cheese.mp3', 'https://r2/2.mp3', 'https://r2/plain.mp3']) // audioUrl шаблона без segments сбросился при подстановке
  })
})

describe('линтер и счётчики озвучки шаблонов', () => {
  const warns = s => lintScene(s).filter(x => x.level === 'warn').map(x => x.text).join('|')
  const voiced = [aud('Can I have', 1), { var: 'food' }, aud(', please?', 2)]
  it('реплика-шаблон с озвученными частями — «озвучена» и без audioUrl целой реплики; других замечаний про озвучку нет', () => {
    const s = sceneWith([tpl('Can I have {food}, please?', voiced), tpl('Thank you!', null, { audioUrl: 'https://r2/t.mp3', wordTimings: [{ word: 'Thank', start: 0, end: 1 }], audioMeta: { hash: audioHash('Thank you!', spec) } })])
    expect(sceneVoiceStats(s)).toMatchObject({ total: 2, ready: 2 })
    expect(warns(s)).not.toMatch(/озвучено|audioUrl|segments/)
  })
  it('озвучена только часть частей: шаблон не считается озвученным → «озвучено 1 из 2»', () => {
    const s = sceneWith([tpl('Can I have {food}, please?', [voiced[0]]), tpl('Thank you!', null, { audioUrl: 'https://r2/t.mp3', wordTimings: [{ word: 'Thank', start: 0, end: 1 }], audioMeta: { hash: audioHash('Thank you!', spec) } })])
    expect(warns(s)).toMatch(/озвучено 1 из 2/)
  })
  it('устаревшая часть → предупреждение про segments; реплика из одних плейсхолдеров в счёт не идёт', () => {
    const stale = [{ ...voiced[0], audioMeta: { hash: 'old' } }, voiced[1], voiced[2]]
    expect(warns(sceneWith([tpl('Can I have {food}, please?', stale)]))).toMatch(/timeline\[0\]\.segments — озвучка частей реплики устарела/)
    const only = sceneWith([tpl('{food}'), tpl('Hi there.')])
    expect(sceneVoiceStats(only).total).toBe(1)
  })
  it('перевод шаблонных реплик не требует файла: при включённой озвучке перевода нет замечания про «файлы перевода»', () => {
    const s = sceneWith([tpl('Can I have {food}, please?', voiced, { translation: 'Можно {food:ru}?' })], { options: { voice: { translation: true } } })
    expect(warns(s)).not.toMatch(/файлы перевода/)
  })
})

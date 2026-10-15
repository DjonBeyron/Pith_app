import { describe, it, expect, vi } from 'vitest'
import { planVoiceAll, runVoicePlan, patchFromLine, toSetPatch, setSpec } from './voicePlan.js'
import { generateSetAudio, clearAudioPatch, isOrphanUrl } from './voiceGenerate.js'
import { lineVoiceStatus, lineKey } from './voiceStatus.js'
import { audioHash, voiceSpec, translationVoiceSpec, TTS_MODEL } from '../../../scene/v2/sceneVoice.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

// «Озвучить всё» по наборам: какие реплики, кэш по hash между наборами, остановка, ошибка одной
const clone = s => JSON.parse(JSON.stringify(s))
const URL_OK = 'https://pub-1.r2.dev/chat/a.mp3'
const readyTr = (scene, i, translation) => {
  const l = scene.timeline[i]
  l.translation = translation
  l.translationAudioUrl = URL_OK
  l.translationAudioMeta = { hash: audioHash(translation, translationVoiceSpec(scene.characters[l.who], scene)), voiceId: 'v' }
}

describe('planVoiceAll по наборам', () => {
  it('набор translation: только реплики с переводом; без перевода — не в плане; bySet по каждому набору и сумма', () => {
    const s = clone(demoOfficeScene)
    s.timeline[0].translation = 'Hello'
    s.timeline[1].translation = 'World'
    readyTr(s, 2, 'Done')
    const p = planVoiceAll(s, ['original', 'translation'])
    expect(p.sets).toEqual(['original', 'translation'])
    expect(p.items.filter(x => x.set === 'original').length).toBe(6)
    expect(p.items.filter(x => x.set === 'translation').map(x => x.index)).toEqual([0, 1])
    expect(p.bySet.original).toMatchObject({ total: 6, withText: 6, ready: 0, items: 6, generate: 6 })
    expect(p.bySet.translation).toMatchObject({ total: 6, withText: 3, ready: 1, items: 2, generate: 2, chars: 10 })
    expect(p.generate).toBe(8)
    expect(p.chars).toBe(p.bySet.original.chars + 10)
    // Только перевод — total/ready верхнего уровня по первому набору
    const t = planVoiceAll(s, ['translation'])
    expect(t.items.length).toBe(2)
    expect(t.ready).toBe(1)
    // Без переводов вовсе — пустой план по набору translation
    expect(planVoiceAll(demoOfficeScene, ['translation']).items).toEqual([])
  })
  it('кэш по hash между наборами: та же фраза тем же голосом в другом наборе — reuseFrom/reuseSet без вызова', () => {
    const s = clone(demoOfficeScene)
    // Голос перевода у a = голос персонажа a (оба 'default') → hash перевода «Привет.» совпадает с hash оригинала «Привет.»
    s.timeline[0].text = 'Привет.'
    s.timeline[0].audioUrl = URL_OK
    s.timeline[0].audioMeta = { hash: audioHash('Привет.', voiceSpec(s.characters.a)), voiceId: 'v' }
    s.timeline[2].translation = 'Привет.' // a, перевод — тот же голос по умолчанию → из набора original реплики 0
    s.timeline[3].translation = 'Пока.'   // b
    s.timeline[5].translation = 'Пока.'   // b — из первой в плане (3, translation)
    const p = planVoiceAll(s, ['translation'])
    const by = Object.fromEntries(p.items.map(x => [x.index, [x.reuseFrom, x.reuseSet]]))
    expect(by[2]).toEqual([0, 'original'])
    expect(by[3]).toEqual([null, null])
    expect(by[5]).toEqual([3, 'translation'])
    expect(p.generate).toBe(1)
    // Свой голос перевода у сцены → hash другой, кэш из оригинала не срабатывает
    s.options.translationVoiceId = 'yoZ06aMxZJJ28mfd3POQ'
    expect(planVoiceAll(s, ['translation']).items.find(x => x.index === 2).reuseFrom).toBeNull()
  })
  it('setSpec/patchFromLine/toSetPatch: поля набора перевода', () => {
    const s = clone(demoOfficeScene)
    s.characters.a.voice.translationVoiceId = 'abc'
    expect(setSpec('translation', s.characters.a, s).voiceId).toBe('abc')
    expect(setSpec('original', s.characters.a, s).voiceId).toBe('default')
    readyTr(s, 0, 'Hi')
    expect(patchFromLine(s.timeline[0], 'translation')).toEqual({ audioUrl: URL_OK, audioMeta: s.timeline[0].translationAudioMeta })
    expect(patchFromLine(s.timeline[0], 'original')).toBeNull()
    expect(toSetPatch({ audioUrl: 'u', wordTimings: [1], audioMeta: { hash: 'h' } }, 'translation')).toEqual({ translationAudioUrl: 'u', translationWordTimings: [1], translationAudioMeta: { hash: 'h' } })
    expect(clearAudioPatch('translation')).toEqual({ translationAudioUrl: null, translationWordTimings: null, translationAudioMeta: null })
  })
})

describe('runVoicePlan по наборам', () => {
  const items = [
    { index: 0, set: 'original', text: 'a', hash: 'h0', who: 'a', reuseFrom: null, reuseSet: null },
    { index: 0, set: 'translation', text: 'ta', hash: 'h0', who: 'a', reuseFrom: 0, reuseSet: 'original' },
    { index: 1, set: 'translation', text: 'tb', hash: 'h1', who: 'b', reuseFrom: null, reuseSet: null },
    { index: 2, set: 'translation', text: 'tc', hash: 'h2', who: 'a', reuseFrom: null, reuseSet: null },
  ]
  it('apply получает поля набора; кэш по hash работает между наборами внутри прогона; ошибка одной не обрывает', async () => {
    const generate = vi.fn(async item => { if (item.index === 1) throw new Error('429'); return { audioUrl: `https://pub-1.r2.dev/${item.set}${item.index}.mp3`, audioMeta: { hash: item.hash } } })
    const apply = vi.fn()
    const r = await runVoicePlan({ items }, { generate, apply })
    expect(generate).toHaveBeenCalledTimes(3) // h0 — один раз на оба набора
    expect(apply.mock.calls[0]).toEqual([0, { audioUrl: 'https://pub-1.r2.dev/original0.mp3', audioMeta: { hash: 'h0' } }, 'original'])
    expect(apply.mock.calls[1]).toEqual([0, { translationAudioUrl: 'https://pub-1.r2.dev/original0.mp3', translationAudioMeta: { hash: 'h0' } }, 'translation'])
    expect(r.ok).toEqual([0, 0, 2])
    expect(r.failed).toEqual([{ index: 1, set: 'translation', error: '429' }])
  })
  it('остановка между репликами — остаток в skipped (индексы)', async () => {
    let stop = false
    const generate = vi.fn(async item => { if (item.index === 1) stop = true; return { audioUrl: 'https://pub-1.r2.dev/x.mp3' } })
    const r = await runVoicePlan({ items }, { generate, apply: () => {}, isStopped: () => stop })
    expect(r.stopped).toBe(true)
    expect(r.skipped).toEqual([2])
  })
})

describe('генерация и статусы набора перевода', () => {
  const file = { name: 'tts.mp3' }
  const deps = () => ({ tts: vi.fn(async () => ({ file, wordTimings: [{ w: 'Hi', t: 0, e: 0.3 }], voiceId: 'abc' })), upload: vi.fn(async () => URL_OK), remove: vi.fn(), probeDuration: vi.fn(async () => 0.5) })
  it('generateSetAudio translation: текст — translation, голос — translationVoiceSpec, hash сходится с translationAudioState', async () => {
    const s = clone(demoOfficeScene)
    s.options.translationVoiceId = 'abcdefghij'
    s.timeline[0].translation = 'Hi there'
    const d = deps()
    const patch = await generateSetAudio('translation', s.timeline[0], s.characters.a, s, d)
    expect(d.tts).toHaveBeenCalledWith('Hi there', { voiceId: 'abcdefghij', modelId: TTS_MODEL, voiceSettings: { stability: 0.5, similarity_boost: 0.75, speed: 1 } })
    s.timeline[0] = { ...s.timeline[0], ...toSetPatch(patch, 'translation') }
    expect(lineVoiceStatus(s.timeline[0], s.characters.a, undefined, 'translation', s)).toBe('ready')
    s.timeline[0].translation = 'Changed'
    expect(lineVoiceStatus(s.timeline[0], s.characters.a, undefined, 'translation', s)).toBe('stale')
    delete s.timeline[0].translation
    expect(lineVoiceStatus(s.timeline[0], s.characters.a, undefined, 'translation', s)).toBe('stale') // файл есть, перевода нет
    await expect(generateSetAudio('translation', { translation: ' ' }, s.characters.a, s, d)).rejects.toThrow(/пустая/)
  })
  it('статус empty — нет перевода и нет файла; busy/error поверх; ключи состояния', () => {
    expect(lineVoiceStatus({ text: 'x' }, {}, undefined, 'translation', null)).toBe('empty')
    expect(lineVoiceStatus({ text: 'x', translation: 'y' }, {}, undefined, 'translation', null)).toBe('none')
    expect(lineVoiceStatus({ text: 'x' }, {}, { busy: true }, 'translation', null)).toBe('busy')
    expect(lineKey(3)).toBe(3)
    expect(lineKey(3, 'translation')).toBe('t3')
  })
  it('isOrphanUrl смотрит оба набора: файл перевода, который делит реплика-оригинал, — не сирота', () => {
    const tl = [{ audioUrl: 'u1', translationAudioUrl: 'u2' }, { translationAudioUrl: 'u1' }]
    expect(isOrphanUrl(tl, 'u1', 1, 'translation')).toBe(false)
    expect(isOrphanUrl(tl, 'u2', 0, 'translation')).toBe(true)
    expect(isOrphanUrl(tl, 'u1', 0, 'original')).toBe(false)
  })
})

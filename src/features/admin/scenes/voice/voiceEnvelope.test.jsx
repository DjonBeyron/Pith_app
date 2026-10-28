import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { generateLineAudio } from './voiceGenerate.js'
import { envelopeFromUrl, envelopeFor, envPatch, envelopeTargets, runEnvelopePlan } from './voiceEnvelope.js'
import LineVoiceControls from './LineVoiceControls.jsx'
import EnvelopeAllRow from './EnvelopeAllRow.jsx'
import { audioHash, voiceSpec } from '../../../scene/v2/sceneVoice.js'
import { validateSceneV2 } from '../../../scene/v2/sceneSchemaV2.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

// Огибающая в панели озвучки: считается сразу при озвучке, догоняется кнопками «Посчитать огибающую» (одна реплика / вся сцена)
const URL_OK = 'https://pub-1.r2.dev/chat/a.mp3'
const ENV = { hz: 20, data: '0ff80' }
const cat = { gender: 'male', name: 'Кот', voice: { pitch: 1, rate: 1, voiceId: 'pNInz6obpgDQGcFmaJgB' } }
const hashFor = text => audioHash(text, voiceSpec(cat))
const file = { name: 'tts.mp3', type: 'audio/mpeg', size: 10 }
const deps = (over = {}) => ({
  tts: vi.fn(async () => ({ file, wordTimings: [{ w: 'Привет', t: 0, e: 0.41 }], voiceId: 'v1' })),
  upload: vi.fn(async () => URL_OK),
  remove: vi.fn(async () => {}),
  probeDuration: vi.fn(async () => 1.2),
  envelope: vi.fn(async () => ENV),
  ...over,
})

describe('озвучка: огибающая считается сразу из полученного файла', () => {
  it('generateAudio кладёт audioMeta.env; результат проходит валидатор сцены', async () => {
    const d = deps()
    const patch = await generateLineAudio('Привет.', cat, d)
    expect(d.envelope).toHaveBeenCalledWith(file)
    expect(patch.audioMeta.env).toEqual(ENV)
    const s = JSON.parse(JSON.stringify(demoOfficeScene))
    s.timeline[0] = { ...s.timeline[0], text: 'Привет.', ...patch }
    s.characters.a = cat
    expect(validateSceneV2(s)).toEqual([])
  })

  it('не посчиталась (ошибка / тишина / нет функции) — озвучка всё равно сохраняется, без env', async () => {
    for (const envelope of [vi.fn(async () => { throw new Error('decode') }), vi.fn(async () => ({ hz: 20, data: '' })), undefined]) {
      const patch = await generateLineAudio('Привет.', cat, deps({ envelope }))
      expect(patch.audioUrl).toBe(URL_OK)
      expect(patch.audioMeta.env).toBeUndefined()
    }
  })
})

describe('envelopeFor / envPatch / envelopeFromUrl', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('envelopeFor: качает файл нужного набора; нет файла / тишина — понятная ошибка', async () => {
    const stub = vi.fn(async () => ENV)
    expect(await envelopeFor({ audioUrl: URL_OK }, 'original', stub)).toEqual(ENV)
    expect(stub).toHaveBeenCalledWith(URL_OK)
    await envelopeFor({ audioUrl: URL_OK, translationAudioUrl: 'https://pub-1.r2.dev/t.mp3' }, 'translation', stub)
    expect(stub).toHaveBeenLastCalledWith('https://pub-1.r2.dev/t.mp3')
    await expect(envelopeFor({ text: 'x' }, 'original', stub)).rejects.toThrow(/нет файла/)
    await expect(envelopeFor({ audioUrl: URL_OK }, 'original', async () => ({ hz: 20, data: '' }))).rejects.toThrow(/тишина/)
  })

  it('envPatch дописывает env к audioMeta нужного набора, не теряя hash и длительность', () => {
    const line = { audioMeta: { hash: 'h', durationMs: 900 }, translationAudioMeta: { hash: 't' } }
    expect(envPatch(line, 'original', ENV)).toEqual({ audioMeta: { hash: 'h', durationMs: 900, env: ENV } })
    expect(envPatch(line, 'translation', ENV)).toEqual({ translationAudioMeta: { hash: 't', env: ENV } })
  })

  it('envelopeFromUrl: сеть / HTTP-ошибка — ошибка по-русски', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(envelopeFromUrl(URL_OK)).rejects.toThrow(/CORS/)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })))
    await expect(envelopeFromUrl(URL_OK)).rejects.toThrow(/403/)
  })
})

describe('envelopeTargets / runEnvelopePlan — «для всех реплик»', () => {
  const scene = {
    timeline: [
      { who: 'a', text: 'Раз.', audioUrl: URL_OK, audioMeta: { hash: hashFor('Раз.') } },                  // нужна
      { who: 'a', text: 'Два.', audioUrl: URL_OK, audioMeta: { hash: hashFor('Два.'), env: ENV } },        // уже есть
      { who: 'a', text: 'Три.' },                                                                          // нет файла
      { who: 'a', text: 'Четыре.', audioUrl: URL_OK },                                                     // файл без hash — пропуск
      { who: 'a', text: 'Пять.', audioUrl: URL_OK, audioMeta: { hash: 'h5' }, translation: 'Five', translationAudioUrl: URL_OK, translationAudioMeta: { hash: 'h6' } }, // оригинал + перевод
      { who: 'a', text: 'Can I have {food}?', translation: '{food:ru}', audioUrl: URL_OK, audioMeta: { hash: 'h7' } }, // шаблон — мимо
    ],
  }

  it('todo — реплики и наборы с файлом и hash, но без env; без hash — в skipped; шаблоны не считаются', () => {
    expect(envelopeTargets(scene)).toEqual({ todo: [{ index: 0, set: 'original' }, { index: 4, set: 'original' }, { index: 4, set: 'translation' }], skipped: 1 })
    expect(envelopeTargets({ timeline: [] })).toEqual({ todo: [], skipped: 0 })
    expect(envelopeTargets(null)).toEqual({ todo: [], skipped: 0 })
  })

  it('runEnvelopePlan идёт по одной подряд; ошибка одной не обрывает остальные; прогресс — после каждой', async () => {
    const order = []
    const progress = []
    const res = await runEnvelopePlan(
      [{ index: 0, set: 'original' }, { index: 1, set: 'original' }, { index: 2, set: 'translation' }],
      async (i, set) => { order.push(`${i}${set[0]}`); return i !== 1 },
      p => progress.push(p),
    )
    expect(order).toEqual(['0o', '1o', '2t'])
    expect(res.failed).toBe(1)
    expect(progress).toEqual([{ done: 1, total: 3, failed: 0 }, { done: 2, total: 3, failed: 1 }, { done: 3, total: 3, failed: 1 }])
  })
})

describe('панель озвучки: кнопки «Посчитать огибающую»', () => {
  const api = (over = {}) => ({ lines: {}, quota: null, busy: false, playing: null, voiceLine: vi.fn(), removeLineAudio: vi.fn(), playLine: vi.fn(), envLine: vi.fn(), envAll: vi.fn(), envLines: {}, envAllState: null, ...over })
  const line = env => ({ who: 'a', text: 'Привет.', audioUrl: URL_OK, audioMeta: { hash: hashFor('Привет.'), voiceId: 'pNInz6obpgDQGcFmaJgB', ...(env ? { env } : {}) } })
  const render = (l, voice) => renderToStaticMarkup(<LineVoiceControls index={0} line={l} character={cat} voice={voice} idPrefix="f-timeline-0" />)

  it('озвученная реплика без env — кнопка; с env — отметка «огибающая ✓» без кнопки; без файла или hash — кнопки нет', () => {
    expect(render(line(null), api())).toContain('Посчитать огибающую')
    const withEnv = render(line(ENV), api())
    expect(withEnv).not.toContain('Посчитать огибающую')
    expect(withEnv).toContain('огибающая ✓')
    expect(render({ who: 'a', text: 'Привет.' }, api())).not.toContain('Посчитать огибающую')
    expect(render({ who: 'a', text: 'x', audioUrl: URL_OK }, api())).not.toContain('Посчитать огибающую')
  })

  it('считаю… — кнопка заблокирована; ошибка — текст рядом', () => {
    const busy = render(line(null), api({ envLines: { 0: { busy: true } } }))
    expect(busy).toContain('Считаю…')
    expect(busy).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Считаю/)
    expect(render(line(null), api({ envLines: { 0: { error: 'файл не скачался (HTTP 403)' } } }))).toContain('огибающая: файл не скачался (HTTP 403)')
  })

  it('строка «для всех»: сколько без огибающей и кнопка; идёт прогон — прогресс; всё есть — кнопки нет', () => {
    const html = renderToStaticMarkup(<EnvelopeAllRow scene={{ timeline: [line(null), line(ENV), line(null)] }} voice={api()} />)
    expect(html).toContain('нет у <b>2</b>')
    expect(html).toContain('Посчитать огибающую')
    const run = renderToStaticMarkup(<EnvelopeAllRow scene={{ timeline: [line(null)] }} voice={api({ envAllState: { done: 1, total: 3, failed: 0, skipped: 0 }, busy: true })} />)
    expect(run).toContain('считаю 2 из 3')
    expect(run).toMatch(/<button[^>]*disabled/)
    const done = renderToStaticMarkup(<EnvelopeAllRow scene={{ timeline: [line(ENV)] }} voice={api({ envAllState: { done: 2, total: 2, failed: 1, skipped: 0 } })} />)
    expect(done).toContain('готово 1 из 2')
    expect(done).toContain('с ошибкой 1')
    expect(done).not.toContain('<button')
    expect(renderToStaticMarkup(<EnvelopeAllRow scene={{ timeline: [{ who: 'a', text: 'x' }] }} voice={api()} />)).toBe('')
  })
})

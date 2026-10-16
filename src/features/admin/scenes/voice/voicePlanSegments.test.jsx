import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { planVoiceAll, planLineSegments, runVoicePlan } from './voicePlan.js'
import { createSegmentApplier } from './voiceSegments.js'
import { isOrphanUrl, generateItemAudio } from './voiceGenerate.js'
import SegmentVoiceControls from './SegmentVoiceControls.jsx'
import VoiceAllFacts from './VoiceAllFacts.jsx'
import { audioHash, voiceSpec } from '../../../scene/v2/sceneVoice.js'
import { demoTemplateScene } from '../../../scene/v2/demoScenes.js'
import { lineEditLabel } from '../history/historyLabels.js'
import { helpContent } from '../scenesHelp.js'

// Озвучка частей реплик-шаблонов в сборщике: план (символы, кэш по hash, устаревание), прогон, запись в черновик, статус в UI
const clone = o => JSON.parse(JSON.stringify(o))
const char = demoTemplateScene.characters.a
const spec = voiceSpec(char)
const aud = (text, n) => ({ text, audioUrl: `https://r2/${n}.mp3`, audioMeta: { hash: audioHash(text, spec), durationMs: 700 } })
const line = (text, segments) => ({ who: 'a', text, emotion: 'happy', ...(segments ? { segments } : {}) })
const sceneWith = timeline => ({ ...clone(demoTemplateScene), timeline })
const T1 = 'Can I have {food}, please?'

describe('planVoiceAll — части шаблона', () => {
  it('каждая текстовая часть — отдельный пункт (seg = индекс части), символы по обрезанному тексту, слово в расход не входит', () => {
    const p = planVoiceAll(sceneWith([line(T1), line('Hi.')]))
    const segs = p.items.filter(x => x.seg !== undefined)
    expect(segs.map(x => [x.index, x.seg, x.text])).toEqual([[0, 0, 'Can I have'], [0, 2, ', please?']])
    expect(p.items.map(x => x.index)).toEqual([0, 0, 1])
    expect(p.chars).toBe('Can I have'.length + ', please?'.length + 'Hi.'.length)
    expect(p.bySet.original).toMatchObject({ withText: 3, parts: 2, items: 3, generate: 3 })
    expect(segs[0].hash).toBe(audioHash('Can I have', spec))
  })
  it('готовые части пропускаются; устаревшая (другой hash) и неозвученная идут в план', () => {
    const stale = { ...aud('Can I have', 1), audioMeta: { hash: 'old' } }
    const p = planVoiceAll(sceneWith([line(T1, [stale, { var: 'food' }, aud(', please?', 2)]), line('Thank you! {food} looks great.')]))
    expect(p.items.map(x => [x.index, x.text])).toEqual([[0, 'Can I have'], [1, 'Thank you!'], [1, 'looks great.']])
    expect(p.bySet.original.ready).toBe(p.bySet.original.withText - p.items.length)
  })
  it('кэш по hash: ", please?" второй реплики подтягивается из первой готовой — без вызова и без символов', () => {
    const p = planVoiceAll(sceneWith([line(T1, [aud('Can I have', 1), { var: 'food' }, aud(', please?', 2)]), line('Could I get {food}, please?')]))
    const reuse = p.items.find(x => x.text === ', please?')
    expect(reuse).toMatchObject({ index: 1, reuseFrom: 0, reuseData: { audioUrl: 'https://r2/2.mp3' } })
    expect(p.generate).toBe(1)                       // только «Could I get»
    expect(p.chars).toBe('Could I get'.length)
  })
  it('две новые реплики с общей частью: первая генерируется, вторая ждёт результат первой', () => {
    const p = planVoiceAll(sceneWith([line('I like {food}, please?'), line('Give me {food}, please?')]))
    const dup = p.items.filter(x => x.text === ', please?')
    expect(dup.map(x => x.reuseFrom)).toEqual([null, 0])
    expect(p.generate).toBe(3)
  })
  it('часть без букв («?») не озвучивается и в расчёт не входит', () => {
    const p = planVoiceAll(sceneWith([line('Do you like {food}?')]))
    expect(p.items.map(x => x.text)).toEqual(['Do you like'])
  })
})

describe('перевод шаблонной реплики не озвучивается', () => {
  const tl = [{ ...line(T1), translation: 'Можно мне {food:ru}, пожалуйста?' }, { ...line('Hi.'), translation: 'Привет.' }]
  it('план набора «Перевод»: пункт только у обычной реплики; текст для озвучки шаблонного перевода пуст', () => {
    const p = planVoiceAll(sceneWith(tl), ['translation'])
    expect(p.items.map(x => x.index)).toEqual([1])
    expect(p.bySet.translation.withText).toBe(1)
  })
  it('статус «со словом — читает синтез устройства», кнопок нет; в счётчик озвучки перевода не входит', async () => {
    const { default: Lvc } = await import('./LineVoiceControls.jsx')
    const { sceneVoiceStats } = await import('../../../scene/v2/sceneVoice.js')
    const html = renderToStaticMarkup(<Lvc index={0} line={tl[0]} character={char} voice={{ lines: {}, busy: false, playing: null, voiceLine: vi.fn() }} idPrefix="f-timeline-0" set="translation" scene={sceneWith(tl)} />)
    expect(html).toContain('со словом — читает синтез устройства')
    expect(html).not.toContain('Озвучить')
    expect(sceneVoiceStats(sceneWith(tl)).translation).toMatchObject({ total: 1, withText: 1 })
  })
})

describe('planLineSegments', () => {
  const s = sceneWith([line(T1, [aud('Can I have', 1), { var: 'food' }, aud(', please?', 2)]), line('x')])
  it('все части готовы — пустой план; force — заново все части (без кэша)', () => {
    expect(planLineSegments(s, 0).items).toEqual([])
    const f = planLineSegments(s, 0, { force: true })
    expect(f.items.map(x => x.seg)).toEqual([0, 2])
    expect(f.generate).toBe(2)
    expect(f.chars).toBe('Can I have'.length + ', please?'.length)
  })
  it('обычная реплика и чужой индекс — пусто', () => {
    expect(planLineSegments(s, 1).items).toEqual([])
    expect(planLineSegments(s, 9).items).toEqual([])
  })
})

describe('runVoicePlan для частей шаблона', () => {
  it('apply получает пункт (seg), generate — по тексту части; кэш из плана без вызова; ошибка части не обрывает остальные и несёт seg', async () => {
    const s = sceneWith([line('I like {food}, please?'), line('Give me {food}, please?')])
    const plan = planVoiceAll(s)
    const generate = vi.fn(async item => {
      if (item.text === 'Give me') throw new Error('429')
      return { audioUrl: `https://r2/${item.text.length}.mp3`, audioMeta: { hash: item.hash } }
    })
    const apply = vi.fn()
    const r = await runVoicePlan(plan, { generate, apply })
    expect(generate.mock.calls.map(c => c[0].text)).toEqual(['I like', ', please?', 'Give me']) // общая часть второй реплики — без вызова
    expect(apply.mock.calls.map(c => [c[0], c[3].seg])).toEqual([[0, 0], [0, 2], [1, 2]])
    expect(r.failed).toEqual([{ index: 1, set: 'original', error: '429', seg: 0 }])
    expect(r.ok).toEqual([0, 0, 1])
  })
  it('generateItemAudio: часть → TTS ровно её текстом голосом персонажа', async () => {
    const tts = vi.fn(async () => ({ file: new Blob(['x']), wordTimings: [{ w: 'Can', t: 0.1, e: 0.3 }], voiceId: 'v' }))
    const deps = { tts, upload: async () => 'https://r2/new.mp3', remove: vi.fn(), probeDuration: async () => 0.9 }
    const scene = sceneWith([line(T1)])
    const patch = await generateItemAudio({ index: 0, seg: 0, set: 'original', text: 'Can I have', who: 'a' }, scene, deps)
    expect(tts.mock.calls[0][0]).toBe('Can I have')
    expect(patch.audioMeta.hash).toBe(audioHash('Can I have', spec))
    expect(patch.audioUrl).toBe('https://r2/new.mp3')
  })
})

describe('createSegmentApplier и файлы-сироты', () => {
  const mk = scene => {
    const sceneRef = { current: scene }
    const calls = []
    const remove = vi.fn(async () => {})
    const actions = { updateLine: (i, p) => { calls.push([i, p]); sceneRef.current = { ...sceneRef.current, timeline: sceneRef.current.timeline.map((l, n) => (n === i ? { ...l, ...p } : l)) } } }
    return { app: createSegmentApplier({ sceneRef, actions, deps: { remove } }), calls, remove, sceneRef }
  }
  it('подряд пришедшие части одной реплики накапливаются в буфере, а не перетирают друг друга', () => {
    const scene = sceneWith([line(T1)])
    const sceneRef = { current: scene }
    const calls = []
    const app = createSegmentApplier({ sceneRef, actions: { updateLine: (i, p) => calls.push([i, p]) }, deps: { remove: vi.fn() } }) // sceneRef не обновляется (как до перерисовки)
    app.apply({ index: 0, seg: 0 }, { audioUrl: 'https://r2/1.mp3' })
    app.apply({ index: 0, seg: 2 }, { audioUrl: 'https://r2/2.mp3' })
    expect(calls[1][1].segments.map(s => s.audioUrl)).toEqual(['https://r2/1.mp3', undefined, 'https://r2/2.mp3'])
    app.reset()
    app.apply({ index: 0, seg: 0 }, { audioUrl: 'https://r2/3.mp3' })
    expect(calls[2][1].segments[2].audioUrl).toBeUndefined() // буфер сброшен — база снова из сцены
  })
  it('заменённый файл части удаляется из R2, если на него никто не ссылается; на общий файл другой реплики — нет', async () => {
    const stale = { ...aud('Can I have', 1), audioMeta: { hash: 'old' } }
    const { app, remove } = mk(sceneWith([line(T1, [stale, { var: 'food' }, aud(', please?', 2)]), line('Could I get {food}, please?', [aud('Could I get', 5), { var: 'food' }, { ...aud(', please?', 2) }])]))
    app.apply({ index: 0, seg: 0 }, { audioUrl: 'https://r2/new.mp3' })
    await Promise.resolve()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('https://r2/1.mp3')
    app.apply({ index: 0, seg: 2 }, { audioUrl: 'https://r2/other.mp3' })
    await Promise.resolve()
    expect(remove).toHaveBeenCalledTimes(1) // https://r2/2.mp3 ещё нужен второй реплике
  })
  it('isOrphanUrl учитывает файлы сегментов', () => {
    const tl = [line(T1, [aud('Can I have', 1), { var: 'food' }]), { who: 'a', text: 'x', audioUrl: 'https://r2/z.mp3' }]
    expect(isOrphanUrl(tl, 'https://r2/1.mp3', 1)).toBe(false)
    expect(isOrphanUrl(tl, 'https://r2/z.mp3', 1)).toBe(true)
  })
})

describe('интерфейс: SegmentVoiceControls и подписи', () => {
  const api = (over = {}) => ({ lines: {}, busy: false, playing: null, voiceSegments: vi.fn(), removeSegmentsAudio: vi.fn(), playUrl: vi.fn(), ...over })
  const render = (l, over) => renderToStaticMarkup(<SegmentVoiceControls index={0} line={l} character={char} voice={api(over)} idPrefix="f-timeline-0" />)
  it('нет файлов / озвучено частей 2 из 2 / озвучено 1 из 2 / устарело — статус, кнопки, слово из библиотеки, id для линтера', () => {
    const none = render(line(T1))
    expect(none).toContain('нет файлов (0 из 2)')
    expect(none).toContain('Озвучить части')
    expect(none).toContain('слово из библиотеки озвучки слов')
    expect(none).toContain('id="f-timeline-0-segments"')
    expect(none).not.toContain('Удалить озвучку')
    const ok = render(line(T1, [aud('Can I have', 1), { var: 'food' }, aud(', please?', 2)]))
    expect(ok).toContain('озвучено частей 2 из 2')
    expect(ok).toContain('Переозвучить')
    expect(ok).toContain('Удалить озвучку частей')
    expect(ok).not.toContain('Озвучить части')
    expect(ok).toContain('озвучено · 0,7 с')
    expect(render(line(T1, [aud('Can I have', 1)]))).toContain('озвучено 1 из 2')
    const stale = render(line(T1, [{ ...aud('Can I have', 1), audioMeta: { hash: 'old' } }, { var: 'food' }, aud(', please?', 2)]))
    expect(stale).toContain('устарело')
    expect(stale).toContain('scbVoiceTag-stale')
  })
  it('busy и ошибка; без voice — только статус; перевод в подсказке "?"', () => {
    expect(render(line(T1), { lines: { 0: { busy: true } }, busy: true })).toContain('озвучиваю…')
    const err = render(line(T1), { lines: { 0: { error: 'не озвучено частей: 1 из 2 — 429' } } })
    expect(err).toContain('scbVoiceTag-error')
    expect(err).toContain('429')
    const st = renderToStaticMarkup(<SegmentVoiceControls index={0} line={line(T1)} character={char} idPrefix="f-timeline-0" />)
    expect(st).not.toContain('Озвучить части')
    expect(st).toContain('нет файлов')
  })
  it('подсказка «?»: перевод шаблонных реплик не озвучивается — читает синтез устройства; слово — из библиотеки', () => {
    const h = helpContent('voice_segments')
    expect(h.body).toMatch(/Перевод шаблонных реплик не озвучивается/)
    expect(h.body).toMatch(/синтезом устройства целиком, английским голосом/)
    expect(helpContent('vars_word_audio').body).toMatch(/word_audio/)
  })
  it('VoiceAllFacts: строка про части шаблонов; подпись в истории — «озвучка частей реплики N»', () => {
    const plan = planVoiceAll(sceneWith([line(T1)]))
    const html = renderToStaticMarkup(<VoiceAllFacts plan={plan} sets={['original']} quota={{ used: 0, limit: 1000 }} onSets={() => {}} />)
    expect(html).toContain('частей реплик-шаблонов: 2')
    expect(html).toContain(`символов ${'Can I have'.length + ', please?'.length}`)
    expect(lineEditLabel(2, { segments: [] })).toEqual(['озвучка частей реплики 3', null])
  })
})

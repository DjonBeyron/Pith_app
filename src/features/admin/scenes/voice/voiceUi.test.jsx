import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LineVoiceControls from './LineVoiceControls.jsx'
import VoiceAllDialog from './VoiceAllDialog.jsx'
import VoicePicker from './VoicePicker.jsx'
import TimelineEditor from '../TimelineEditor.jsx'
import { audioHash, voiceSpec } from '../../../scene/v2/sceneVoice.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import { fieldIdCandidates } from '../lintFieldMap.js'
import { buildPrompt } from '../aiPrompt.js'

// Разметка озвучки в сборщике (без DOM): бейджи статусов и кнопки реплики, диалог
// «Озвучить всё» с оценкой квоты и итогом, выбор голоса с подсказкой по полу, шапка таймлайна
const URL_OK = 'https://pub-1.r2.dev/chat/a.mp3'
const cat = { gender: 'male', name: 'Кот', voice: { pitch: 1, rate: 1, voiceId: 'pNInz6obpgDQGcFmaJgB' } }
const voiceApi = (over = {}) => ({
  lines: {}, all: null, quota: { used: 100, limit: 1000 }, busy: false, playing: null, previewBusy: null,
  voiceLine: vi.fn(), removeLineAudio: vi.fn(), playLine: vi.fn(), previewVoice: vi.fn(), openAll: vi.fn(), startAll: vi.fn(), stopAll: vi.fn(), closeAll: vi.fn(),
  ...over,
})
const ready = { who: 'a', text: 'Привет.', audioUrl: URL_OK, audioMeta: { hash: audioHash('Привет.', voiceSpec(cat)), voiceId: 'pNInz6obpgDQGcFmaJgB', durationMs: 2400 } }

describe('LineVoiceControls', () => {
  const render = (line, over) => renderToStaticMarkup(<LineVoiceControls index={0} line={line} character={cat} voice={voiceApi(over)} idPrefix="f-timeline-0" />)
  it('нет файла — «Озвучить»; озвучено — длительность, голос, Прослушать/Переозвучить/Удалить', () => {
    const none = render({ who: 'a', text: 'Привет.' })
    expect(none).toContain('нет файла')
    expect(none).toContain('Озвучить')
    expect(none).not.toContain('Переозвучить')
    const ok = render(ready)
    expect(ok).toContain('озвучено · 2,4 с')
    expect(ok).toContain('Adam')
    expect(ok).toContain('aria-label="Прослушать"')
    expect(ok).toContain('Переозвучить')
    expect(ok).toContain('aria-label="Удалить озвучку"')
    expect(ok).toContain('id="f-timeline-0-audioUrl"')
  })
  it('устарело — жёлтый бейдж и акцент на «Переозвучить»; ошибка — текст; busy — всё заблокировано', () => {
    const stale = render({ ...ready, text: 'Другой текст.' })
    expect(stale).toContain('scbVoiceTag-stale')
    expect(stale).toContain('изменились после озвучки')
    expect(stale).toMatch(/fsBtnPrimary[^>]*>[^<]*<svg[\s\S]*?Переозвучить/)
    const err = render({ who: 'a', text: 'x' }, { lines: { 0: { error: 'ElevenLabs 429' } } })
    expect(err).toContain('scbVoiceTag-error')
    expect(err).toContain('ElevenLabs 429')
    expect(err).toContain('Повторить')
    const busy = render({ who: 'a', text: 'x' }, { lines: { 0: { busy: true } }, busy: true })
    expect(busy).toContain('озвучиваю…')
    expect(busy).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Озвучить/)
  })
  it('без voice (статичный рендер) — только бейдж', () => {
    const html = renderToStaticMarkup(<LineVoiceControls index={0} line={ready} character={cat} idPrefix="f-timeline-0" />)
    expect(html).toContain('озвучено')
    expect(html).not.toContain('<button')
  })
})

describe('VoiceAllDialog', () => {
  const plan = { items: [{ index: 1, text: 'a', hash: 'h', who: 'a', reuseFrom: null }, { index: 2, text: 'b', hash: 'h', who: 'b', reuseFrom: 1 }], generate: 1, chars: 120, ready: 4, total: 6 }
  const names = { a: 'Рыжик', b: 'Дымка' }
  it('подтверждение: реплики, вызовы, символы, остаток квоты; не хватает — предупреждение', () => {
    const ok = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'confirm', plan }} quota={{ used: 500, limit: 1000 }} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(ok).toContain('Итого: <b>2</b> записи')
    expect(ok).toContain('<b>1</b> — из кэша')
    expect(ok).toContain('вызовов ElevenLabs: <b>1</b>')
    expect(ok).toContain('500 симв.</b>')
    expect(ok).not.toContain('не хватит')
    expect(ok).toContain('>Озвучить 2<')
    const low = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'confirm', plan }} quota={{ used: 950, limit: 1000 }} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(low).toContain('не хватит')
    const unknown = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'confirm', plan }} quota={null} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(unknown).toContain('неизвестен')
    const empty = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'confirm', plan: { ...plan, items: [], generate: 0, chars: 0, ready: 6 } }} quota={null} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(empty).toContain('генерировать нечего')
  })
  it('прогон: полоса, «реплика i из n», «Остановить»; итог: сколько ок, ошибки по репликам', () => {
    const run = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'running', plan, current: 1, progress: { done: 0, total: 2, ok: 0, failed: [] } }} quota={null} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(run).toContain('role="progressbar"')
    expect(run).toContain('Реплика 1 из 2 — №2, Рыжик')
    expect(run).toContain('Остановить после текущей')
    const done = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'done', plan, progress: { done: 2, total: 2, ok: 1, failed: [{ index: 2, error: 'квота исчерпана' }] }, result: { stopped: false, skipped: [] } }} quota={null} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(done).toContain('Озвучено 1 из 2, с ошибкой 1')
    expect(done).toContain('№3</b>: квота исчерпана')
    expect(done).toContain('>Закрыть<')
    expect(renderToStaticMarkup(<VoiceAllDialog all={null} />)).toBe('')
  })
})

describe('VoicePicker и шапка таймлайна', () => {
  it('выбран пресет по id; женский голос у кота — подсказка «Подобрать по полу»; стоимость прослушки', () => {
    const actions = { setVoice: vi.fn() }
    const html = renderToStaticMarkup(<VoicePicker who="a" character={cat} actions={actions} voice={voiceApi()} />)
    expect(html).toMatch(/<option value="pNInz6obpgDQGcFmaJgB" selected="">Adam ♂/)
    expect(html).toContain('Прослушать голос')
    expect(html).toContain('симв. квоты')
    expect(html).not.toContain('Подобрать по полу')
    const mismatch = renderToStaticMarkup(<VoicePicker who="a" character={{ ...cat, voice: { voiceId: '21m00Tcm4TlvDq8ikWAM' } }} actions={actions} voice={voiceApi()} />)
    expect(mismatch).toContain('Голос женский, а персонаж — кот')
    expect(mismatch).toContain('Подобрать по полу')
    const custom = renderToStaticMarkup(<VoicePicker who="b" character={{ ...cat, gender: 'female', voice: { voiceId: 'myCustomVoice123' } }} actions={actions} />)
    expect(custom).toContain('value="myCustomVoice123"')
    expect(custom).not.toContain('Прослушать голос')
  })
  it('TimelineEditor: «Озвучено X из N», квота, ссылка «Озвучить всё» (в тулбаре — основная кнопка; заблокирована, когда всё озвучено)', () => {
    const actions = {}
    const html = renderToStaticMarkup(<TimelineEditor scene={demoOfficeScene} actions={actions} voice={voiceApi()} />)
    expect(html).toContain('Озвучено <b>0</b> из 6')
    expect(html).toContain('квота ElevenLabs: 900 симв.')
    expect(html).toMatch(/<button[^>]*class="scbLink"[^>]*>[\s\S]*?Озвучить всё/)
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Озвучить всё/)
    const all = { ...demoOfficeScene, timeline: demoOfficeScene.timeline.map(l => ({ ...l, audioUrl: URL_OK })) }
    expect(renderToStaticMarkup(<TimelineEditor scene={all} actions={actions} voice={voiceApi()} />)).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Озвучить всё/)
    expect(renderToStaticMarkup(<TimelineEditor scene={demoOfficeScene} actions={actions} />)).not.toContain('Озвучить всё')
  })
  it('замечание «озвучка устарела» подсвечивает строку озвучки реплики; промпт просит не трогать поля озвучки', () => {
    expect(fieldIdCandidates('timeline[3].audioUrl — озвучка устарела: …')[0]).toBe('f-timeline-3-audioUrl')
    expect(buildPrompt('кофе')).toContain('audioUrl, wordTimings, audioMeta')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LineVoiceControls from './LineVoiceControls.jsx'
import VoiceAllDialog from './VoiceAllDialog.jsx'
import TranslationVoicePicker from './TranslationVoicePicker.jsx'
import TimelineLine from '../TimelineLine.jsx'
import PlaybackOptions from '../modes/PlaybackOptions.jsx'
import ToolbarStatus from '../toolbar/ToolbarStatus.jsx'
import { planVoiceAll } from './voicePlan.js'
import { audioHash, translationVoiceSpec, sceneVoiceStats } from '../../../scene/v2/sceneVoice.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

// Разметка озвучки перевода и режимов (без DOM): блок «Перевод» у реплики в разных статусах,
// диалог с выбором наборов, выбор голоса перевода, «Параметры воспроизведения», индикатор тулбара
const URL_OK = 'https://pub-1.r2.dev/chat/a.mp3'
const strip = h => h.replace(/<!-- -->/g, '')
const scene = JSON.parse(JSON.stringify(demoOfficeScene))
const cat = scene.characters.a
const voiceApi = (over = {}) => ({
  lines: {}, all: null, quota: { used: 100, limit: 1000 }, busy: false, playing: null, previewBusy: null,
  voiceLine: vi.fn(), removeLineAudio: vi.fn(), playLine: vi.fn(), previewVoice: vi.fn(), openAll: vi.fn(), setSets: vi.fn(), startAll: vi.fn(), stopAll: vi.fn(), closeAll: vi.fn(),
  ...over,
})
const trReady = { who: 'a', text: 'Привет.', translation: 'Hello.', translationAudioUrl: URL_OK, translationAudioMeta: { hash: audioHash('Hello.', translationVoiceSpec(cat, scene)), voiceId: 'yoZ06aMxZJJ28mfd3POQ', durationMs: 1500 } }

describe('LineVoiceControls set=translation', () => {
  const render = (line, over) => renderToStaticMarkup(<LineVoiceControls index={0} line={line} character={cat} scene={scene} voice={voiceApi(over)} idPrefix="f-timeline-0" set="translation" />)
  it('нет перевода — блок неактивен с пояснением, кнопок нет; есть перевод без файла — «Озвучить»', () => {
    const empty = render({ who: 'a', text: 'Привет.' })
    expect(empty).toContain('Перевод:')
    expect(empty).toContain('нет перевода')
    expect(empty).toContain('впишите перевод')
    expect(empty).not.toContain('Озвучить')
    expect(empty).not.toContain('aria-label="Удалить озвучку"')
    expect(empty).toContain('id="f-timeline-0-translationAudioUrl"')
    const none = render({ who: 'a', text: 'Привет.', translation: 'Hello.' })
    expect(none).toContain('нет файла')
    expect(none).toMatch(/<button[^>]*>[\s\S]*?Озвучить/)
  })
  it('озвучено — длительность и голос Sam, Прослушать/Переозвучить/Удалить; устарело при смене перевода и при убранном переводе', () => {
    const ok = render(trReady)
    expect(ok).toContain('озвучено · 1,5 с')
    expect(ok).toContain('Sam')
    expect(ok).toContain('aria-label="Прослушать"')
    expect(ok).toContain('aria-label="Удалить озвучку"')
    const stale = render({ ...trReady, translation: 'Hi.' })
    expect(stale).toContain('scbVoiceTag-stale')
    expect(stale).toContain('перевод или голос перевода изменились')
    const gone = render({ ...trReady, translation: undefined })
    expect(gone).toContain('scbVoiceTag-stale')
    expect(gone).toContain('aria-label="Удалить озвучку"')
    const err = render(trReady, { lines: { t0: { error: 'R2 500' } } })
    expect(err).toContain('R2 500')
    const busy = render(trReady, { lines: { t0: { busy: true } }, busy: true })
    expect(busy).toContain('озвучиваю…')
  })
  it('TimelineLine: два блока (Текст / Перевод), счётчик перевода 0 / 140 и maxLength', () => {
    const html = renderToStaticMarkup(<TimelineLine index={0} line={{ who: 'a', text: 'Привет.', emotion: 'neutral' }} names={{ a: 'Рыжик', b: 'Дымка' }} total={2} actions={{}} characters={scene.characters} scene={scene} voice={voiceApi()} />)
    expect(html).toContain('data-set="original"')
    expect(html).toContain('data-set="translation"')
    expect(html).toContain('0 / 140')
    expect(html).toMatch(/id="f-timeline-0-translation"[^>]*maxlength="140"|maxlength="140"[^>]*id="f-timeline-0-translation"/i)
  })
})

describe('VoiceAllDialog — выбор наборов', () => {
  const s = JSON.parse(JSON.stringify(demoOfficeScene))
  s.timeline[0].translation = 'Hello'
  s.timeline[1].translation = 'World'
  const names = { a: 'Рыжик', b: 'Дымка' }
  const dlg = (sets, over = {}) => strip(renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'confirm', sets, plan: planVoiceAll(s, sets), ...over }} quota={{ used: 0, limit: 1000 }} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} onSets={() => {}} />))
  it('чекбоксы Текст/Перевод, расчёт по набору и в сумме; единственный отмеченный набор нельзя снять', () => {
    const both = dlg(['original', 'translation'])
    expect(both).toMatch(/<input type="checkbox" checked=""\/> Текст/)
    expect(both).toMatch(/<input type="checkbox" checked=""\/> Перевод/)
    expect(both).toContain('<b>Текст:</b> озвучить 6 из 6')
    expect(both).toContain('<b>Перевод:</b> озвучить 2 из 2 (перевод есть у 2 из 6)')
    expect(both).toContain('Итого: <b>8</b> записей')
    expect(both).toContain('>Озвучить 8<')
    const one = dlg(['original'])
    expect(one).toMatch(/<input type="checkbox" disabled="" checked=""\/> Текст/)
    expect(one).not.toContain('<b>Перевод:</b>')
  })
  it('только перевод, а переводов нет — «озвучивать нечего»; прогон показывает набор в строке и в ошибках', () => {
    const none = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'confirm', sets: ['translation'], plan: planVoiceAll(demoOfficeScene, ['translation']) }} quota={null} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(none).toContain('Ни у одной реплики нет перевода')
    const plan = planVoiceAll(s, ['original', 'translation'])
    const run = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'running', sets: plan.sets, plan, current: { index: 0, set: 'translation' }, progress: { done: 6, total: 8, ok: 6, failed: [] } }} quota={null} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(run).toContain('Реплика 7 из 8 — №1, Рыжик (перевод)')
    const done = renderToStaticMarkup(<VoiceAllDialog all={{ phase: 'done', sets: plan.sets, plan, progress: { done: 8, total: 8, ok: 7, failed: [{ index: 1, set: 'translation', error: 'квота' }] }, result: { stopped: false, skipped: [] } }} quota={null} names={names} onStart={() => {}} onStop={() => {}} onClose={() => {}} />)
    expect(done).toContain('№2 (перевод)</b>: квота')
  })
})

describe('голос перевода, параметры, индикатор', () => {
  it('TranslationVoicePicker: у персонажа «Как у сцены», подсказка о мультиязычной модели, прослушка со стоимостью; у сцены — «Голос проекта»', () => {
    const s = { ...scene, options: { ...scene.options, translationVoiceId: 'yoZ06aMxZJJ28mfd3POQ' } }
    const ch = renderToStaticMarkup(<TranslationVoicePicker who="a" value="" onChange={() => {}} scene={s} character={cat} voice={voiceApi()} idPrefix="f-characters-a-voice-translationVoiceId" />)
    expect(ch).toContain('Как у сцены (Sam)')
    expect(ch).toContain('Сейчас читает: <b>Sam</b>')
    expect(ch).toContain('eleven_multilingual_v2')
    expect(ch).toContain('Прослушать голос перевода')
    expect(ch).toContain('симв. квоты')
    expect(ch).toContain('id="f-characters-a-voice-translationVoiceId"')
    const sc = renderToStaticMarkup(<TranslationVoicePicker who={null} value="" onChange={() => {}} scene={scene} idPrefix="f-options-translationVoiceId" />)
    expect(sc).toContain('Голос проекта (секрет')
    expect(sc).toContain('Сейчас читает: <b>Голос проекта</b>')
    expect(sc).not.toContain('Прослушать голос перевода')
    const custom = renderToStaticMarkup(<TranslationVoicePicker who="b" value="myOwnVoice12345" onChange={() => {}} scene={scene} character={scene.characters.b} idPrefix="x" />)
    expect(custom).toContain('value="myOwnVoice12345"')
  })
  it('PlaybackOptions: сегмент режима (как в сцене — «С текстом»), тумблеры озвучки, id полей для линтера', () => {
    const html = renderToStaticMarkup(<PlaybackOptions scene={scene} actions={{}} />)
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>С текстом/)
    expect(html).toContain('id="f-options-display"')
    expect(html).toMatch(/id="f-options-voice-original"[\s\S]*?checked=""/)
    expect(html).toContain('id="f-options-voice-translation"')
    expect(html).toContain('id="f-options-translationVoiceId"')
    expect(html).not.toContain('облачки</label>')
    expect(html).toContain('станет явным')
    const written = renderToStaticMarkup(<PlaybackOptions scene={{ ...scene, options: { ...scene.options, display: 'both', voice: { original: false, translation: true } } }} actions={{}} />)
    expect(written).toMatch(/role="radio" aria-checked="true"[^>]*>Текст \+ перевод/)
    expect(written).not.toContain('станет явным')
  })
  it('ToolbarStatus: «озвучено X из N · перевод Y из M · устарело Z» через sceneVoiceStats; чип «предпросмотр ≠ сцена»', () => {
    const s = JSON.parse(JSON.stringify(demoOfficeScene))
    s.timeline[0] = { ...s.timeline[0], ...trReady, who: 'a' }
    s.timeline[1].translation = 'World'
    s.timeline[2] = { ...s.timeline[2], audioUrl: URL_OK, audioMeta: { hash: 'f'.repeat(64), voiceId: 'v' } } // устарело
    const st = sceneVoiceStats(s)
    const html = renderToStaticMarkup(<ToolbarStatus saved={{ id: null }} unsaved={false} voice={st} modes={{ any: true }} />).replace(/<!-- -->/g, '')
    expect(html).toContain('озвучено 0 из 6 · перевод 1 из 2 · устарело 1')
    expect(html).toContain('предпросмотр ≠ сцена')
    expect(renderToStaticMarkup(<ToolbarStatus saved={{ id: null }} unsaved={false} voice={sceneVoiceStats(demoOfficeScene)} />).replace(/<!-- -->/g, '')).toContain('озвучено 0 из 6</li>')
  })
})

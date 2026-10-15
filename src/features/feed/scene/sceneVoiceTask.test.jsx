import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneVoiceSheet from './SceneVoiceSheet.jsx'
import { feedTaskOf, taskPanelKind, silenceScene } from './sceneTaskPlay.js'
import { voiceSayData, voiceVerdict, voiceTaskAvailable } from './sceneVoiceData.js'
import { voiceNote, voiceVerdictView, VOICE_DENIED, VOICE_OFF } from './sceneVoiceTexts.js'
import { warmVoiceTask } from './useSceneVoiceWarm.js'
import { judgeRun } from '../../../shared/lib/speech/sayResult.js'
import { buildSayGrammar, sayCompleteCheck } from '../../../shared/lib/vosk/sayVoskGrammar.js'
import { pickEngine } from '../../../shared/lib/speech/sayEnginePick.js'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'

vi.mock('../../../shared/lib/analytics/track.js', () => ({ track: () => {} }))

const EN = ['Do you like tea?', 'I like tea a lot', 'Me too', 'Great']
const timeline = demoCafeScene.timeline.map((l, i) => ({ ...l, text: EN[i % EN.length] }))
const mk = task => feedTaskOf(normalizeSceneV2({ ...demoCafeScene, timeline, task }))
const repeat = mk({ kind: 'repeat', lineIndex: 1, accept: [], hint: 'Говори медленно' })
const say = mk({ kind: 'say', lineIndex: 0, answers: ['I like tea', 'Tea please'], accept: [] })
const sheet = (p = {}) => renderToStaticMarkup(<SceneVoiceSheet kind="repeat" phase="ready" prompt="Повтори за Барсик" lineText="Hello there" expected={['Hello there']} {...p} />)

describe('выбор панели по kind', () => {
  it('голосовые виды → voice, translate → keyboard; say с одними ключевыми словами допустим', () => {
    expect(repeat.voice).toBe(true)
    expect(say.voice).toBe(true)
    expect(taskPanelKind(repeat)).toBe('voice')
    expect(taskPanelKind(say)).toBe('voice')
    expect(taskPanelKind({ voice: false })).toBe('keyboard')
    expect(taskPanelKind(null)).toBe('keyboard')
    expect(mk({ kind: 'say', answers: [], keywords: ['tea'] })?.voice).toBe(true)
    expect(mk({ kind: 'say', answers: [] })).toBeNull()
  })
})

describe('адаптер грамматики и проверки', () => {
  it('грамматика Vosk из taskGrammar, словарь и «фраза целиком» из готового списка', () => {
    const d = voiceSayData(say)
    expect(d.grammar).toContain('i like tea')
    expect(d.open).toBe(false)
    expect(JSON.parse(buildSayGrammar(d).json)).toContain('tea please')
    expect(sayCompleteCheck(d)('Tea, please!')).toBe(true)
    expect(sayCompleteCheck(d)('tea')).toBe(false)
    expect(pickEngine({ phrase: d.phrase, free: !!(d.pattern || d.open), loaded: true, libReady: true, cached: true }).engine).toBe('vosk')
  })
  it('ключевые слова без ответов → открытый ответ: системное распознавание, не Vosk', () => {
    const d = voiceSayData({ ...say, task: { ...say.task, answers: [], accept: [], keywords: [] } })
    expect(d.grammar).toEqual([])
    expect(d.open).toBe(true)
    expect(pickEngine({ phrase: d.phrase, free: d.open, loaded: true, libReady: true, cached: true }).engine).toBe('system')
  })
  it('гипотезы → checkSpeechAnswer через judgeRun (мок распознавателя)', () => {
    const d = voiceSayData(say)
    const run = text => judgeRun({ final: { text }, alternatives: [{ text }] }, d)
    expect(run('i like tea')).toMatchObject({ passed: true, heard: 'i like tea', best: 'I like tea' })
    const bad = run('banana')
    expect(bad.passed).toBe(false)
    expect(bad.heard).toBe('banana')
    expect(run('[unk]').heard).toBe('')
    expect(voiceVerdict(say.task, say.line, []).passed).toBe(false)
  })
  it('repeat: эталон — текст реплики', () => {
    const d = voiceSayData(repeat)
    expect(d.phrase).toBe('i like tea a lot')
    expect(d.open).toBe(false)
    const text = repeat.line.text
    expect(voiceVerdict(repeat.task, repeat.line, [text]).passed).toBe(true)
  })
})

describe('недоступность микрофона / движка → пропуск', () => {
  const perm = action => ({ decide: () => ({ action }), refresh: () => Promise.resolve() })
  it('fallback sayPermission (Firefox, нет распознавания, отказ) → панель не показывается', () => {
    expect(voiceTaskAvailable(perm('fallback'))).toBe(false)
    expect(voiceTaskAvailable(perm('listen'))).toBe(true)
    expect(voiceTaskAvailable(perm('explain'))).toBe(true)
  })
  it('прогрев: нет микрофона — не греем; иначе общий путь sayLessonWarm и чанк панели, отмена освобождает', async () => {
    const stop = vi.fn()
    const load = vi.fn(() => Promise.resolve({ startLessonWarm: () => stop }))
    const loadPanel = vi.fn(() => Promise.resolve())
    expect(warmVoiceTask({ perm: perm('fallback'), load, loadPanel })).toBeNull()
    expect(load).not.toHaveBeenCalled()
    const cancel = warmVoiceTask({ perm: perm('listen'), load, loadPanel })
    expect(loadPanel).toHaveBeenCalled()
    await Promise.resolve(); await Promise.resolve()
    cancel()
    expect(stop).toHaveBeenCalled()
  })
  it('silenceScene: пауза и возврат желания «продолжить» на последней реплике', () => {
    const api = { pause: vi.fn(), play: vi.fn() }
    silenceScene(api, 3)
    expect(api.pause).toHaveBeenCalled()
    expect(api.play).toHaveBeenCalledWith(2)
    expect(() => silenceScene(null, 3)).not.toThrow()
  })
})

describe('разметка панели', () => {
  it('repeat до ответа: вопрос, текст реплики, микрофон-слот, «Не могу говорить», «Спроси позже»', () => {
    const html = sheet({ stage: <i data-testid="stage" /> })
    expect(html).toContain('Повтори за Барсик')
    expect(html).toContain('data-testid="voice-line"')
    expect(html).toContain('Hello there')
    expect(html).toContain('data-testid="stage"')
    expect(html).toContain('Не могу говорить')
    expect(html).toContain('Спроси позже')
    expect(html).toContain('data-kind="repeat"')
  })
  it('say: текста реплики нет; «слушаю» — кнопки гаснут, «Ещё раз» заблокирована', () => {
    const html = sheet({ kind: 'say', phase: 'listening' })
    expect(html).not.toContain('voice-line')
    expect(html).toContain('stVoiceBtnsHidden')
    expect(html).toMatch(/class="stReplay" disabled/)
  })
  it('первая неудача: «Не совсем» + подсказка + осталась попытка; тишина — «Не расслышал»', () => {
    const wrong = sheet({ wrong: true, note: 'wrong', attempt: 1, hint: 'Говори медленно' })
    expect(wrong).toContain('Не совсем. Подсказка: Говори медленно. Осталась ещё одна попытка')
    expect(sheet({ wrong: true, note: 'quiet' })).toContain('Не расслышал')
  })
  it('вердикт: ✓ Отлично + транскрипт; ✗ + ожидаемые фразы после 2-й неудачи; ✗ Не расслышал без транскрипта', () => {
    const ok = sheet({ phase: 'checked', ok: true, heard: 'Hello there' })
    expect(ok).toContain('✓ Отлично!')
    expect(ok).toContain('Ты сказал: «Hello there»')
    const bad = sheet({ phase: 'checked', heard: 'hallo', expected: ['Hello there', 'Hi there'] })
    expect(bad).toContain('✗ Не совсем')
    expect(bad).toContain('Твой ответ: «hallo»')
    expect(bad).toContain('Можно было сказать:')
    expect(bad).toContain('Hi there')
    const deaf = sheet({ phase: 'checked', heard: '' })
    expect(deaf).toContain('✗ Не расслышал')
    expect(deaf).not.toContain('Твой ответ')
  })
  it('тексты: отказ микрофона и недоступность; вердикт обрезает ожидаемое до трёх', () => {
    expect(voiceNote({ phase: 'ready', fallbackReason: 'denied' })).toBe(VOICE_DENIED)
    expect(voiceNote({ phase: 'ready', fallbackReason: 'browser' })).toBe(VOICE_OFF)
    expect(voiceNote({ phase: 'ready' })).toBe('')
    expect(voiceVerdictView({ ok: false, heard: 'x', expected: ['a', 'b', 'c', 'd'] }).expected).toHaveLength(3)
  })
})

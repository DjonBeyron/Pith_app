import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TYPED_PAIRS } from '../../../canvas/nodeDefaults.js'
import { NODE_TYPES, TYPE_SHORT } from '../../../canvas/nodeTypes.js'
import { linkKind } from '../../../canvas/canvasLineStyle.js'
import { REWARD_TYPES, rewardNodes } from '../../lessonXp.js'
import { resolveModule } from '../../modules/index.js'
import { pickStepAnswer } from '../../admin/stepAnswer.js'
import { isTaskNode } from '../../../reviewCards/reviewCardCopy.js'
import { sayPromptNode } from '../../modules/say-phrase/sayPromptNode.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const playerPanels = read('../../PlayerPanels.jsx')
const lessonPlayer = read('../../LessonPlayer.jsx')
const panelNodes = read('../../usePlayerPanelNodes.js')
const css = read('../../../../styles/player/panels/say-phrase.css')
const indexCss = read('../../../../index.css')
const answerFields = read('../../../canvas/NodeAnswerFields.jsx')
const contentEditor = read('../../../canvas/NodeContentEditor.jsx')

describe('say_phrase — проводка (плеер)', () => {
  it('тип резолвится в модуль ленты; вопрос — текстовый пузырь с фразой и просьбой «Скажите фразу вслух»', () => {
    expect(resolveModule('say_phrase')).not.toBe(null)
    const n = sayPromptNode({ id: 'x', type: 'say_phrase' }, { phrase: 'I am here', translation: 'Я здесь' })
    expect(n.type).toBe('text')
    expect(n.typeData.text.content).toBe('I am here\nСкажите фразу вслух')
    expect(n.typeData.text).toMatchObject({ pro: true, proText: 'Я здесь' })
    expect(sayPromptNode({ id: 'x' }, { phrase: 'Hi', translation: '' }).typeData.text.pro).toBeUndefined()
  })

  it('usePlayerPanelNodes.js заводит kind "sp" на say_phrase, считает панель «ручной»; LessonPlayer пробрасывает ноду и высоту', () => {
    expect(panelNodes).toContain("sp: 'say_phrase'")
    expect(panelNodes).toContain('node.pa || node.fb || node.tw || node.sp ||')
    expect(lessonPlayer).toContain('spNode={panels.node.sp}')
    expect(lessonPlayer).toContain("setSpPanelHeight={panels.setHeight('sp')}")
  })

  it('PlayerPanels.jsx: панель — только через ленивую обёртку (чанк), статического импорта панели и речевых модулей нет', () => {
    expect(playerPanels).toContain("import SayPhrasePanelLazy from './panels/say-phrase/SayPhrasePanelLazy.jsx'")
    expect(playerPanels).not.toMatch(/import SayPhrasePanel\b/)
    expect(playerPanels).not.toMatch(/shared\/lib\/speech/)
    const block = playerPanels.slice(playerPanels.indexOf('{spNode && ('), playerPanels.indexOf('{pcNode &&')).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(block).toContain('<SayPhrasePanelLazy')
    expect(block).toContain("onDone={trigger => { setSpPanelHeight(0); onNodeDone(spNode.id, trigger) }}")
    expect(block).toContain('handlePhraseAnswer(spNode.id, text, result, arriving)')
    expect(block).not.toContain('wrongRef') // речь не штрафуется
    expect(block).not.toContain('record(')  // и не пишет события анализа знаний
    expect(read('./SayPhrasePanelLazy.jsx')).toMatch(/lazy\(\(\) => lazyRetry\(\(\) => import\('\.\/SayPhrasePanel\.jsx'\)/)
    expect(playerPanels).toContain('startIdlePrewarm([prefetchSayPhrasePanel])')
  })

  it('награда XP: say_phrase в REWARD_TYPES; пара триггеров и вид связей', () => {
    expect(REWARD_TYPES).toContain('say_phrase')
    expect(rewardNodes([{ type: 'say_phrase', typeData: { say_phrase: {} } }])).toHaveLength(1)
    expect(rewardNodes([{ type: 'say_phrase', typeData: { say_phrase: { reward: false } } }])).toHaveLength(0)
    expect(TYPED_PAIRS.say_phrase).toEqual(['say_done', 'say_skip'])
    expect(linkKind('say_done')).toBe('correct')
    expect(linkKind('say_skip')).toBe('plain')
  })

  it('шаговый прогон админа: «верно» → say_done без ошибки; «неверно» → say_skip только если ветка соединена', () => {
    const node = { type: 'say_phrase', typeData: { say_phrase: { phrase: 'Hi there' } }, triggers: [{ if: 'say_done', then: 'a' }, { if: 'say_skip', then: null }] }
    expect(pickStepAnswer(node, true)).toMatchObject({ kind: 'phrase', correct: true, result: 'say_done', responseText: 'Hi there' })
    expect(pickStepAnswer(node, false)).toMatchObject({ correct: true, result: 'say_done', responseText: '' })
    const linked = { ...node, triggers: [{ if: 'say_done', then: 'a' }, { if: 'say_skip', then: 'b' }] }
    expect(pickStepAnswer(linked, false)).toMatchObject({ correct: true, result: 'say_skip' })
  })

  it('в повторение (колоды карточек) «Сказать фразу» не берётся', () => {
    expect(isTaskNode({ type: 'say_phrase' })).toBe(false)
    expect(isTaskNode({ type: 'type_word' })).toBe(true)
  })
})

describe('say_phrase — микрофон: только по тапу, минимум запросов', () => {
  const hook = panelSrc['useSayPhrase.js']

  it('recognition.start() зовётся ровно в одном месте — begin(), которое вызывают обработчики тапов', () => {
    expect(hook.match(/ctrl\.start\(/g)).toHaveLength(1)
    expect(hook).toMatch(/const begin = useCallback\(\(\) => \{[\s\S]*ctrl\.start\(/)
    // при монтировании и в эффектах start не вызывается
    expect(hook.slice(hook.indexOf('useEffect(() => {\n    let alive'), hook.indexOf('// Начать попытку'))).not.toContain('ctrl.start')
  })

  it('getUserMedia, режимы захвата B/C и постоянные потоки не используются; нет setInterval/localStorage вне sayPermission', () => {
    for (const [name, src] of Object.entries(panelSrc)) {
      const code = src.replace(/\/\/.*$/gm, '')
      expect(code, name).not.toMatch(/getUserMedia|speechCapture|setInterval|localStorage|sessionStorage/)
    }
  })

  it('урок не просит микрофон при старте: карточка запуска и плеер не знают про речь', () => {
    for (const rel of ['../../../lessons/LaunchPreloader.jsx', '../../LessonPlayer.jsx', '../../PlayerPanels.jsx']) {
      expect(read(rel)).not.toMatch(/SpeechRecognition|getUserMedia|sayPermission/)
    }
  })

  it('прерывание: сворачивание и pagehide гасят запись, панель при закрытии не держит микрофон', () => {
    expect(hook).toContain("document.addEventListener('visibilitychange'")
    expect(hook).toContain("window.addEventListener('pagehide'")
    expect(hook).toMatch(/return \(\) => \{[\s\S]*ctrl\.reset\(\)/)
  })

  it('аналитика идёт через track(), событий звука нет; перевод и пояснение — по тексту задания', () => {
    const panel = panelSrc['SayPhrasePanel.jsx']
    expect(panel).toContain("import { track } from '../../../../shared/lib/analytics/track.js'")
    expect(panel).toContain('onEvent: track')
    expect(read('../../../../shared/lib/speech/sayTexts.js')).toContain('Мы не записываем и не сохраняем звук')
  })
})

describe('say_phrase — CSS и редактор', () => {
  it('стили подключены; анимации только opacity/transform; без filter/blur/box-shadow; высота блоков постоянна', () => {
    expect(indexCss).toContain("@import './styles/player/panels/say-phrase.css';")
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/filter\s*:|blur\(|box-shadow\s*:|backdrop-filter/)
    const frames = [...code.matchAll(/@keyframes\s+(\w+)\s*\{([\s\S]*?)\}\s*\}/g)]
    expect(frames.length).toBeGreaterThan(0)
    for (const [, name, body] of frames) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map(m => m[1])
      expect(props.every(p => p === 'transform' || p === 'opacity'), name).toBe(true)
    }
    expect(css).toContain('.sayPhraseSpacer')
    expect(css).toMatch(/\.sayStage \{[^}]*height: 156px/)
    expect(css).toMatch(/\.sayActions \{[^}]*min-height: 46px/)
  })

  it('кнопки панели — .phraseCheckBtn без своих размеров (единый вид «Проверить»)', () => {
    expect(panelSrc['SayActions.jsx']).toContain('className="phraseCheckBtn"')
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\.phraseCheckBtn/)
  })

  it('редактор: тип в меню, короткая подпись, пикер в NodeAnswerFields, нет общего блока триггеров', () => {
    expect(NODE_TYPES.some(t => t.value === 'say_phrase')).toBe(true)
    expect(TYPE_SHORT.say_phrase).toBeTruthy()
    expect(answerFields).toContain("node.type === 'say_phrase'")
    expect(answerFields).toContain('<NodeSayPhrasePicker')
    expect(contentEditor).toContain("node.type !== 'say_phrase'")
  })
})

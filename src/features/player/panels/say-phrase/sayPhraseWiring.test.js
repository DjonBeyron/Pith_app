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
    expect(read('./SayPhrasePanelLazy.jsx')).toMatch(/lazyRetry\(\(\) => import\('\.\/SayPhrasePanel\.jsx'\)/)
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

describe('say_phrase — порядок появления, звук, попап, эквалайзер, админ', () => {
  const body = panelSrc['SayPhrasePanel.jsx']
  const hook = panelSrc['useSayPhrase.js']
  const popupCss = read('../../../../styles/player/panels/say-phrase-popup.css')
  const popup = panelSrc['SayMicPopup.jsx']

  it('панель монтируется ТОЛЬКО после паузы (не мигает): ленивая обёртка держит её за таймером panelDelayMs, чанк грузится сразу', () => {
    const lazyW = panelSrc['SayPhrasePanelLazy.jsx']
    expect(lazyW).toContain('panelDelayMs(showPhrase)')
    expect(lazyW).toContain('return timeUp && Panel ? <Panel.C {...props} /> : null')
    expect(lazyW).toContain("lazyRetry(() => import('./SayPhrasePanel.jsx'), 'say-phrase-panel')")
    expect(lazyW).toContain('clearTimeout(t)')
    expect(lazyW.replace(/\/\/.*$/gm, '')).not.toMatch(/Suspense|React\.lazy|\blazy\(/) // Suspense придерживает показ на ~300 мс
    expect(lazyW).not.toMatch(/speechController|sayFlow|sayPermission/) // код распознавания в основной чанк не тянем
    expect(read('../../../../shared/lib/speech/sayPanelDelay.js')).toContain('export const SAY_PANEL_DELAY_MS = 1500')
    expect(read('../../../../shared/lib/speech/sayPanelDelay.js')).not.toMatch(/^import /m)
  })

  it('SayPhraseModule: фраза в чате по showPhrase (по умолчанию да), раскраска слов из sayChatTones', () => {
    const mod = read('../../modules/say-phrase/SayPhraseModule.jsx')
    expect(mod).toContain('raw?.showPhrase !== false')
    expect(mod).toContain('useChatTones(')
    expect(body).toContain('setChatTones(node.id')
  })

  it('звук: при проверке голосом приложение не играет answer-correct (только «Получилось»/админ); других Audio/playSound нет', () => {
    expect(body).toContain("if (kind !== 'passed') playSound('answer-correct'")
    expect(body.match(/playSound\(/g)).toHaveLength(1)
    for (const [name, src] of Object.entries(panelSrc)) {
      if (name === 'sayListen.js') continue // «Послушать» — по тапу, не в момент результата
      expect(src.replace(/\/\/.*$/gm, ''), name).not.toMatch(/new Audio\(|\.play\(\)/)
    }
  })

  it('после финального результата движок гасится abort() (endOnFinal), а не stop()', () => {
    expect(hook).toContain("endOnFinal: 'abort'")
  })

  it('пояснение про микрофон — отдельный попап (портал в body), а не блок в панели; start() — только в тапе «Понятно»', () => {
    expect(body).toContain('<SayMicPopup')
    expect(body).toContain('useHudPopupExit(phase ===')
    expect(popup).toContain('createPortal(')
    expect(popup).toContain('onClick={onConfirm}')
    expect(panelSrc['SayActions.jsx']).not.toContain('EXPLAIN_BTN')
    expect(hook).toMatch(/const confirmExplain = useCallback\(\(\) => \{ perm\.markExplained\(\); begin\(\) \}/)
  })

  it('попап: пружина открытия, схлопывание как у худа, затемнение отдельным слоем; без blur/backdrop-filter/теней', () => {
    expect(popupCss).toContain('animation: popSpringIn 0.45s backwards')
    expect(popupCss).toContain('animation: hudPopOut 0.34s')
    expect(popupCss).toContain('hudPopFlood')
    expect(popupCss).toMatch(/\.sayPopDim \{[^}]*background: rgba\(0, 0, 0, 0\.62\)/)
    expect(popupCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/filter\s*:|blur\(|box-shadow\s*:|backdrop-filter/)
    expect(indexCss).toContain("@import './styles/player/panels/say-phrase-popup.css';")
    expect(popup).toContain('sayPopDim')
    expect(popup).toContain('sayPopCard--out')
  })

  it('«Я не могу говорить»: по центру, подчёркнута, без рамки/фона, ≥44px', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toMatch(/\.sayFoot \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/)
    const skip = code.match(/\.saySkipLink \{[^}]*min-height: 44px[^}]*\}/)[0]
    expect(skip).toContain('text-decoration: underline')
    expect(skip).toMatch(/text-underline-offset: 3px/)
    expect(code).toMatch(/\.sayLink,\s*\.saySkipLink \{[^}]*background: none;[^}]*border: 0/)
    expect(panelSrc['SayActions.jsx']).toContain('CANT_SPEAK_LINK')
  })

  it('эквалайзер: на время попытки принудительно включён и получает синтетический уровень; rAF и getUserMedia в модуле нет', () => {
    expect(hook).toContain('forceEqualizer()')
    expect(hook).toContain("publishLevel(VOICE_SOURCE")
    expect(hook).toContain('onSignal: kind => voice.signal(kind, nowMs())')
    expect(hook).toMatch(/unmount|stopEq\(eq, voice\)/)
    for (const [name, src] of Object.entries(panelSrc)) expect(src.replace(/\/\/.*$/gm, ''), name).not.toMatch(/requestAnimationFrame\(\(\) => .*level|AnalyserNode|AudioContext/)
    expect(read('../../AudioGlowGate.jsx')).toContain('useEqualizerEnabled()')
    expect(read('../../lessonPrefs.js')).toContain('equalizerOn(pref, isForced ? 1 : 0)')
  })

  it('распознанный текст — только админу: панель берёт строку из adminHeardLine, обычная раскладка текста не знает', () => {
    expect(body).toContain('adminHeardLine({ isAdmin, phase, view })')
    expect(body).toContain('{isAdmin && (')
    for (const name of ['SayStage.jsx', 'SayActions.jsx', 'SayPhrasePanelLazy.jsx']) expect(panelSrc[name]).not.toMatch(/interim|heard|lastInterim/)
    expect(panelSrc['SayStage.jsx']).not.toContain('say-heard')
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
    expect(css).toMatch(/\.sayLabel \{[^}]*height: 22px/)
    expect(css).toMatch(/\.sayStage \{[^}]*height: 94px/)
    expect(css).toMatch(/\.sayMicBtn \{[^}]*height: 52px/)
    expect(css).toMatch(/\.sayInfo \{[^}]*height: 34px/)
    expect(css).toMatch(/\.sayActions \{[^}]*min-height: 46px/)
    expect(css).toMatch(/\.sayFoot \{[^}]*min-height: 44px/)
  })

  it('кнопки панели — .phraseCheckBtn без своих размеров (единый вид «Проверить»)', () => {
    expect(panelSrc['SayActions.jsx']).toContain('className="phraseCheckBtn"')
    expect(panelSrc['SayStage.jsx']).toContain('phraseCheckBtn sayMicBtn')
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

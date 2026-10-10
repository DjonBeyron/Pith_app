import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TYPED_PAIRS } from '../../../canvas/nodeDefaults.js'
import { linkKind } from '../../../canvas/canvasLineStyle.js'
import { REWARD_TYPES, rewardNodes } from '../../lessonXp.js'
import { resolveModule } from '../../modules/index.js'
import { pickStepAnswer } from '../../admin/stepAnswer.js'
import { isTaskNode } from '../../../reviewCards/reviewCardCopy.js'

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

describe('say_phrase — проводка (плеер)', () => {
  it('тип резолвится в модуль ленты; сам модуль в чат НИЧЕГО не пишет — только ответ ученика (AnswerBubbles)', () => {
    expect(resolveModule('say_phrase')).not.toBe(null)
    const mod = read('../../modules/say-phrase/SayPhraseModule.jsx').replace(/\/\/.*$/gm, '')
    expect(mod).toContain('<AnswerBubbles')
    expect(mod).not.toMatch(/TextModule|sayPromptNode|useChatTones|showPhrase/)
    for (const gone of ['sayPromptNode.js', 'sayPromptNode.test.js', 'sayChatTones.js']) {
      expect(existsSync(fileURLToPath(new URL(`../../modules/say-phrase/${gone}`, import.meta.url))), gone).toBe(false)
    }
    expect(existsSync(fileURLToPath(new URL('../../../../shared/lib/speech/sayPanelDelay.js', import.meta.url)))).toBe(false)
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
    expect(TYPED_PAIRS.say_phrase).toEqual(['say_done', 'say_wrong'])
    expect(linkKind('say_done')).toBe('correct')
    expect(linkKind('say_wrong')).toBe('wrong')
    expect(linkKind('say_skip')).toBe('wrong') // старое имя второго выхода читается как «неверный»
  })

  it('шаговый прогон админа: «верно» → say_done, «неверно» → say_wrong (без штрафа урока; соединён ли выход — решает плеер, sayPairSkip.sayExit)', () => {
    const node = { type: 'say_phrase', typeData: { say_phrase: { phrase: 'Hi there' } }, triggers: [{ if: 'say_done', then: 'a' }, { if: 'say_wrong', then: null }] }
    expect(pickStepAnswer(node, true)).toMatchObject({ kind: 'phrase', correct: true, result: 'say_done', responseText: 'Hi there' })
    expect(pickStepAnswer(node, false)).toMatchObject({ correct: true, result: 'say_wrong', responseText: '' })
    const linked = { ...node, triggers: [{ if: 'say_done', then: 'a' }, { if: 'say_wrong', then: 'b' }] }
    expect(pickStepAnswer(linked, false)).toMatchObject({ correct: true, result: 'say_wrong' })
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

  it('панель поднимается сразу, как у других модулей: ни задержки 1,5/0,4 с, ни SAY_PANEL_DELAY, ни showPhrase; чанк грузится сразу', () => {
    const lazyW = panelSrc['SayPhrasePanelLazy.jsx']
    const code = lazyW.replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/setTimeout|timeUp|panelDelay|SAY_PANEL|showPhrase/)
    expect(code).toContain('return Panel ? <Panel.C {...props} /> : null')
    expect(lazyW).toContain("lazyRetry(() => import('./SayPhrasePanel.jsx'), 'say-phrase-panel')")
    expect(code).not.toMatch(/Suspense|React\.lazy|\blazy\(/) // Suspense придерживает показ на ~300 мс
    expect(lazyW).not.toMatch(/speechController|sayFlow|sayPermission/) // код распознавания в основной чанк не тянем
    for (const [name, src] of Object.entries(panelSrc)) expect(src.replace(/\/\/.*$/gm, ''), name).not.toMatch(/showPhrase|sayChatTones|SAY_PANEL|sayPanelDelay/)
  })

  it('«Ещё раз» и «Получилось» удалены целиком: ни кнопок, ни самооценки, ни события say_phrase_self_ok, ни подсказок про них', () => {
    for (const [name, src] of Object.entries(panelSrc)) {
      const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(code, name).not.toMatch(/Ещё раз|Получилось|self_ok|selfOk|onSelfOk|onRetry|canRetry|MAX_TAPS/)
    }
    const texts = read('../../../../shared/lib/speech/sayTexts.js').replace(/\/\/.*$/gm, '')
    expect(texts).not.toMatch(/«Получилось»|«Ещё раз»/)
    expect(read('../../../../shared/lib/speech/sayResult.js')).not.toContain('self_ok')
  })

  it('звук: при проверке голосом приложение не играет answer-correct (только админская палочка); других Audio/playSound нет', () => {
    expect(body).toContain("if (kind === 'solve') playSound('answer-correct'")
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
    expect(hook).toMatch(/const confirmExplain = useCallback\(\(\) => \{ perm\.markExplained\(\); perm\.markPreShown\(\); begin\(\) \}/)
    expect(body).toContain('<SayMicPopup kind={sp.explainKind}')
    expect(popup).toContain("kind = 'full'")
    expect(popup).toContain('EXPLAIN_SHORT_TEXT')
    expect(popup).toContain('EXPLAIN_SHORT_BTN')
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

  it('«Я не могу говорить»: по центру, подчёркнута, приглушена (opacity ≈ 0.45–0.5), без рамки/фона, опущена к низу корпуса (≈7px текста от края), зона касания шире текста', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toMatch(/\.sayFoot \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/)
    const skip = code.match(/\.saySkipLink \{[^}]*min-height: 30px[^}]*\}/)[0]
    expect(skip).toContain('text-decoration: underline')
    expect(skip).toMatch(/text-underline-offset: 3px/)
    const op = Number(skip.match(/opacity: (\.?[\d.]+)/)[1])
    expect(op).toBeGreaterThanOrEqual(0.45)
    expect(op).toBeLessThanOrEqual(0.5)
    expect(code).toMatch(/\.sayLink,\s*\.saySkipLink \{[^}]*background: none;[^}]*border: 0/)
    expect(panelSrc['SayActions.jsx']).toContain('CANT_SPEAK_LINK')
    // ряд опущен до низа .phraseInner (bottom −12px = нижний padding корпуса; safe-area лежит ещё ниже): отступ текста = (высота ряда − строка) / 2
    const foot = code.match(/\.sayFoot \{[^}]*\}/)[0]
    const bottom = Number(foot.match(/bottom: (-?\d+)px/)[1])
    const rowH = Number(foot.match(/height: (\d+)px/)[1])
    const lineH = Number(skip.match(/line-height: (\d+)px/)[1])
    expect(bottom).toBe(-12)
    const gap = (rowH - lineH) / 2
    expect(gap).toBeGreaterThanOrEqual(6)
    expect(gap).toBeLessThanOrEqual(8)
    expect(code).toMatch(/\.saySkipLink::after \{ content: ''; position: absolute; inset: -14px/)
  })

  it('распознанный текст — только админу: строка из reducer (sayFlow.adminLine), панель показывает её только при isAdmin, плашка ВНЕ раскладки', () => {
    expect(body).toContain('const adminLine = isAdmin ? sp.adminLine : null')
    expect(body).toContain('{adminLine && (')
    expect(read('../../../../shared/lib/speech/sayFlow.js')).toContain('adminHeardLine({ isAdmin: true')
    for (const name of ['SayStage.jsx', 'SayActions.jsx', 'SayPhrasePanelLazy.jsx']) expect(panelSrc[name]).not.toMatch(/interim|heard|lastInterim/)
    // плашка лежит в панели ДО корпуса (.phraseInner), а не внутри него, и в CSS абсолютная над панелью
    expect(body.indexOf('sayAdminLine')).toBeLessThan(body.indexOf('phraseInner'))
    const admin = css.match(/\.sayAdminLine \{[^}]*\}/)[0]
    expect(admin).toMatch(/position: absolute/)
    expect(admin).toMatch(/bottom: calc\(100% \+ 8px\)/)
    expect(admin).toMatch(/pointer-events: none/)
    expect(admin).not.toMatch(/(^|[^-])\bheight:/m) // высоты не резервирует (line-height — это не высота блока)
  })

  it('звуки приложения: окно тишины на попытку (soundQuiet), тап по микрофону не запускает разблокировку звука', () => {
    expect(hook).toContain("import { holdSoundQuiet } from '../../../../shared/lib/soundQuiet.js'")
    expect(hook).toMatch(/if \(!q\.release\) q\.release = holdSoundQuiet\(\)/)
    expect(hook).toContain("import { QUIET_TAIL_MS } from '../../../../shared/lib/speech/sayHints.js'")
    expect(read('../../../../shared/lib/speech/sayHints.js')).toContain('QUIET_TAIL_MS = 600')
    expect(panelSrc['SayStage.jsx']).toContain('data-no-unlock=""')
    expect(read('../../../../shared/lib/sounds.js')).toContain("suppressSound(name, () => playSound(name, where, opts))")
    expect(read('../../../../shared/lib/sounds.js')).toContain("closest?.('[data-no-unlock]')")
    expect(read('../../../../shared/lib/primedAudio.js')).toContain("closest?.('[data-no-unlock]')")
    expect(read('../../../../shared/lib/soundQuiet.js')).not.toMatch(/^import /m)
  })

  it('«Не могу говорить» и два выхода: итог say_cant без флага сессии; плеер решает в sayPairSkip.sayExit (крошечный sayTriggers.js без импортов)', () => {
    expect(body).not.toContain('setCantSpeakSession')
    expect(body).not.toContain('sessionStorage')
    expect(read('../../useGraphPlayer.js')).toContain("from './sayPairSkip.js'")
    expect(read('../../useGraphPlayer.js')).toContain('sayExit(nodeMapRef.current, node, result)')
    expect(read('../../useGraphPlayer.js')).not.toMatch(/sayRevealJump|saySuccessSkip|applySayJump/)
    expect(read('../../sayPairSkip.js').replace(/\/\/.*$/gm, '')).not.toMatch(/sayPermission|SpeechRecognition|sessionStorage|isCantSpeakSession/)
    expect(read('../../../../shared/lib/speech/sayTriggers.js')).not.toMatch(/^import /m)
    expect(read('../../../../shared/lib/speech/cantSpeakFlag.js')).not.toMatch(/^import /m)
  })
})

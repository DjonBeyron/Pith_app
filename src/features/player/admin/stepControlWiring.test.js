import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const GRAPH  = read('../useGraphPlayer.js')
const PANELS = read('../PlayerPanels.jsx')
const MEDIA  = read('../useMediaPause.js')
const FROZEN = read('../playerFrozen.js')
const TYPING = read('../PlayerTypingText.jsx')
const STUB   = read('../useMissingMediaFallback.js')
const PLAYER = read('../LessonPlayer.jsx')

// Пошаговый режим держится на нескольких связях в разных файлах. Тест
// фиксирует их по живому коду: если связь порвётся при рефакторинге, пауза
// или шаг назад тихо перестанут работать — заметить это в интерфейсе трудно.
describe('пауза замораживает всю цепочку', () => {
  it('переход не назначается, пока стоит пауза — он запоминается', () => {
    expect(GRAPH).toContain('if (pausedRef.current && !force)')
    expect(GRAPH).toContain("scheduledRef.current = { type: 'reveal', nodeId: nextNodeId }")
    expect(GRAPH).toContain("scheduledRef.current = { type: 'timer', nodeId: node.id }")
  })

  it('снятие паузы доигрывает то, что было запланировано', () => {
    const eff = GRAPH.slice(GRAPH.indexOf('pausedRef.current = paused'))
    expect(eff).toContain('clearTimers()')
    expect(eff).toContain('scheduleReveal.current(planned.nodeId)')
    expect(eff).toContain('activateTimerTrigger.current(n)')
  })

  it('медиа глушится по всему плееру и не может запуститься само', () => {
    expect(MEDIA).toContain("querySelectorAll('audio, video')")
    expect(MEDIA).toContain("el.addEventListener('play', block, true)")
    expect(MEDIA).toContain('stoppedRef.current.forEach')
  })

  it('печать текста и заглушка нод без файла знают про заморозку', () => {
    expect(TYPING).toContain('const frozen = usePlayerFrozen()')
    expect(TYPING).toContain('if (isControlled || frozen) return')
    expect(STUB).toContain('if (!active || frozen || firedRef.current) return')
  })

  it('провайдер заморозки оборачивает весь плеер', () => {
    expect(FROZEN).toContain('export const PlayerFrozenContext')
    expect(PLAYER).toContain('<PlayerFrozenContext.Provider value={stepState.frozen}>')
  })
})

describe('переходы, которые пауза могла бы потерять', () => {
  // Баг: пауза, пришедшая в эти миллисекунды, убивала таймер вместе с
  // переходом — повторного «доиграло» от модуля уже не будет, и цепочка
  // вставала навсегда даже после снятия паузы
  it('офсет played и «таймер после показа» помечаются запланированными', () => {
    expect(GRAPH).toContain('scheduleAfter.current(offset, t.then)')
    expect(GRAPH).toContain('scheduleAfter.current(tap.ms ?? 3000, tap.then)')
    const fn = GRAPH.slice(GRAPH.indexOf('scheduleAfter.current = ('))
    expect(fn).toContain("scheduledRef.current = { type: 'reveal', nodeId: nextNodeId }")
    expect(fn.indexOf('scheduledRef.current =')).toBeLessThan(fn.indexOf('if (pausedRef.current) return'))
  })
})

describe('шаг вперёд отыгрывает показанное сообщение', () => {
  // Баг: на паузе звук заглушён, а текст голосового печатается синхронно с
  // ним — сообщение появлялось пустым пузырём
  it('шаг снимает заморозку, оставляя паузу цепочки', () => {
    const ctrl = read('./usePlayerStepControl.js')
    expect(ctrl).toContain('unfreeze: () => setFrozen(false)')
    const fwd = ctrl.slice(ctrl.indexOf('forward()'))
    expect(fwd.indexOf('state.unfreeze()')).toBeLessThan(fwd.indexOf('graph.revealNow()'))
  })

  it('блокируется только то, что звучало на момент заморозки', () => {
    expect(MEDIA).toContain('const known = new Set(el.querySelectorAll')
    expect(MEDIA).toContain('if (known.has(e.target)) e.target.pause?.()')
  })

  it('пропущенное сообщение не воскресает при «продолжить»', () => {
    expect(PLAYER).toContain('forgetPaused()')
    expect(read('./usePlayerStepControl.js')).toContain('c.onSkipMedia(); makeStepActions(c).forward()')
    expect(MEDIA).toContain('forgetPaused: () => { stoppedRef.current = [] }')
  })
})

describe('шаг вперёд', () => {
  it('показывает уже назначенный переход немедленно', () => {
    const fn = GRAPH.slice(GRAPH.indexOf('const revealNow'))
    expect(fn).toContain('const planned = scheduledRef.current')
    expect(fn).toContain('revealNode(next)')
  })

  it('звук пропущенного сообщения глушится — иначе голоса наложатся', () => {
    expect(PLAYER).toContain('onSkipMedia: () => { pauseAllMedia(playerRef.current); forgetPaused() }')
    expect(MEDIA).toContain('export function pauseAllMedia(el)')
  })

  it('force доходит до всех веток перехода, включая офсет и таймер после показа', () => {
    expect(GRAPH).toContain('if (offset > 0 && !force)')
    expect(GRAPH).toContain('if (force) scheduleReveal.current(tap.then, true)')
    expect(GRAPH).toContain('scheduleReveal.current(vt.then, force)')
  })
})

describe('конец урока в прогоне из канваса', () => {
  it('итоги не показываются и в схему модуля не выкидывает', () => {
    const fn = PLAYER.slice(PLAYER.indexOf('function finishSummary()'))
    const guard = fn.slice(0, fn.indexOf('setTimeout('))
    expect(guard).toContain('if (edit) {')
    expect(guard).toContain('return')
  })

  it('заодно ничего не начисляется — прогон автора не трогает прогресс', () => {
    const fn = PLAYER.slice(PLAYER.indexOf('function finishSummary()'))
    const guard = fn.slice(0, fn.indexOf('setTimeout('))
    // выход из функции стоит ДО начислений и записи статистики
    expect(guard).not.toContain('completeLesson')
    expect(guard).not.toContain('saveAnswerEvents')
    expect(guard).not.toContain('setShowSummary')
  })

  it('обычное прохождение итоги показывает как раньше', () => {
    expect(PLAYER).toContain('setShowSummary(true)')
    expect(PLAYER).toContain('onSummaryClose ?? onClose')
  })
})

describe('выход к ноде и вид панели', () => {
  const PANEL = read('./PlayerAdminPanel.jsx')
  const BAR   = read('./PlayerStepBar.jsx')
  const BOARD = read('../../canvas/useCanvasBoardApi.js')
  const PAGE  = read('../../canvas/CanvasPage.jsx')

  it('кнопка «к ноде» закрывает прогон и ставит ноду в центр холста', () => {
    expect(BAR).toContain('onClick={onExitToNode}')
    expect(PANEL).toContain('onExitToNode={() => onExitToNode?.(node.id)}')
    expect(PLAYER).toContain('onExitToNode={edit.onExitToNode}')
    const fn = PAGE.slice(PAGE.indexOf('const handleExitToNode'))
    expect(fn).toContain('setShowPlayer(false)')
    expect(fn).toContain('boardApiRef.current?.focusNode(id)')
  })

  it('нода на холсте центрируется, выделяется и секунду светится одна', () => {
    expect(BOARD).toContain('focusNode(nodeId)')
    expect(BOARD).toContain('selectOnly(node.id)')
    expect(BOARD).toContain('setSpotlightId(node.id)')
    expect(BOARD).toContain('setTimeout(() => setSpotlightId(null), SPOTLIGHT_MS)')
    const FEED_CSS = read('../../../styles/canvas/spotlight.css')
    // тускнеет быстро, возвращается плавно — переходы разной длительности
    expect(FEED_CSS).toContain('transition: opacity 0.55s ease')
    expect(FEED_CSS).toContain('transition: opacity 0.12s ease')
    expect(read('../../canvas/CanvasBoard.jsx'))
      .toContain("spotlightId === node.id ? ' canvasNodeWrapperSpot' : ''")
  })

  it('в панели есть блок «Если/Тогда» — свёрнутый, и рамка медиа как в ноде', () => {
    expect(PANEL).toContain('collapsibleTriggers')
    expect(PANEL).toContain('useState(false)')
    expect(PANEL).not.toContain('collapsibleMedia')
  })

  it('видимый карандаш всегда один — тот, что под курсором', () => {
    const CSS = read('../../../styles/player/admin-edit.css')
    expect(CSS).toContain('.nodeEditPencil:focus-visible { opacity: 1; }')
    expect(CSS).not.toContain('.nodeEditPencilOn { opacity: 1; }')
    expect(CSS).toContain('.playerMsgSlotActive::before')
    const FEED = read('../PlayerFeedNodes.jsx')
    expect(FEED).toContain("adminEdit.editId === node.id ? ' playerMsgSlotActive' : ''")
  })
})

describe('шаг назад', () => {
  it('снимает последнее сообщение и забывает сработавшие триггеры обеих нод', () => {
    const fn = GRAPH.slice(GRAPH.indexOf('const stepBack'))
    expect(fn).toContain('if (prev.length <= 1) return null')
    expect(fn).toContain('firedRef.current.delete(key)')
    expect(fn).toContain('finishedRef.current = false')
    expect(fn).toContain('setVisibleNodes(p => p.slice(0, -1))')
  })

  it('панель ответа пересобирается по epoch — иначе вопрос второй раз не покажется', () => {
    expect(PANELS).toContain('epoch = 0,')
    expect(PANELS).toContain('key={`${wcNode.id}:${epoch}`}')
    expect(PANELS).toContain('key={`${paNode.id}:${epoch}`}')
    expect(PANELS).toContain('key={`${pcNode.id}:${epoch}`}')
    expect(PANELS).toContain('key={`${tableNode.id}:${epoch}`}')
  })

  it('откат за финиш урока убирает экран итогов', () => {
    expect(PLAYER).toContain('onHideSummary: () => setShowSummary(false)')
    expect(read('./usePlayerStepControl.js')).toContain('c.onHideSummary(); makeStepActions(c).back()')
  })

  it('после отката встаём на паузу — иначе чат замер бы молча', () => {
    const ctrl = read('./usePlayerStepControl.js')
    expect(ctrl).toContain('state.pause()')
    expect(ctrl).toContain('pause: () => { setPaused(true); setFrozen(true) }')
  })

  it('неверный шаг считается ошибкой урока, откат её снимает', () => {
    const ctrl = read('./usePlayerStepControl.js')
    expect(ctrl).toContain('if (!a.correct) onCountWrong()')
    expect(ctrl).toContain('wasAnsweredWrong(answers, node.id)')
    expect(PLAYER).toContain('onCountWrong: () => { wrongRef.current += 1 }')
    expect(PLAYER).toContain('if (wasWrong) wrongRef.current = Math.max(0, wrongRef.current - 1)')
  })

  it('откат чистит ответы, отметку «мгновенная нода отыграла» и XP', () => {
    const ctrl = read('./usePlayerStepControl.js')
    expect(ctrl).toContain('answers.resetNode(node.id)')
    expect(ctrl).toContain('onRollbackNode(node.id, wasAnsweredWrong(answers, node.id))')
    expect(PLAYER).toContain('instantDoneRef.current.delete(nodeId)')
    expect(PLAYER).toContain('earnedXpRef.current = Math.max(0, earnedXpRef.current - xp)')
  })
})

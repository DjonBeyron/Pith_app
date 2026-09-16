import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Нет testing-library/jsdom в этом проекте (см. CLAUDE.md/задачу) — компонент
// не рендерим. Вместо этого проверяем ИСХОДНЫЙ ТЕКСТ: сигналы ошибок (см.
// PROJECT.md) требуют, чтобы конкретные пропсы дошли по цепочке компонентов —
// тот же приём, что и у других «проводных» тестов в этом репозитории (напр.
// replyWiring.test.js у replyToSeq): по строке в файле видно, что провод не
// потерян при правке.
//
// Правка 2026-09-15: SignalOverlay.jsx (самодельный рендер по типу ноды,
// критика автора — «сигнал должен выглядеть как обычное сообщение») удалён.
// Сигнал теперь рендерится ТЕМ ЖЕ PlayerMessage/resolveModule, что и вся
// остальная лента, — см. useSignalMessages.js. Отдельный PlayerSignalMessages.jsx
// тоже удалён следующей правкой (та же дата): сигнал не просто «после ленты»,
// а встаёт на своё хронологическое место среди обычных нод (см.
// shared/lib/feedOrder.js) — рендерит его сам PlayerFeedNodes.jsx. Эти тесты
// проверяют новую цепочку: панель → onSignalFired → LessonPlayer → лента, и
// что freeze/blinkIndex (useSignalState.js) остались нетронуты.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('сигналы ошибок — сигнал играет сообщением в ленте, не оверлеем', () => {
  it('SignalOverlay.jsx удалён — старого самодельного рендера по типу больше нет', () => {
    expect(() => read('./SignalOverlay.jsx')).toThrow()
  })

  it('PlayerSignalMessages.jsx удалён — сигнал рендерит сам PlayerFeedNodes.jsx на своём месте в ленте', () => {
    expect(() => read('../../PlayerSignalMessages.jsx')).toThrow()
  })

  it('useSignalMessages.js копит сработавшие сигналы (с afterVisibleCount) и умеет их отпускать', () => {
    const src = read('../../useSignalMessages.js')
    expect(src).toContain('export function useSignalMessages')
    expect(src).toContain('const fire = useCallback')
    expect(src).toContain('setItems(prev => [...prev, { key, node, afterVisibleCount }])') // сообщение остаётся в ленте навсегда
  })

  it('useSignalMessages.js — каждая нода-сигнал срабатывает один раз за урок (firedNodeIds/hasFired)', () => {
    const src = read('../../useSignalMessages.js')
    expect(src).toContain('const firedNodeIds = useRef(new Set())')
    expect(src).toContain('const hasFired = useCallback(nodeId => firedNodeIds.current.has(nodeId)')
    expect(src).toMatch(/if \(firedNodeIds\.current\.has\(node\.id\)\) return/)
    expect(src).toContain('hasFired')
  })

  it('feedOrder.js вставляет сигнал в ленту по afterVisibleCount, а не жёстко в хвост', () => {
    const src = read('../../../../shared/lib/feedOrder.js')
    expect(src).toContain('export function mergeFeedOrder')
    expect(src).toContain('afterVisibleCount')
  })

  it('PlayerFeedNodes.jsx рендерит сигнал через PlayerMessage/resolveModule — без свитча по node.type', () => {
    const src = read('../../PlayerFeedNodes.jsx')
    const renderSignal = src.slice(src.indexOf('function renderSignal'), src.indexOf('return (\n    <>'))
    expect(src).toContain('mergeFeedOrder')
    expect(renderSignal).toContain('<PlayerMessage')
    expect(renderSignal).not.toMatch(/node\.type\s*===/) // никакого «text/audio/photo/...» вручную для сигнала
  })

  it('LessonPlayer заводит useSignalMessages, прокидывает signalItems в ленту и якорит сигнал на exerciseNodeId через fireForExercise (не на длину visibleNodes)', () => {
    const src = read('../../LessonPlayer.jsx')
    expect(src).toContain('useSignalMessages()')
    expect(src).toMatch(/<PlayerFeedNodes[\s\S]{0,600}signalItems=\{signalMessages\.items\}/)
    expect(src).toMatch(/<PlayerPanels[\s\S]{0,900}onSignalFired=\{\(node, release, exerciseNodeId\) =>\s*\n\s*signalMessages\.fireForExercise\(node, release, exerciseNodeId, visibleNodes\)/)
    expect(src).toMatch(/<PlayerPanels[\s\S]{0,1200}hasSignalFired=\{signalMessages\.hasFired\}/)
  })

  it('useSignalMessages.fireForExercise находит индекс ноды упражнения в visibleNodes и вставляет сигнал ПЕРЕД её слотом', () => {
    const src = read('../../useSignalMessages.js')
    expect(src).toContain('const fireForExercise = useCallback((node, onReleased, exerciseNodeId, visibleNodes)')
    expect(src).toContain('visibleNodes.findIndex(n => n.id === exerciseNodeId)')
    expect(src).toMatch(/return \{ items, fire, fireForExercise, onMessageDone: release, hasFired \}/)
  })

  it('PlayerPanels пробрасывает nodes/onSignalFired/hasSignalFired в TableManualPanel и PhraseAssemblyPanel', () => {
    const src = read('../../PlayerPanels.jsx')
    expect(src).toMatch(/<PhraseAssemblyPanel[\s\S]{0,300}nodes=\{nodes\}/)
    expect(src).toMatch(/<PhraseAssemblyPanel[\s\S]{0,300}onSignalFired=\{onSignalFired\}/)
    expect(src).toMatch(/<PhraseAssemblyPanel[\s\S]{0,300}hasSignalFired=\{hasSignalFired\}/)
    expect(src).toMatch(/<TableManualPanel[\s\S]{0,400}nodes=\{nodes\}/)
    expect(src).toMatch(/<TableManualPanel[\s\S]{0,400}onSignalFired=\{onSignalFired\}/)
    expect(src).toMatch(/<TableManualPanel[\s\S]{0,600}hasSignalFired=\{hasSignalFired\}/)
  })

  it('TableManualPanel держит useSignalState (freeze/blinkIndex нетронуты), зовёт onSignalFired с id своей ноды и пробрасывает hasSignalFired в check — оверлей не рендерит', () => {
    const src = read('../table-manual/TableManualPanel.jsx')
    expect(src).toContain('useSignalState()')
    expect(src).toContain('signalState.freeze')
    expect(src).toContain('signalState.fire(slotIndex, signalNode)')
    expect(src).toContain('onSignalFired?.(signalNode, signalState.dismissOverlay, node.id)')
    expect(src).toMatch(/makeManualCheck\(\{[\s\S]{0,300}hasSignalFired/)
    expect(src).not.toContain('SignalOverlay')
  })

  it('manualCheck.js резолвит signalForSlot ПЕРЕД тем, как тратить попытку, и пропускает уже сработавший сигнал (hasSignalFired)', () => {
    const src = read('../table-manual/manualCheck.js')
    const signalIdx = src.indexOf('signalForSlot')
    const wrongCountIdx = src.indexOf('wrongCount.current += 1')
    expect(signalIdx).toBeGreaterThan(-1)
    expect(wrongCountIdx).toBeGreaterThan(-1)
    expect(signalIdx).toBeLessThan(wrongCountIdx)
    expect(src).toContain('if (found && !hasSignalFired?.(found.node.id))')
  })

  it('usePhraseAssembly принимает onSignalFired/hasSignalFired, зовёт их только на полном ответе и передаёт id своей ноды', () => {
    const src = read('../phrase-assembly/usePhraseAssembly.js')
    expect(src).toContain('useSignalState()')
    expect(src).toContain('onSignalFired')
    expect(src).toContain('hasSignalFired')
    expect(src).toContain('signalForSlot')
    // onSignalFired проверяется внутри if(full) — не на частичной сборке
    expect(src).toMatch(/if \(full\) \{[\s\S]*if \(found && !hasSignalFired\?\.\(found\.node\.id\)\)[\s\S]*onSignalFired\?\.\(found\.node, signalState\.dismissOverlay, node\.id\)/)
  })

  it('PhraseAssemblyPanel не рендерит оверлей, пробрасывает hasSignalFired и не шлёт статистику на result === "signal"', () => {
    const src = read('../phrase-assembly/PhraseAssemblyPanel.jsx')
    expect(src).not.toContain('SignalOverlay')
    expect(src).toContain('onSignalFired')
    expect(src).toContain('hasSignalFired')
    expect(src).toMatch(/r === 'signal'/)
  })
})

describe('сигналы ошибок — редактор канваса (не менялось)', () => {
  it('NodeTablePicker и NodePhraseAssemblyPicker рендерят NodeSignalsPicker', () => {
    expect(read('../../../canvas/NodeTablePicker.jsx')).toContain('<NodeSignalsPicker')
    expect(read('../../../canvas/NodePhraseAssemblyPicker.jsx')).toContain('<NodeSignalsPicker')
  })

  it('CanvasBoard считает цели сигналов и рисует CanvasSignalConnections', () => {
    const src = read('../../../canvas/CanvasBoard.jsx')
    expect(src).toContain('collectSignalTargetIds')
    expect(src).toContain('<CanvasSignalConnections')
    expect(src).toMatch(/isSignalTarget=\{signalTargetIds\.has\(node\.id\)\}/)
  })

  it('CanvasNode красит шапку красным для isSignalTarget', () => {
    const src = read('../../../canvas/CanvasNode.jsx')
    expect(src).toContain('isSignalTarget')
    expect(src).toContain('SIGNAL_TARGET_COLOR')
  })
})

describe('сигналы ошибок — export/import (не менялось)', () => {
  it('exportLesson переводит signals[].ref во внешний ref (refOf)', () => {
    const src = read('../../../canvas/lesson-io/exportLesson.js')
    expect(src).toContain('exportSignals')
    expect(src).toContain('refOf.get(s.ref)')
  })

  it('importLesson резолвит signals[].ref обратно в id ноды урока (idByRef)', () => {
    const src = read('../../../canvas/lesson-io/importLesson.js')
    expect(src).toMatch(/data\.signals[\s\S]{0,120}idByRef\.get\(s\.ref\)/)
  })

  it('lessonSchema документирует signals у table и phrase_assembly', () => {
    const src = read('../../../canvas/lesson-io/lessonSchema.js')
    expect(src).toMatch(/phrase_assembly:[\s\S]*signals:/)
    expect(src).toMatch(/table:[\s\S]*signals:/)
  })
})

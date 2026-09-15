import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Нет testing-library/jsdom в этом проекте (см. CLAUDE.md/задачу) — компонент
// не рендерим. Вместо этого проверяем ИСХОДНЫЙ ТЕКСТ: сигналы ошибок (см.
// PROJECT.md) требуют, чтобы конкретные пропсы дошли по цепочке компонентов
// (nodes/lessonFiles от LessonPlayer до панелей ответа) — тот же приём, что
// и у других «проводных» тестов в этом репозитории (напр. replyWiring.test.js
// у replyToSeq): по строке в файле видно, что провод не потерян при правке.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('сигналы ошибок — nodes/lessonFiles доходят до панелей', () => {
  it('LessonPlayer передаёт nodes в PlayerPanels', () => {
    const src = read('../../LessonPlayer.jsx')
    expect(src).toMatch(/<PlayerPanels[\s\S]{0,300}nodes=\{nodes\}/)
  })

  it('PlayerPanels пробрасывает nodes/lessonFiles в TableManualPanel и PhraseAssemblyPanel', () => {
    const src = read('../../PlayerPanels.jsx')
    expect(src).toMatch(/<PhraseAssemblyPanel[\s\S]{0,300}nodes=\{nodes\}/)
    expect(src).toMatch(/<PhraseAssemblyPanel[\s\S]{0,300}lessonFiles=\{filesWithBlobs\}/)
    expect(src).toMatch(/<TableManualPanel[\s\S]{0,400}nodes=\{nodes\}/)
    expect(src).toMatch(/<TableManualPanel[\s\S]{0,400}lessonFiles=\{filesWithBlobs\}/)
  })

  it('TableManualPanel держит useSignalState и рендерит SignalOverlay', () => {
    const src = read('../table-manual/TableManualPanel.jsx')
    expect(src).toContain("useSignalState()")
    expect(src).toContain('<SignalOverlay')
    expect(src).toContain('signalState.freeze')
  })

  it('manualCheck.js резолвит signalForSlot ПЕРЕД тем, как тратить попытку', () => {
    const src = read('../table-manual/manualCheck.js')
    const signalIdx = src.indexOf('signalForSlot')
    const wrongCountIdx = src.indexOf('wrongCount.current += 1')
    expect(signalIdx).toBeGreaterThan(-1)
    expect(wrongCountIdx).toBeGreaterThan(-1)
    expect(signalIdx).toBeLessThan(wrongCountIdx)
  })

  it('usePhraseAssembly держит useSignalState и смотрит signalForSlot только на полном ответе', () => {
    const src = read('../phrase-assembly/usePhraseAssembly.js')
    expect(src).toContain('useSignalState()')
    expect(src).toContain('signalForSlot')
    // сигнал проверяется внутри if(full) — не на частичной сборке
    expect(src).toMatch(/if \(full\) \{[\s\S]*signalForSlot/)
  })

  it('PhraseAssemblyPanel рендерит SignalOverlay и не шлёт статистику на result === "signal"', () => {
    const src = read('../phrase-assembly/PhraseAssemblyPanel.jsx')
    expect(src).toContain('<SignalOverlay')
    expect(src).toMatch(/r === 'signal'/)
  })
})

describe('сигналы ошибок — редактор канваса', () => {
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

describe('сигналы ошибок — export/import', () => {
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

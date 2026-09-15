import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const signalsPicker = read('./NodeSignalsPicker.jsx')
const tablePicker = read('./NodeTablePicker.jsx')
const phraseAssemblyPicker = read('./NodePhraseAssemblyPicker.jsx')
const answerFields = read('./NodeAnswerFields.jsx')
const contentEditor = read('./NodeContentEditor.jsx')
const canvasNode = read('./CanvasNode.jsx')
const canvasBoardNode = read('./CanvasBoardNode.jsx')
const canvasBoard = read('./CanvasBoard.jsx')
const boardPointer = read('./useCanvasBoardPointer.js')
const signalPortDrag = read('./useCanvasSignalPortDrag.js')
const nodeOps = read('./useCanvasNodeOps.js')
const canvasPorts = read('./canvasPorts.js')
const signalConnections = read('./CanvasSignalConnections.jsx')

// У сигналов ошибок (signals[] на table/phrase_assembly) появился ВТОРОЙ
// способ назначить ref — перетаскиваемый порт на холсте, той же механикой,
// что у обычных переходов триггера (✓ Верно/✗ Неверно). Дропдаун
// NodeSignalsPicker.jsx продолжает работать как раньше — это ДОПОЛНИТЕЛЬНЫЙ
// вход в те же данные, а не замена. Тест проверяет всю цепочку проводки
// (измерение строк слотов → порт → CanvasBoard), а не поведение в браузере —
// в проекте нет рендера компонентов (testing-library/jsdom), см. CLAUDE.md.
describe('сигналы ошибок — порт на холсте (сквозная проводка)', () => {
  it('NodeSignalsPicker измеряет Y-центр каждой строки слота и поднимает офсеты', () => {
    expect(signalsPicker).toContain('useLayoutEffect')
    expect(signalsPicker).toContain('onSignalMeasure')
    expect(signalsPicker).toContain('rowRefs.current.set(slot.index, el)')
  })

  it('NodeTablePicker и NodePhraseAssemblyPicker пробрасывают onSignalMeasure в пикер', () => {
    for (const src of [tablePicker, phraseAssemblyPicker]) {
      expect(src).toContain('onSignalMeasure')
      expect(src).toContain('<NodeSignalsPicker')
    }
  })

  it('NodeAnswerFields пробрасывает onSignalMeasure обоим пикерам (table и phrase_assembly)', () => {
    expect(answerFields).toContain('onSignalMeasure')
    const tableBlock = answerFields.slice(answerFields.indexOf("node.type === 'table'"))
    expect(tableBlock).toContain('onSignalMeasure={onSignalMeasure}')
  })

  it('NodeContentEditor и CanvasNode доносят onSignalMeasure до CanvasBoardNode', () => {
    expect(contentEditor).toContain('onSignalMeasure')
    // CanvasNode оборачивает офсеты в (nodeId, offsets) — тот же приём, что у onTriggerMeasure
    expect(canvasNode).toContain('const handleSignalMeasure = offsets => onSignalMeasure?.(node.id, offsets)')
    // При выходе из max-режима меры сигналов тоже чистятся — не тянутся за нодой на следующий layout
    expect(canvasNode).toContain('handleSignalMeasure([])')
    expect(canvasBoardNode).toContain('onSignalMeasure={onSignalMeasure}')
  })

  it('CanvasBoard.jsx держит signalMeasures/signalDrag через useCanvasSignalPortDrag и кормит ими CanvasSignalConnections', () => {
    expect(canvasBoard).toContain("import { useCanvasSignalPortDrag } from './useCanvasSignalPortDrag.js'")
    expect(canvasBoard).toContain('useCanvasSignalPortDrag(')
    expect(canvasBoard).toContain('<CanvasSignalConnections')
    expect(canvasBoard).toContain('signalMeasures={signalMeasures}')
    expect(canvasBoard).toContain('signalDrag={signalDrag}')
    expect(canvasBoard).toContain('onSignalDragStart={startSignalDrag}')
  })

  it('клик по порту сигнала (без протяжки) создаёт ноду через insertSignalFromPort', () => {
    expect(nodeOps).toContain('function insertSignalFromPort(nodeId, slotIndex, type)')
    expect(canvasBoard).toContain('insertSignalFromPort')
    expect(canvasBoard).toContain('typeMenu.slotIndex != null')
  })

  it('useCanvasBoardPointer пробует обработчики сигнала в общей цепочке мыши доски', () => {
    expect(boardPointer).toContain('handleSignalMouseMove')
    expect(boardPointer).toContain('handleSignalMouseUp')
  })

  it('промах при протяжке сигнала удаляет запись слота целиком (в отличие от триггера, где then: null)', () => {
    expect(signalPortDrag).toContain('const signals = hit ? [...rest, { slot: slotIndex, ref: hit.id }] : rest')
  })

  it('canvasPorts.js даёт отдельную геометрию порта на слот (signalSlotAnchor), не общую точку на ноду', () => {
    expect(canvasPorts).toContain('export function signalSlotAnchor(node, slotIndex, signalMeasures)')
  })

  it('CanvasSignalConnections рисует порты только у развёрнутых (max) нод', () => {
    expect(signalConnections).toContain("node.size !== 'max'")
  })
})

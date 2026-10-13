import { useRef, useState, useCallback } from 'react'

const LIMIT = 30      // сколько правок хранит отмена
const BURST_MS = 700  // правки подряд в пределах этого времени — одна запись (набор текста не плодит сотни шагов)

const snapOf = n => (n ? { type: n.type, typeData: n.typeData, triggers: n.triggers } : null)

/**
 * Сессия окна замечания к ноде: отмена/повтор правок (до 30, хранятся ссылки на неизменяемые снимки — почти бесплатно), снимок «на момент открытия»
 * для кнопки «Закрыть» (отменяет всё сделанное в редакторе) и реестр сброса полей (reg), чтобы отложенный набор не терялся при отмене/повторе.
 */
export function useNoteSession(canvasRef, noteFor, setNoteFor) {
  const reg = useRef({ fns: new Set(), discard: false })
  const undoStack = useRef([])
  const redoStack = useRef([])
  const startSnap = useRef(null)
  const lastPush = useRef(0)
  const [rev, setRev] = useState(0) // растёт при отмене/повторе — поля редактора перечитывают данные ноды
  const [counts, setCounts] = useState({ u: 0, r: 0 })
  const sync = () => setCounts({ u: undoStack.current.length, r: redoStack.current.length })
  const getNode = useCallback(ref => canvasRef.current?.getNodes().find(n => n.id === ref), [canvasRef])
  const flushAll = () => { const had = reg.current.fns.size > 0; reg.current.fns.forEach(f => f()); return had }

  const open = ref => {
    undoStack.current = []; redoStack.current = []; lastPush.current = 0
    startSnap.current = snapOf(getNode(ref))
    sync()
  }
  const record = () => {
    const now = Date.now()
    if (now - lastPush.current > BURST_MS) {
      undoStack.current.push(snapOf(getNode(noteFor)))
      if (undoStack.current.length > LIMIT) undoStack.current.shift()
      redoStack.current = []
      sync()
    }
    lastPush.current = now
  }
  const patch = fn => { record(); canvasRef.current?.updateNode(noteFor, n => ({ typeData: { ...n.typeData, [n.type]: fn(n.typeData?.[n.type] ?? {}) } })) }
  const patchRaw = updater => { record(); canvasRef.current?.updateNode(noteFor, updater) }

  // поля перечитываются, когда новые данные ноды реально дошли до окна (копия урока обновляется асинхронно): окно зовёт consumeRestore при смене данных
  const restoring = useRef(null) // данные ноды, которых ждём после отмены/повтора (ссылка на объект)
  const restore = snap => {
    restoring.current = snap.typeData?.[snap.type] ?? null
    canvasRef.current?.updateNode(noteFor, () => snap)
    setTimeout(() => { if (restoring.current) { restoring.current = null; setRev(r => r + 1) } }, 700) // страховка, если ссылка не совпала
  }
  /** Окно зовёт при смене данных ноды: перечитываем поля только когда пришли именно восстановленные данные (а не промежуточные) */
  const consumeRestore = useCallback(data => { if (restoring.current && data === restoring.current) { restoring.current = null; setRev(r => r + 1) } }, [])
  const step = (from, to) => {
    flushAll()
    // отложенный набор сначала доходит до копии урока (запись в историю уже сделана), потом шаг назад/вперёд
    setTimeout(() => {
      const snap = from.current.pop()
      if (!snap) return
      to.current.push(snapOf(getNode(noteFor)))
      if (to.current.length > LIMIT) to.current.shift()
      lastPush.current = 0
      restore(snap); sync()
    }, 40)
  }
  const undo = () => step(undoStack, redoStack)
  const redo = () => step(redoStack, undoStack)

  const dirty = () => {
    const cur = getNode(noteFor)
    return !!cur && !!startSnap.current && (cur.typeData !== startSnap.current.typeData || cur.type !== startSnap.current.type)
  }
  /** Закрыть без сохранения: всё, что сделано в редакторе, откатывается к состоянию на момент открытия */
  const cancel = () => {
    reg.current.discard = true
    if (dirty() && startSnap.current) canvasRef.current?.updateNode(noteFor, () => startSnap.current)
    setNoteFor(null)
    setTimeout(() => { reg.current.discard = false }, 0)
  }
  /** Закрыть, оставив правки (отложенный набор доходит) */
  const keep = () => { flushAll(); setNoteFor(null) }

  return { reg, rev, consumeRestore, counts, open, patch, patchRaw, undo, redo, dirty, cancel, keep, flushAll }
}

import { useRef, useState, useCallback, useEffect } from 'react'

const LIMIT = 30      // сколько правок хранит отмена
const BURST_MS = 700  // правки подряд в пределах этого времени — одна запись (набор текста не плодит сотни шагов)

const API_KEYS = ['open', 'patch', 'patchRaw', 'recordComment', 'bindComment', 'undo', 'redo', 'dirty', 'cancel', 'keep', 'flushAll']
const makeApi = implRef => Object.fromEntries(API_KEYS.map(k => [k, (...a) => implRef.current?.[k](...a)]))
const snapOf = n => (n ? { type: n.type, typeData: n.typeData, triggers: n.triggers } : null)

/**
 * Сессия окна замечания к ноде: отмена/повтор правок (до 30 в каждой цепочке, хранятся ссылки на неизменяемые снимки — почти бесплатно), снимок «на момент открытия»
 * для кнопки «Закрыть» (отменяет всё сделанное в редакторе) и реестр сброса полей (reg), чтобы отложенный набор не терялся при отмене/повторе.
 */
export function useNoteSession(canvasRef, noteFor, setNoteFor) {
  const reg = useRef({ fns: new Set(), discard: false })
  // Записи отмены двух видов: { k: 'n', snap } — правка ноды, { k: 'c', text, template } — набор в поле комментария (отмена идёт по порядку действий, как одна цепочка)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const startSnap = useRef(null)
  const lastPush = useRef(0)
  const [rev, setRev] = useState(0) // растёт при отмене/повторе — поля редактора перечитывают данные ноды
  const [counts, setCounts] = useState({ u: 0, r: 0 })
  const countOf = (st, kind) => st.current.filter(e => e.k === kind).length
  const sync = () => setCounts({ u: countOf(undoStack, 'n'), r: countOf(redoStack, 'n') })
  const getNode = useCallback(ref => canvasRef.current?.getNodes().find(n => n.id === ref), [canvasRef])
  const flushAll = () => { const had = reg.current.fns.size > 0; reg.current.fns.forEach(f => f()); return had }

  const open = ref => {
    undoStack.current = []; redoStack.current = []; lastPush.current = 0
    startSnap.current = snapOf(getNode(ref))
    sync()
  }
  const lastKind = useRef('')
  const pushEntry = (kind, make) => {
    const now = Date.now()
    if (now - lastPush.current > BURST_MS || lastKind.current !== kind) {
      undoStack.current.push(make())
      if (undoStack.current.length > LIMIT) undoStack.current.shift()
      redoStack.current = []
      sync()
    }
    lastPush.current = now
    lastKind.current = kind
  }
  const record = () => pushEntry('n', () => ({ k: 'n', snap: snapOf(getNode(noteFor)) }))
  // Поле комментария окна: dialog отдаёт доступ (get/set) и сообщает о наборе — он попадает в ту же цепочку отмены
  const commentApi = useRef({ get: () => ({ text: '', template: '' }), set: () => {} })
  const bindComment = api => { commentApi.current = api }
  const recordComment = () => pushEntry('c', () => ({ k: 'c', ...commentApi.current.get() }))
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
  // kind: 'n' — правки ноды (фокус в редакторе), 'c' — набор комментария (фокус в поле комментария): у каждого поля своя цепочка, они не мешают друг другу
  const step = (from, to, kind) => {
    flushAll()
    // отложенный набор сначала доходит до копии урока (запись в историю уже сделана), потом шаг назад/вперёд
    setTimeout(() => {
      const idx = from.current.map(x => x.k).lastIndexOf(kind)
      if (idx < 0) return
      const [e] = from.current.splice(idx, 1)
      lastPush.current = 0
      if (e.k === 'c') {
        to.current.push({ k: 'c', ...commentApi.current.get() })
        commentApi.current.set(e.text, e.template)
      } else {
        to.current.push({ k: 'n', snap: snapOf(getNode(noteFor)) })
        restore(e.snap)
      }
      if (to.current.length > LIMIT) to.current.shift()
      sync()
    }, 40)
  }
  const undo = (kind = 'n') => step(undoStack, redoStack, kind)
  const redo = (kind = 'n') => step(redoStack, undoStack, kind)

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

  // Наружу — СТАБИЛЬНЫЕ обёртки (одни и те же функции на всё время жизни окна): раньше каждая перерисовка панели давала новые
  // session.patch/onType, и мемо-превью «После» (SlotBody + редактор) перерисовывалось на каждую букву комментария — набор лагал
  const implRef = useRef(null)
  useEffect(() => { implRef.current = { open, patch, patchRaw, recordComment, bindComment, undo, redo, dirty, cancel, keep, flushAll } })
  // обёртки только читают implRef.current при вызове (в обработчиках), не при рендере
  const [api] = useState(() => makeApi(implRef)) // eslint-disable-line react-hooks/refs
  return { reg, rev, consumeRestore, counts, ...api }
}

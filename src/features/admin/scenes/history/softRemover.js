// Ядро мягкого удаления сцены из библиотеки (без React; React-обёртка — useSoftRemove.js, тест — softRemover.test.js).
// Строка прячется сразу (hidden), настоящее удаление commit(id) — через delay мс; cancel() до этого возвращает строку.
// Второе удаление, flush() и закрытие окна выполняют отложенное сразу. Скрытой строка остаётся, пока commit
// не завершился (иначе при ответе сети она мигнула бы обратно). onChange({ hidden, pending }) — для состояния UI.
export const SOFT_DELETE_MS = 8000

export function createSoftRemover({ commit: firstCommit, onChange = () => {}, delay = SOFT_DELETE_MS, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) } }) {
  let commit = firstCommit
  let cur = null // { id, title, timer, onDone }
  let hidden = []
  const emit = () => onChange({ hidden: [...hidden], pending: cur ? { id: cur.id, title: cur.title } : null })

  function flush() {
    const p = cur
    if (!p) return
    timers.clear(p.timer)
    cur = null
    emit()
    p.onDone?.()
    Promise.resolve(commit(p.id)).finally(() => { hidden = hidden.filter(x => x !== p.id); emit() })
  }
  // row — { id, title }; onDone — когда отмена стала невозможной (таймер / новое удаление / закрытие окна)
  function schedule(row, onDone = null) {
    flush()
    hidden = [...hidden, row.id]
    cur = { id: row.id, title: row.title, onDone, timer: timers.set(flush, delay) }
    emit()
  }
  // → { id, title } отменённого или null, если отменять уже нечего
  function cancel() {
    const p = cur
    if (!p) return null
    timers.clear(p.timer)
    cur = null
    hidden = hidden.filter(x => x !== p.id)
    emit()
    return { id: p.id, title: p.title }
  }
  return { schedule, cancel, flush, setCommit: fn => { commit = fn } }
}

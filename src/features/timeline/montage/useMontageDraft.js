import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { hInit, hPush, hUndo, hRedo, canUndo, canRedo, loadDraft, saveDraft, restore, newest, serverDraft, safeStore } from './montageHistory.js'

// Черновик правок монтажа одного прохождения (runId): история с отменой / возвратом, запись в хранилище устройства СРАЗУ после каждого шага (закрыл экран, перезагрузил страницу — черновик на месте) и на сервер
// с задержкой (saveServer(draft) — shared/api/timelineApi.saveTimelineEdits; нет — сервера нет). При открытии: в хранилище или на сервере (serverEdits — runs[i].edits) нашёлся черновик с правками —
// он НЕ применяется молча: pending → вопрос «продолжить / сбросить» (accept / discard). Из двух черновиков берётся записанный позже. Смена runId — другой черновик.
// store — { get, set, del, keys } (montageHistory.safeStore; тесты подставляют свой).
export const SERVER_DELAY_MS = 2500

function open(runId, store, serverEdits) {
  const cand = newest(loadDraft(store, runId), restore(serverEdits))
  const ask = !!cand && cand.h.now.length > 0
  return { id: runId, h: !cand || ask ? hInit() : cand.h, pending: ask ? cand : null, dirty: 0, seen: serverEdits?.savedAt ?? '' }
}

export function useMontageDraft({ runId, store = null, serverEdits = null, saveServer = null, delay = SERVER_DELAY_MS }) {
  const [box] = useState(() => store ?? safeStore())
  const [st0, setSt] = useState(() => open(runId, box, serverEdits))
  let st = st0
  if (st.id !== runId) { st = open(runId, box, serverEdits); setSt(st) } // другое прохождение — другой черновик
  const cur = useRef(st)
  useLayoutEffect(() => { cur.current = st })
  const [srv, setSrv] = useState('') // '' | 'busy' | 'ok' | текст ошибки

  // черновик сервера пришёл позже (экран открылся раньше ответа): если здесь ещё ничего не правили и он новее — спросить
  useEffect(() => {
    const s = cur.current, at = serverEdits?.savedAt ?? ''
    if (!at || at === s.seen) return
    const untouched = !s.dirty && !s.h.now.length && !s.h.past.length
    const next = untouched ? open(s.id, box, serverEdits) : { ...s, seen: at }
    cur.current = next; setSt(next)
  }, [serverEdits, box])

  const step = useCallback(fn => {
    const s = cur.current, h = fn(s.h)
    if (h === s.h) return
    saveDraft(box, s.id, h)
    const next = { ...s, h, pending: null, dirty: s.dirty + 1 }
    cur.current = next; setSt(next)
  }, [box])

  // сервер: через delay после последнего шага; экран закрыли раньше — запись уходит сразу
  const late = useRef(null)
  const saveRef = useRef(saveServer)
  useLayoutEffect(() => { saveRef.current = saveServer })
  const flush = useCallback(() => {
    const job = late.current
    if (!job) return
    clearTimeout(job.timer); late.current = null
    setSrv('busy')
    Promise.resolve().then(() => saveRef.current(serverDraft(job.h))).then(r => setSrv(r?.ok ? 'ok' : r?.error || 'нет ответа'), e => setSrv(String(e?.message ?? e)))
  }, [])
  useEffect(() => {
    if (!saveRef.current || !st.dirty) return
    if (late.current) clearTimeout(late.current.timer)
    late.current = { h: st.h, timer: setTimeout(flush, delay) }
  }, [st.dirty, st.h, delay, flush])
  useEffect(() => () => { const job = late.current; if (job) { clearTimeout(job.timer); late.current = null; try { Promise.resolve(saveRef.current?.(serverDraft(job.h))).catch(() => {}) } catch { /* сервер не мешает экрану */ } } }, [])

  return {
    edits: st.h.now, pending: st.pending, steps: st.h.past.length, srv,
    canUndo: canUndo(st.h), canRedo: canRedo(st.h),
    /** Список правок стал таким (новый шаг истории) */
    set: edits => step(h => hPush(h, edits)),
    undo: () => step(hUndo), redo: () => step(hRedo),
    /** «Сбросить всё» — тоже шаг истории: его можно отменить */
    reset: () => step(h => hPush(h, [])),
    /** Найденный черновик: продолжить — вернуть его вместе с историей отмены */
    accept: () => { const p = cur.current.pending; if (p) step(() => ({ ...p.h })) },
    /** Найденный черновик: сбросить — пустой черновик записывается поверх (и на сервер), прежний больше не предложат */
    discard: () => { if (cur.current.pending) step(() => ({ ...hInit() })) },
    flush,
  }
}

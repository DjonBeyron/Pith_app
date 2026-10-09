// Общее место для загруженной модели Vosk: её загружает эксперимент 10 (VoskLab, внутри свёрнутых «Проверок»), а «Тест 3» стоит на виду в «Простых тестах»
// и должен её использовать. Один микрофон на всех: busy — кто-то сейчас записывает. Модуль-одиночка с подпиской (useSyncExternalStore), без React-состояния выше.
import { useSyncExternalStore, useMemo } from 'react'
import { startListening } from './voskEngine.js'

let snap = { model: null, busy: false, info: null } // info — { model: имя файла, modelMs } для отчёта
const subs = new Set()
const set = patch => { snap = { ...snap, ...patch }; subs.forEach(f => f()) }

export const setVoskModel = (model, info = null) => set({ model, info: model ? info : null, busy: false })
export const setVoskBusy = busy => set({ busy: !!busy })
export const getVoskSnap = () => snap

/** Движок для тестов: { loaded, ready (загружен и никто не пишет), busy, info, listen(grammar, cb, opts), setBusy } */
export function useVoskEngine() {
  const s = useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, getVoskSnap)
  return useMemo(() => ({
    loaded: !!s.model, busy: s.busy, ready: !!s.model && !s.busy, info: s.info,
    listen: (grammar, cb, opts) => startListening(s.model, grammar, cb, opts), setBusy: setVoskBusy,
  }), [s])
}

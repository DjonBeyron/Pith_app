import { useCallback, useEffect, useRef } from 'react'

// Конец экзамена «Шкала памяти» ведёт РЕАЛЬНЫЙ конец речи, а не расчёт по длинам реплик (владелец 2026-11-24: озвучку заменили — тексты другой длины; замена файла не должна ничего ломать):
//  • afterSpeech — стадия-конец началась, а Мия ещё договаривает колкость о последнем слове (и Пит — «это значит» + слово): реплики исхода ставятся, когда очередь речи реально опустела.
//    Раньше ждали расчётное время (длины реплик + запас 1,3 с на слово + 450 мс) — после помощи Пита оставалась пустая тишина ≈ 1,5–2,5 с;
//  • examEndReady / useExamEnd — стадию-конец отпускает к итогу не таймер «сумма длин реплик + 800 мс» (длинная озвучка обрезалась потолком 18 с, короткая оставляла тишину), а момент, когда
//    реплики исхода реально доиграли и Мия ушла (исходы free / mid), плюс короткий хвост END_TAIL_MS.
export const END_POLL_MS = 100      // как часто смотрим на очередь речи
export const END_TAIL_MS = 500      // хвост после последней реплики до итога
export const DRAIN_CAP_MS = 12000   // страховка: колкость о последнем слове ждём не дольше
export const END_CAP_MS = 40000     // страховка: стадия-конец не висит дольше (речь встала насовсем)

/** go(), когда очередь речи опустела (pending() === 0), но не позже cap. Таймер лежит в mb.endTimer (его снимает raceMia.clearEndTimer при уходе из игры). Очередь пуста — go() сразу */
export function afterSpeech(mb, pending, go, { cap = DRAIN_CAP_MS, poll = END_POLL_MS, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const t0 = now()
  clearTimer(mb.endTimer)
  const tick = () => { if (pending() > 0 && now() - t0 < cap) { mb.endTimer = setTimer(tick, poll); return } mb.endTimer = 0; go() }
  tick()
}

/** Экзамен договорён: реплики исхода поставлены (m.outcome), очередь речи пуста, Мия уже ушла или остаётся (ожидания ухода m.bye нет). Мии на сцене нет (эпизод выключен) — ждать нечего */
export const examEndReady = (m, pending) => pending() === 0 && !m?.bye && (!!m?.outcome || m?.phase !== 'in' || m.act !== 'boss')

/** Ждать ready(), потом хвост tail, потом go(); не дольше cap. → cancel() */
export function whenReady({ ready, go, tail = END_TAIL_MS, cap = END_CAP_MS, poll = END_POLL_MS, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const t0 = now()
  let t = 0
  const tick = () => { if (!ready() && now() - t0 < cap) { t = setTimer(tick, poll); return } t = setTimer(go, ready() ? tail : 0) }
  tick()
  return () => clearTimer(t)
}

/** Директор гонки: обёртка afterCount для стадии-конца экзамена. wrap(afterCount) → afterCount: на boss-end переход к итогу ждёт examEndReady; смена стадии, пауза и выход ожидание снимают */
export function useExamEnd({ mb, mspeech, running, at, captionOn = () => false }) { // captionOn — подпись неозвученной реплики ещё на экране (озвученная реплика кончается концом звука, подпись — своим таймером)
  const cancel = useRef(null), exam = running?.mia === 'end' && running.act === 'boss'
  useEffect(() => () => { cancel.current?.(); cancel.current = null }, [running, at])
  return useCallback(afterCount => fn => {
    if (!exam) { afterCount(fn); return }
    cancel.current?.()
    cancel.current = whenReady({ ready: () => !captionOn() && examEndReady(mb.m, () => mspeech.pending()), go: () => { cancel.current = null; afterCount(fn) } })
  }, [exam, mb, mspeech, captionOn])
}

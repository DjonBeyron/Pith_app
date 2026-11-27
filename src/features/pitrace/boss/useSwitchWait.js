import { useCallback, useEffect, useRef } from 'react'
import { pLog } from '../../../shared/lib/debug.js'
import { READY_MS } from '../raceSwitch.js'
import { whenReady } from './examEndWait.js'

// «Мия меняет правила» (владелец 2026-11-27, слабый Android: русская модель Vosk грузится ≈ 9–10 с, реплика Мии ≈ 4–5 с — игрок ждал ≈ 5 с в тишине). Стадия boss-sw держится, пока слух
// РЕАЛЬНО не переключился (событие «модель готова» — sw.state() вышло из 'switching', а не таймер): реплика про смену правил договорила, а модель ещё грузится — Мия говорит одну короткую
// реплику-прикрытие (SWITCH_WAIT_LINE), потом ждём модель. Модель успела за SWITCH_GRACE_MS (iPhone ≈ 2 с, сильные устройства) — реплики нет, стадия кончается сразу. Реплики не накладываются
// (очередь речи Мии), ожидание не дольше READY_MS + запас (сам переключатель отпускает русскую по тому же сроку и переводит блок на английскую), смена стадии и пауза ожидание снимают.
export const SWITCH_WAIT_LINE = 'boss_mia_ru_wait'
export const SWITCH_GRACE_MS = 600
export const SWITCH_WAIT_CAP_MS = READY_MS + 4000

/** Переход после стадии смены слуха: afterCount(fn) — когда слух готов (а при долгом ожидании — и прикрытие договорено). → cancel() */
export function switchWait({ sw, mspeech, afterCount, fn, log = () => {}, grace = SWITCH_GRACE_MS, cap = SWITCH_WAIT_CAP_MS, setTimer = setTimeout, clearTimer = clearTimeout, now = () => performance.now() }) {
  const idle = () => sw.state() !== 'switching' // 'ru' — готова; 'en' — не вышло (директор уже перевёл блок на английскую): ждать нечего
  if (idle()) { afterCount(fn); return () => {} }
  let cancelled = false, inner = null, t = 0
  const t0 = now()
  const cover = () => {
    if (cancelled) return
    if (idle()) { afterCount(fn); return }
    mspeech.enqueue([{ id: SWITCH_WAIT_LINE, who: 'mia', delay: 0 }])
    log(`[race] слух: русская модель ещё грузится (${Math.round(now() - t0)} мс), Мия говорит прикрытие «${SWITCH_WAIT_LINE}»`)
    inner = whenReady({ ready: () => idle() && mspeech.pending() === 0, go: () => { inner = null; afterCount(fn) }, tail: 0, cap, setTimer, clearTimer, now })
  }
  t = setTimer(cover, grace)
  return () => { cancelled = true; clearTimer(t); inner?.() }
}

/** Директор гонки: обёртка afterCount (как useExamEnd): на стадии boss-sw переход ждёт слух. Смена стадии, пауза и выход ожидание снимают */
export function useSwitchWait({ sw, mspeech, running, at }) {
  const cancel = useRef(null), on = running?.sid === 'boss-sw' && running?.switchTo === 'ru'
  useEffect(() => () => { cancel.current?.(); cancel.current = null }, [running, at])
  return useCallback(afterCount => fn => {
    if (!on) { afterCount(fn); return }
    cancel.current?.()
    cancel.current = switchWait({ sw, mspeech, afterCount, fn, log: pLog })
  }, [on, sw, mspeech])
}

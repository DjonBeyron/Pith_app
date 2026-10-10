import { useState, useEffect, useRef } from 'react'
import { holdKind, startsAsk, startsAfterPopup, readyDelayLeft, activationLeft } from '../../../../shared/lib/speech/sayReadyDelay.js'
import { isIos } from '../../../../shared/lib/soundVolume.js'

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

// Видимое состояние круга-микрофона с отложенным выходом из серого locked (правила и числа — sayReadyDelay.js). target — настоящее состояние (micVisualState): решения по доступу
// (decide(), автопопап, тапы), запись и флаги читают именно его и работают сразу, задержка ТОЛЬКО в том, что видит ученик. Два удержания:
//  ready  — locked → ready (доступ выдан без нажатия): 700 мс от появления ready;
//  active — запись пошла из locked: (а) первый запрос доступа (noAccess на момент нажатия) — ждём opened (микрофон реально открылся = диалог подтверждён), затем 700 мс;
//           (б) кнопкой попапа (popup — в прошлом рендере панель была в фазе попапа) — картинка через POPUP_DELAY_MS от нажатия, чтобы не налезать на закрывающийся попап;
//           если есть и (а), и (б) — не раньше, чем пройдёт POPUP_DELAY_MS от нажатия.
// На iPhone отсчёт идёт от последнего из «можно показывать» и «приложение вернулось» (focus / visibilitychange → visible: системный диалог закрыт), пока приложение скрыто — ждём возврата.
// Монтирование с выданным доступом (в том числе ответ Permissions API сразу после открытия модуля), повторные попытки, done/off (отказ), отзыв доступа — без задержки. Таймер и слушатели
// живут, пока идёт удержание; чистятся при размонтировании и когда цель сменилась (отказ, итог, прерывание). settled — Permissions API уже ответил; opened — микрофон открылся.
export function useDelayedMicState(target, { ios = isIos(), settled = true, noAccess = false, opened = false, popup = false } = {}) {
  const [shown, setShown] = useState(target)
  const [prev, setPrev] = useState(target)
  const [asked, setAsked] = useState(false)
  const [wasSettled, setWasSettled] = useState(settled)
  if (settled !== wasSettled) setWasSettled(settled)
  const [afterPopup, setAfterPopup] = useState(false)
  const [wasPopup, setWasPopup] = useState(popup) // попап был открыт в ПРЕДЫДУЩЕМ рендере: нажатие в нём ставит phase 'run' (попап уходит) тем же рендером, где цель становится active
  if (popup !== wasPopup) setWasPopup(popup)
  // Нажатие, с которого началась запись, запоминаем В ТОТ РЕНДЕР, где цель стала active: дальше флаг доступа изменится (микрофон откроется), а удержание должно жить до показа
  const askedNow = target !== prev ? startsAsk({ shown, target, noAccess }) : asked
  const popupNow = target !== prev ? startsAfterPopup({ shown, target, wasPopup }) : afterPopup
  if (target !== prev) { setPrev(target); setAsked(askedNow); setAfterPopup(popupNow) }
  // settled — Permissions API уже ответил; в самом рендере, где он ответил (wasSettled ещё false), ready — «доступ уже был при открытии модуля»: показываем сразу, без задержки
  const kind = holdKind({ shown, target, settled: settled && wasSettled, asked: askedNow, afterPopup: popupNow })
  if (!kind && shown !== target) setShown(target) // всё, кроме удерживаемых переходов, показываем сразу (сброс при рендере)
  const armed = kind === 'ready' || (kind === 'active' && (opened || !askedNow)) // active с диалогом ждёт, пока микрофон реально откроется; после попапа без диалога — сразу

  const tapAt = useRef(0)
  useEffect(() => { if (kind) tapAt.current = nowMs() }, [kind]) // момент нажатия, с которого началось удержание (отсчёт «не раньше, чем POPUP_DELAY_MS после попапа»)

  useEffect(() => {
    if (!kind || !armed) return undefined
    const readyAt = nowMs()
    let backAt = 0
    let timer = 0
    const schedule = () => {
      clearTimeout(timer)
      const now = nowMs()
      const left = kind === 'ready'
        ? readyDelayLeft({ ios, readyAt, backAt, now, visible: isVisible() })
        : activationLeft({ asked: askedNow, afterPopup: popupNow, ios, tapAt: tapAt.current, readyAt, backAt, now, visible: isVisible() })
      if (left !== null) timer = setTimeout(() => setShown(kind === 'ready' ? 'ready' : 'active'), left)
    }
    // вернулись (focus / visibilitychange → visible) — отсчёт заново от возврата; на iPhone скрылись (диалог / сворачивание) — таймер снимаем и ждём возврата
    const onChange = () => { if (isVisible()) { backAt = nowMs(); schedule() } else if (ios) clearTimeout(timer) }
    window.addEventListener('focus', onChange)
    document.addEventListener('visibilitychange', onChange)
    schedule()
    return () => { clearTimeout(timer); window.removeEventListener('focus', onChange); document.removeEventListener('visibilitychange', onChange) }
  }, [kind, armed, ios, askedNow, popupNow])

  return kind ? 'locked' : target
}

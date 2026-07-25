import { useState, useEffect, useRef } from 'react'
import { getCachedProfile } from '../../shared/api/profileCache.js'
import { markSlowmoHintSeen } from '../../shared/api/profileApi.js'

const SEEN_KEY = 'pithy_slowmo_hint_seen_v1'
// «Свайп доехал до конца» у виртуализатора не отдельное событие, а вывод из
// activeIdx (см. useFeedVirtualizer.onSettle ~140мс тишины) — не лезем в его
// внутренности, просто ждём, что activeIdx перестал меняться, плюс
// запрошенные 0.3с сверху: 140 + 300 ≈ 450мс.
const ARM_DELAY_MS = 450

function readSeen() {
  if (getCachedProfile()?.slowmo_hint_seen) return true
  try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}

// Обучающая подсказка «зажми лайк — замедли видео» (см. feedSlowZone в
// FeedSlide.jsx): показывается ровно один раз за всё время пользователя.
// Триггер — не первое попавшееся видео, а осознанный момент: звук только
// что включили И после этого свайпнули на следующее видео (значит человек
// уже смотрит со звуком, а не просто листает молча). Прячется не по тапу,
// а только когда замедление реально успело подействовать — см. markSeenNow
// вызывается из FeedSlide после удержания дольше порога.
export function useSlowMotionHint(activeIdx, soundOn) {
  const [seen, setSeen] = useState(readSeen)
  const [armed, setArmed] = useState(false)
  const justTurnedOnRef = useRef(false)
  const prevSoundRef = useRef(soundOn)
  const prevIdxRef = useRef(activeIdx)
  const armTimer = useRef(null)

  useEffect(() => {
    if (!prevSoundRef.current && soundOn) justTurnedOnRef.current = true
    prevSoundRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    if (activeIdx !== prevIdxRef.current) {
      prevIdxRef.current = activeIdx
      // Свайп ещё в движении (activeIdx снова поменялся) — сбрасываем
      // таймер и ждём следующей остановки, не показываем на полпути
      clearTimeout(armTimer.current)
      if (!seen && justTurnedOnRef.current) {
        armTimer.current = setTimeout(() => {
          setArmed(true)
          justTurnedOnRef.current = false // разовый триггер — не взводится повторно
        }, ARM_DELAY_MS)
      }
    }
  }, [activeIdx, seen])

  useEffect(() => () => clearTimeout(armTimer.current), [])

  function markSeenNow() {
    clearTimeout(armTimer.current) // отменяем отложенный показ, если он ещё не выстрелил
    setSeen(true)
    setArmed(false)
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* нет localStorage — переживём */ }
    if (getCachedProfile()) markSlowmoHintSeen()
  }

  return { showHint: armed && !seen, markSeenNow }
}

// Вызывается один раз сразу после успешной регистрации (RegisterForm.jsx):
// если гость уже видел подсказку локально — переносим флаг на свежий
// серверный профиль, чтобы она не всплыла снова на другом устройстве.
export function transferSlowMotionHintOnRegister() {
  let seenLocally = false
  try { seenLocally = localStorage.getItem(SEEN_KEY) === '1' } catch { /* нет localStorage */ }
  if (seenLocally) markSlowmoHintSeen()
}

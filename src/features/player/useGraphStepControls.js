import { useCallback } from 'react'

// Пошаговое управление сценарием для админского дебага (панель плеера и
// мобильный тулбар): показать назначенное сообщение сейчас, сдвинуть время
// сценария вручную, снять последнее сообщение. Вынесено из useGraphPlayer.js
// (тот упирался в потолок 400 строк) без изменения логики: рефы, таймеры и
// сеттеры — те же, что у проигрывателя графа (приходят аргументом).
// Зависимости колбэков — как были в useGraphPlayer: [] и [revealNow]. Всё, что
// приходит аргументом, — рефы, сеттеры useState или функции, читающие только
// рефы/сеттеры, поэтому идентичность колбэков остаётся стабильной (линтер
// этого про аргументы хука знать не может — отсюда disable-строки)
export function useGraphStepControls({
  scheduledRef, nodeMapRef, firedRef, scheduleReveal, pendingMsRef, visibleRef, finishedRef,
  clearTimers, revealNode, setPendingNode, setIsWaiting, setVisibleNodes,
}) {
  // Шаг «вперёд», когда переход уже назначен (тикает «печатает…» или лежит
  // отложенным из-за паузы) — показываем следующее сообщение сейчас же.
  // Возвращает true, если было что показать
  const revealNow = useCallback(() => {
    const planned = scheduledRef.current
    if (!planned) return false
    clearTimers()
    scheduledRef.current = null
    if (planned.type === 'reveal') {
      const next = nodeMapRef.current[planned.nodeId]
      if (next) revealNode(next)
      return !!next
    }
    const n = nodeMapRef.current[planned.nodeId]
    const t = (n?.triggers ?? []).find(tr => tr.if === 'timer' && tr.then)
    if (!t) return false
    const key = `${n.id}:timer`
    if (firedRef.current.has(key)) return false
    firedRef.current.add(key)
    scheduleReveal.current(t.then, true)
    return true
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Дебаг-тулбар двигает время руками (±33/±100мс, см. debugMedia.js). Пауза
  // убила таймеры сценария, поэтому «печатает…» само по себе уже не кончится:
  // сколько ни жми «вперёд», индикатор крутится бесконечно (у него CSS-анимация
  // с iteration-count: infinite), а следующее сообщение не приходит. Здесь те же
  // миллисекунды списываются и с отсчёта сценария — дошли до нуля, показываем
  // ноду, ровно как это сделал бы живой таймер
  const stepTime = useCallback(ms => {
    if (!scheduledRef.current) return false
    pendingMsRef.current -= ms
    if (pendingMsRef.current > 0) return false
    return revealNow()
  }, [revealNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // Шаг «назад»: снимаем последнее сообщение и разрешаем пройти этот кусок
  // заново — забываем сработавшие триггеры снятой ноды И той, что снова стала
  // последней (иначе её нельзя было бы «ответить» ещё раз, дедуп firedRef не
  // пустил бы). Возвращает обе ноды: вызывающий откатывает по ним ответы и XP
  const stepBack = useCallback(() => {
    const prev = visibleRef.current
    if (prev.length <= 1) return null
    const removed = prev[prev.length - 1]
    const last    = prev[prev.length - 2]
    clearTimers()
    scheduledRef.current = null
    finishedRef.current = false
    for (const key of [...firedRef.current]) {
      if (key.startsWith(`${removed.id}:`) || key.startsWith(`${last.id}:`)) firedRef.current.delete(key)
    }
    setPendingNode(null)
    setIsWaiting(false)
    setVisibleNodes(p => p.slice(0, -1))
    return { removed, last }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { revealNow, stepTime, stepBack }
}

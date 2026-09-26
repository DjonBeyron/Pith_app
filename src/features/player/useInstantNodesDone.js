import { useRef, useEffect } from 'react'

// «Мгновенные» ноды зовут onDone в эффекте маунта, но монтируются они в
// pending-фазе с onDone-заглушкой (DOM сохраняется по key при активации,
// эффект не перезапускается) — их onNodeDone терялся, и ПОСЛЕДНЕЕ такое
// сообщение не завершало урок (итоги с XP не показывались). Дублируем
// onNodeDone при появлении ноды среди видимых; повторные вызовы безопасны
// (дедуп триггеров и финиша в useGraphPlayer).
// Вынесено из LessonPlayer.jsx (тот упирался в потолок 400 строк). Реф
// отдаётся наружу: шаг назад (rollbackNode) снимает с ноды отметку «отыграла»
export function useInstantNodesDone(visibleNodes, onNodeDone) {
  const instantDoneRef = useRef(new Set())
  useEffect(() => {
    visibleNodes.forEach(n => {
      if (!['text', 'pin_message', 'system', 'photo'].includes(n.type)) return
      if (instantDoneRef.current.has(n.id)) return
      instantDoneRef.current.add(n.id)
      onNodeDone(n.id)
    })
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps
  return instantDoneRef
}

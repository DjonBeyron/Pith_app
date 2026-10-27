import { useEffect, useRef, useCallback } from 'react'
import { usePromptSlotContext } from './usePromptSlotContext.js'

// «Талон» в едином бюджете Пита для того, что показывает себя само (проверка «О чём диалог», подсказки ленты): оно не шторка,
// но обязано подчиняться тем же правилам (не чаще 1 на 5 слайдов, не раньше 20 с, приоритет, паузы) — старые лимиты остаются
// внутри, бюджет сверху. Пока wanted, хук просит у слота кандидата (request); granted === true, когда слот его выбрал.
// Вне хоста слота (тесты, старые вызовы) granted всегда true — поведение как до бюджета.
//   candidate = { id, kind, reason } — id стабилен (строка), объект можно пересоздавать на каждый рендер
//   wanted    — кандидат сейчас нужен (слайд активен и т. п.); стал false или размонтирование — кандидат снимается (cancel),
//               выбранный, но ненужный не держит слот
//   ready()   — необязательная проверка ПЕРЕД запросом (например, старые лимиты уже отказали — бюджет зря не тратим)
//   tick      — любое значение: смена заново просит слот (кандидат живёт в очереди ограниченное время)
// → { granted, answer(value), dismiss() } — answer/dismiss действуют, только если слот сейчас держит именно этого кандидата
export function usePromptTicket(candidate, wanted, { ready, tick } = {}) {
  const slot = usePromptSlotContext()
  const slotRef = useRef(slot)
  useEffect(() => { slotRef.current = slot })
  const { id } = candidate
  const request = slot?.request
  const cancel = slot?.cancel
  const granted = !slot || slot.current?.id === id

  useEffect(() => {
    if (!request || !wanted || (ready && !ready())) return
    request(candidate)
  }, [request, wanted, id, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cancel || !wanted) return undefined
    return () => cancel(id)
  }, [cancel, wanted, id])

  // Слот выбрал кандидата, когда он уже не нужен (слайд ушёл до выбора) — отпускаем
  const heldId = slot?.current?.id
  useEffect(() => {
    if (cancel && !wanted && heldId === id) cancel(id)
  }, [cancel, wanted, heldId, id])

  const answer = useCallback(value => {
    const s = slotRef.current
    if (s?.current?.id === id) s.answer(value)
  }, [id])
  const dismiss = useCallback(() => {
    const s = slotRef.current
    if (s?.current?.id === id) s.dismiss()
  }, [id])
  return { granted, answer, dismiss }
}

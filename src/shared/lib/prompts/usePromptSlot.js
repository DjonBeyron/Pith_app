import { useState, useEffect, useSyncExternalStore } from 'react'
import { createPromptSlot } from './promptSlotCore.js'
import { loadState, write } from './promptStore.js'
import { track } from '../analytics/track.js'
import { currentGroup, allowedInGroup } from './promptGroup.js'

// Хук шторки вопросов Пита (без разметки — интерфейс делает отдельная задача). Один экземпляр на приложение:
// при маунте начинается сессия бюджета (promptBudget.startSession). Логика очереди — promptSlotCore.js.
//   current            — показанный сейчас кандидат ({ id, kind, reason, ...данные шторки }) или null
//   request(candidate) — предложить показать; покажется, когда бюджет разрешит и нет другой шторки
//   answer(value)      — ответил (value — id ответа); dismiss() — закрыл/смахнул; later() — «Спроси позже»
//   cancel(id)         — кандидат не нужен: убрать из очереди (показанного — закрыть ответом 'left')
//   onSlide(i)         — слайд ленты сменился; setBusy({ audio, input, afterError, afterDontKnow }) — «сейчас нельзя»
// События: prompt_shown / prompt_answer / prompt_dismiss (analytics/eventNames.js), каждое несёт group.
export function usePromptSlot() {
  const [slot] = useState(() => createPromptSlot({
    load: loadState, save: write, track,
    allow: c => allowedInGroup(currentGroup(), c), // контрольная группа не видит «умные» вопросы (promptGroup.js)
    extra: () => ({ group: currentGroup() }),       // группа едет в props всех prompt_* событий
  }))
  const current = useSyncExternalStore(slot.subscribe, slot.getCurrent, slot.getCurrent)

  useEffect(() => {
    slot.start()
    return () => slot.dispose()
  }, [slot])

  return {
    current,
    request: slot.request,
    answer: slot.answer,
    dismiss: slot.dismiss,
    later: slot.later,
    cancel: slot.cancel,
    onSlide: slot.onSlide,
    setBusy: slot.setBusy,
  }
}

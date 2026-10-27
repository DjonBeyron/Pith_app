import { usePromptSlot } from '../shared/lib/prompts/usePromptSlot.js'
import { PromptSlotContext } from '../shared/lib/prompts/usePromptSlotContext.js'
import PromptSheet from '../shared/ui/PromptSheet.jsx'

// Хозяин единого слота вопросов Пита: один usePromptSlot на приложение (ShellV2 оборачивает им весь интерфейс),
// слот отдаётся через контекст (usePromptSlotContext) ленте и вкладкам — они зовут request(кандидат), — а шторку рисует здесь.
// Кандидаты без text (проверка «Ловли», «О чём диалог», подсказки ленты) шторкой не рисуются: им нужно только разрешение.
export default function PromptHost({ children }) {
  const slot = usePromptSlot()
  return (
    <PromptSlotContext.Provider value={slot}>
      {children}
      <PromptSheet prompt={slot.current} onAnswer={slot.answer} onDismiss={slot.dismiss} onLater={slot.later} />
    </PromptSlotContext.Provider>
  )
}

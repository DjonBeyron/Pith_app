import { useEffect } from 'react'
import { usePromptSlot } from '../shared/lib/prompts/usePromptSlot.js'
import { PromptSlotContext } from '../shared/lib/prompts/usePromptSlotContext.js'
import PromptSheet from '../shared/ui/PromptSheet.jsx'

// Хозяин единого слота вопросов Пита: один usePromptSlot на приложение (ShellV2 оборачивает им весь интерфейс),
// слот отдаётся через контекст (usePromptSlotContext) ленте и вкладкам — они зовут request(кандидат), — а шторку рисует здесь.
// Кандидаты без text (проверка «Ловли», «О чём диалог», подсказки ленты) шторкой не рисуются: им нужно только разрешение.
// feedActive — лента на экране: шторки со scope 'feed' (подсказки, вопрос по поведению, предложения игр) на других
// вкладках ни к чему — снимаем их, иначе шторка висит поверх «Памяти», «Профиля» и остальных, пока не нажмут крестик
export default function PromptHost({ children, feedActive = true }) {
  const slot = usePromptSlot()
  const current = slot.current
  useEffect(() => {
    if (!feedActive && current?.scope === 'feed') slot.cancel(current.id)
  }, [feedActive, current, slot])
  return (
    <PromptSlotContext.Provider value={slot}>
      {children}
      <PromptSheet prompt={slot.current} onAnswer={slot.answer} onDismiss={slot.dismiss} onLater={slot.later} />
    </PromptSlotContext.Provider>
  )
}

import { createContext, useContext } from 'react'

// Контекст единого слота вопросов Пита: значение — то, что отдаёт usePromptSlot() (current, request, answer, dismiss, later,
// onSlide, setBusy, cancel). Хозяин — src/app/PromptHost.jsx. Вне хоста (тесты, старые вызовы, превью) значение null:
// потребители тогда ведут себя как до бюджета (старые лимиты и никаких запросов).
export const PromptSlotContext = createContext(null)

export const usePromptSlotContext = () => useContext(PromptSlotContext)

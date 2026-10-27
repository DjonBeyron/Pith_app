import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePromptSlotContext } from '../../../shared/lib/prompts/usePromptSlotContext.js'
import { createChooseGame } from './chooseGame.js'

// Игра ленты «Выбери слово» (B4) — тонкая обёртка над chooseGame.js: держит одну игру на ленту и отдаёт её состояние.
// Свежие значения (слот бюджета, слова в памяти, лента на экране, звук) уходят в игру эффектом (setContext), поэтому
// пересоздавать её на каждый рендер не нужно. Слот выбрал предложение или лента скрылась/показалась — check() перепроверяет решение.
//   inMemory — Map/Set слов в памяти (learnView.stepOf); enabled — лента на экране; soundOn — звук ленты включён
// → { open, onFinishStats, close }: open — открытая игра | null (поля: word, card, moduleId, teacher, textOnly, result)
export function useFeedChoose({ inMemory, enabled, soundOn }) {
  const slot = usePromptSlotContext()
  const [game] = useState(() => createChooseGame())
  useEffect(() => { game.setContext({ slot, inMemory, enabled, soundOn }) })
  const open = useSyncExternalStore(game.subscribe, game.getOpen, game.getOpen)
  const curId = slot?.current?.id ?? null

  useEffect(() => game.start(), [game])
  useEffect(() => { game.check() }, [game, curId, enabled])

  return { open, onFinishStats: game.answered, close: game.close }
}

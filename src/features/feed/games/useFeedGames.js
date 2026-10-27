import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePromptSlotContext } from '../../../shared/lib/prompts/usePromptSlotContext.js'
import { createFeedGames } from './createFeedGames.js'

// Игры ленты («Выбери слово», «Дополни реплику», «Картинка») — тонкая обёртка над ядром (feedGame.js): держит одно ядро
// на ленту и отдаёт его состояние. Свежие значения (слот бюджета, слова в памяти, лента на экране, звук) уходят в ядро
// эффектом (setContext), поэтому пересоздавать его на каждый рендер не нужно. Слот выбрал предложение или лента
// скрылась/показалась — check() перепроверяет решение.
//   inMemory — Map/Set слов в памяти (learnView.stepOf); enabled — лента на экране; soundOn — звук ленты включён;
//   create — фабрика ядра (в тестах подменяется)
// → { open, onFinishStats, close }: open — открытая игра | null (поля: game, word, moduleId, result, textOnly + поля вида)
export function useFeedGames({ inMemory, enabled, soundOn }, create = createFeedGames) {
  const slot = usePromptSlotContext()
  const [game] = useState(() => create())
  useEffect(() => { game.setContext({ slot, inMemory, enabled, soundOn }) })
  const open = useSyncExternalStore(game.subscribe, game.getOpen, game.getOpen)
  const curId = slot?.current?.id ?? null

  useEffect(() => game.start(), [game])
  useEffect(() => { game.check() }, [game, curId, enabled])

  return { open, onFinishStats: game.answered, close: game.close }
}

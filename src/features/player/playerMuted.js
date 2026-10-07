import { createContext, useContext } from 'react'
import { useLessonMuted } from './lessonVolume.js'

// «Без звука» для голосовых сообщений плеера (повторение: кнопка «Не могу слушать»).
// Голосовое играет как обычно — идут время, спектр и печать текста под голос, — только не слышно:
// у его <audio> включён muted. Включается на лету, и звучащее сообщение смолкает.
//
// Контекст, а не проп: голосовое лежит глубоко в ленте (PlayerMessage → AudioModule), и тащить
// флаг через все слои — та же правка в куче файлов ради одного булева (как playerFrozen.js).
// В обычном плеере контекст всегда false.
export const PlayerMutedContext = createContext(false)

// Итоговое «без звука» = muted повторения (контекст) || кнопка «без звука» в
// шапке урока (lessonVolume.js, localStorage). Объединяется здесь, а не в
// LessonPlayer: все потребители (голосовое, диктант, озвучка слов, видео) и
// так читают этот хук, а LessonPlayer остаётся как есть
export function usePlayerMuted() {
  const review = useContext(PlayerMutedContext)
  const lesson = useLessonMuted()
  return review || lesson
}

import { createContext, useContext } from 'react'

// «Без звука» для голосовых сообщений плеера (повторение: кнопка «Не могу слушать»).
// Голосовое играет как обычно — идут время, спектр и печать текста под голос, — только не слышно:
// у его <audio> включён muted. Включается на лету, и звучащее сообщение смолкает.
//
// Контекст, а не проп: голосовое лежит глубоко в ленте (PlayerMessage → AudioModule), и тащить
// флаг через все слои — та же правка в куче файлов ради одного булева (как playerFrozen.js).
// В обычном плеере контекст всегда false.
export const PlayerMutedContext = createContext(false)

export function usePlayerMuted() {
  return useContext(PlayerMutedContext)
}

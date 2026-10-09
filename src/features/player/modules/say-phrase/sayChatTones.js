import { useSyncExternalStore } from 'react'

// Раскраска слов фразы в пузыре чата по итогу проверки («Сказать фразу»): панель (ленивый чанк) пишет тона слов сюда,
// пузырь в ленте (SayPhraseModule) читает. Маленький файл в основном коде плеера — модуль ленты не тянет код распознавания.
// tones — массив на слова фразы: 'ok' (услышано) | 'miss' (пропущено) | null (нейтрально); нет записи — без раскраски.
const store = new Map() // id ноды → массив тонов
const subs = new Set()

export function setChatTones(nodeId, tones) {
  if (nodeId == null) return
  if (tones && tones.length) store.set(nodeId, tones); else if (!store.delete(nodeId)) return
  subs.forEach(fn => fn())
}

export const getChatTones = nodeId => store.get(nodeId) ?? null
const subscribe = fn => { subs.add(fn); return () => subs.delete(fn) }

export function useChatTones(nodeId) {
  return useSyncExternalStore(subscribe, () => getChatTones(nodeId), () => null)
}

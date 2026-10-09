// Разрешение микрофона для модуля «Сказать фразу»: ОДИН экземпляр состояния на запуск приложения (модульный синглтон),
// чтобы микрофон спрашивали как можно реже. Что именно спрашивает ОС — решает платформа, мы только не просим лишнего:
//  - Android: диалог один раз навсегда, дальше query вернёт 'granted';
//  - iPhone (PWA): диалог на КАЖДОМ холодном запуске, внутри запуска повторов нет — внутри запуска мы помним `micOk`.
// Микрофон здесь не открывается вообще: только читаем query({name:'microphone'}) (он диалога не вызывает) и флаги.
//
// Флаги:
//  - localStorage   pithy_say_explained_v1     — пояснение «зачем микрофон» уже видели (один раз в жизни устройства)
//  - sessionStorage pithy_say_denied_session   — в этом запуске отказали: start() больше НЕ зовём
//  - sessionStorage pithy_cant_speak_session   — «Не могу говорить»: следующие модули сразу в запасном режиме
import { getRecognitionCtor, queryMicPermission } from './speechSupport.js'

export const EXPLAINED_KEY = 'pithy_say_explained_v1'
export const DENIED_KEY = 'pithy_say_denied_session'
export const CANT_SPEAK_KEY = 'pithy_cant_speak_session'

const pick = name => { try { return globalThis[name] ?? null } catch { return null } }
const read = (store, key) => { try { return store?.getItem(key) === '1' } catch { return false } }
const write = (store, key, on) => { try { if (on) store?.setItem(key, '1'); else store?.removeItem(key) } catch { /* приватный режим — живёт до перезагрузки */ } }

/**
 * Что делать по тапу на микрофон. Чистая функция.
 *  fallback — start() НЕ вызываем, показываем запасной режим (reason: unsupported | cant_speak | denied)
 *  explain  — показать пояснение с кнопкой «Понятно, включить микрофон» (диалог ОС — уже по её тапу)
 *  listen   — сразу слушаем (диалога ОС не будет или он покажется по этому же тапу)
 * perm — granted | prompt | denied | unavailable; micOk — в этом запуске приложения микрофон уже работал.
 */
export function decideMic({ supported, cantSpeak, denied, perm, explained, micOk }) {
  if (!supported) return { action: 'fallback', reason: 'unsupported' }
  if (cantSpeak) return { action: 'fallback', reason: 'cant_speak' }
  if (denied || (perm === 'denied' && !micOk)) return { action: 'fallback', reason: 'denied' }
  if (micOk || perm === 'granted') return { action: 'listen' }
  if (!explained) return { action: 'explain' }
  return { action: 'listen' }
}

export function createSayPermission({
  local = pick('localStorage'), session = pick('sessionStorage'),
  queryPerm = queryMicPermission, isSupported = () => !!getRecognitionCtor(),
} = {}) {
  let perm = 'unavailable' // последний ответ query (он асинхронный, а start() нужен синхронно в тапе — поэтому кэш)
  let micOk = false        // в ЭТОМ запуске приложения распознавание реально началось (диалог ОС позади)

  return {
    /** Обновить кэш разрешения (диалога не вызывает). Звать при показе панели и после попытки */
    async refresh() {
      try { perm = await queryPerm() } catch { perm = 'unavailable' }
      return perm
    },
    getPerm: () => perm,
    isExplained: () => read(local, EXPLAINED_KEY),
    isDenied: () => read(session, DENIED_KEY),
    isCantSpeak: () => read(session, CANT_SPEAK_KEY),
    isMicOk: () => micOk,
    supported: () => isSupported(),
    markExplained: () => write(local, EXPLAINED_KEY, true),
    markMicOk() { micOk = true },
    markDenied() { micOk = false; write(session, DENIED_KEY, true) },
    setCantSpeak: on => write(session, CANT_SPEAK_KEY, !!on),
    /** Решение по тапу (синхронное: кэш perm + флаги). 'denied' по query запоминаем в сессии, чтобы не донимать */
    decide() {
      const r = decideMic({
        supported: isSupported(), cantSpeak: read(session, CANT_SPEAK_KEY), denied: read(session, DENIED_KEY),
        perm, explained: read(local, EXPLAINED_KEY), micOk,
      })
      if (r.reason === 'denied' && !read(session, DENIED_KEY)) write(session, DENIED_KEY, true)
      return r
    },
  }
}

export const sayPermission = createSayPermission()

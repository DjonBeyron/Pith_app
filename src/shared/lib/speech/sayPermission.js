// Разрешение микрофона для модуля «Сказать фразу»: ОДИН экземпляр состояния на запуск приложения (модульный синглтон),
// чтобы микрофон спрашивали как можно реже. Что именно спрашивает ОС — решает платформа, мы только не просим лишнего:
//  - Android: диалог один раз навсегда, дальше query вернёт 'granted';
//  - iPhone (PWA): диалог на КАЖДОМ холодном запуске, внутри запуска повторов нет — внутри запуска мы помним `micOk`.
// Микрофон здесь не открывается вообще: только читаем query({name:'microphone'}) (он диалога не вызывает) и флаги.
//
// Флаги:
//  - localStorage   pithy_say_explained_v1     — ПОЛНОЕ пояснение «зачем микрофон» уже видели (один раз в жизни устройства)
//  - localStorage   pithy_say_mic_granted_v1   — микрофон на этом устройстве уже УСПЕШНО открывался (запись пошла): по нему кнопка показывает «доступ выдан»
//                                                там, где Permissions API молчит (iPhone Safari). Сбрасывается при отказе (not-allowed / query=denied) и в админском сбросе
//  - sessionStorage pithy_say_pre_shown_session — в этом запуске уже показывали попап перед системным запросом (нужен iPhone, где query недоступен)
//  - sessionStorage pithy_say_denied_session   — в этом запуске отказали: start() больше НЕ зовём
//  - sessionStorage pithy_cant_speak_session   — СТАРЫЙ сессионный флаг «Не могу говорить» (панель его больше не ставит: теперь это разовое решение
//                                                внутри модуля, sayPairSkip.sayExit; плеер сбрасывает флаг на старте урока). Ветка оставлена как страховка
import { getRecognitionCtor, queryMicPermission } from './speechSupport.js'
import { CANT_SPEAK_KEY } from './cantSpeakFlag.js'
import { isFirefoxBrowser } from './sayBrowser.js'

export const EXPLAINED_KEY = 'pithy_say_explained_v1'
export const DENIED_KEY = 'pithy_say_denied_session'
export const PRE_SHOWN_KEY = 'pithy_say_pre_shown_session'
export const MIC_GRANTED_KEY = 'pithy_say_mic_granted_v1'
export { CANT_SPEAK_KEY } // ключ и чтение флага для плеера — в cantSpeakFlag.js (без импортов)

const pick = name => { try { return globalThis[name] ?? null } catch { return null } }
const read = (store, key) => { try { return store?.getItem(key) === '1' } catch { return false } }
const write = (store, key, on) => { try { if (on) store?.setItem(key, '1'); else store?.removeItem(key) } catch { /* приватный режим — живёт до перезагрузки */ } }

/**
 * Что делать по тапу на микрофон. Чистая функция. Попап (свой) показываем ПЕРЕД системным запросом ОС, который ожидается:
 *  fallback — blocked: start() НЕ вызываем, запасной режим (reason: browser (Firefox) | unsupported | cant_speak | denied)
 *  explain  — попап с кнопкой (диалог ОС — уже по её тапу); kind 'full' — самый первый раз на устройстве (зачем микрофон, «не записываем»),
 *             kind 'short' — «Сейчас появится запрос… нажмите «Разрешить»» (каждый следующий ожидаемый запрос)
 *  listen   — none: сразу слушаем (диалога ОС не будет — разрешено или уже работал в этом запуске)
 * perm — granted | prompt | denied | unavailable; micOk — в этом запуске приложения микрофон уже работал; preShown — в этом запуске уже
 * показывали попап (iPhone без Permissions API: диалог ОС один раз за запуск, дальше micOk). perm=prompt → диалог ожидается всегда.
 */
export function decideMic({ supported, cantSpeak, denied, perm, explained, micOk, preShown = false, browserBlocked = false }) {
  if (browserBlocked) return { action: 'fallback', reason: 'browser' } // Firefox: распознавание не поддерживается — пояснение «откройте в Safari или Chrome» и обычный выход
  if (!supported) return { action: 'fallback', reason: 'unsupported' }
  if (cantSpeak) return { action: 'fallback', reason: 'cant_speak' }
  if (denied || (perm === 'denied' && !micOk)) return { action: 'fallback', reason: 'denied' }
  if (micOk || perm === 'granted') return { action: 'listen' }
  if (!explained) return { action: 'explain', kind: 'full' }
  if (perm === 'prompt' || !preShown) return { action: 'explain', kind: 'short' }
  return { action: 'listen' }
}

/** То же решение одним словом: full | short | none | blocked */
export const micGate = d => (d.action === 'fallback' ? 'blocked' : d.action === 'explain' ? d.kind : 'none')

export function createSayPermission({
  local = pick('localStorage'), session = pick('sessionStorage'),
  queryPerm = queryMicPermission, isSupported = () => !!getRecognitionCtor(), isBlockedBrowser = isFirefoxBrowser,
} = {}) {
  let perm = 'unavailable' // последний ответ query (он асинхронный, а start() нужен синхронно в тапе — поэтому кэш)
  let micOk = false        // в ЭТОМ запуске приложения распознавание реально началось (диалог ОС позади)

  return {
    /** Обновить кэш разрешения (диалога не вызывает). Звать при показе панели и после попытки */
    async refresh() {
      try { perm = await queryPerm() } catch { perm = 'unavailable' }
      if (perm === 'denied') write(local, MIC_GRANTED_KEY, false) // доступ отозвали в настройках: «уже разрешали» больше не верим
      return perm
    },
    getPerm: () => perm,
    isExplained: () => read(local, EXPLAINED_KEY),
    isDenied: () => read(session, DENIED_KEY),
    isPreShown: () => read(session, PRE_SHOWN_KEY),
    isCantSpeak: () => read(session, CANT_SPEAK_KEY),
    isMicOk: () => micOk,
    /** Всё, что нужно кнопке для вида «нет доступа / доступ выдан» (sayMicState.micVisualState): ответ query, флаг «уже открывался» и «работал в этом запуске» */
    access: () => ({ permission: perm, flag: read(local, MIC_GRANTED_KEY), sessionOk: micOk }),
    supported: () => isSupported(),
    markExplained: () => write(local, EXPLAINED_KEY, true),
    markPreShown: () => write(session, PRE_SHOWN_KEY, true),
    /** Для тестов админа: подсказки микрофона снова как в первый раз (полное пояснение, без отказа и «Не могу говорить») */
    resetHints() {
      micOk = false
      write(local, EXPLAINED_KEY, false)
      write(local, MIC_GRANTED_KEY, false)
      for (const k of [DENIED_KEY, PRE_SHOWN_KEY, CANT_SPEAK_KEY]) write(session, k, false)
    },
    markMicOk() { micOk = true; write(local, MIC_GRANTED_KEY, true) },
    markDenied() { micOk = false; write(local, MIC_GRANTED_KEY, false); write(session, DENIED_KEY, true) },
    setCantSpeak: on => write(session, CANT_SPEAK_KEY, !!on),
    /** Решение по тапу (синхронное: кэш perm + флаги). 'denied' по query запоминаем в сессии, чтобы не донимать */
    decide() {
      const r = decideMic({
        supported: isSupported(), cantSpeak: read(session, CANT_SPEAK_KEY), denied: read(session, DENIED_KEY),
        perm, explained: read(local, EXPLAINED_KEY), micOk, preShown: read(session, PRE_SHOWN_KEY), browserBlocked: isBlockedBrowser(),
      })
      if (r.reason === 'denied' && !read(session, DENIED_KEY)) write(session, DENIED_KEY, true)
      return r
    },
  }
}

export const sayPermission = createSayPermission()
export const resetMicHints = () => sayPermission.resetHints()

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
//  - localStorage   pithy_say_intro_seen_v1    — ВВОДНЫЙ попап (с пояснением про «Я не могу говорить») ученик уже принял кнопкой. Пока флага нет, круг серый (как «нет доступа») и тап открывает попап
//                                                на ВСЕХ платформах — иначе на Android, где отдельного шага разрешения нет, ученик не узнал бы про «не могу говорить». «Не сейчас»/тап мимо флаг НЕ ставят
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
export const INTRO_SEEN_KEY = 'pithy_say_intro_seen_v1'
export { CANT_SPEAK_KEY } // ключ и чтение флага для плеера — в cantSpeakFlag.js (без импортов)

const pick = name => { try { return globalThis[name] ?? null } catch { return null } }
const read = (store, key) => { try { return store?.getItem(key) === '1' } catch { return false } }
const write = (store, key, on) => { try { if (on) store?.setItem(key, '1'); else store?.removeItem(key) } catch { /* приватный режим — живёт до перезагрузки */ } }

/**
 * Какой попап показать перед записью (чистая функция). null — попап не нужен.
 *  intro — системного запроса не будет (уже разрешено / работает в этом запуске), но ввод ещё не видели: объяснение + «Я не могу говорить», кнопка «Понятно, начать»;
 *  full  — системный запрос ожидается, и это первый показ (полное пояснение не видели ИЛИ вводный не видели — в полном тексте тоже есть строка про «не могу говорить»);
 *  short — системный запрос ожидается снова (perm=prompt — всегда; без Permissions API — один раз за запуск, iPhone).
 * perm — granted | prompt | denied | unavailable; micOk — в этом запуске микрофон уже работал; preShown — в этом запуске попап уже показывали.
 */
export function pickExplainKind({ perm, explained, introSeen = true, micOk = false, preShown = false }) {
  if (micOk || perm === 'granted') return introSeen ? null : 'intro'
  if (!explained || !introSeen) return 'full'
  if (perm === 'prompt' || !preShown) return 'short'
  return null
}

/**
 * Что делать по тапу на микрофон. Чистая функция. Попап (свой) показываем ПЕРЕД системным запросом ОС, который ожидается, и один раз вводный (pickExplainKind):
 *  fallback — blocked: start() НЕ вызываем, запасной режим (reason: browser (Firefox) | unsupported | cant_speak | denied)
 *  explain  — попап с кнопкой (диалог ОС, если он нужен, — уже по её тапу); kind 'full' | 'short' | 'intro'
 *  listen   — none: сразу слушаем (диалога ОС не будет, вводный уже видели)
 * introSeen по умолчанию true: вызовы без этого поля ведут себя как до вводного попапа. Отказ (denied) и недоступность важнее попапа: объяснять нечего.
 */
export function decideMic({ supported, cantSpeak, denied, perm, explained, micOk, preShown = false, browserBlocked = false, introSeen = true }) {
  if (browserBlocked) return { action: 'fallback', reason: 'browser' } // Firefox: распознавание не поддерживается — пояснение «откройте в Safari или Chrome» и обычный выход
  if (!supported) return { action: 'fallback', reason: 'unsupported' }
  if (cantSpeak) return { action: 'fallback', reason: 'cant_speak' }
  if (denied || (perm === 'denied' && !micOk)) return { action: 'fallback', reason: 'denied' }
  const kind = pickExplainKind({ perm, explained, introSeen, micOk, preShown })
  return kind ? { action: 'explain', kind } : { action: 'listen' }
}

/** То же решение одним словом: full | short | intro | none | blocked */
export const micGate = d => (d.action === 'fallback' ? 'blocked' : d.action === 'explain' ? d.kind : 'none')

export function createSayPermission({
  local = pick('localStorage'), session = pick('sessionStorage'),
  queryPerm = queryMicPermission, isSupported = () => !!getRecognitionCtor(), isBlockedBrowser = isFirefoxBrowser,
} = {}) {
  let perm = 'unavailable' // последний ответ query (он асинхронный, а start() нужен синхронно в тапе — поэтому кэш)
  let micOk = false        // в ЭТОМ запуске приложения распознавание реально началось (диалог ОС позади)
  let checked = false      // Permissions API хотя бы раз ответил (или не смог): до этого perm — просто «не знаем», и «доступ выдан» на кнопке — не новость (useDelayedMicState)

  return {
    /** Обновить кэш разрешения (диалога не вызывает). Звать при показе панели и после попытки */
    async refresh() {
      try { perm = await queryPerm() } catch { perm = 'unavailable' }
      checked = true
      if (perm === 'denied') write(local, MIC_GRANTED_KEY, false) // доступ отозвали в настройках: «уже разрешали» больше не верим
      return perm
    },
    getPerm: () => perm,
    isChecked: () => checked,
    isExplained: () => read(local, EXPLAINED_KEY),
    isIntroSeen: () => read(local, INTRO_SEEN_KEY),
    isDenied: () => read(session, DENIED_KEY),
    isPreShown: () => read(session, PRE_SHOWN_KEY),
    isCantSpeak: () => read(session, CANT_SPEAK_KEY),
    isMicOk: () => micOk,
    /** Всё, что нужно кнопке для вида «нет доступа / доступ выдан» (sayMicState.micVisualState): ответ query, флаг «уже открывался», «работал в этом запуске» и «вводный попап видели» */
    access: () => ({ permission: perm, flag: read(local, MIC_GRANTED_KEY), sessionOk: micOk, introSeen: read(local, INTRO_SEEN_KEY) }),
    supported: () => isSupported(),
    markExplained: () => write(local, EXPLAINED_KEY, true),
    markIntroSeen: () => write(local, INTRO_SEEN_KEY, true),
    markPreShown: () => write(session, PRE_SHOWN_KEY, true),
    /** Для тестов админа: подсказки микрофона снова как в первый раз (полное и вводное пояснение, без отказа и «Не могу говорить») */
    resetHints() {
      micOk = false
      write(local, EXPLAINED_KEY, false)
      write(local, MIC_GRANTED_KEY, false)
      write(local, INTRO_SEEN_KEY, false)
      for (const k of [DENIED_KEY, PRE_SHOWN_KEY, CANT_SPEAK_KEY]) write(session, k, false)
    },
    markMicOk() { micOk = true; write(local, MIC_GRANTED_KEY, true) },
    markDenied() { micOk = false; write(local, MIC_GRANTED_KEY, false); write(session, DENIED_KEY, true) },
    setCantSpeak: on => write(session, CANT_SPEAK_KEY, !!on),
    /** Решение по тапу (синхронное: кэш perm + флаги). 'denied' по query запоминаем в сессии, чтобы не донимать */
    decide() {
      const r = decideMic({
        supported: isSupported(), cantSpeak: read(session, CANT_SPEAK_KEY), denied: read(session, DENIED_KEY),
        perm, explained: read(local, EXPLAINED_KEY), introSeen: read(local, INTRO_SEEN_KEY), micOk, preShown: read(session, PRE_SHOWN_KEY), browserBlocked: isBlockedBrowser(),
      })
      if (r.reason === 'denied' && !read(session, DENIED_KEY)) write(session, DENIED_KEY, true)
      return r
    },
  }
}

export const sayPermission = createSayPermission()
export const resetMicHints = () => sayPermission.resetHints()

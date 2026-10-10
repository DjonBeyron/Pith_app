// Админская диагностика «Сказать фразу» в уроке — снимок ТЕЛЕФОНА / БРАУЗЕРА (без React; всё подставляется в тестах): поддерживает ли системное распознавание, режим аудиосессии,
// права микрофона, сеть, экономия трафика, браузер, PWA или вкладка. Ничего не запускает и микрофон не открывает (права — только Permissions API, он диалога не вызывает).
import { getRecognitionCtor, isStandalone, queryMicPermission } from './speechSupport.js'
import { isSayAudioSessionOn } from './sayAudioSession.js'
import { SESSION_PLAY_REC } from './speechAudioSession.js'

/** Safari | Chrome | Firefox | другой — по строке User-Agent (на iPhone Chrome и Firefox — это CriOS / FxiOS) */
export function browserName(ua) {
  const s = String(ua ?? '')
  if (/FxiOS|Firefox\//.test(s)) return 'Firefox'
  if (/EdgA?\/|EdgiOS|OPR\/|OPiOS|SamsungBrowser|YaBrowser|DuckDuckGo/.test(s)) return 'другой'
  if (/CriOS|Chrome\//.test(s)) return 'Chrome'
  if (/Safari\//.test(s)) return 'Safari'
  return 'другой'
}

/** Платформа по User-Agent: «iPhone / iOS 17.2», «Android 14», «компьютер» */
export function platformName(ua) {
  const s = String(ua ?? '')
  const ver = (s.match(/(?:OS|Android) (\d+[._]?\d*)/) || [])[1]
  if (/iPhone|iPad|iPod/.test(s)) return `iOS${ver ? ` ${ver.replace('_', '.')}` : ''}`
  if (/Android/.test(s)) return `Android${ver ? ` ${ver}` : ''}`
  return s ? 'компьютер' : 'неизвестно'
}

/** Синхронный снимок среды. g — глобальные объекты (в тестах подставные) */
export function readDiagEnv(g = globalThis) {
  const nav = g.navigator ?? {}
  const conn = nav.connection
  const ctor = (() => { try { return getRecognitionCtor() } catch { return null } })()
  const ua = nav.userAgent || ''
  return {
    recognition: !!ctor,
    audioSession: (() => { try { return isSayAudioSessionOn() } catch { return true } })(),
    sessionType: SESSION_PLAY_REC,
    sessionApi: typeof nav.audioSession === 'object',
    online: nav.onLine !== false,
    saveData: conn?.saveData === true,
    netType: conn?.effectiveType || '',
    browser: browserName(ua),
    platform: platformName(ua),
    pwa: (() => { try { return isStandalone() } catch { return false } })(),
    secure: g.isSecureContext === true,
    cacheApi: typeof g.caches?.open === 'function',
    ua,
  }
}

/** granted | prompt | denied | unavailable — через Permissions API (диалога не вызывает) */
export const readMicPermission = () => queryMicPermission()

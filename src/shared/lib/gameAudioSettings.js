// Настройки проверки на телефоне (Админ → «Голос» → «Микрофон игры»): как поведёт себя звук Пита и диктора, пока открыт микрофон игры. Хранятся в localStorage (по телефону), читаются при каждом
// обращении — менять можно между играми, перезагрузка не нужна. Незнакомое значение = по умолчанию.
//  • pithy_game_audio_session_v1 — тип аудиосессии iOS (navigator.audioSession.type) на время игры: 'play-and-record' (по умолчанию) | 'auto' (не трогаем) | 'phases' (playback на время речи, play-and-record на очередь ученика).
//  • pithy_game_mic_hold_v1 — глушить ли дорожку микрофона на время речи Пита и диктора: 'none' (по умолчанию) | 'enabled-false' (track.enabled = false).
export const AUDIO_SESSION_KEY = 'pithy_game_audio_session_v1'
export const MIC_HOLD_KEY = 'pithy_game_mic_hold_v1'

export const AUDIO_SESSION_MODES = ['play-and-record', 'auto', 'phases']
export const MIC_HOLD_MODES = ['none', 'enabled-false']
export const DEFAULT_AUDIO_SESSION_MODE = 'play-and-record'
export const DEFAULT_MIC_HOLD_MODE = 'none'

const read = (key, modes, fallback, store) => { try { const v = store?.getItem(key); return modes.includes(v) ? v : fallback } catch { return fallback } }
const write = (key, modes, fallback, value, store) => {
  try { if (modes.includes(value) && value !== fallback) store?.setItem(key, value); else store?.removeItem(key) } catch { /* приватный режим — живёт до перезагрузки */ }
}

export const readAudioSessionMode = (store = globalThis.localStorage) => read(AUDIO_SESSION_KEY, AUDIO_SESSION_MODES, DEFAULT_AUDIO_SESSION_MODE, store)
export const writeAudioSessionMode = (value, store = globalThis.localStorage) => write(AUDIO_SESSION_KEY, AUDIO_SESSION_MODES, DEFAULT_AUDIO_SESSION_MODE, value, store)
export const readMicHoldMode = (store = globalThis.localStorage) => read(MIC_HOLD_KEY, MIC_HOLD_MODES, DEFAULT_MIC_HOLD_MODE, store)
export const writeMicHoldMode = (value, store = globalThis.localStorage) => write(MIC_HOLD_KEY, MIC_HOLD_MODES, DEFAULT_MIC_HOLD_MODE, value, store)

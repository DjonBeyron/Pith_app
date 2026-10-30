// Настройки проверки на телефоне (Админ → «Голос» → «Микрофон игры»): как поведёт себя звук Пита и диктора, пока открыт микрофон игры. Хранятся в localStorage (по телефону), читаются при каждом
// обращении — менять можно между играми, перезагрузка не нужна. Незнакомое значение = по умолчанию.
//  • pithy_game_audio_session_v1 — тип аудиосессии iOS (navigator.audioSession.type) на время игры: 'play-and-record' (по умолчанию) | 'auto' (не трогаем) | 'phases' (playback на время речи, play-and-record на очередь ученика).
//  • pithy_game_mic_hold_v1 — что делать с микрофоном на время речи Пита и диктора: 'enabled-false' (по умолчанию с 3.3.76: track.enabled = false — по журналам iPhone голос Пита с 'none' попадал в распознавание, пилюли защёлкивались во время речи кота) | 'none' (не трогать) | 'close' (поток закрывается совсем и открывается заново
//    к очереди ученика — «микрофон только в фазе ученика», приём «Сказать фразу»: запись не держит аудиосессию, пока говорит диктор; iOS может спросить доступ заново, всё пишется в отладку mic-hold).
//  • pithy_game_web_audio_v1 — чем играют короткие звуки игры (реплики Пита, куски диктора, мяу/ноты, плашка): 'on' (по умолчанию) — Web Audio, буферы декодируются заранее и стартуют мгновенно (gameAudioCtx.js); 'off' — прежние <audio>-слоты
//    (аварийный выключатель: если на каком-то телефоне Web Audio в сессии «запись + воспроизведение» молчит).
export const AUDIO_SESSION_KEY = 'pithy_game_audio_session_v1'
export const MIC_HOLD_KEY = 'pithy_game_mic_hold_v1'
export const WEB_AUDIO_KEY = 'pithy_game_web_audio_v1'

export const AUDIO_SESSION_MODES = ['play-and-record', 'auto', 'phases']
export const MIC_HOLD_MODES = ['enabled-false', 'none', 'close']
export const WEB_AUDIO_MODES = ['on', 'off']
export const DEFAULT_WEB_AUDIO_MODE = 'on'
export const DEFAULT_AUDIO_SESSION_MODE = 'play-and-record'
export const DEFAULT_MIC_HOLD_MODE = 'enabled-false'

const read = (key, modes, fallback, store) => { try { const v = store?.getItem(key); return modes.includes(v) ? v : fallback } catch { return fallback } }
const write = (key, modes, fallback, value, store) => {
  try { if (modes.includes(value) && value !== fallback) store?.setItem(key, value); else store?.removeItem(key) } catch { /* приватный режим — живёт до перезагрузки */ }
}

export const readAudioSessionMode = (store = globalThis.localStorage) => read(AUDIO_SESSION_KEY, AUDIO_SESSION_MODES, DEFAULT_AUDIO_SESSION_MODE, store)
export const writeAudioSessionMode = (value, store = globalThis.localStorage) => write(AUDIO_SESSION_KEY, AUDIO_SESSION_MODES, DEFAULT_AUDIO_SESSION_MODE, value, store)
export const readMicHoldMode = (store = globalThis.localStorage) => read(MIC_HOLD_KEY, MIC_HOLD_MODES, DEFAULT_MIC_HOLD_MODE, store)
export const writeMicHoldMode = (value, store = globalThis.localStorage) => write(MIC_HOLD_KEY, MIC_HOLD_MODES, DEFAULT_MIC_HOLD_MODE, value, store)
export const readWebAudioMode = (store = globalThis.localStorage) => read(WEB_AUDIO_KEY, WEB_AUDIO_MODES, DEFAULT_WEB_AUDIO_MODE, store)
export const writeWebAudioMode = (value, store = globalThis.localStorage) => write(WEB_AUDIO_KEY, WEB_AUDIO_MODES, DEFAULT_WEB_AUDIO_MODE, value, store)

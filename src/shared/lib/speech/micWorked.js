// Флаги «микрофон реально работал / отказали» — то немногое от sayPermission.js, что нужно игре «Повтори за диктором» (gameMic.js): после открытия игрового потока «Скажи фразу» не спрашивает лишнего.
// Вынесено отдельным файлом без импортов: sayPermission.js тянет speechSupport.js (проверка нативного SpeechRecognition), а игра и репетиция слушают ТОЛЬКО Vosk — нативного распознавателя в их графе модулей
// быть не должно (страж rehearsalOnlyVosk.test.js). Состояние общее с sayPermission-синглтоном: он читает isOk() наравне со своим флагом.
export const MIC_GRANTED_KEY = 'pithy_say_mic_granted_v1' // localStorage: микрофон на этом устройстве уже успешно открывался
export const DENIED_KEY = 'pithy_say_denied_session'      // sessionStorage: в этом запуске отказали

const pick = name => { try { return globalThis[name] ?? null } catch { return null } }
const write = (store, key, on) => { try { if (on) store?.setItem(key, '1'); else store?.removeItem(key) } catch { /* приватный режим — живёт до перезагрузки */ } }

let ok = false // в ЭТОМ запуске приложения микрофон реально открылся (диалог ОС позади)

export const micWorked = {
  markOk() { ok = true; write(pick('localStorage'), MIC_GRANTED_KEY, true) },
  markDenied() { ok = false; write(pick('localStorage'), MIC_GRANTED_KEY, false); write(pick('sessionStorage'), DENIED_KEY, true) },
  reset() { ok = false },
  isOk: () => ok,
}

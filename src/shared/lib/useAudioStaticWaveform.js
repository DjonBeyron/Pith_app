import { useSyncExternalStore } from 'react'
import { getAudioStaticWaveform, saveAudioStaticWaveform } from '../api/appSettingsApi.js'

// Глобальная заморозка спектра голосовых — для ВСЕХ голосовых во ВСЕХ
// уроках сразу (app_settings.audio_static_waveform), не настройка одной
// ноды. Включено: каждый бар встаёт на высоту САМОЙ громкой амплитуды всей
// записи (посчитанной один раз, как только готовы данные волны) и больше
// не двигается — ни во время игры, ни на паузе, ни после конца (см.
// AudioModule.jsx). Прогресс-заливка (зелёным по мере игры) при этом
// продолжает работать — застывает только колебание высоты.
//
// Устройство — то же зеркало в localStorage, что у usePlayerDebugUi.js:
// первый кадр плеера рисуется раньше, чем приходит ответ сервера.

const LS = 'pithy_audio_static_waveform_v1'

function readLs() {
  try { return localStorage.getItem(LS) === '1' } catch { return false }
}

function writeLs(on) {
  try {
    if (on) localStorage.setItem(LS, '1')
    else localStorage.removeItem(LS)
  } catch { /* приватный режим — переживём, сервер всё равно источник правды */ }
}

let value = readLs()
let loaded = false          // ответ сервера в этом сеансе уже получен
let inflight = null         // чтобы три вызова не сделали три запроса
const subs = new Set()

function apply(on) {
  writeLs(on)
  if (on === value) return
  value = on
  subs.forEach(fn => fn())
}

// Прогрев: зовём один раз на старте приложения, чтобы к открытию урока ответ
// уже был. Ошибку не бросает — без настройки волна просто останется живой.
export function prefetchAudioStaticWaveform() {
  if (loaded || inflight) return inflight
  inflight = getAudioStaticWaveform()
    .then(on => {
      loaded = true
      if (on !== null) apply(on) // null — запрос не удался, зеркало не трогаем
    })
    .catch(() => {})
    .finally(() => { inflight = null })
  return inflight
}

// Переключение из админки: пишем в базу, и только после подтверждения сервера
// (saveAudioStaticWaveform бросает, если RLS отсекла запись) меняем то, что видно
export async function setAudioStaticWaveform(on) {
  await saveAudioStaticWaveform(on)
  loaded = true
  apply(!!on)
}

export function getAudioStaticWaveformValue() { return value }

function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function useAudioStaticWaveform() {
  return useSyncExternalStore(subscribe, getAudioStaticWaveformValue, () => false)
}

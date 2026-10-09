// Синтетический «уровень голоса» для эквалайзера плеера в модуле «Сказать фразу» (чистая логика, без React и без DOM).
// РЕАЛЬНЫЙ уровень не снимаем: getUserMedia/AnalyserNode рядом с SpeechRecognition на iPhone ломает распознавание и меняет
// маршрут звука. Вместо этого уровень 0..1 управляется СОБЫТИЯМИ распознавания (speechController.onSignal):
//   audiostart            → тихий «idle» (слушаем, голоса нет);
//   speechstart           → голос пошёл: уровень поднимается до «речи»;
//   interim / final       → всплеск амплитуды, плавно затухает за ~DECAY_MS;
//   speechend / end       → плавно к нулю за FADE_MS.
// Дрожание — детерминированный шум от времени (синусы), без Math.random: картинка одинакова при одинаковых событиях.
// Время t — в мс одной шкалы (rAF-метка performance.now); вызывающий передаёт то же время в signal() и level().
export const IDLE_LEVEL = 0.16     // слушаем, но голоса нет (чуть выше порога MIN_LEVEL эквалайзера — еле виден)
export const SPEECH_LEVEL = 0.4    // ровная «речь» между всплесками
export const BURST_LEVEL = 0.45    // добавка всплеска на каждый interim/final (до 1 в сумме)
export const DECAY_MS = 200        // спад всплеска (постоянная времени экспоненты)
export const RISE_MS = 90          // подъём к «речи» после speechstart
export const FADE_MS = 350         // затухание к нулю после speechend/end

const clamp01 = v => (v > 1 ? 1 : v > 0 ? v : 0)

/** Дрожание 0.85..1.15 как функция времени: несколько несоизмеримых синусов */
export function jitter(tMs) {
  const t = tMs / 1000
  return 1 + 0.08 * Math.sin(t * 17.3) + 0.05 * Math.sin(t * 41.1 + 1.3) + 0.02 * Math.sin(t * 7.9 + 0.6)
}

export function createVoiceLevel() {
  let state = 'off'      // off | idle | speaking | fading
  let since = 0          // время входа в состояние
  let fadeFrom = 0       // уровень в момент начала затухания
  let burstAt = -Infinity
  let burstPeak = 0
  let burstNo = 0

  // Уровень без дрожания и без затухания
  function raw(t) {
    const burst = burstPeak * Math.exp(-Math.max(0, t - burstAt) / DECAY_MS)
    if (state === 'speaking') {
      const rise = clamp01((t - since) / RISE_MS)
      return IDLE_LEVEL + (SPEECH_LEVEL - IDLE_LEVEL) * rise + burst
    }
    return IDLE_LEVEL + burst
  }

  function level(t) {
    if (state === 'off') return 0
    if (state === 'fading') {
      const k = 1 - (t - since) / FADE_MS
      return k <= 0 ? 0 : clamp01(fadeFrom * k * jitter(t))
    }
    return clamp01(raw(t) * jitter(t))
  }

  function fade(t) {
    if (state === 'off' || state === 'fading') return
    fadeFrom = raw(t)
    state = 'fading'
    since = t
  }

  return {
    /** kind — событие контроллера; t — текущее время (мс) */
    signal(kind, t) {
      switch (kind) {
        case 'audiostart': if (state === 'off' || state === 'fading') { state = 'idle'; since = t } break
        case 'speechstart': if (state !== 'speaking') { state = 'speaking'; since = t } break
        case 'interim': case 'final':
          if (state === 'off') break
          if (state === 'fading' || state === 'idle') { state = 'speaking'; since = t } // результат без speechstart — голос всё равно был
          burstNo += 1
          burstAt = t
          burstPeak = BURST_LEVEL * (0.7 + 0.3 * Math.abs(Math.sin(burstNo * 2.7))) // 0.7..1 от пика: всплески не одинаковые
          break
        case 'speechend': case 'end': fade(t); break
        case 'stop': state = 'off'; break
        default: break
      }
    },
    level,
    /** Есть ли что показывать (не off и затухание не доиграно) */
    isLive: t => state !== 'off' && !(state === 'fading' && t - since >= FADE_MS),
    state: () => state,
  }
}

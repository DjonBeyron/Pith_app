// Синтетический «уровень голоса» для эквалайзера плеера в модуле «Сказать фразу» (чистая логика, без React и без DOM).
// РЕАЛЬНЫЙ уровень не снимаем: getUserMedia/AnalyserNode рядом с SpeechRecognition на iPhone ломает распознавание и меняет
// маршрут звука. Вместо этого уровень 0..1 управляется СОБЫТИЯМИ распознавания (speechController.onSignal):
//   audiostart            → тихий «idle» (слушаем, голоса нет);
//   soundstart            → звук пошёл: поднимаемся к «речи» за ATTACK_MS. Это САМОЕ РАННЕЕ событие голоса — приходит, когда
//                           движок только услышал звук, раньше speechstart и первого interim (те запаздывают на 0,5–1,5 с);
//   speechstart           → то же самое (если soundstart не пришёл — на части движков его нет);
//   interim / final       → всплеск амплитуды (нарастает за ATTACK_MS, затухает за ~DECAY_MS) — оживляет картинку, но НЕ старт;
//   soundend              → звук кончился: плавно (DECAY_MS) к idle;
//   speechend / end       → плавно к нулю за FADE_MS.
// Чувствительность: уровень УСИЛЕН ×GAIN с мягким ограничением до 1 (boost), «пол» idle поднят — эквалайзер заметно живее.
// Дрожание — детерминированный шум от времени (синусы), без Math.random: картинка одинакова при одинаковых событиях.
// Время t — в мс одной шкалы (rAF-метка performance.now); вызывающий передаёт то же время в signal() и level().
export const GAIN = 2              // усиление чувствительности (×2) до мягкого ограничения
export const KNEE = 0.7            // с этого уровня после усиления ограничение плавно загибает кривую к 1
export const IDLE_LEVEL = 0.14     // слушаем, но голоса нет (до усиления; после ×2 = 0,28, выше порога MIN_LEVEL эквалайзера)
export const SPEECH_LEVEL = 0.3    // ровная «речь» между всплесками (до усиления; после ×2 = 0,6 — запас под всплески)
export const BURST_LEVEL = 0.45    // добавка всплеска на каждый interim/final (до усиления)
export const DECAY_MS = 200        // спад всплеска (постоянная времени экспоненты)
export const ATTACK_MS = 45        // подъём к «речи» после soundstart/speechstart и нарастание всплеска (быстрая атака 40–60 мс)
export const RISE_MS = ATTACK_MS   // прежнее имя
export const FADE_MS = 350         // затухание к нулю после speechend/end

const clamp01 = v => (v > 1 ? 1 : v > 0 ? v : 0)

/** Усиление ×GAIN с мягким ограничением: до KNEE линейно, дальше плавно (tanh) к 1 и никогда не выше */
export function boost(x) {
  const v = Math.max(0, x) * GAIN
  return v <= KNEE ? v : KNEE + (1 - KNEE) * Math.tanh((v - KNEE) / (1 - KNEE))
}

/** Дрожание 0.85..1.15 как функция времени: несколько несоизмеримых синусов */
export function jitter(tMs) {
  const t = tMs / 1000
  return 1 + 0.08 * Math.sin(t * 17.3) + 0.05 * Math.sin(t * 41.1 + 1.3) + 0.02 * Math.sin(t * 7.9 + 0.6)
}

export function createVoiceLevel() {
  let state = 'off'      // off | idle | speaking | fading
  let since = 0          // время входа в состояние
  let fadeFrom = 0       // уровень (до усиления) в момент начала затухания
  let burstAt = -Infinity
  let burstPeak = 0
  let burstFrom = 0      // вклад предыдущего всплеска в момент нового (нарастаем от него, а не от нуля: частые interim не «сбрасывают» уровень)
  let burstSoft = false  // true — всплеск без нарастания (спад после soundend)
  let burstNo = 0

  // Уровень до усиления и до дрожания
  function burstAtTime(t) {
    const dt = Math.max(0, t - burstAt)
    const peak = burstSoft ? burstPeak : burstFrom + (burstPeak - burstFrom) * clamp01(dt / ATTACK_MS)
    return peak * Math.exp(-dt / DECAY_MS)
  }

  function raw(t) {
    const burst = burstAtTime(t)
    if (state === 'speaking') {
      const rise = clamp01((t - since) / ATTACK_MS)
      return IDLE_LEVEL + (SPEECH_LEVEL - IDLE_LEVEL) * rise + burst
    }
    return IDLE_LEVEL + burst
  }

  function level(t) {
    if (state === 'off') return 0
    if (state === 'fading') {
      const k = 1 - (t - since) / FADE_MS
      return k <= 0 ? 0 : clamp01(boost(fadeFrom) * k * jitter(t))
    }
    return clamp01(boost(raw(t)) * jitter(t))
  }

  function fade(t) {
    if (state === 'off' || state === 'fading') return
    fadeFrom = raw(t)
    state = 'fading'
    since = t
  }

  function speak(t) { if (state !== 'speaking') { state = 'speaking'; since = t } }

  return {
    /** kind — событие контроллера; t — текущее время (мс) */
    signal(kind, t) {
      switch (kind) {
        case 'audiostart': if (state === 'off' || state === 'fading') { state = 'idle'; since = t } break
        case 'soundstart': case 'speechstart':
          if (state === 'off') break // до audiostart слушать нечего
          speak(t)
          break
        case 'soundend':
          if (state !== 'speaking') break
          // к idle не обрывом, а спадом: остаток над idle превращаем в затухающий всплеск
          burstPeak = Math.max(0, raw(t) - IDLE_LEVEL)
          burstAt = t
          burstSoft = true
          state = 'idle'
          since = t
          break
        case 'interim': case 'final':
          if (state === 'off') break
          if (state === 'fading' || state === 'idle') { state = 'speaking'; since = t } // результат без speechstart — голос всё равно был
          burstNo += 1
          burstFrom = burstAtTime(t)
          burstAt = t
          burstSoft = false
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

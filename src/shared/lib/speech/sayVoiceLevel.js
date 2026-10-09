// Синтетический «уровень голоса» для колец вокруг круга «Слушаю…» в модуле «Сказать фразу» (чистая логика, без React и без DOM).
// РЕАЛЬНЫЙ уровень не снимаем: getUserMedia/AnalyserNode рядом с SpeechRecognition на iPhone ломает распознавание и меняет
// маршрут звука. Вместо этого уровень 0..1 управляется СОБЫТИЯМИ распознавания (speechController.onSignal):
//   audiostart            → тихий «idle» (слушаем, голоса нет);
//   soundstart            → звук пошёл: «речь» включается СРАЗУ. Это САМОЕ РАННЕЕ событие голоса — приходит, когда движок только
//                           услышал звук, раньше speechstart и первого interim (те запаздывают на 0,5–1,5 с);
//   speechstart           → то же самое (если soundstart не пришёл — на части движков его нет);
//   interim / final       → всплеск амплитуды (нарастает за ATTACK_MS, затухает за ~DECAY_MS) — оживляет картинку, но НЕ старт;
//   soundend              → звук кончился: плавно (DECAY_MS) к idle;
//   speechend / end       → плавно к нулю за FADE_MS.
// ringLevel(t) — то, что видят кольца: голос БЕЗ пола idle (тишина = 0, «дыхание» добавляет sayRings.js), чувствительность выше
// прежнего эквалайзера ×2 (RING_GAIN 4) и сжатие динамики корнем (level' = level^0.5): даже шёпот поднимает кольца заметно.
// Дрожание — детерминированный шум от времени (синусы), без Math.random: картинка одинакова при одинаковых событиях.
// Время t — в мс одной шкалы (rAF-метка performance.now); вызывающий передаёт то же время в signal() и ringLevel().
export const IDLE_LEVEL = 0.14     // слушаем, но голоса нет (внутренняя шкала; кольца её вычитают)
export const SPEECH_LEVEL = 0.3    // ровная «речь» между всплесками (внутренняя шкала)
export const BURST_LEVEL = 0.45    // добавка всплеска на каждый interim/final
export const RING_GAIN = 4         // чувствительность колец: ×2 к прежним ×2 эквалайзера (шёпот: (SPEECH−IDLE)×4 = 0,64 → корень 0,8)
export const DECAY_MS = 200        // спад всплеска (постоянная времени экспоненты)
export const ATTACK_MS = 45        // подъём к «речи» после soundstart/speechstart и нарастание всплеска (быстрая атака 40–60 мс)
export const FADE_MS = 350         // затухание к нулю после speechend/end

const clamp01 = v => (v > 1 ? 1 : v > 0 ? v : 0)

/** Сжатие динамики: усиление ×RING_GAIN и корень (level' = level^0.5) → тихий голос поднимает кольца сильно, громкий — до 1 */
export function squash(x) { return Math.sqrt(clamp01(Math.max(0, x) * RING_GAIN)) }

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

  // Уровень колец 0..1. Речь включается мгновенно (без атаки) — «soundstart → не меньше 0,5 сразу»; тишина (idle) = 0
  function ringLevel(t) {
    if (state === 'off') return 0
    let x
    if (state === 'fading') {
      const k = 1 - (t - since) / FADE_MS
      x = k <= 0 ? 0 : Math.max(0, fadeFrom - IDLE_LEVEL) * k
    } else if (state === 'speaking') x = SPEECH_LEVEL - IDLE_LEVEL + burstAtTime(t)
    else x = burstAtTime(t)
    const v = squash(x)
    return v > 0 ? clamp01(v * jitter(t)) : 0
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
    ringLevel,
    /** Есть ли что показывать (не off и затухание не доиграно) */
    isLive: t => state !== 'off' && !(state === 'fading' && t - since >= FADE_MS),
    state: () => state,
  }
}

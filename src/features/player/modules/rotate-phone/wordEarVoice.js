// «Голос или тишина» для правила честного зачёта слова (wordEarRule.js): порог — ОТНОСИТЕЛЬНЫЙ, от шума микрофона и пика текущего высказывания, а не константа.
// Зачем (отчёт владельца, iPhone, v3.3.181): микрофон iPhone тихий — речь rms 0,012–0,026 при фоне 0,0002; жёсткий порог 0,015 считал тихую часть слова («‑sting», смычку /t/) тишиной,
// правило решало «голос кончился» посреди слова и обрывало заход: 18 попыток «interesting» — 0 зачётов (итоги «interest», «inte»). Теперь:
//  • ШУМ — нижняя огибающая уровня: вниз идёт быстро (половина разницы за кусок), вверх — медленно (в тишине ≈ +9 дБ/с, в голосе ≈ +0,8 дБ/с: залипший фон отпустит сам). Ровный ноль
//    (игра выключила дорожку на время речи Пита) шумом не считается.
//  • ГОЛОС НАЧАЛСЯ — кусок громче max(шум × ON_NOISE, ON_MIN); ГОЛОС ИДЁТ (гистерезис) — пока громче max(шум × OFF_NOISE, OFF_MIN, пик высказывания × OFF_PEAK):
//    тихие согласные («f», «s», взрыв «k» — 5–10 % пика гласной) остаются голосом, а дыхание и эхо после слова (ниже 5 % пика) — нет.
//  • Пик — только текущего высказывания: громкий щелчок или нота из динамика не «оглушают» правило на следующие слова.
// Чистая логика над часами now(); rms — громкость куска звука 0..1 (voskEngine.bufferRms, кусок ≈ 43–46 мс).
export const ON_NOISE = 4       // начало голоса: во столько раз громче шума
export const OFF_NOISE = 2.5    // продолжение голоса: во столько раз громче шума
export const OFF_PEAK = 0.05    // продолжение голоса: не тише этой доли пика высказывания
export const ON_MIN = 0.003     // начало голоса: тише — не голос ни при каком шуме (шорох у тихого микрофона; речь iPhone — от 0,012)
export const OFF_MIN = 0.0008   // продолжение голоса: тише — не голос (цифровой шум тракта)
export const NOISE_MAX = 0.02   // шум выше не оцениваем (иначе громкая комната заглушила бы голос совсем)
export const EAR_GAP_MS = 350   // тишина короче — то же высказывание
const RISE_QUIET = 2.8, RISE_VOICE = 1.1 // рост оценки шума за секунду, раз: в тишине и в голосе
const r4 = v => Math.round(v * 1e4) / 1e4

export function createEarVoice({ now = () => Date.now() } = {}) {
  let noise = null, peak = 0 // peak — пик текущего (или последнего) высказывания
  let on = null, last = null, prev = null, live = false, low = null // low — самый тихий кусок в текущей паузе
  const thrOn = () => Math.max((noise ?? 0) * ON_NOISE, ON_MIN)
  const thrOff = () => Math.max((noise ?? 0) * OFF_NOISE, OFF_MIN, peak * OFF_PEAK)
  return {
    /** Кусок звука → { voice, started (началось новое высказывание), gap (мс: голос вернулся после паузы внутри высказывания), low (самый тихий кусок этой паузы) } */
    push(rms) {
      const t = now(), dt = Math.min(250, Math.max(0, prev == null ? 0 : t - prev)) // после долгого перерыва (заход закрывали) оценка шума не скачет
      prev = t
      if (live && last != null && t - last > EAR_GAP_MS) live = false // высказывание кончилось
      const voice = rms > 0 && noise != null && rms >= (live ? thrOff() : thrOn()) // первый кусок только задаёт шум
      if (rms > 0) { // оценка шума
        if (noise == null || rms < noise) noise = noise == null ? rms : noise + (rms - noise) * 0.5
        else noise = Math.min(rms, noise * (voice ? RISE_VOICE : RISE_QUIET) ** (dt / 1000))
        noise = Math.min(NOISE_MAX, noise)
      }
      if (!voice) { if (live) low = low == null ? rms : Math.min(low, rms); return { voice: false, started: false, gap: 0 } }
      const started = !live, gap = !started && last != null ? t - last : 0, quietest = low
      if (started) { on = t; peak = rms; live = true } else peak = Math.max(peak, rms)
      last = t; low = null
      return { voice: true, started, gap, low: quietest == null ? null : r4(quietest) }
    },
    /** Сколько мс длится голос текущего высказывания (от первого громкого куска до последнего) */
    ms: () => (on == null ? 0 : last - on),
    /** Сколько мс тишины после последнего громкого куска (null — голоса ещё не было) */
    quietMs: () => (last == null ? null : now() - last),
    /** Числа для журнала: шум, пик высказывания, пороги начала и продолжения голоса, самый тихий кусок текущей паузы */
    state: () => ({ noise: r4(noise ?? 0), peak: r4(peak), on: r4(thrOn()), off: r4(thrOff()), low: low == null ? null : r4(low) }),
  }
}

/** «порог голоса 0.0013 (шум 0.0002, пик речи 0.026)» — для журнала [word-ear] */
export const voiceNote = s => `порог голоса ${s.off} (шум ${s.noise}, пик речи ${s.peak})`

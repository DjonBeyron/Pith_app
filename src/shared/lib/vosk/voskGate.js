// «Затвор тишины» для Vosk: длинную паузу в речи не отдаём распознавателю целиком.
// Зачем: эндпойнтер Vosk сидит в декодере (правила model.conf: 0,5 / 1,0 / 2,0 с тишины после слова), vosk-browser его не настраивает (в API только setWords), а у «Сказать фразу»
// закрытый словарь из ЦЕЛЫХ фраз: после «сам закончил» декодер начинает заново с начала фраз, продолжение («to please both») уже не склеить — медленная речь оборвалась бы навсегда.
// Поэтому тишину сверх GATE_KEEP_MS подряд в декодер не шлём: он «видит» паузу не длиннее ≈0,4 с и сам не заканчивает. Конец речи решает наш авто-стоп (voskTiming.js).
// Громкость звука считает движок (bufferRms), порог GATE_RMS заметно ниже голоса (VOICE_RMS = 0,03): тихий звук слова пропускаем, режем только настоящую тишину.
// Когда в partial уже вся фраза (open), затвор открыт: пусть движок заканчивает сам, как раньше (≈0,5 с) — успех не тормозим. Чистая функция состояния, без React и браузера.

export const GATE_RMS = 0.006 // тише — тишина (с включённым шумоподавлением комната ≈0,001–0,004)
export const GATE_KEEP_MS = 300 // столько тишины подряд ещё отдаём распознавателю (3 куска по 128 мс ≈ 384 мс: короче самого короткого правила эндпойнта, 500 мс)

export function createGate({ rmsMin = GATE_RMS, keepMs = GATE_KEEP_MS } = {}) {
  let quiet = 0 // сколько мс тихо подряд (отданных и нет)
  let dropped = 0 // всего не отдано
  let lastDropped = 0 // длина последнего не отданного куска (если голос вернулся — этот кусок уйдёт «предзвуком»)
  let skipping = false
  return {
    /**
     * Что делать с куском звука: { feed — отдать распознавателю, preroll — перед ним отдать и предыдущий (не отданный) кусок: начало слова могло быть тише порога }.
     * rms — громкость куска, ms — длина, open — затвор открыт (фраза уже вся)
     */
    push(rms, ms, { open = false } = {}) {
      if (open || rms >= rmsMin) {
        const preroll = skipping
        if (preroll) dropped -= lastDropped
        skipping = false; quiet = 0
        return { feed: true, preroll }
      }
      const before = quiet
      quiet += ms
      if (before < keepMs) return { feed: true, preroll: false }
      dropped += ms; lastDropped = ms; skipping = true
      return { feed: false, preroll: false }
    },
    get droppedMs() { return Math.round(dropped) },
  }
}

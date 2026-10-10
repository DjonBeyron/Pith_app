// Тайминги Vosk-теста и авто-стоп. Чистые функции без React и браузера.
// Эндпойнтинг Vosk (итог «сам», когда пауза в речи) стоит в декодере, а не в нашем коде: на практике это ≈0,5–1 с тишины после слова.
// Чтобы итог приходил быстрее, приложение само просит итог («как кнопка Стоп»), когда ТЕКСТ partial не менялся N мс (авто-стоп).

export const AUTOSTOP_MIN = 500
export const AUTOSTOP_MAX = 1500
export const AUTOSTOP_DEFAULT = 800
export const AUTOSTOP_PRESETS = [0, 500, 800, 1000, 1500] // 0 — выключен (итог даёт движок сам или кнопка «Стоп»)
export const AUTOSTOP_PHRASE = 1000 // для целых фраз («Сказать фразу»): пауза перед последним словом до 1 с — ещё речь, а не конец
export const NO_SPEECH_MS = 10000 // запись, в которой так и не заговорили, закрываем сами (потолок записи)

// Хвост речи. Vosk выдаёт последнее слово только когда «видит» после него тишину: если оборвать звук на слове, декодер достраивает конец повтором последнего кадра и слабое
// конечное слово («both», фрикативный /θ/) теряется или получает низкую уверенность. Поэтому перед запросом итога (retrieveFinalResult): ждём последний кусок звука из ScriptProcessor
// (до DRAIN_MAX_MS) и досылаем в распознаватель TAIL_SILENCE_MS тишины (нулевые сэмплы; в воркере это секунды вычислений в долю секунды, на ожидание почти не влияет).
export const TAIL_SILENCE_MS = 400
export const DRAIN_MAX_MS = 300
// «Идёт речь»: кусок звука громче VOICE_RMS — голос. Пока голос был не дольше VOICE_GRACE_MS назад, авто-стоп ждёт (partial мог отстать от голоса), но не дольше VOICE_HOLD_MAX_MS сверх паузы
// (иначе шумная комната никогда бы не закончила попытку).
export const VOICE_RMS = 0.03
export const VOICE_GRACE_MS = 300
export const VOICE_HOLD_MAX_MS = 1200

/** Пауза авто-стопа: 0 = выкл.; иначе 500…1500 мс. Мусор → значение по умолчанию */
export function clampAutoStop(v) {
  const n = v == null || v === '' ? NaN : Number(v)
  if (!Number.isFinite(n)) return AUTOSTOP_DEFAULT
  if (n <= 0) return 0
  return Math.min(AUTOSTOP_MAX, Math.max(AUTOSTOP_MIN, Math.round(n / 50) * 50))
}

/**
 * Пора ли самим просить итог: 'max' — запись длится дольше потолка maxMs; 'auto' — текст partial есть и не менялся autoStopMs;
 * иначе null. Пока ни одного partial не было (не заговорили), авто-стоп не срабатывает — только потолок.
 * lastVoiceAt — когда в последний раз был громкий кусок звука (VOICE_RMS): пока голос ещё идёт, а текст отстал, авто-стоп ждёт (не дольше VOICE_HOLD_MAX_MS).
 */
export function autoStopDue({ now, startedAt, lastChangeAt, text, autoStopMs = 0, maxMs = 0, lastVoiceAt = null }) {
  if (maxMs > 0 && now - startedAt >= maxMs) return 'max'
  if (autoStopMs > 0 && text && lastChangeAt != null && now - lastChangeAt >= autoStopMs) {
    const speaking = lastVoiceAt != null && now - lastVoiceAt < VOICE_GRACE_MS && now - lastChangeAt < autoStopMs + VOICE_HOLD_MAX_MS
    return speaking ? null : 'auto'
  }
  return null
}

/** Сколько мс прошло между концом последнего слова и итогом (null — не знаем). audioStartMs — когда начался звук, от старта записи */
export function afterSpeechMs({ resultMs, audioStartMs, words }) {
  const last = (words || []).at(-1)
  const end = Array.isArray(last) ? last[3] : last?.end
  if (typeof resultMs !== 'number' || typeof audioStartMs !== 'number' || typeof end !== 'number') return null
  return Math.max(0, Math.round(resultMs - audioStartMs - end * 1000))
}

export const STOP_BY = { endpoint: 'движок сам', auto: 'авто-стоп', manual: 'кнопка «Стоп»', max: 'потолок записи' }

/** Медиана и максимум по числам (пустые/не числа отбрасываем). n = 0 → { n: 0 } */
export function summarize(list) {
  const v = (list || []).filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return { n: 0, med: null, max: null }
  const mid = v.length >> 1
  return { n: v.length, med: v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2), max: v[v.length - 1] }
}

/** Секунды с одним знаком: 2706 → «2.7 с» */
export const sec = m => (typeof m === 'number' ? `${(m / 1000).toFixed(1)} с` : '—')

/** Строка таймингов карточки: «старт записи 420 мс · первый partial 1.6 с · итог 2.7 с · слово 0.75–1.53 с · итог через 0.9 с после слова (авто-стоп)» */
export function timeLine(tm, ws = []) {
  if (!tm) return ''
  const w0 = ws[0], w1 = ws.at(-1)
  return [
    tm.tap != null && `старт записи ${tm.tap} мс после «Сказать»`, tm.fp != null && `первый partial ${sec(tm.fp)}`, tm.res != null && `итог ${sec(tm.res)}`,
    w0 && w0[2] != null && w1[3] != null && `слово ${w0[2]}–${w1[3]} с`,
    tm.end != null && `итог через ${sec(tm.end)} после слова`, tm.by && `(${STOP_BY[tm.by] ?? tm.by})`,
  ].filter(Boolean).join(' · ')
}

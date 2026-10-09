// Вспомогательные чистые функции контроллера распознавания: история промежуточных (interim) обновлений и сегменты режима
// continuous (проба «Голос», эксперименты против «домысливания движка»). Без React и window.

export const HISTORY_CAP = 80 // сколько записей истории interim храним в попытке (старейшие отбрасываем)

/**
 * Добавить запись в историю попытки: текст {t, text, final?} или служебное событие движка {t, kind} (soundstart/speechstart/speechend/soundend/audioend —
 * у него нет text). Подряд идущий дубль (тот же текст и тип / то же событие) не пишем. Возвращает новый массив
 */
export function pushHistory(history, entry, cap = HISTORY_CAP) {
  const last = history[history.length - 1]
  if (last && (entry.kind ? last.kind === entry.kind : !last.kind && last.text === entry.text && !!last.final === !!entry.final)) return history
  const next = [...history, entry]
  return next.length > cap ? next.slice(next.length - cap) : next
}

const altsOf = r => Array.from(r).map(x => ({ text: String(x.transcript ?? '').trim(), confidence: x.confidence }))

/**
 * Сегменты continuous-результата: по одному на каждый SpeechRecognitionResult.
 * prev — сегменты прошлого события (чтобы сохранить момент появления t и момент финализации tFinal), t — мс от старта попытки.
 */
export function readSegments(results, prev, t) {
  const out = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const alts = altsOf(r)
    const p = prev[i]
    out.push({
      text: alts[0]?.text ?? '', confidence: alts[0]?.confidence ?? null, isFinal: !!r.isFinal, alts,
      t: p ? p.t : t,
      tFinal: r.isFinal ? (p?.isFinal ? p.tFinal : t) : null,
    })
  }
  return out
}

export const segmentsText = segs => segs.map(s => s.text).filter(Boolean).join(' ')

/** Средняя уверенность финальных сегментов; нет финальных или нет чисел → null */
export function segmentsConfidence(segs) {
  const c = segs.filter(s => s.isFinal && typeof s.confidence === 'number').map(s => s.confidence)
  return c.length ? c.reduce((x, y) => x + y, 0) / c.length : null
}

/** Результаты обычного (не continuous) события: { alts: [{text, confidence}] | null (финала ещё нет), interim: строка } */
export function readResults(results) {
  const finals = []
  let interim = ''
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.isFinal) finals.push(r)
    else interim += (interim ? ' ' : '') + r[0].transcript
  }
  if (!finals.length) return { alts: null, interim }
  const alts = finals.length === 1
    ? Array.from(finals[0]).map(x => ({ text: x.transcript.trim(), confidence: x.confidence }))
    : [{ text: finals.map(r => r[0].transcript.trim()).join(' '), confidence: finals.reduce((s, r) => s + r[0].confidence, 0) / finals.length }]
  return { alts, interim }
}

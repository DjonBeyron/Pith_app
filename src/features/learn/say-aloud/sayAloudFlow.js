// Ход раунда «Скажи вслух» — чистый редьюсер без таймеров: слово за словом, Пит показывает перевод, ученик называет английское слово.
// mode: ask (ждём слово) → ok (услышали) | miss (не успел или пропустил: показываем ответ) → advance → следующее слово; после последнего done.
// seq — номера слов раунда в порядке, как их услышал Vosk (listener копит его по заходам и не откатывает назад). Слово принимается, если в ещё не разобранной части seq есть его номер:
// так слово, сказанное чуть раньше, чем сменился экран, не пропадает, а лишнее/чужое слово просто пропускается.
export const WORD_MS = 10000    // сколько ждём одно слово
export const OK_MS = 1000       // пауза после верного слова
export const MISS_MS = 2000     // пауза, пока показан верный ответ после промаха
export const ROUND_MS = 90000   // потолок раунда: после него останавливаемся, оставшиеся слова не засчитываются

export const initFlow = n => ({ n, idx: 0, mode: n > 0 ? 'ask' : 'done', answers: [], handled: 0, seq: [] })

// В режиме ask ищем в неразобранной части seq номер текущего слова
function settle(s) {
  if (s.mode !== 'ask') return s
  const p = s.seq.findIndex((e, i) => i >= s.handled && e === s.idx)
  return p < 0 ? s : { ...s, mode: 'ok', handled: p + 1, answers: [...s.answers, true] }
}

const miss = s => (s.mode === 'ask' ? { ...s, mode: 'miss', answers: [...s.answers, false] } : s)

export function flowReduce(s, a) {
  switch (a.type) {
    case 'hear': return settle({ ...s, seq: a.seq })
    case 'timeout': case 'skip': return miss(s)
    case 'advance': {
      if (s.mode !== 'ok' && s.mode !== 'miss') return s
      const idx = s.idx + 1
      return idx >= s.n ? { ...s, idx, mode: 'done' } : settle({ ...s, idx, mode: 'ask' })
    }
    case 'finish': return s.mode === 'done' ? s : { ...s, mode: 'done' }
    default: return s
  }
}

/** Ответы для итога: по порядку заданных слов (идут подряд, поэтому answers[i] — про words[i]) */
export const answersOf = (words, s) => s.answers.map((ok, i) => ({ word: words[i].word, translation: words[i].translation, ok }))

/** Сколько мс держать текущий режим до следующего шага (0 — не держим, ждём ученика) */
export const holdMs = mode => (mode === 'ok' ? OK_MS : mode === 'miss' ? MISS_MS : 0)

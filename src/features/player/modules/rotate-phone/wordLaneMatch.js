// Распознавание в игре «Повтори за диктором»: что считать принятым словом. Чистые функции.
// Ученик повторяет слово SLOT_COUNT раз подряд. Vosk отдаёт partial — «try try [unk] try»: слова слоя (hit) и всё остальное (miss: [unk] или чужое слово).
// Слов в одной попытке может быть несколько — сколько услышано, столько слоёв и заливается; каждое неверное слово — «отшатывание» линии.
import { tokenize } from '../../../../shared/lib/speech/speechMatch.js'
import { SLOT_COUNT } from './wordLaneTimeline.js'

const UNK = '[unk]'

/**
 * Услышанное → { hits, misses }: сколько раз сказана цель (target — слово/короткая фраза: «get up» считается одним попаданием) и сколько слов «не то». Сырой partial Vosk годится как есть:
 * [unk] остаётся меткой промаха. final=false (идёт речь): последнее слово ещё может измениться, поэтому промахом оно не считается — линия не «отшатывается» от недосказанного слова.
 */
export function analyzeHeard(raw, word, final = true) {
  const target = tokenize(word)
  const heard = String(raw ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  let hits = 0
  let misses = 0
  for (let i = 0; i < heard.length;) {
    const part = heard.slice(i, i + target.length)
    if (target.length && part.length === target.length && tokenize(part.join(' ')).join(' ') === target.join(' ')) { hits++; i += target.length }
    else { if ((final || i < heard.length - 1) && (heard[i] === UNK || tokenize(heard[i]).length)) misses++; i++ }
  }
  return { hits, misses }
}

/**
 * Закрытый словарь Vosk на игру: всё, что ученик может сказать за один заход, — от одного до `max` слов, где каждое либо цель, либо «не то» ([unk]).
 * Так движок видит повтор «try try try» одним высказыванием и не подменяет чужое слово целью. Число фраз — 2 + 4 + … (при max = 3: 14).
 */
export function wordGrammar(word, max = SLOT_COUNT) {
  const w = tokenize(word).join(' ')
  if (!w) return null
  let level = [[]]
  const out = []
  for (let n = 1; n <= max; n++) {
    level = level.flatMap(seq => [[...seq, w], [...seq, UNK]])
    out.push(...level.map(seq => seq.join(' ')))
  }
  return JSON.stringify([...out, UNK])
}

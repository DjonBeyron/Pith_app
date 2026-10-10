// Результат Vosk → текст для оценки модуля «Сказать фразу». Чистые функции.
// Правила: нижний регистр, апострофы к ' («i’m» → «i'm»; «i'm» ↔ «i am» дальше уравнивает speechMatch.tokenize), метка [unk] («слово вне словаря») — НЕ слово и в текст не идёт,
// слово с уверенностью ниже порога (VOSK_MIN_CONF) считается нераспознанным и тоже выпадает: оценка увидит «не хватило слова», а не угаданное наугад.
export const VOSK_MIN_CONF = 0.3 // порог уверенности слова; админская таблица порога «Теста 3» (voskThreshold.js) показывает, где он ловит ошибки без ложных отказов
export const UNK = '[unk]'

const norm = s => String(s ?? '').toLowerCase().replace(/[‘’‛ʼ´`]/g, "'").replace(/\s+/g, ' ').trim()
const isUnk = w => norm(w) === UNK

/** Промежуточный текст (partial) без метки [unk]; уверенности у partial нет */
export const cleanPartial = text => norm(text).split(' ').filter(w => w && w !== UNK).join(' ')

/**
 * Итог: text/words из результата Vosk (words — [{word, conf, start, end}] от setWords). Есть пословные метки — берём из них только слова с conf ≥ minConf и не [unk];
 * нет меток — берём text как есть без [unk]. Возвращает { text, confidence (средняя уверенность оставшихся слов 0..1 или null), unk (сколько [unk]), low (сколько слов отброшено по порогу) }
 */
export function cleanResult({ text, words, minConf = VOSK_MIN_CONF } = {}) {
  const list = Array.isArray(words) ? words.filter(w => w && typeof w.word === 'string') : []
  if (!list.length) return { text: cleanPartial(text), confidence: null, unk: 0, low: 0 }
  const unk = list.filter(w => isUnk(w.word)).length
  const real = list.filter(w => !isUnk(w.word))
  const kept = real.filter(w => typeof w.conf !== 'number' || w.conf >= minConf)
  const confs = kept.map(w => w.conf).filter(c => typeof c === 'number')
  return {
    text: norm(kept.map(w => w.word).join(' ')),
    confidence: confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : null,
    unk, low: real.length - kept.length,
  }
}

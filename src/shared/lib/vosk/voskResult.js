// Результат Vosk → текст для оценки модуля «Сказать фразу». Чистые функции.
// Правила: нижний регистр, апострофы к ' («i’m» → «i'm»; «i'm» ↔ «i am» дальше уравнивает speechMatch.tokenize), метка [unk] («слово вне словаря») — НЕ слово и в текст не идёт,
// слово с уверенностью ниже порога (VOSK_MIN_CONF) считается нераспознанным и тоже выпадает: оценка увидит «не хватило слова», а не угаданное наугад.
export const VOSK_MIN_CONF = 0.3 // порог уверенности слова; админская таблица порога «Теста 3» (voskThreshold.js) показывает, где он ловит ошибки без ложных отказов
// Мягкий порог для ПОСЛЕДНЕГО слова эталона. Словарь закрытый: всё, что Vosk выдал, и так слово из нашего списка, а [unk] отсекается отдельно — порог нужен лишь против случайного угадывания.
// У конечного слова уверенность занижена по природе (декодер не видит после него продолжения, слабый конечный звук вроде /θ/ в «both»), и жёсткие 0.3 выбрасывали его чаще всех остальных.
export const VOSK_TAIL_MIN_CONF = 0.15
export const UNK = '[unk]'

const norm = s => String(s ?? '').toLowerCase().replace(/[‘’‛ʼ´`]/g, "'").replace(/\s+/g, ' ').trim()
const isUnk = w => norm(w) === UNK

/** Промежуточный текст (partial) без метки [unk]; уверенности у partial нет */
export const cleanPartial = text => norm(text).split(' ').filter(w => w && w !== UNK).join(' ')

/**
 * Слова итога с вердиктом фильтра (для диагностики и для cleanResult): [{ ...слово Vosk, need (нужная уверенность, null — [unk]), drop: null | 'unk' | 'low' }].
 * Последнее настоящее слово, равное tailWord (последнему слову эталона), проверяется мягче — tailMinConf.
 */
export function judgeWords(words, { minConf = VOSK_MIN_CONF, tailWord = '', tailMinConf = VOSK_TAIL_MIN_CONF } = {}) {
  const list = Array.isArray(words) ? words.filter(w => w && typeof w.word === 'string') : []
  let lastReal = -1
  list.forEach((w, i) => { if (!isUnk(w.word)) lastReal = i })
  const tail = norm(tailWord)
  return list.map((w, i) => {
    if (isUnk(w.word)) return { ...w, need: null, drop: 'unk' }
    const need = i === lastReal && tail && norm(w.word) === tail ? Math.min(minConf, tailMinConf) : minConf
    return { ...w, need, drop: typeof w.conf === 'number' && w.conf < need ? 'low' : null }
  })
}

/**
 * Итог: text/words из результата Vosk (words — [{word, conf, start, end}] от setWords). Есть пословные метки — берём из них только слова с conf ≥ minConf (последнее слово эталона tailWord — с мягким порогом)
 * и не [unk]; нет меток — берём text как есть без [unk]. Возвращает { text, confidence (средняя уверенность оставшихся слов 0..1 или null), unk (сколько [unk]), low (сколько слов отброшено по порогу), rows (judgeWords) }
 */
export function cleanResult({ text, words, minConf = VOSK_MIN_CONF, tailWord = '', tailMinConf = VOSK_TAIL_MIN_CONF } = {}) {
  const rows = judgeWords(words, { minConf, tailWord, tailMinConf })
  if (!rows.length) return { text: cleanPartial(text), confidence: null, unk: 0, low: 0, rows }
  const kept = rows.filter(w => !w.drop)
  const confs = kept.map(w => w.conf).filter(c => typeof c === 'number')
  return {
    text: norm(kept.map(w => w.word).join(' ')),
    confidence: confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : null,
    unk: rows.filter(w => w.drop === 'unk').length, low: rows.filter(w => w.drop === 'low').length, rows,
  }
}

// Разметка рта для СВОЕГО файла озвучки (voskAlign.js): текст реплики → слова, как их пишет Vosk, словарь для распознавателя и сопоставление итога Vosk со словами текста. Чистые функции.
//  • Слово текста (token) — кусок между пробелами, в котором есть буква или цифра: ровно так же считает слова mouthTrack (wordLaneVisemes.js) и так же режет озвучку ElevenLabs (tts-elevenlabs:
//    wordTimingsFromAlignment) — знаки препинания остаются приклеенными к слову («Отлично!»), тире отдельным «словом» не идёт.
//  • Ключи слова (keys) — как его слышит Vosk: строчные, без знаков, дефис делит слово («кто-то» → кто, то), число — словами (0…99, именительный падеж), апостроф остаётся (it's).
//    «ё» в словарь идёт в обеих записях («ещё» и «еще»: модель могла выучить любую), сравнение — с «ё» ≡ «е».
//  • Язык — по большинству слов: кириллица → русская модель, латиница → английская. Слова другого письма в словарь не идут (модель их не знает) — они будут достроены (voskAlignFill.js).
export const UNK = '[unk]'
const WORDY = /[a-zа-яё0-9]/i
const RU = /[а-яё]/i, EN = /[a-z]/i

const RU_ONES = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const RU_TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** Число 0…99 словами (lang 'ru' | 'en') → слова; больше или не число → [] (такое слово Vosk не найдёт — оно будет достроено) */
export function numberWords(digits, lang = 'ru') {
  const n = /^\d{1,2}$/.test(digits) ? Number(digits) : -1
  if (n < 0) return []
  const ones = lang === 'ru' ? RU_ONES : EN_ONES, tens = lang === 'ru' ? RU_TENS : EN_TENS
  return n < 20 ? [ones[n]] : n % 10 ? [tens[Math.floor(n / 10)], ones[n % 10]] : [tens[n / 10]]
}

/** «ё» ≡ «е» — для сравнения слов текста со словами Vosk */
export const fold = w => String(w ?? '').toLowerCase().replace(/ё/g, 'е')

/** Язык реплики: 'ru' | 'en' — по большинству слов (поровну и без букв — русский: реплики Пита и Мии русские) */
export function textLang(text) {
  let ru = 0, en = 0
  for (const w of String(text ?? '').split(/\s+/)) { if (RU.test(w)) ru++; else if (EN.test(w)) en++ }
  return en > ru ? 'en' : 'ru'
}

/** Ключи одного слова текста для модели lang: «Кто-то,» → ['кто', 'то']; «It's» → ["it's"]; «5» → ['пять'] */
export function wordKeys(word, lang = 'ru') {
  const s = String(word ?? '').toLowerCase().replace(/[‘’‛ʼ´`]/g, "'")
  const out = []
  for (const part of s.split(/[^a-zа-яё0-9']+/)) {
    for (const p of part.match(/\d+|[a-zа-яё']+/g) ?? []) {
      if (/^\d/.test(p)) out.push(...numberWords(p, lang))
      else { const w = p.replace(/^'+|'+$/g, ''); if (w) out.push(w) }
    }
  }
  return out
}

/** Знает ли модель языка lang такое письмо (русская — кириллицу, английская — латиницу с апострофом) */
export const inScript = (key, lang) => (lang === 'ru' ? /^[а-яё]+$/ : /^[a-z']+$/).test(key)

/** Текст реплики → слова: [{ w (как в тексте, со знаками), keys (как пишет Vosk; пусто — модель такое не найдёт) }] */
export function alignTokens(text, lang = textLang(text)) {
  return String(text ?? '').split(/\s+/).filter(w => WORDY.test(w)).map(w => ({ w, keys: wordKeys(w, lang).filter(k => inScript(k, lang)) }))
}

/** Словарь распознавателя (JSON для KaldiRecognizer): фраза целиком (+ запись без «ё», если отличается) и «[unk]»; слов нет — null */
export function alignGrammar(tokens) {
  const keys = tokens.flatMap(t => t.keys)
  if (!keys.length) return null
  const phrase = keys.join(' '), plain = fold(phrase)
  return JSON.stringify([...new Set([phrase, plain]), UNK])
}

/** Слова итога Vosk, годные для сопоставления: настоящие (не [unk]) с конечными временами start < end, по порядку времени */
export function heardWords(words) {
  return (Array.isArray(words) ? words : [])
    .filter(w => w && typeof w.word === 'string' && w.word !== UNK && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .map(w => ({ word: w.word, start: w.start, end: w.end, conf: w.conf }))
    .sort((a, b) => a.start - b.start)
}

/**
 * Выравнивание двух последовательностей по порядку (наибольшая общая подпоследовательность): keys — слова текста, heard — слова Vosk (строки).
 * → массив длиной keys.length: индекс слова Vosk или -1 (не найдено). Повторяющиеся слова берутся по порядку, лишние слова Vosk пропускаются.
 */
export function alignSeq(keys, heard) {
  const a = keys.map(fold), b = heard.map(fold), n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = new Array(n).fill(-1)
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j] && dp[i][j] === dp[i + 1][j + 1] + 1) { out[i] = j; i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++
  }
  return out
}

/**
 * Слова текста + итог Vosk → времена найденных слов: { times: [{ t, e } | null по каждому слову текста], found, extra (слов Vosk, которым не нашлось места в тексте), heard (сколько настоящих слов услышал Vosk) }.
 * Слово из нескольких ключей («кто-то») найдено, если найден хоть один ключ: начало — первого найденного, конец — последнего.
 */
export function matchTokens(tokens, voskWords) {
  const heard = heardWords(voskWords)
  const flat = tokens.flatMap((t, i) => t.keys.map(k => ({ k, i })))
  const hit = alignSeq(flat.map(x => x.k), heard.map(h => h.word))
  const times = tokens.map(() => null)
  hit.forEach((j, q) => {
    if (j < 0) return
    const i = flat[q].i, h = heard[j]
    times[i] = times[i] ? { t: Math.min(times[i].t, h.start), e: Math.max(times[i].e, h.end) } : { t: h.start, e: h.end }
  })
  const used = hit.filter(j => j >= 0).length
  return { times, found: times.filter(Boolean).length, extra: heard.length - used, heard: heard.length }
}

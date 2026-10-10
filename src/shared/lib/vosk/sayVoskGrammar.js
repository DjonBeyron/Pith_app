// Закрытый словарь Vosk для модуля «Сказать фразу»: из полей шага (readSayData: phrase, keywords) строим список фраз, из которых движок ОБЯЗАН выбрать —
// верная фраза целиком + фразы с неверной формой слова + [unk] («Фразы целиком», как в лаборатории — voskGrammar.js админ-пробы). Так «I'm try» остаётся
// «I'm try» и не превращается в «I'm trying», а лишнее слово уходит в [unk]. Какие слова менять: ключевые слова шага (поле keywords — необязательно); если их нет — ВСЕ слова
// фразы, у которых есть формы (wordForms.js: play → plays / played / playing), родственные формы берёт formsOfWord; сначала слова в «изменённой» форме (trying, goes, cats; isInflectedWord), потом остальные.
// Формы — по одной подмене на фразу (не комбинаторика), число фраз ограничено MAX_GRAMMAR_PHRASES (формы разных слов берутся по кругу, чтобы потолок не съел последнее слово).
// Числа (numberWords.js): цифры в фразе заменяются словами, ВСЕ допустимые прочтения («1998» → «nineteen ninety eight» и «one thousand nine hundred ninety eight», «0» → «zero» и «oh») — верные фразы,
// основное прочтение первым; ошибочные формы строятся от основного прочтения, слова-числа не склоняем. Порог и «Строго» словарь не меняют — они работают на оценке (judgeRun).
// Чистые функции, без React и браузера.
import { tokenize } from '../speech/speechMatch.js'
import { formsOfWord, isInflectedWord } from '../speech/wordForms.js'
import { readingsOfText, isNumberWord } from '../speech/numberWords.js'

export const UNK = '[unk]'
export const MAX_GRAMMAR_PHRASES = 24 // верная фраза + ошибочные; в словаре строк вдвое больше («i'm» и «i am» — две записи)
export const MAX_FORMS_PER_WORD = 4
export const MAX_ALT_READINGS = 5 // прочтений чисел сверх основного, попадающих в словарь

const clean = s => String(s ?? '').toLowerCase().replace(/[‘’‛ʼ´`]/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
const PUNCT = /[\s.,!?;:"'‘’“”…–—()-]/g

/**
 * Почему фраза не годится для Vosk: null — годится; 'empty' — пусто; 'numbers' — есть число, которого мы не умеем читать (десятичное, от 10000, телефон, «3:30 pm»);
 * 'chars' — не латиница. Простые числа (2, 25, 1998, 21st, 5%, $5, 3:30 — numberWords.js) годятся: Vosk получит их словами
 */
export function voskPhraseProblem(phrase) {
  const readings = readingsOfText(String(phrase ?? ''))
  if (!readings) return 'numbers'
  const p = readings[0]
  if (!clean(p).length) return /[^\s\p{P}]/u.test(String(phrase ?? '')) ? 'chars' : 'empty'
  return /[^A-Za-z]/.test(p.replace(PUNCT, '')) ? 'chars' : null
}

/** Фразу может распознать Vosk: латиница, обычная пунктуация и простые числа. Чужие буквы и сложные числа он выдать не умеет — такие фразы идут на системное распознавание */
export const isVoskPhrase = phrase => voskPhraseProblem(phrase) === null

// Слова, которые меняем: ключевые слова шага, что есть во фразе; нет ключевых — все слова фразы с родственными формами. Группы: сначала слова в «изменённой» форме (trying, goes, cats), потом остальные
function varyGroups(words, keywords) {
  const keys = new Set((keywords ?? []).flatMap(k => clean(k).split(' ')).filter(Boolean))
  const chosen = words.filter(w => keys.has(w))
  const groups = chosen.length ? [chosen] : [words.filter(isInflectedWord), words.filter(w => !isInflectedWord(w))]
  const seen = new Set()
  return groups.map(g => [...new Set(g)].filter(w => !seen.has(w) && !isNumberWord(w) && seen.add(w))
    .map(w => ({ word: w, forms: formsOfWord(w).slice(0, MAX_FORMS_PER_WORD) })).filter(x => x.forms.length))
}

/** Фразы словаря: [верная (основное прочтение), другие верные прочтения чисел, …ошибочные] (чистый текст в нижнем регистре, без знаков), не больше `limit` */
export function sayGrammarPhrases(data, limit = MAX_GRAMMAR_PHRASES) {
  const readings = (readingsOfText(String(data?.phrase ?? '')) ?? [data?.phrase]).map(clean)
  const correct = readings[0]
  if (!correct) return []
  const words = correct.split(' ')
  const out = [correct]
  for (const alt of readings.slice(1, 1 + MAX_ALT_READINGS)) if (alt && !out.includes(alt) && out.length < limit) out.push(alt)
  for (const vary of varyGroups(words, data?.keywords)) {
    for (let k = 0; k < MAX_FORMS_PER_WORD && out.length < limit; k++) {
      for (const { word, forms } of vary) {
        if (forms[k] == null) continue
        const at = words.indexOf(word)
        const phrase = words.map((w, i) => (i === at ? forms[k] : w)).join(' ')
        if (!out.includes(phrase) && out.length < limit) out.push(phrase)
      }
    }
  }
  return out
}

/** Словарь для Vosk: { json (JSON-массив строк, в конце [unk]), phrases (верная первой), words (слова словаря без [unk]) } */
export function buildSayGrammar(data) {
  const phrases = sayGrammarPhrases(data)
  const lines = [...new Set(phrases.flatMap(p => [p, tokenize(p).join(' ')]).filter(Boolean))]
  return { json: JSON.stringify([...lines, UNK]), phrases, words: [...new Set(lines.flatMap(l => l.split(' ')))] }
}

/** Проверка «вся фраза услышана»: text → true, если его слова (tokenize: «i'm» = «i am», числа словами) в точности равны одному из верных прочтений фразы. Для быстрой остановки (voskTiming.AUTOSTOP_FULL) и открытия затвора тишины */
export function sayCompleteCheck(data) {
  const readings = readingsOfText(String(data?.phrase ?? '')) ?? [data?.phrase]
  const ok = new Set(readings.slice(0, 1 + MAX_ALT_READINGS).map(r => tokenize(r).join(' ')).filter(Boolean))
  return text => ok.size > 0 && ok.has(tokenize(text).join(' '))
}

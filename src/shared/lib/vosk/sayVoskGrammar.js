// Закрытый словарь Vosk для модуля «Сказать фразу»: из полей шага (readSayData: phrase, keywords) строим список фраз, из которых движок ОБЯЗАН выбрать —
// верная фраза целиком + фразы с неверной формой ключевого слова + [unk] («Фразы целиком», как в лаборатории — voskGrammar.js админ-пробы). Так «I'm try» остаётся
// «I'm try» и не превращается в «I'm trying», а лишнее слово уходит в [unk]. Какие слова менять: ключевые слова шага (поле keywords — автору стоит их задавать); если их нет — слова
// фразы в «изменённой» форме (trying, goes, cats; wordForms.js: isInflectedWord), родственные формы берёт formsOfWord. Формы — по одной подмене на фразу (не комбинаторика), число фраз ограничено
// MAX_GRAMMAR_PHRASES (формы разных слов берутся по кругу, чтобы потолок не съел последнее слово). Порог и «Строго» словарь не меняют — они работают на оценке (judgeRun).
// Чистые функции, без React и браузера.
import { tokenize } from '../speech/speechMatch.js'
import { formsOfWord, isInflectedWord } from '../speech/wordForms.js'

export const UNK = '[unk]'
export const MAX_GRAMMAR_PHRASES = 24 // верная фраза + ошибочные; в словаре строк вдвое больше («i'm» и «i am» — две записи)
export const MAX_FORMS_PER_WORD = 4

const clean = s => String(s ?? '').toLowerCase().replace(/[‘’‛ʼ´`]/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
const PUNCT = /[\s.,!?;:"'‘’“”…–—()-]/g

/** Фразу может распознать Vosk: только латинские буквы и обычная пунктуация. Цифры («2 cats») и чужие буквы он выдать не умеет — такие фразы идут на системное распознавание */
export const isVoskPhrase = phrase => {
  const p = String(phrase ?? '')
  return clean(p).length > 0 && !/[^A-Za-z]/.test(p.replace(PUNCT, ''))
}

// Слова, которые меняем: ключевые слова шага, что есть во фразе; нет ключевых — все слова фразы с родственными формами
function varyWords(words, keywords) {
  const keys = new Set((keywords ?? []).flatMap(k => clean(k).split(' ')).filter(Boolean))
  const chosen = words.filter(w => keys.has(w))
  const list = chosen.length ? chosen : words.filter(isInflectedWord) // без ключевых слов — только слова в «изменённой» форме (trying, goes, cats): у hello / world ошибочной формы нет
  return [...new Set(list)].map(w => ({ word: w, forms: formsOfWord(w).slice(0, MAX_FORMS_PER_WORD) })).filter(x => x.forms.length)
}

/** Фразы словаря: [верная, …ошибочные] (чистый текст в нижнем регистре, без знаков), не больше `limit` */
export function sayGrammarPhrases(data, limit = MAX_GRAMMAR_PHRASES) {
  const correct = clean(data?.phrase)
  if (!correct) return []
  const words = correct.split(' ')
  const vary = varyWords(words, data?.keywords)
  const out = [correct]
  for (let k = 0; k < MAX_FORMS_PER_WORD && out.length < limit; k++) {
    for (const { word, forms } of vary) {
      if (forms[k] == null) continue
      const at = words.indexOf(word)
      const phrase = words.map((w, i) => (i === at ? forms[k] : w)).join(' ')
      if (!out.includes(phrase) && out.length < limit) out.push(phrase)
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

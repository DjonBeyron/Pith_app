// Сокращения при сравнении фраз этапа 2 «Фразы» (racePhraseScore.js; замечание владельца 2026-11-08: Vosk слышит «am trying to learn» вместо «I'm trying to learn» — фраза не засчитывалась).
// tokenize (speechMatch.js) уже раскрывает сокращения в обе стороны: «i'm» ↔ «i am», «you're» ↔ «you are», «it's» ↔ «it is», «don't» ↔ «do not», «let's» ↔ «let us», «gonna» ↔ «going to», «wanna» ↔ «want to».
// Здесь — то, чего ему не хватает: формы без апострофа (Vosk и ученик пишут «im», «dont», «lets») — normForms сводит их к сокращениям (и в цели, и в услышанном), и «опорная часть» слова-сокращения:
// слово цели «I'm» засчитано, если услышано «am» (PART_OK) — местоимение Vosk глотает чаще всего. Чистые функции.
export const BARE = { im: "i'm", youre: "you're", dont: "don't", lets: "let's", its: "it's", cant: "can't", wont: "won't", isnt: "isn't", arent: "aren't", doesnt: "doesn't", didnt: "didn't", thats: "that's", whats: "what's" }
export const PART_OK = { "i'm": ['am'] } // слово-сокращение → какие его токены одни уже значат «сказал»

const APOS = /[‘’‛ʼ´`]/g

/** Строка: апострофы — к ', формы без апострофа — к сокращениям («im trying» → «i'm trying»); остальное как есть */
export const normForms = text => String(text ?? '').replace(APOS, "'").split(/(\s+)/).map(w => BARE[w.toLowerCase()] ?? w).join('')

/** Слово-сокращение засчитано по опорной части: word — слово цели (после normForms), items — его токены из matchPhrase ({ word, ok }) */
export function partOk(word, items) {
  const need = PART_OK[String(word ?? '').toLowerCase()]
  return !!need && need.every(t => items.some(it => it.word === t && it.ok))
}

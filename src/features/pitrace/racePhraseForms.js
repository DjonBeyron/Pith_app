// Сокращения при сравнении фраз этапа 2 «Фразы» (racePhraseScore.js; замечание владельца 2026-11-08: Vosk слышит «am trying to learn» вместо «I'm trying to learn» — фраза не засчитывалась).
// tokenize (speechMatch.js) уже раскрывает сокращения в обе стороны: «i'm» ↔ «i am», «you're» ↔ «you are», «it's» ↔ «it is», «don't» ↔ «do not», «let's» ↔ «let us», «gonna» ↔ «going to», «wanna» ↔ «want to».
// Здесь — то, чего ему не хватает: формы без апострофа (Vosk и ученик пишут «im», «dont», «lets») — normForms сводит их к сокращениям (и в цели, и в услышанном), и «опорная часть» слова-сокращения:
// слово цели «I'm» засчитано, если услышано «am» (PART_OK) — местоимение Vosk глотает чаще всего. Чистые функции.
import { latinRu } from './racePhraseLatin.js'

export const BARE = { im: "i'm", youre: "you're", hes: "he's", shes: "she's", theyre: "they're", ive: "i've", youve: "you've", weve: "we've", theyve: "they've", youll: "you'll", theyll: "they'll", whos: "who's", theres: "there's", heres: "here's", dont: "don't", lets: "let's", its: "it's", cant: "can't", wont: "won't", isnt: "isn't", arent: "aren't", doesnt: "doesn't", didnt: "didn't", thats: "that's", whats: "what's" }
// слово-сокращение → какие его токены одни уже значат «сказал». v3.3.373 (владелец: «нужно, чтобы и подобные фразы типа I'm или he's не вызывали проблем»): то же для ВСЕХ сокращений
// «местоимение + глагол» — Vosk глотает местоимение и отдаёт один глагол («is trying» за «he's trying»). Опорная часть — только глагол: одно местоимение («he») слово не зажигает,
// иначе в полном «he is …» глагол остался бы лишним токеном и светился неверным словом. Отрицания (don't, can't…) и let's сюда не входят: их половина меняет смысл.
const VERB = { "'m": 'am', "'re": 'are', "'s": 'is', "'ve": 'have', "'ll": 'will', "'d": 'would' }
const HEADS = { "'m": ['i'], "'re": ['you', 'we', 'they'], "'s": ['he', 'she', 'it', 'that', 'there', 'what', 'who', 'here'], "'ve": ['i', 'you', 'we', 'they'], "'ll": ['i', 'you', 'he', 'she', 'we', 'they', 'it'], "'d": ['i', 'you', 'he', 'she', 'we', 'they'] }
export const PART_OK = Object.fromEntries(Object.entries(HEADS).flatMap(([tail, heads]) => heads.map(h => [h + tail, [VERB[tail]]])))

const APOS = /[‘’‛ʼ´`]/g

/** Строка: апострофы — к ', формы без апострофа — к сокращениям («im trying» → «i'm trying»), кириллица — латиницей (racePhraseLatin.js: русские фразы стенда пилюль); остальное как есть */
export const normForms = text => latinRu(String(text ?? '').replace(APOS, "'").split(/(\s+)/).map(w => BARE[w.toLowerCase()] ?? w).join(''))

/** Слово-сокращение засчитано по опорной части: word — слово цели (после normForms), items — его токены из matchPhrase ({ word, ok }) */
export function partOk(word, items) {
  const need = PART_OK[String(word ?? '').toLowerCase()]
  return !!need && need.every(t => items.some(it => it.word === t && it.ok))
}

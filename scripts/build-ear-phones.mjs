// Сборщик таблицы произношений для фонетических ловушек «честного зачёта слова» (src/shared/lib/vosk/phones/enPhones.js; описание — phoneNeighbors.js, CONCEPT_PILLSTAND.md).
// Источники в репозитории НЕ хранятся и в зависимости проекта не входят — поставьте их во временную папку и передайте пути:
//   npm i --prefix /tmp/ear cmu-pronouncing-dictionary wordlist-english
//   node scripts/build-ear-phones.mjs /tmp/ear/node_modules путь/к/vosk-model-small-en-us-0.15/graph/words.txt
//  • произношения — CMUdict (Carnegie Mellon University, лицензия BSD-2-Clause; npm-пакет cmu-pronouncing-dictionary — ISC): ударения отброшены, фонема — один символ (phoneNeighbors.PHONES);
//  • какие слова брать — частотные списки SCOWL (npm wordlist-english, MIT-подобная лицензия SCOWL): уровни 10–20 целиком, 35 — слова до 6 фонем, 40–50 — до 4 фонем;
//  • плюс РЕДКИЕ слова CMUdict, чьё произношение есть начало произношения частого слова (breck ← breakfast, wat ← water): обрубку есть чем стать;
//  • каждое слово таблицы есть в словаре модели (words.txt: «слово ID» по строке) — Vosk не выбросит ни одной ловушки; грубые слова не берём (услышанное показывается ученику).
// Таблица — строки «слово:КОД[,КОД2] …» (первое произношение — основное); сначала частые слова, в конце редкие — среди омофонов ловушкой берётся первое по файлу. Файл грузится лениво отдельным чанком (phoneTable.js), в основной бандл не входит.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { encodePhones, PHONES } from '../src/shared/lib/vosk/phones/phoneNeighbors.js'

const [mods, vocabPath] = process.argv.slice(2)
if (!mods || !vocabPath) { console.error('Использование: node scripts/build-ear-phones.mjs <папка node_modules с cmu-pronouncing-dictionary и wordlist-english> <путь к graph/words.txt модели>'); process.exit(2) }
const { dictionary } = await import(pathToFileURL(`${mods}/cmu-pronouncing-dictionary/index.js`))
const vocab = new Set(readFileSync(vocabPath, 'utf8').split('\n').map(l => l.split(/\s+/)[0]).filter(Boolean))
const level = new Map()
for (const n of [10, 20, 35, 40, 50]) for (const w of JSON.parse(readFileSync(`${mods}/wordlist-english/english-words-${n}.json`, 'utf8'))) if (!level.has(w.toLowerCase())) level.set(w.toLowerCase(), n)
const RUDE = new Set('ass asses arse bitch bitches cock cocks crap cum cunt cunts damn dick dicks fag fags fuck fucked fucker fucking fucks hell negro nigger piss pussy rape raped sex shit shits slut sluts tit tits whore whores'.split(' '))
const VOWEL = new Set('AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW'.split(' ').map(p => encodePhones(p)))
const wanted = (l, n) => l <= 20 || (l <= 35 && n <= 6) || (l <= 50 && n <= 4)

const all = new Map() // слово → [коды], как в CMUdict (варианты «word(2)» — следующие произношения)
for (const [key, value] of Object.entries(dictionary)) {
  const w = key.replace(/\(\d+\)$/, '')
  if (!/^[a-z']+$/.test(w) || !vocab.has(w) || RUDE.has(w)) continue
  const code = encodePhones(value.split('#')[0])
  if (!code) continue
  if (!all.has(w)) all.set(w, [])
  if (!all.get(w).includes(code)) all.get(w).push(code)
}
const table = new Map()
for (const [w, codes] of all) if (level.has(w) && wanted(level.get(w), codes[0].length)) table.set(w, codes)
const common = table.size
const heads = new Set(), have = new Set([...table.values()].flat())
for (const [P] of table.values()) for (let k = 2; k < P.length; k++) heads.add(P.slice(0, k))
for (const [w, [code]] of all) {
  if (table.has(w) || !/^[a-z]{2,}$/.test(w) || !heads.has(code) || have.has(code) || ![...code].some(c => VOWEL.has(c))) continue
  table.set(w, [code]); have.add(code)
}
const tier = w => (level.get(w) <= 20 ? 0 : level.has(w) && wanted(level.get(w), table.get(w)[0].length) ? 1 : 2) // порядок в файле: частые → реже → редкие начала; среди омофонов ловушкой берётся первое (how, а не hao)
const entries = [...table.keys()].sort((a, b) => tier(a) - tier(b) || (a < b ? -1 : 1)).map(w => `${w}:${table.get(w).join(',')}`)
const lines = []
for (let i = 0; i < entries.length; i += 120) lines.push(entries.slice(i, i + 120).join(' '))
const out = `// СГЕНЕРИРОВАНО scripts/build-ear-phones.mjs — руками не править. Произношения английских слов для фонетических ловушек правила слова (phoneNeighbors.js): «слово:КОД», фонема — один символ
// (${PHONES.length} фонем ARPAbet без ударений, порядок — phoneNeighbors.PHONES). Слов: ${table.size} (частых ${common}, редких слов-начал ${table.size - common}); все есть в словаре модели vosk-model-small-en-us-0.15.
// Произношения — CMUdict, Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved (лицензия BSD-2-Clause, текст — LICENSE-cmudict.txt рядом). Отбор слов — SCOWL (wordlist-english).
export const NOTICE = 'Pronunciations: CMUdict, Copyright (C) 1993-2015 Carnegie Mellon University (BSD-2-Clause). Word selection: SCOWL.'
export const EN_PHONES = \`
${lines.join('\n')}
\`
`
writeFileSync(new URL('../src/shared/lib/vosk/phones/enPhones.js', import.meta.url), out)
console.log(`Слов: ${table.size} (частых ${common}, редких слов-начал ${table.size - common}); строк ${out.split('\n').length}; ${out.length} байт, gzip ${gzipSync(out, { level: 9 }).length}`)

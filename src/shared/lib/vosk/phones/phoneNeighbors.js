// Фонетические соседи слова — ловушки «честного зачёта слова» (wordEarDecoys.js, v3.3.186). Чистые функции над таблицей произношений (phoneTable.js: слово → фонемы, по символу на фонему).
// Зачем: закрытая грамматика Vosk выбирает только между целью и [unk] и отдаёт цель на её обрубок («hau…» → house, conf 1). Соседи по БУКВАМ («hous», «housy») — не слова, модель их
// молча выбрасывает. Сосед должен быть настоящим словом, которое ЗВУЧИТ как обрубок цели:
//  • НАЧАЛО — слово, чьё произношение есть начало произношения цели (house /h aʊ s/ → how /h aʊ/; milk → mill; window → win, wind; interesting → interest);
//  • ЗАМЕНА КОНЦА — то же начало и одна другая фонема вместо следующей (house → howl; nice → night, nine, knife; cat → cap, can, cab; book → bull, bush; window → windy, wins):
//    обрубку «ka…» без «t» всё равно, cat это или cap — уверенность Vosk делится между ними, и цель не набирает CONF_MIN; целое слово с ясным концом выигрывает у всех;
//  • ПАРА — начало цели, разбитое на два слова (yesterday → «yes stir», together → «to get»): обрубок длинного слова, для которого одного слова-соседа нет.
// Каждый кусок содержит гласную; сосед не омофон цели (night ↔ knight) и не слово целей. Все слова таблицы есть в словаре модели (проверено сборщиком таблицы) — ни одна ловушка не выброшена.
export const PHONES = 'AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH'.split(' ')
const CODE = i => String.fromCharCode(i < 26 ? 65 + i : 71 + i)
/** Фонемы ARPAbet («HH AW S») → строка-код (по символу на фонему); null — есть незнакомая фонема */
export const encodePhones = text => { const out = String(text ?? '').trim().split(/\s+/).map(p => PHONES.indexOf(p.replace(/\d/g, ''))); return out.includes(-1) ? null : out.map(CODE).join('') }
export const decodePhones = code => [...String(code ?? '')].map(c => PHONES[c < 'a' ? c.charCodeAt(0) - 65 : c.charCodeAt(0) - 71]).join(' ')
const ALL = PHONES.map((_, i) => CODE(i))
const VOWEL = new Set('AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW'.split(' ').map(p => CODE(PHONES.indexOf(p))))
const hasVowel = code => [...code].some(c => VOWEL.has(c))
// Класс согласной: замена внутри класса (t↔d, t↔p, s↔z, m↔n) звучит слишком похоже — такой сосед крадёт целое слово
const CLASS = {}
for (const [name, list] of Object.entries({ stop: 'P B T D K G CH JH', fric: 'F V TH DH S Z SH ZH HH', nasal: 'M N NG', glide: 'L R W Y' })) for (const p of list.split(' ')) CLASS[CODE(PHONES.indexOf(p))] = name
const klass = c => (VOWEL.has(c) ? 'vowel' : CLASS[c])

export const SUBS_MAX = 5    // замен конца на одно начало — не больше
export const PAIRS_MAX = 8   // пар на слово — не больше
export const PAIR_SUBS = 2   // пар с лишней фонемой во второй части на одно место — не больше
export const PAIR_MIN = 6    // пары — только словам от стольких фонем
export const PAIR_SHARE = 0.9 // пара покрывает не больше этой доли фонем слова
export const SPELL_MIN = 3   // начало по буквам — не короче стольких букв

/**
 * Соседи слова: { prefixes: [слова-начала, от длинных к коротким], subs: [замены конца], spelled: [начала по буквам — настоящие слова: break ← breakfast], pairs: ['a b'] };
 * null — слова нет в таблице. table: { prons: Map(слово → [коды], первое произношение — основное), words: Map(код → [слова]) }; skip — Set слов, которые брать нельзя (слова целей).
 */
export function phoneNeighbors(word, table, skip = new Set()) {
  const P = table?.prons.get(word)?.[0]
  if (!P) return null
  const used = new Set(), n = P.length
  const sounds = new Set([P]) // произношения цели и уже взятых соседей: два омофона (mil и mill) делили бы уверенность Vosk пополам
  const free = w => w !== word && !skip.has(w) && !used.has(w) && !table.prons.get(w).some(c => sounds.has(c)) // омофон цели — не сосед
  const take = w => { used.add(w); for (const c of table.prons.get(w)) sounds.add(c); return w }
  const pick = code => { const w = (table.words.get(code) ?? []).find(free); return w ? take(w) : null }
  const prefixes = [], subs = [], spelled = [], pairs = []
  for (let k = n - 1; k >= 2; k--) {
    const pre = P.slice(0, k)
    if (!hasVowel(pre)) break
    if (k === 2 && prefixes.length) break // начало из двух фонем — только когда длиннее нет (water: «wat» есть — «waugh» не берём: короткое начало крало целое слово)
    const w = pick(pre)
    if (w) prefixes.push(w)
  }
  for (let k = n - 1; k >= Math.max(1, Math.floor(n / 2)); k--) { // замена фонемы: последней — на звук другого класса; гласной внутри слова — на другую гласную (согласная внутри крала целое слово: water → wall)
    const pre = P.slice(0, k), vowel = VOWEL.has(P[k])
    if (!vowel && (k < n - 1 || !hasVowel(pre))) continue
    let m = 0
    for (const c of ALL) {
      if (m >= SUBS_MAX) break
      if (c === P[k] || (klass(c) === klass(P[k])) !== vowel) continue
      const s = pick(pre + c)
      if (s) { subs.push(s); m++ }
    }
  }
  for (let k = word.length - 1; k >= SPELL_MIN; k--) { const w = word.slice(0, k); if (table.prons.has(w) && free(w)) spelled.push(take(w)) }
  if (n >= PAIR_MIN) {
    const one = code => (table.words.get(code) ?? []).find(x => x !== word && !skip.has(x))
    const add = (a, b) => { if (a && b && pairs.length < PAIRS_MAX && !pairs.includes(`${a} ${b}`)) pairs.push(`${a} ${b}`) }
    for (let j = Math.max(Math.floor(n * PAIR_SHARE), 3); j >= 3 && pairs.length < PAIRS_MAX; j--) for (let i = j - 1; i >= 1 && pairs.length < PAIRS_MAX; i--) {
      const a = P.slice(0, i), b = P.slice(i, j)
      if (!hasVowel(a) || !hasVowel(b) || !one(a)) continue
      if (one(b)) add(one(a), one(b))
      else ALL.filter(c => klass(c) !== klass(P[j])).map(c => one(b + c)).filter(Boolean).slice(0, PAIR_SUBS).forEach(w => add(one(a), w)) // вторая часть с одной лишней фонемой («to get» ← together)
    }
  }
  return { prefixes, subs, spelled, pairs }
}

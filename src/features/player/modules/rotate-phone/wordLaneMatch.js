// Распознавание в игре «Повтори за диктором»: что считать принятым словом. Чистые функции.
// Ученик повторяет слово SLOT_COUNT раз подряд. Vosk отдаёт partial — «try try [unk] try»: слова слоя (hit) и всё остальное (miss: [unk] или чужое слово).
// Слов в одной попытке может быть несколько — сколько услышано, столько слоёв и заливается; каждое неверное слово — «отшатывание» линии.
import { tokenize, phraseForms } from '../../../../shared/lib/speech/speechMatch.js'
import { tokenizeRu, phraseFormsRu, altsRu } from '../../../../shared/lib/speech/speechMatchRu.js'
import { SLOT_COUNT } from './wordLaneTimeline.js'

const UNK = '[unk]'
const tokenizerOf = lang => (lang === 'ru' ? tokenizeRu : tokenize) // русские цели («Встряхни память», проход «назови перевод»): кириллица, ё ≡ е

/**
 * Сколько услышанных слов (с позиции i) составляют цель целиком, 0 — не составляют. Сравнение по токенам с границами по СЛОВАМ: «i'm» (одно слово Vosk) ≡ «i am» (два слова) —
 * и цель «I'm», и цель «I am» принимают любую из записей; слово из середины («am» внутри «i'm») отдельно не засчитывается. ht — токены услышанных слов (tokenize каждого).
 */
function takeTarget(ht, i, tk) {
  let m = 0
  let w = 0
  while (m < tk.length && i + w < ht.length) {
    const ws = ht[i + w]
    if (!ws.length || m + ws.length > tk.length || ws.some((x, q) => x !== tk[m + q])) return 0
    m += ws.length
    w++
  }
  return m === tk.length ? w : 0
}

/**
 * Услышанное → { hits, misses }: сколько раз сказана цель (target — слово/короткая фраза: «get up» считается одним попаданием) и сколько слов «не то». Сырой partial Vosk годится как есть:
 * [unk] остаётся меткой промаха. final=false (идёт речь): последнее слово ещё может измениться, поэтому промахом оно не считается — линия не «отшатывается» от недосказанного слова.
 */
export function analyzeHeard(raw, word, final = true) {
  const target = tokenize(word)
  const heard = String(raw ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const ht = heard.map(h => tokenize(h))
  let hits = 0
  let misses = 0
  for (let i = 0; i < heard.length;) {
    const w = target.length ? takeTarget(ht, i, target) : 0
    if (w) { hits++; i += w }
    else { if ((final || i < heard.length - 1) && (heard[i] === UNK || ht[i].length)) misses++; i++ }
  }
  return { hits, misses }
}

/**
 * Закрытый словарь Vosk на игру: всё, что ученик может сказать за один заход, — от одного до `max` слов, где каждое либо цель, либо «не то» ([unk]).
 * Так движок видит повтор «try try try» одним высказыванием и не подменяет чужое слово целью. Число фраз — 2 + 4 + … (при max = 3: 14).
 */
export function wordGrammar(word, max = SLOT_COUNT) {
  const forms = phraseForms(word)   // «I'm» → «i am» и «i'm»: ученик может сказать любую запись
  if (!forms.length) return null
  let level = [[]]
  const out = []
  for (let n = 1; n <= max; n++) {
    level = level.flatMap(seq => [...forms.map(w => [...seq, w]), [...seq, UNK]])
    out.push(...level.map(seq => seq.join(' ')))
  }
  return JSON.stringify([...out, UNK])
}

// ---------- несколько целей: фразы из кусков (игра с рецептом) ----------
// На одной ступени ученик может говорить РАЗНЫЕ тексты (раунд «вслепую»: куск 1, куск 2, куск 3), поэтому распознавание знает список целей и отдаёт ПО ПОРЯДКУ, какие цели услышаны.

/**
 * Начало какой-либо цели с позиции i: слова heard[i…], которые идут как её первые слова (целиком, без конца — иначе это уже попадание). Возвращает { target, tokens, words } (самое длинное начало;
 * при равенстве — цель подлиннее) или null. tokens — сколько слов цели (после раскрытия сокращений) произнесено, words — сколько слов heard на это ушло.
 */
function prefixAt(heard, i, toks, order, tk = tokenize) {
  let best = null
  for (const k of order) {
    let m = 0
    let w = 0
    for (; i + w < heard.length; w++) {
      const ws = tk(heard[i + w])
      if (!ws.length || m + ws.length > toks[k].length - 1 || ws.some((x, q) => x !== toks[k][m + q])) break
      m += ws.length
    }
    if (m > 0 && (!best || m > best.tokens)) best = { target: k, tokens: m, words: w }
  }
  return best
}

/**
 * Услышанное → { seq, misses, tail }: seq — номера целей в порядке, как они прозвучали (одна и та же цель может повторяться), misses — слова «не то», tail — недосказанная цель ({ target, tokens }: сколько её слов уже произнесено — по ним пилюля заливается по очереди). Самая длинная подходящая цель берётся первой.
 * final=false (идёт речь): слово ещё может измениться или продолжиться, поэтому промахом считается только то, что уже «устоялось»: за ним началось новое слово. Не промах: последнее слово; хвостовой [unk]
 * (звук, который ещё не разобран); слова, которыми начинается какая-то цель, — «i am» из «i am trying» (пауза между словами цели — не ошибка), в том числе с любого места («cat i am»: cat — промах, «i am» — начало цели).
 * final=true (итог): всё, что не вошло в цели целиком, — промах. targets — тексты целей (как угодно: сокращения раскроются).
 */
export function analyzeTargets(raw, targets, final = true, lang = 'en') {
  const tk = tokenizerOf(lang)
  const ru = lang === 'ru'
  const alts = ru ? targets.flatMap((t, k) => altsRu(t).map(a => ({ k, toks: tk(a) }))) : targets.map((t, k) => ({ k, toks: tk(t) })) // русский перевод — любой из вариантов («пытаться, стараться»)
  const toks = alts.map(a => a.toks)
  const order = toks.map((t, i) => i).filter(i => toks[i].length).sort((a, b) => toks[b].length - toks[a].length)
  let heard = String(raw ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!final) while (heard.at(-1) === UNK) heard = heard.slice(0, -1)
  const ht = heard.map(h => tk(h))
  const seq = []
  let misses = 0
  let tail = null   // недосказанная цель: начало цели, которое тянется до конца услышанного
  for (let i = 0; i < heard.length;) {
    let hit = null
    let hitWords = 0
    for (const j of order) { hitWords = takeTarget(ht, i, toks[j]); if (hitWords) { hit = alts[j].k; break } }
    if (hit != null) { seq.push(hit); i += hitWords; continue }
    const pre = prefixAt(heard, i, toks, order, tk)
    if (pre && !tail && i + pre.words === heard.length) tail = { target: alts[pre.target].k, tokens: pre.tokens }
    if (pre && !final) { i += pre.words; continue }   // начало цели в черновике — не промах (в итоге недосказанное — уже промах)
    if (ru && seq.length) { i++; continue }            // русский: слова ПОСЛЕ сказанного перевода — продолжение фразы («спасибо большое», «приятно познакомиться»), не ошибка
    if ((final || i < heard.length - 1) && (heard[i] === UNK || ht[i].length)) misses++
    i++
  }
  return { seq, misses, tail }
}

/**
 * Закрытый словарь Vosk на ступень: все последовательности длиной 1…max из «любая цель / не то», плюс [unk]. Три цели и max = 3 — 84 фразы; одна цель — 14.
 * Повторы одной цели подряд («try try try») Vosk видит одним высказыванием и не подменяет чужое слово целью.
 * Цель с сокращением даёт две записи («I'm» → «i am» и «i'm»; speechMatch.phraseForms), поэтому число фраз растёт: цели «I'm», «trying», «to learn» и max = 3 — 5 слов в уровне, 5 + 25 + 125 + [unk].
 */
export function targetGrammar(targets, max = SLOT_COUNT, known = null, lang = 'en') {
  // каждая цель — во всех записях: «I'm trying» → «i am trying» и «i'm trying» (Vosk отдаёт то, что услышал; analyzeTargets принимает обе). known(слово) — необязательный фильтр по словарю модели
  const forms = lang === 'ru' ? phraseFormsRu : phraseForms // русская модель: слова кириллицей строчными, «ё» и «е» (speechMatchRu.js)
  const words = [...new Set(targets.flatMap(t => forms(t)).filter(f => !known || f.split(' ').every(known)))]
  if (!words.length) return null
  let level = [[]]
  const out = []
  for (let n = 1; n <= max; n++) {
    level = level.flatMap(seq => [...words.map(w => [...seq, w]), [...seq, UNK]])
    out.push(...level.map(seq => seq.join(' ')))
  }
  return JSON.stringify([...out, UNK])
}

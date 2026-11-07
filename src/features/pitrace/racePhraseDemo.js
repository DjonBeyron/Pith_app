// Демо перед кругом 2 «Скажи» этапа «Фразы» (CONCEPT_PHRASES.md, «Демо перед кругом «Скажи»»; замечание владельца: «непонятно, что можно говорить по словам, а не фразу целиком»).
// На плашке круга (phrases2-ann, «Скажи · Скажи сам»), когда Пит договорил race_phrases_say, директор не отпускает стадию сразу (useRacePhraseDemo → afterCount): Пит говорит race_phrases_demo
// «смотри, можно по словам, я подсвечиваю каждое», через DEMO_LINE_GAP_MS читает демо-фразу по словам (sayText(слово, { hold, tight }) — диктор слов, как в игре), с каждым словом кирпичик слова
// проявляется (маска racePhraseMask.js) и заливка демо-пилюли растёт слева направо; в конце вся фраза и 100 %, DEMO_END_MS — и круг начинается. Механике круга демо не мешает: слушатель фраз ещё не создан.
// Демо-фраза — запасная (own: false, не цель круга 2), самая короткая; запасной нет — первая фраза круга. Только «Голосом» (у «Пальцами» stage.demo нет). Один раз за игру (gate.played) и не больше
// DEMO_MAX_SHOWS игр подряд на устройстве (localStorage DEMO_KEY — счётчик показов). Пауза / сворачивание / смена стадии — stop(): демо обрывается, переход не зовётся (после «Продолжить» стадия
// идёт сначала, демо уже сыграно — круг начинается сразу после реплики плашки). Чистая логика: таймеры, голос, вид и хранилище подставляются (тесты); DOM — racePhraseDemoView.js.
import { phraseWords } from './racePhraseData.js'

export const DEMO_LINE = 'race_phrases_demo'
export const DEMO_LINE_GAP_MS = 300  // после реплики — до первого слова
export const DEMO_WORD_GAP_MS = 350  // после конца голоса слова — до следующего
export const DEMO_END_MS = 600       // вся фраза видна — столько, потом круг
export const DEMO_WORD_MS = 450      // длина слова, если диктор не сказал свою (нет озвучки)
export const DEMO_POLL_MS = 60       // Пит ещё говорит реплику — проверить снова через столько
export const DEMO_LINE_CAP_MS = 4000 // дольше реплику не ждём
export const DEMO_MAX_WORDS = 4      // длиннее — демо не уложится в ≈ 6 с: запасная фраза берётся покороче
export const DEMO_MAX_SHOWS = 3
export const DEMO_KEY = 'pithy_phrase_demo_seen_v1'

const words = p => phraseWords(p?.text).length

/** Демо-фраза: запасная (own: false), которой нет среди целей круга (turns), с текстом; самая короткая (при равенстве — по порядку плана). Нет — первая цель круга; нет и её — null */
export function demoPhrase(phrases = [], turns = []) {
  const targets = new Set(turns.map(t => t.target?.key))
  const spare = phrases.filter(p => !p.own && !targets.has(p.key) && words(p) > 0)
  const best = spare.reduce((a, p) => (!a || words(p) < words(a) ? p : a), null)
  if (best && words(best) <= DEMO_MAX_WORDS) return { text: best.text, key: best.key, spare: true }
  const first = turns[0]?.target
  if (first && (!best || words(first) < words(best))) return { text: first.text, key: first.key, spare: false }
  return best ? { text: best.text, key: best.key, spare: true } : null
}

const store = s => { try { return s === undefined ? globalThis.localStorage ?? null : s } catch { return null } }

/** Сколько раз демо уже показано на этом устройстве (нет хранилища — 0) */
export function demoSeen(storage) {
  try { const n = Number(store(storage)?.getItem(DEMO_KEY)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 } catch { return 0 }
}
/** Показать ли ещё: меньше max показов */
export const demoAllowed = (storage, max = DEMO_MAX_SHOWS) => demoSeen(storage) < max
/** Отметить показ (+1) */
export function markDemoShown(storage) {
  try { store(storage)?.setItem(DEMO_KEY, String(demoSeen(storage) + 1)) } catch { /* приватный режим: демо просто покажется снова */ }
}

/** Слова 0..i подтверждены — для mask.set */
export const heardUpTo = i => new Map(Array.from({ length: i + 1 }, (_, k) => [k, true]))

/**
 * Одно демо: реплика → DEMO_LINE_GAP_MS → слова (голос слова + DEMO_WORD_GAP_MS) → вся фраза → DEMO_END_MS → onDone. → { stop(), words }.
 * sayLine(id, vars, opts) / sayText(word, opts) — голос директора; busyLeft() — сколько Пит ещё занят (мс); mount({ text, caption }) → вид { show, step(heard, v), all(), hide(), remove() } или null;
 * onStep(name, info) — для журнала и тестов: 'line', 'word' { i, word, v }, 'all', 'done'.
 */
export function runPhraseDemo({ phrase, caption = '', sayLine, sayText, busyLeft = () => 0, mount = null, onDone, onStep = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const list = phraseWords(phrase?.text)
  const view = mount?.({ text: phrase?.text ?? '', caption }) ?? null
  let timer = 0, stopped = false, waited = 0
  const at = (ms, fn) => { timer = setTimer(() => { timer = 0; if (!stopped) fn() }, Math.max(0, ms)) }
  const finish = () => {
    view?.all(); onStep('all')
    at(DEMO_END_MS, () => { stopped = true; view?.hide(); onStep('done'); onDone?.() })
  }
  const word = i => {
    let ms = 0
    sayText?.(list[i], { hold: true, tight: true, onSay: m => { ms = m } }) // onSay приходит синхронно: длина голоса слова (без хвоста тишины файла)
    const v = (i + 1) / list.length
    view?.step(heardUpTo(i), v); onStep('word', { i, word: list[i], v })
    const voice = ms > 0 ? ms : DEMO_WORD_MS
    if (i + 1 < list.length) at(voice + DEMO_WORD_GAP_MS, () => word(i + 1))
    else at(voice, finish)
  }
  const afterLine = () => {
    if (busyLeft() > 0 && waited < DEMO_LINE_CAP_MS) { waited += DEMO_POLL_MS; at(DEMO_POLL_MS, afterLine); return }
    at(DEMO_LINE_GAP_MS, () => (list.length ? word(0) : finish()))
  }
  const begin = () => { // Пит ещё договаривает реплику плашки (хвост занятости в десятки мс) — иначе sayLine пропустит реплику демо как «Пит занят»
    if (busyLeft() > 0 && waited < DEMO_LINE_CAP_MS) { waited += DEMO_POLL_MS; at(DEMO_POLL_MS, begin); return }
    waited = 0
    const said = sayLine?.(DEMO_LINE, null, { pause: 0 }) // pause 0: «занят» снимается по реальному концу реплики, без хвоста LINE_PAUSE_MS
    onStep('line', { said })
    at(0, afterLine)
  }
  view?.show()
  begin()
  return {
    words: list,
    stop() { if (stopped) return; stopped = true; if (timer) clearTimer(timer); timer = 0; view?.remove() },
  }
}

/**
 * Ворота демо на всю игру: after(stage, fn, deps) — стадия просит переход; у стадии есть demo и демо в этой игре ещё не было (и лимит показов не исчерпан) — сначала демо, fn после него; иначе fn сразу.
 * stop(why) — оборвать идущее демо (fn не зовётся). deps — как у runPhraseDemo (без phrase / onDone). storage — хранилище счётчика (по умолчанию localStorage).
 */
export function createDemoGate({ storage, max = DEMO_MAX_SHOWS, log = () => {} } = {}) {
  let played = false, run = null
  const say = s => { try { log(`[phrase-demo] ${s}`) } catch { /* журнал не мешает демо */ } }
  return {
    after(stage, fn, deps = {}) {
      const phrase = stage?.demo
      if (!phrase || played) { fn(); return }
      played = true
      if (!demoAllowed(storage, max)) { say(`пропуск: уже показано ${demoSeen(storage)} раз (лимит ${max})`); fn(); return }
      markDemoShown(storage)
      say(`показ ${demoSeen(storage)}/${max}: «${phrase.text}»${phrase.spare ? ' (запасная фраза)' : ' (первая фраза круга)'}`)
      run = runPhraseDemo({ ...deps, phrase, onDone: () => { run = null; say('конец — круг «Скажи» начинается'); fn() } })
    },
    stop(why = '') { if (!run) return; run.stop(); run = null; say(`прервано${why ? `: ${why}` : ''}`) },
    active: () => !!run,
    played: () => played,
  }
}

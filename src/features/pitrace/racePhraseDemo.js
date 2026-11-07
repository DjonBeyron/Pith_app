// Демо перед кругом 2 «Скажи» этапа «Фразы» (CONCEPT_PHRASES.md, «Демо на живой пилюле»; замечание владельца: «демо должно быть натуральным, как будто играет пользователь»).
// Первым ходом круга (до первой настоящей фразы) сцена ленты выкатывает ЖИВУЮ широкую пилюлю «Скажи» с маской-кирпичиками демо-фразы (racePhraseDemoTurn.js), слушатель фраз на этом ходу не слушает,
// а Пит играет за ученика: race_demo_1 «главное начать, смотри» → слово 1 диктором (sayText(слово, { hold, tight })), кирпичик открывается, заливка на долю → race_demo_2 «затем второе» → слово 2
// → race_demo_3 «потом третье» → слово 3 → (слов больше трёх: race_demo_more «и так до конца» → остальные подряд) → вся фраза и 100 % → взлёт (как зачёт) → race_demo_go «теперь ты» → первый настоящий ход.
// Реплика без озвучки (sayLine вернул false) — только подпись над лентой и LINE_SILENT_MS; подпись видна и с озвучкой. Здесь — чистая часть: какая фраза (demoPhrase), скрипт (runDemoScript,
// таймеры и голос подставляются), ворота на игру (createDemoGate: один раз за игру и не больше DEMO_MAX_SHOWS игр на устройстве — localStorage DEMO_KEY). Обрыв (пауза, сворачивание, смена стадии) — stop() сцены.
import { phraseWords } from './racePhraseData.js'

export const DEMO_LINES = ['race_demo_1', 'race_demo_2', 'race_demo_3'] // перед словами 1, 2, 3
export const DEMO_MORE = 'race_demo_more' // слов больше трёх — перед остальными
export const DEMO_GO = 'race_demo_go'     // после взлёта
export const LINE_SILENT_MS = 650    // реплика без озвучки: подпись держится столько, потом слово (≤ 700 мс — замечание владельца)
export const DEMO_LINE_GAP_MS = 150  // озвученная реплика договорена — до слова
export const DEMO_WORD_GAP_MS = 250  // после голоса слова — до следующей реплики
export const DEMO_RUN_GAP_MS = 120   // «и так до конца»: между словами подряд
export const DEMO_WORD_MS = 450      // длина слова, если диктор не сказал свою (нет озвучки)
export const DEMO_POLL_MS = 60       // Пит ещё говорит — проверить снова через столько
export const DEMO_LINE_CAP_MS = 4000 // дольше реплику не ждём
export const DEMO_MAX_WORDS = 4      // длиннее — демо не уложится в ≈ 6–7 с: запасная фраза берётся покороче
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

/** Порядок скрипта: [{ line } | { word: i, run? } | { all } | { rise } | { line: go }] — для слов n */
export function demoPlan(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    if (i < DEMO_LINES.length) out.push({ line: DEMO_LINES[i] }, { word: i })
    else { if (i === DEMO_LINES.length) out.push({ line: DEMO_MORE }); out.push({ word: i, run: true }) }
  }
  return [...out, { all: true }, { rise: true }, { line: DEMO_GO }]
}

/**
 * Скрипт демо: шаги demoPlan по очереди. → { stop(), words, step() }.
 * sayLine(id, vars, opts) → озвучено ли / sayText(word, opts) — голос директора; busyLeft() — сколько Пит ещё занят (мс); lineText(id) — подпись реплики; show(text) — подпись над лентой ('' — снять);
 * open(i, v) — кирпичик слова i открыт, цель заливки v; all() — вся фраза, 100 %; rise(done) — пилюля взлетает (done — когда можно дальше); onDone(); onStep(name, info) — журнал и тесты.
 */
export function runDemoScript({ phrase, sayLine, sayText, busyLeft = () => 0, lineText = id => id, show = () => {}, open = () => {}, all = () => {}, rise = done => done(), onDone, onStep = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const list = phraseWords(phrase?.text)
  const plan = demoPlan(list.length)
  let timer = 0, stopped = false, pos = -1, waited = 0
  const at = (ms, fn) => { timer = setTimer(() => { timer = 0; if (!stopped) fn() }, Math.max(0, ms)) }
  const free = fn => { // Пит ещё говорит (хвост реплики плашки, своя реплика) — ждём, не дольше DEMO_LINE_CAP_MS
    if (busyLeft() > 0 && waited < DEMO_LINE_CAP_MS) { waited += DEMO_POLL_MS; at(DEMO_POLL_MS, () => free(fn)); return }
    waited = 0; fn()
  }
  const next = () => {
    pos++
    const s = plan[pos]
    if (!s) { stopped = true; show(''); onStep('done'); onDone?.(); return }
    if (s.line) {
      show(lineText(s.line))
      const said = !!sayLine?.(s.line, null, { pause: 0 }) // pause 0: «занят» снимается по реальному концу реплики
      onStep('line', { id: s.line, said })
      if (said) at(DEMO_POLL_MS, () => free(() => at(DEMO_LINE_GAP_MS, next)))
      else at(LINE_SILENT_MS, next)
    } else if (s.word != null) {
      let ms = 0
      sayText?.(list[s.word], { hold: true, tight: true, onSay: m => { ms = m } }) // onSay приходит синхронно: длина голоса слова
      const v = (s.word + 1) / list.length
      open(s.word, v); onStep('word', { i: s.word, word: list[s.word], v })
      const voice = ms > 0 ? ms : DEMO_WORD_MS
      const following = plan[pos + 1]
      at(voice + (following?.word != null ? DEMO_RUN_GAP_MS : following?.all ? 0 : DEMO_WORD_GAP_MS), next) // подряд — короткий зазор, последнее — сразу к 100 %
    } else if (s.all) { show(''); all(); onStep('all'); next() }
    else if (s.rise) { onStep('rise'); rise(() => { if (!stopped) next() }) }
  }
  at(0, () => free(next))
  return {
    words: list,
    step: () => plan[pos] ?? null,
    stop() { if (stopped) return; stopped = true; if (timer) clearTimer(timer); timer = 0; show('') },
  }
}

/**
 * Ворота демо на всю игру: claim(phrase) — сцена круга «Скажи» спрашивает перед первым ходом; true — играть (отмечено: «сыграно в этой игре» и +1 показ на устройстве), false — сразу первый ход.
 * end(why) — демо кончилось ('' — доиграло) или оборвано (журнал). storage — хранилище счётчика (по умолчанию localStorage).
 */
export function createDemoGate({ storage, max = DEMO_MAX_SHOWS, log = () => {} } = {}) {
  let played = false, active = false
  const say = s => { try { log(`[phrase-demo] ${s}`) } catch { /* журнал не мешает демо */ } }
  return {
    claim(phrase) {
      if (!phrase || played) return false
      played = true
      if (!demoAllowed(storage, max)) { say(`пропуск: уже показано ${demoSeen(storage)} раз (лимит ${max})`); return false }
      markDemoShown(storage); active = true
      say(`показ ${demoSeen(storage)}/${max} на живой пилюле: «${phrase.text}»${phrase.spare ? ' (запасная фраза)' : ' (первая фраза круга)'}`)
      return true
    },
    end(why = '') { if (!active) return; active = false; say(why ? `прервано: ${why}` : 'конец — первый ход круга «Скажи»') },
    active: () => active,
    played: () => played,
  }
}

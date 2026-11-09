// Демо перед кругом 2 «Скажи» этапа «Фразы» (CONCEPT_PHRASES.md, «Демо на живой пилюле»; замечание владельца: «демо должно быть натуральным, как будто играет пользователь»).
// Первым ходом круга (до первой настоящей фразы) сцена ленты выкатывает ЖИВУЮ широкую пилюлю «Скажи» с маской-кирпичиками демо-фразы (racePhraseDemoTurn.js), слушатель фраз на этом ходу не слушает,
// а Пит играет за ученика: race_demo_1 «главное начать, смотри» → слово 1 диктором (sayText(слово, { hold, tight })), кирпичик открывается, заливка на долю → race_demo_2 «затем второе» → слово 2
// → race_demo_3 «потом третье» → слово 3 → (слов больше трёх: race_demo_more «и так до конца» → остальные подряд) → вся фраза и 100 % → взлёт (как зачёт) → race_demo_go «теперь ты» → первый настоящий ход.
// Подпись реплики над лентой — ТОЛЬКО у неозвученной реплики (нет url в rotate_cat_lines, raceSilentLine.lineCaption; владелец: «сабы Пита я не просил»): озвученная звучит без подписи.
// Слово — только из библиотеки слов: демо-фраза берётся с озвучкой КАЖДОГО слова (racePhraseWordVoice.js); слово всё же без озвучки — не звучит, журнал «[demo] слово … без озвучки», дальше по таймеру.
// Перед словом скрипт ждёт, пока Пит освободится (busyLeft: хвост неозвученной реплики 0,65 с). Здесь — чистая часть: какая фраза (demoPhrase), скрипт (runDemoScript,
// таймеры и голос подставляются), ворота на игру (createDemoGate: один раз за игру — В КАЖДОЙ игре, замечание владельца 6 «куда пропал пример от Пита»: прежний лимит
// «первые 3 игры на устройстве», localStorage pithy_phrase_demo_seen_v1, убран 2026-11-08). Обрыв (пауза, сворачивание, смена стадии) — stop() сцены; после «Продолжить» демо не повторяется.
import { phraseWords } from './racePhraseData.js'

export const DEMO_LINES = ['race_demo_1', 'race_demo_2', 'race_demo_3'] // перед словами 1, 2, 3
export const DEMO_MORE = 'race_demo_more' // слов больше трёх — перед остальными
export const DEMO_GO = 'race_demo_go'     // после взлёта
export const LINE_SILENT_MS = 650    // реплики нет в настройках (sayLine вернул false): подпись держится столько, потом слово (≤ 700 мс — замечание владельца)
export const DEMO_LINE_GAP_MS = 150  // озвученная реплика договорена — до слова
export const DEMO_WORD_GAP_MS = 250  // после голоса слова — до следующей реплики
export const DEMO_RUN_GAP_MS = 120   // «и так до конца»: между словами подряд
export const DEMO_WORD_MS = 450      // длина слова, если диктор не сказал свою (нет озвучки)
export const DEMO_POLL_MS = 60       // Пит ещё говорит — проверить снова через столько
export const DEMO_LINE_CAP_MS = 4000 // дольше реплику не ждём
export const DEMO_MAX_WORDS = 4      // длиннее — демо не уложится в ≈ 6–7 с: запасная фраза берётся покороче

const words = p => phraseWords(p?.text).length

/**
 * Демо-фраза: запасная (own: false), которой нет среди целей круга (turns), с текстом и озвучкой каждого слова (voiced(text) — racePhraseWordVoice.phraseWordsVoiced); самая короткая (при равенстве —
 * по порядку плана). Нет такой — первая цель круга; нет и её — null
 */
export function demoPhrase(phrases = [], turns = [], voiced = () => true) {
  const targets = new Set(turns.map(t => t.target?.key))
  const spare = phrases.filter(p => !p.own && !targets.has(p.key) && words(p) > 0 && voiced(p.text))
  const best = spare.reduce((a, p) => (!a || words(p) < words(a) ? p : a), null)
  if (best && words(best) <= DEMO_MAX_WORDS) return { text: best.text, key: best.key, spare: true }
  const first = turns[0]?.target
  if (first && (!best || words(first) < words(best))) return { text: first.text, key: first.key, spare: false }
  return best ? { text: best.text, key: best.key, spare: true } : null
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
 * Скрипт демо: шаги demoPlan по очереди. → { stop(), words, plan, step() }.
 * sayLine(id, vars, opts) → принята ли / sayText(word, opts) — голос директора; busyLeft() — сколько Пит ещё занят (мс); lineText(id) — подпись реплики ('' — реплика озвучена, подписи нет);
 * hasWord(word) — есть ли озвучка слова (нет — слово не звучит, шаг 'mute', дальше по таймеру DEMO_WORD_MS); show(text) — подпись над лентой ('' — снять);
 * open(i, v) — кирпичик слова i открыт, цель заливки v; all() — вся фраза, 100 %; rise(done) — пилюля взлетает (done — когда можно дальше); onDone(); onStep(name, info) — журнал, тесты и темп пилюли
 * (info.at — номер шага в plan, у слова info.ms — длина голоса; racePhraseDemoPace.js); pad() — добавка к паузе после шага, мс (разбор короче пути пилюли до головы Пита — Пит говорит размереннее).
 */
export function runDemoScript({ phrase, sayLine, sayText, busyLeft = () => 0, lineText = id => id, hasWord = () => true, show = () => {}, open = () => {}, all = () => {}, rise = done => done(), onDone, onStep = () => {}, pad = () => 0, setTimer = setTimeout, clearTimer = clearTimeout }) {
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
      const cap = lineText(s.line) || ''
      show(cap) // подпись — только у неозвученной реплики; у озвученной '' (снять прежнюю)
      const said = !!sayLine?.(s.line, null, { pause: 0 }) // pause 0: «занят» снимается по реальному концу реплики
      onStep('line', { id: s.line, said, cap: !!cap, at: pos })
      if (said) at(DEMO_POLL_MS, () => free(() => at(DEMO_LINE_GAP_MS + pad(), next)))
      else at(LINE_SILENT_MS + pad(), () => free(next))
    } else if (s.word != null) {
      let ms = 0
      const word = list[s.word], voiced = !!hasWord(word)
      if (voiced) sayText?.(word, { hold: true, tight: true, onSay: m => { ms = m } }) // onSay приходит синхронно: длина голоса слова
      const v = (s.word + 1) / list.length
      const voice = ms > 0 ? ms : DEMO_WORD_MS
      open(s.word, v); onStep('word', { i: s.word, word, v, voiced, ms: voice, at: pos })
      if (!voiced) onStep('mute', { i: s.word, word })
      const following = plan[pos + 1]
      at(voice + (following?.word != null ? DEMO_RUN_GAP_MS + pad() : following?.all ? 0 : DEMO_WORD_GAP_MS + pad()), next) // подряд — короткий зазор, последнее — сразу к 100 %
    } else if (s.all) { show(''); all(); onStep('all'); next() }
    else if (s.rise) { onStep('rise'); rise(() => { if (!stopped) next() }) }
  }
  at(0, () => free(next))
  return {
    words: list,
    plan, step: () => plan[pos] ?? null,
    stop() { if (stopped) return; stopped = true; if (timer) clearTimer(timer); timer = 0; show('') },
  }
}

/**
 * Ворота демо на всю игру: claim(phrase) — сцена круга «Скажи» спрашивает перед первым ходом; true — играть (отмечено: «сыграно в этой игре»), false — сразу первый ход.
 * Журнал: «[demo] демо: фраза «…» (запасная фраза | первая фраза круга)» или «[demo] демо пропущено: <причина>»; end(why) — демо кончилось ('' — доиграло) или оборвано.
 */
export function createDemoGate({ log = () => {} } = {}) {
  let played = false, active = false
  const say = s => { try { log(`[demo] ${s}`) } catch { /* журнал не мешает демо */ } }
  return {
    claim(phrase) {
      if (!phrase) { say('демо пропущено: нет фразы для демо'); return false }
      if (played) { say('демо пропущено: уже было в этой игре (после «Продолжить» не повторяется)'); return false }
      played = true; active = true
      say(`демо: фраза «${phrase.text}» (${phrase.spare ? 'запасная' : 'первая фраза круга'})`)
      return true
    },
    end(why = '') { if (!active) return; active = false; say(why ? `демо прервано: ${why}` : 'демо: конец — первый ход круга «Скажи»') },
    active: () => active,
    played: () => played,
  }
}

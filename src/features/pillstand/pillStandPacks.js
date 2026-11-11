// Пакеты тем отчёта «📤 Отправить» стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме»): какие события трассы попадают в файл замечания по каждой теме и в каком виде. Каждый набор описан явно:
//  • anim «Анимация» — пилюля и заливка: цель заливки (только смены) и экран (шаг ≥ FILL_STEP, дошёл до цели), строки «[fill]» (слово → граница, откат, неверное слово — рывок), «заливка дошла» (reach), события
//    движка пилюли (spawn / claim / snap / win / miss / fail), перед ходом, слова слушателя (засчитано / откат) и зачёт; для контекста — только МОМЕНТЫ слов Vosk (heard: черновик / итог, какие слова новые) без
//    сырого JSON, без rms и затвора;
//  • ear «Распознавание (Vosk)» — сырые черновики и итоги Vosk (с conf слов и «кто закрыл заход»), словарь, готовность и ошибки, затвор, rms (прореженно: все переходы порога голоса + не чаще LEVEL_EVERY_MS в голосе и LEVEL_QUIET_MS в тишине),
//    слух фраз (onEar), служебные события слушателя слов (словарь, затвор, конец захода, стоп, глушение), микрофон / модель / язык, строки «[phrase-ear]» и «[gate]»;
//  • logic «Зачёт и логика» — решения слушателей (счёт слушателя слов, его разбор черновиков seq / misses, onWord и откаты, onPhrase с ratio), движок пилюли, зачёт / промах, строки «[phrase-ear]» с решениями
//    (кандидаты и ratio, договорена, без последнего слова — середины нет, итог запрошен, откат), «[phrases]» (ход, продление у края), неверные слова; для контекста — тексты итогов Vosk (heard, без conf);
//  • honesty «Честность» — только события-доказательства: всё (кроме rms / повторов / кадров заливки) в окнах ±EVIDENCE_MS вокруг каждого ложного срабатывания и «додуманного» слова (окна считает отчёт);
//  • all «Всё» — в текст: объединение тем (rms и заливка прорежены) + все прочие события; в JSON-блок отчёт кладёт полную трассу отрезка как есть.
// Несколько тем — объединение: событие берётся, если его берёт хоть одна тема, а вид — у самой «полной» (сырой JSON «Распознавания» важнее сокращённого «heard» «Анимации»). Чистые функции.
import { isVoice } from './pillStandVoice.js'
import { heardWords } from './pillStandWords.js'

export const TOPICS = ['anim', 'ear', 'logic', 'honesty', 'all']
export const TOPIC_TITLE = { anim: 'Анимация', ear: 'Распознавание (Vosk)', logic: 'Зачёт и логика', honesty: 'Честность (ложные срабатывания)', all: 'Всё' }
export const TOPIC_SLUG = { anim: 'anim', ear: 'vosk', logic: 'logic', honesty: 'honesty', all: 'all' }
export const PRIORITY = ['ear', 'logic', 'honesty', 'anim'] // чей вид события главнее при объединении
export const LEVEL_EVERY_MS = 250
export const LEVEL_QUIET_MS = 1000 // в тишине — реже
export const FILL_STEP = 0.05
export const EVIDENCE_MS = 300
const EPS = 0.012

export const LOG_RE = {
  anim: /^\[fill\]/,
  ear: /^\[(phrase-ear|gate)\]/,
  logic: /^\[phrase-ear\] (кандидаты|договорена|черновик «[^»]*» без последнего|итог запрошен|слово \d+ «[^»]*» откат)|^\[phrases\]|^\[fill\] неверное слово/,
  honesty: null,
}
const EAR_KINDS = new Set(['vosk-start', 'vosk-ready', 'vosk-error', 'vosk-partial', 'vosk-final', 'gate', 'ear', 'mic', 'model', 'lang', 'listen-error'])
const EAR_WL = new Set(['grammar', 'gate', 'session-end', 'stop', 'mute', 'ear']) // 'ear' — правило честного зачёта слова (wordEarRule.js): и в «Распознавании», и в «Зачёте»
const LOGIC_KINDS = new Set(['listen', 'word', 'phrase', 'pill', 'result', 'run', 'run-stop', 'target-run', 'run-error'])
const ANIM_KINDS = new Set(['pill', 'pre', 'reach', 'run', 'run-stop'])
const NOISE = new Set(['level', 'same', 'fill']) // не доказательства: видны в метриках и кадрах
const MIC_KINDS = new Set(['mic-dead', 'mic-revive', 'mic-revive-fail'])
export const TEXT_SKIP = new Set(['same', 'frame']) // «Всё» в тексте: повторы черновика только в JSON

/** Выбор тем → нормальный список: «Всё» поглощает остальные; порядок — как в TOPICS */
export const normTopics = list => (list.includes('all') ? ['all'] : TOPICS.filter(t => list.includes(t)))

/** Строка журнала / 'log' трассы относится к теме t? */
export const logFor = (t, text) => t === 'all' || !!LOG_RE[t]?.test(String(text ?? ''))

/** Прореживание rms: переходы порога голоса + не чаще LEVEL_EVERY_MS (в тишине — LEVEL_QUIET_MS) */
function levelThin() {
  let at = -Infinity, voice = null
  return e => {
    const v = isVoice(e) // голос — по счётчику распознавания (pillStandVoice.js)
    if (v === voice && e.t - at < (v ? LEVEL_EVERY_MS : LEVEL_QUIET_MS)) return null
    at = e.t; voice = v
    return { t: e.t, k: 'level', rms: e.rms, voice: v, ...(e.n != null ? { n: e.n } : {}), ...(e.lv != null ? { lv: e.lv } : {}), ...(e.g != null ? { g: e.g } : {}) }
  }
}

/** Прореживание заливки: смена цели, шаг экрана ≥ FILL_STEP, экран догнал цель */
function fillThin() {
  let goal = null, shown = null, reached = true
  return e => {
    const got = Math.abs(e.shown - e.goal) <= EPS
    const keep = goal == null || Math.abs(e.goal - goal) > 1e-4 || Math.abs(e.shown - shown) >= FILL_STEP || (got && !reached)
    reached = got
    if (!keep) return null
    goal = e.goal; shown = e.shown
    return e
  }
}

const animPicker = () => {
  const fill = fillThin()
  let prev = ''
  return e => {
    if (e.k === 'target') return e
    if (e.k === 'vosk-start' || e.k === 'vosk-final') { const was = prev; prev = ''; if (e.k === 'vosk-final') { const text = heardWords(e.raw?.text).join(' '); return text || was ? { t: e.t, k: 'heard', src: 'итог', text } : null } return null }
    if (e.k === 'vosk-partial') {
      const ws = heardWords(e.raw?.partial), cur = ws.join(' ')
      if (!cur || cur === prev) return null
      const before = new Set(heardWords(prev)); prev = cur
      return { t: e.t, k: 'heard', src: 'черновик', text: cur, fresh: ws.filter(w => !before.has(w)) }
    }
    if (e.k === 'fill') { const f = fill(e); return f ? { t: f.t, k: 'fill', goal: f.goal, shown: f.shown, ...(f.level != null ? { level: f.level } : {}) } : null } // level — уровень голоса после ворот (вертикальная пилюля): на чём шла заливка
    if (e.k === 'word') return { t: e.t, k: 'word', index: e.index, text: e.text, draft: !!e.draft, ...(e.gone ? { gone: true } : {}) }
    if (e.k === 'result') return { t: e.t, k: 'result', ok: !!e.ok, ...(e.clean != null ? { clean: !!e.clean } : {}) }
    if (e.k === 'log') return LOG_RE.anim.test(e.text) ? e : null
    return ANIM_KINDS.has(e.k) ? e : null
  }
}

const earPicker = () => {
  const lv = levelThin()
  return e => {
    if (e.k === 'target' || EAR_KINDS.has(e.k)) return e
    if (e.k === 'level') return lv(e)
    if (e.k === 'wl') return EAR_WL.has(e.kind) ? e : null
    if (e.k === 'log') return LOG_RE.ear.test(e.text) ? e : null
    return null
  }
}

const logicPicker = () => e => {
  if (e.k === 'target' || LOGIC_KINDS.has(e.k)) return e
  if (e.k === 'wl') return EAR_WL.has(e.kind) && e.kind !== 'ear' ? null : e
  if (e.k === 'vosk-final') return { t: e.t, k: 'heard', src: 'итог', text: heardWords(e.raw?.text).join(' ') }
  if (e.k === 'log') return LOG_RE.logic.test(e.text) ? e : null
  return null
}

const honestyPicker = ({ windows = [] }) => e => {
  if (e.k === 'target') return e
  if (NOISE.has(e.k)) return null
  return windows.some(([a, b]) => e.t >= a && e.t <= b) ? e : null
}

const PICKERS = { anim: animPicker, ear: earPicker, logic: logicPicker, honesty: honestyPicker }

/** Отобранные события для текста отчёта: topics — выбор тем, windows — окна доказательств «Честности» [[a, b]] (мс сессии) */
export function packEvents(topics, events, { windows = [] } = {}) {
  const ts = normTopics(topics)
  const all = ts[0] === 'all'
  const list = all ? ['ear', 'logic', 'anim'] : PRIORITY.filter(t => ts.includes(t))
  const picks = list.map(t => PICKERS[t]({ windows }))
  const out = []
  for (const e of events) {
    let got = null
    for (const p of picks) { const r = p(e); if (got == null && r != null) got = r } // каждый отбор видит каждое событие (у прореживания и «heard» есть память)
    if (got == null && all && !TEXT_SKIP.has(e.k) && !NOISE.has(e.k)) got = e
    if (got == null && (e.k === 'prefs' || MIC_KINDS.has(e.k))) got = e // смена языка / режима / длины на лету и здоровье микрофона — в каждой теме (контекст)
    if (got) out.push(got)
  }
  return out
}

/** Строки журнала игры по темам: «Всё» — все; иначе — строки модулей игры с тегами темы (без «[stand]» — они уже есть в трассе) */
export const journalFor = (topics, lines) => {
  const ts = normTopics(topics)
  if (ts[0] === 'all') return lines
  return lines.filter(l => !l.text.startsWith('[stand]') && ts.some(t => logFor(t, l.text)))
}

/** Темы, у которых есть таблица кадров */
export const wantsFrames = topics => normTopics(topics).some(t => t === 'anim' || t === 'all')

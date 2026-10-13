// Проверки «живого» стиля реплик Пита (чат друга, а не учебник): тире, точки, смайлы/скобки, служебные слова вместо живой речи.
// Работают на формате обмена ({ ref, type, data }) уже после applyMarkup (текст без меток). Чистые функции, возвращают строки-замечания.
const EMOJI = /[\u{1F600}-\u{1F64F}\u{1F910}-\u{1F9FF}\u{1F44C}\u{1F44D}\u{1F44F}\u{1F525}\u{1F389}\u{1F680}\u{1F4AA}]/u
const BRACKETS_END = /[()]+\s*$/ // «)», «))» радость, «(», «((» грусть или досада
const META = /мини-?сцена|штраф|раунд на время|упражнени|правильный ответ|задание\b/i
// Прошедшее время мужского рода о действиях ученика выдаёт его пол: «успел», «угадал», «справился» — говори «получилось», «в точку»
const GENDER = /(^|[^а-яё])(успел|угадал|справился|составил|понял|ответил|заметил|выбрал|написал|молодец)(?![а-яё])/i
const MAX_REACTION_WORDS = 8 // реакция на успех — коротко
const MAX_PERIOD_SHARE = 0.1   // точки в конце предложений — не больше 10% реплик
const EMOJI_SHARE = [0.25, 0.55] // среди реплик со смайлом настоящих эмодзи ~40%, остальные — скобки

const textOf = n => String(n.data?.content ?? n.data?.text ?? n.data?.caption ?? '')
const talks = nodes => nodes.filter(n => n.type === 'text' && textOf(n).trim())

function checkDash(nodes) {
  return talks(nodes)
    .filter(n => !String(textOf(n)).includes('\n') && /\s[—–]\s/.test(textOf(n))) // в списках пар «форма → значение» (с переносами) тире не считаем
    .map(n => `[R-dash] ${n.ref}: тире в реплике — в живом чате почти не ставят, замени запятой, двоеточием или словами («это»)`)
}

function checkPeriods(nodes) {
  const msgs = talks(nodes)
  if (msgs.length < 10) return []
  const withPeriod = msgs.filter(n => { const t = textOf(n).trim(); return (/[^.]\.$/.test(t)) || /[а-яa-z)]\.\s+[А-ЯA-Z]/.test(t) })
  const share = withPeriod.length / msgs.length
  return share > MAX_PERIOD_SHARE
    ? [`[R-period] точки в конце предложений у ${Math.round(share * 100)}% реплик (${withPeriod.slice(0, 5).map(n => n.ref).join(', ')}…), нужно не больше ${MAX_PERIOD_SHARE * 100}% — в чате точки ставят очень редко`]
    : []
}

function checkSmileys(nodes) {
  const msgs = talks(nodes)
  const emoji = msgs.filter(n => EMOJI.test(textOf(n))).length
  const brackets = msgs.filter(n => !EMOJI.test(textOf(n)) && BRACKETS_END.test(textOf(n))).length
  const total = emoji + brackets
  if (total < 8) return []
  const share = emoji / total
  return share < EMOJI_SHARE[0] || share > EMOJI_SHARE[1]
    ? [`[R-smiley] настоящих эмодзи ${Math.round(share * 100)}% среди реплик со смайлом (скобок ${100 - Math.round(share * 100)}%) — нужно примерно 40% эмодзи и 60% скобок «)», «))», «)))»`]
    : []
}

function checkMeta(nodes) {
  return nodes
    .filter(n => ['text', 'audio', 'photo', 'pin_message'].includes(n.type) && META.test(textOf(n)))
    .map(n => `[R-meta] ${n.ref}: учебные слова («мини-сцена», «штраф», «раунд», «упражнение»…) — друг так не говорит, скажи по-человечески («представь…», «давай на время»)`)
}

function checkGender(nodes) {
  return talks(nodes).filter(n => {
    const t = textOf(n)
    const m = GENDER.exec(t)
    if (!m) return false
    const clause = t.slice(0, m.index).split(/[.!?)\n]/).pop() // «я сделаю вид, что не заметил» — это Пит о себе, не о ученике
    return !/(^|\s)я(\s|$)/i.test(clause)
  }).map(n => `[R-gender] ${n.ref}: форма мужского рода о действии ученика («успел», «угадал», «справился») выдаёт пол — скажи нейтрально («получилось», «в точку», «вышло»)`)
}

const CORRECT_IF = /correct|say_done/
/** Реакция на успех (текст сразу после верного ответа) — коротко: «в точку))», «ого! три из трёх, круто)» */
function checkReactionLength(nodes) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const out = []
  for (const ex of nodes.filter(n => n.type !== 'table')) { // у авто-таблицы table_correct — просто «дальше по уроку», не ответ ученика
    for (const t of ex.triggers ?? []) {
      const r = CORRECT_IF.test(t.if) ? byRef.get(t.then) : null
      // нода после верного ответа может быть уже следующим заданием/сценой (вопрос, «скажи/собери/переведи…») — это не реакция
      const isTask = /\?|скажи|напечатай|собери|переведи|ответь|представь|давай/i.test(r ? textOf(r) : '')
      if (r?.type === 'text' && !isTask && textOf(r).trim().split(/\s+/).length > MAX_REACTION_WORDS) out.push(`[R-react-len] ${r.ref}: реакция на верный ответ длиннее ${MAX_REACTION_WORDS} слов — на успех отвечают коротко («в точку))», «да)) именно так!»), без комментариев после`)
    }
  }
  return out
}

export function checkStyle(nodes) {
  return [...checkDash(nodes), ...checkPeriods(nodes), ...checkSmileys(nodes), ...checkMeta(nodes), ...checkGender(nodes), ...checkReactionLength(nodes)]
}

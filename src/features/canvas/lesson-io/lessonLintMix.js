// Проверки «баланса» урока: доля голоса и текста, одиночные смайлики (текст или стикер), повторы реплик, заголовки таблиц, голос в ветке ошибки.
// Чистые функции на формате обмена ({ ref, type, data, triggers }) после applyMarkup, возвращают строки-замечания.
import { wrongOnlySet, isEmojiOnly } from './lessonLintFlow.js'

const textOf = n => String(n.data?.content ?? n.data?.text ?? n.data?.caption ?? '').trim()
const VOICE_SHARE = [0.3, 0.7]  // голосовые сообщения среди (текст + голос): 50% ± 20%
const EMOJI_TEXT_SHARE = [0.25, 0.55] // среди одиночных смайликов текстом ~40%, стикером ~60%

/** Голосовых (audio) и текстовых сообщений примерно поровну: 30–70% голоса */
function checkVoiceShare(nodes) {
  const wrong = wrongOnlySet(nodes, /wrong|skip/)
  const main = nodes.filter(n => !wrong.has(n.ref))
  const voice = main.filter(n => n.type === 'audio').length
  const texts = main.filter(n => n.type === 'text' && textOf(n) && !isEmojiOnly(n)).length
  const total = voice + texts
  if (total < 12) return []
  const share = voice / total
  return share < VOICE_SHARE[0] || share > VOICE_SHARE[1]
    ? [`[R-voice-share] голосовых ${Math.round(share * 100)}% среди текстов и голосовых (${voice} из ${total}) — нужно примерно 50% ± 20%: ${share < VOICE_SHARE[0] ? 'озвучь часть объяснений и вызовов (audio)' : 'часть голосовых замени текстом'}`]
    : []
}

/** В ветке ошибки подсказка всегда текстом: голос там не прослушать с первого раза и нечем перечитать */
function checkWrongAudio(nodes) {
  const wrong = wrongOnlySet(nodes, /wrong|skip/)
  return nodes.filter(n => n.type === 'audio' && wrong.has(n.ref))
    .map(n => `[R-wrong-audio] ${n.ref}: голосовое сообщение в ветке ошибки — подсказку при ошибке пиши текстом`)
}

/** Одиночные смайлики: ~40% отдельным текстом, ~60% стикером (с imagePrompt) */
function checkEmojiShare(nodes) {
  const emoji = nodes.filter(isEmojiOnly).length
  const stickers = nodes.filter(n => n.type === 'sticker').length
  const total = emoji + stickers
  if (total < 5) return []
  const share = emoji / total
  return share < EMOJI_TEXT_SHARE[0] || share > EMOJI_TEXT_SHARE[1]
    ? [`[R-emoji-share] одиночных смайликов текстом ${Math.round(share * 100)}% (${emoji} из ${total}), нужно примерно 40% текстом и 60% стикерами (sticker + imagePrompt)`]
    : []
}

/** Одинаковые реплики дословно (кроме коротких) — чередуй формулировки: «а ну-ка на слух», «давай на слух» */
function checkRepeats(nodes) {
  const seen = new Map()
  const out = []
  for (const n of nodes.filter(m => m.type === 'text' && !isEmojiOnly(m))) {
    const t = textOf(n).toLowerCase().replace(/[^a-zа-яё0-9 ]/gi, '').trim()
    if (t.length < 8) continue
    if (seen.has(t)) out.push(`[R-repeat] ${n.ref}: реплика дословно повторяет ${seen.get(t)} — чередуй формулировки («а ну-ка на слух», «давай на слух»)`)
    else seen.set(t, n.ref)
  }
  return out
}

/** У таблиц разные заголовки в чате (chatCaption) — под контекст каждой, а не один на все */
function checkTableTitles(nodes) {
  const by = new Map()
  for (const n of nodes.filter(m => m.type === 'table')) {
    const c = String(n.data?.chatCaption ?? '').trim()
    if (c) by.set(c, [...(by.get(c) ?? []), n.ref])
  }
  return [...by].filter(([, refs]) => refs.length > 1)
    .map(([c, refs]) => `[R-table-title] ${refs.join(', ')}: у таблиц одинаковый заголовок «${c}» — назови каждую по контексту шага`)
}

const KSTA = /(^|[^а-яё])кста(?![а-яё])/i
/** «кста» — фирменная связка Пита: в уроке из 15+ текстовых реплик минимум раз (в текстовых сообщениях, не в голосовых) */
function checkKsta(nodes) {
  const texts = nodes.filter(n => n.type === 'text' && !isEmojiOnly(n))
  if (texts.length < 15 || texts.some(n => KSTA.test(textOf(n)))) return []
  return [`[R-ksta] в уроке (${texts.length} текстовых реплик) ни разу нет «кста» — добавь связку хотя бы в одну текстовую реплику («мы кста в субботу идём…»), в голосовых её не считаем`]
}

const EMOJI_ANY = /\p{Extended_Pictographic}/u
const BRACKET_SMILEY = /\){2,}|\({2,}|[)(]\s*$/
/** В голосовых и в озвучке авто-таблиц (script) нет смайликов вообще: ни эмодзи, ни скобок-смайлов («))», «(» в конце) — голос их не произнесёт */
function checkVoiceSmileys(nodes) {
  const spoken = n => (n.type === 'audio' ? textOf(n) : n.type === 'table' ? String(n.data?.script ?? '') : '')
  return nodes.filter(n => EMOJI_ANY.test(spoken(n)) || BRACKET_SMILEY.test(spoken(n)))
    .map(n => `[R-voice-smiley] ${n.ref}: в ${n.type === 'table' ? 'озвучке таблицы (script)' : 'голосовом сообщении'} смайлик (эмодзи или скобки) — в голосе их быть не должно, убери`)
}

const LOWER_SHARE = [0.25, 0.55] // неформальность: ~40% реплик начинаются не с большой буквы
/** Текстовые и голосовые реплики основного потока: около 40% начинаются с маленькой буквы (подсказки ветки ошибки не считаем: они всегда с маленькой) */
function checkLowercase(nodes) {
  const wrong = wrongOnlySet(nodes, /wrong|skip/)
  const msgs = nodes.filter(n => (n.type === 'text' || n.type === 'audio') && !wrong.has(n.ref) && !isEmojiOnly(n))
    .map(n => textOf(n).replace(/^[^\p{L}]+/u, '')).filter(t => t)
  if (msgs.length < 12) return []
  const share = msgs.filter(t => t[0] === t[0].toLowerCase() && t[0] !== t[0].toUpperCase()).length / msgs.length
  return share < LOWER_SHARE[0] || share > LOWER_SHARE[1]
    ? [`[R-lowercase] с маленькой буквы начинается ${Math.round(share * 100)}% реплик, нужно примерно 40% (неформально: «а теперь…», «ну как сказать…», «мы кста…»), остальные с большой`]
    : []
}

/** В подсказке ветки ошибки нет «, уже слово»: итоговое слово называется просто, как продолжение фразы */
function checkHintUzhe(nodes) {
  const wrong = wrongOnlySet(nodes, /wrong|skip/)
  return nodes.filter(n => n.type === 'text' && wrong.has(n.ref) && /,\s*уже\s/i.test(textOf(n)))
    .map(n => `[R-hint-uzhe] ${n.ref}: в подсказке «, уже …» — слово «уже» лишнее, назови итоговое слово без него`)
}

/** Таблица в режиме авто/ручной идёт дальше только по table_correct: с таймером или played переход потеряется при открытии на холсте */
function checkTableTriggers(nodes) {
  return nodes.filter(n => n.type === 'table' && (n.data?.mode ?? 'dictator') !== 'demo' && !(n.triggers ?? []).some(t => /^table_(correct|wrong)$/.test(t.if)))
    .map(n => `[R-table-trigger] ${n.ref}: таблица в режиме «${n.data?.mode ?? 'dictator'}» без перехода table_correct — поставь {if:'table_correct', then:…} (timer/played здесь не работают, цепочка оборвётся)`)
}

/** Закрепы и системные сообщения нужны в уроке: pin_message — главное правило/формула раздела, system — смена части и события (в уроке от 20 нод) */
function checkPinSystem(nodes) {
  if (nodes.length < 20) return []
  const out = []
  if (!nodes.some(n => n.type === 'pin_message')) out.push('[R-pin] в уроке нет ни одного закрепа (pin_message) — закрепи главное правило или формулу раздела, чтобы ученик мог к нему вернуться')
  if (!nodes.some(n => n.type === 'system')) out.push('[R-system] в уроке нет системных сообщений (system) — отмечай ими смену частей и события («Часть 2», «Маша написала»)')
  return out
}

/** Главные мысли подчёркнуты сами ({l:..}): в уроке от 20 нод (с раскраской) подчёркнутых нод не меньше одной на 15 (минимум 3) */
function checkKeyMarks(nodes) {
  if (nodes.length < 20 || !nodes.some(n => (n.data?.highlights ?? []).some(h => h.mode === 'bold'))) return []
  const marked = nodes.filter(n => (n.data?.highlights ?? []).some(h => h.mode === 'underline')).length
  const need = Math.max(3, Math.floor(nodes.length / 15))
  return marked < need ? [`[R-key-mark] подчёркнутых главных мыслей ${marked}, нужно хотя бы ${need}: в каждом объяснении выдели ключевое слово или мысль белым подчёркиванием {l:..} (текст остаётся серым)`] : []
}

/** Урок (от 30 нод) открывается мягким выбором пути в первых 10 нодах: «сначала объясни основу» / «сразу к практике» (word_choice-меню с переходами variant) */
function checkStartMenu(nodes) {
  if (nodes.length < 30) return []
  const first = [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).slice(0, 10)
  const ok = first.some(n => n.type === 'word_choice' && (n.triggers ?? []).filter(x => x.if === 'variant').length >= 2)
  return ok ? [] : ['[R-start-menu] в первых 10 нодах нет меню выбора пути — после короткой завязки спроси мягко: «сначала объясни основу» или «сразу к практике» (word_choice с двумя вариантами-переходами, обе опции верные)']
}

const TEACHER = /(^|[^а-яё])учител[а-яё]*/i
/** Вместо слова «учитель» — имя учителя из урока («Пит закрепил сообщение», «Пит пишет»): в репликах и подписях слово «учитель» не нужно */
function checkTeacherWord(nodes) {
  return nodes.filter(n => ['text', 'audio', 'system', 'pin_message', 'photo'].includes(n.type) && TEACHER.test(textOf(n)))
    .map(n => `[R-teacher-name] ${n.ref} (${n.type}): слово «учитель» — пиши имя учителя из урока (Пит), а не «учитель»`)
}

/** В одном сообщении не больше одного подчёркивания {l:..} / {u:..}: много подчёркнутого = ничего не главное */
function checkManyUnderlines(nodes) {
  return nodes.filter(n => (n.data?.highlights ?? []).filter(h => h.mode === 'underline').length > 1)
    .map(n => `[R-underline-many] ${n.ref} (${n.type}): в сообщении больше одного подчёркивания — оставь одно, самое главное`)
}

export function checkMix(nodes) {
  return [...checkTeacherWord(nodes), ...checkManyUnderlines(nodes), ...checkStartMenu(nodes), ...checkKeyMarks(nodes), ...checkPinSystem(nodes), ...checkTableTriggers(nodes), ...checkLowercase(nodes), ...checkKsta(nodes), ...checkVoiceSmileys(nodes), ...checkHintUzhe(nodes), ...checkVoiceShare(nodes), ...checkWrongAudio(nodes), ...checkEmojiShare(nodes), ...checkRepeats(nodes), ...checkTableTitles(nodes)]
}

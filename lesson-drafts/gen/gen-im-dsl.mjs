import { suggestWidths } from '../../src/features/canvas/lesson-io/tableWidths.js'
// Помощники генератора уроков «I'm» (DSL: T/A/P/WC/PA/SAY/TABLE/SCENE…, ветки ошибок, зоны, раскладка) — вынесено из gen-im.mjs (лимит 400 строк).
// Сюжет и тексты урока — gen-im.mjs; здесь только то, как собираются ноды

export const STEP = 560
export const GAP = 1300
export const LEVEL_GAP = 700
export const ERR_Y = 480
export const nodes = []
export const zones = []
export let x = 0, refN = 0
export const newRef = () => `n${++refN}`
export const byKey = {}
export const laterLinks = []

export const CAT_PIT = { a: { kind: 'cat', gender: 'male', name: 'Пит', palette: { fur: '#f2a65a', belly: '#fde7c8', accent: '#f6a9a3', eye: '#5aa36b', stripe: '#d9843d' }, stripes: true, voice: { pitch: 1, rate: 1 } } }
export const SLOTS_CAFE = { table: 'table', 'table-left': 'pastry-plate', window: 'window', 'wall-menu': 'menu-board', 'wall-art': 'picture', ceiling: 'pendant-lamp', counter: 'coffee-machine', 'floor-left': 'plant', 'floor-right': 'floor-lamp', 'table-right': 'laptop' }

export const NEXT = { text: 'timer', audio: 'played', photo: 'timer', sticker: 'timer', reaction: 'timer', system: 'timer', pin_message: 'timer', lesson_ref: 'timer', scene: 'played', table: 'table_correct', word_choice: 'word_correct', phrase_assembly: 'phrase_correct', type_word: 'type_correct', say_phrase: 'say_done' }
export const MS = { text: 1500, photo: 2200, sticker: 1200, reaction: 1400, system: 1600, pin_message: 1800, lesson_ref: 2000, table: 2200 }
export const plain = t => t.replace(/\{[a-z]:([^}]*)\}/g, '$1')

export const mainRow = () => nodes.filter(n => !n._side)
export function link(from, to) { const t = from?.triggers.find(t => t.then === undefined); if (t) t.then = to }
export function main(type, data, extra = {}) {
  const p = mainRow().at(-1)
  const n = { type, data, triggers: [{ if: NEXT[type], ...(MS[type] && NEXT[type] === 'timer' ? { ms: MS[type] } : {}) }], ...extra, ref: newRef(), pos: [x, 0] }
  if (type === 'table') n.triggers.push({ if: 'table_wrong', then: null })
  nodes.push(n); x += STEP
  if (p) link(p, n.ref)
  return n
}
export const T = c => main('text', { content: c, hardWrap: c.includes('\n') })
export const A = (t, showText = true) => main('audio', { text: t, showText }, { needs: 'audio — озвучка реплики', note: `ОЗВУЧКА: ${plain(t)}` })
export const P = (caption, imagePrompt) => main('photo', { caption, imagePrompt, crop: { x: 0, y: 0, scale: 1 } }, { needs: 'photo', note: 'ФОТО: сгенерировать в редакторе по imagePrompt' })
export const S = imagePrompt => main('sticker', { imagePrompt, crop: { x: 0, y: 0, scale: 1 }, muted: true, isVideo: false, autoSound: false }, { needs: 'photo/video — сам стикер', note: 'СТИКЕР: сгенерировать в редакторе по imagePrompt' })
export const R = emoji => main('reaction', { emoji, target: 'student' })
export const SYS = c => main('system', { content: c })
export const LEVEL = c => { x += LEVEL_GAP; return SYS(c) }
export const PIN = c => main('pin_message', { content: c })
export const REF = (caption, targetTitle) => main('lesson_ref', { caption, isModule: false, targetTitle }, { note: `ССЫЛКА: в редакторе выбрать урок «${targetTitle}» (targetId); без него плеер ноду пропустит` })

// Ветка ошибки: текст под заданием (y 480); возвращается в главный ряд, минуя похвалу после задания (skip нод)
export const pendingWrong = []
// Вводное слово ветки ошибки — по кругу, чтобы соседние ветки начинались по-разному и ни одно не занимало больше четверти (R-opener, R-opener-adjacent)
export const OPENERS = ['не совсем)', 'близко)', 'неа)', 'не то)', 'не не не)']
export let openerN = 0
export function wrong(task, content0, trig, skip = 1) {
  const content = content0.replace(/^(не совсем|близко|неа|не то|но нет|но-но-но|не-не-не|не не не)\)\s*/i, () => `${OPENERS[openerN++ % OPENERS.length]} `)
  const w = { type: 'text', data: { content, hardWrap: content.includes('\n') }, triggers: [{ if: 'timer', ms: 1500 }], _side: true, ref: newRef(), pos: [task.pos[0], ERR_Y] }
  nodes.push(w)
  task.triggers.push({ if: trig, then: w.ref })
  pendingWrong.push({ w, task, skip })
}
export function closeWrongs() {
  for (const { w, task, skip } of pendingWrong) {
    const rest = mainRow().slice(mainRow().indexOf(task) + 1)
    w.triggers[0].then = rest[skip].ref
  }
}

export function WC(options, { wrongText, voicePhrase, timeLimitSec } = {}) {
  const n = main('word_choice', { options: options.map((t, i) => ({ text: t, isCorrect: i === 0 })), sendPickToChat: true, ...(voicePhrase ? { voicePhrase } : {}), ...(timeLimitSec ? { timeLimitSec } : {}) })
  for (const t of options) n.triggers.push({ if: 'variant', variantLabel: t, then: null })
  if (wrongText) wrong(n, wrongText, 'word_wrong'); else n.triggers.push({ if: 'word_wrong', then: null })
  return n
}
export function MENU(options, keys) {
  const n = main('word_choice', { reward: false, options: options.map(t => ({ text: t, isCorrect: true })), sendPickToChat: true }, { note: 'Меню-развилка, не тест' })
  n.triggers.push({ if: 'word_wrong', then: null })
  options.forEach((t, i) => { n.triggers.push({ if: 'variant', variantLabel: t, then: undefined }); laterLinks.push({ node: n, idx: n.triggers.length - 1, key: keys[i] }) })
  return n
}
export function companion(task, { slot, type = 'text', text }) {
  const c = { type, data: type === 'audio' ? { text, showText: true } : { content: text }, triggers: [], _side: true, ref: newRef(), pos: [task.pos[0], 960], note: 'СИГНАЛ (нода-спутник): показывается при первой ошибке в этом слоте', ...(type === 'audio' ? { needs: 'audio — озвучка реплики' } : {}) }
  nodes.push(c)
  task.data.signals = [...(task.data.signals ?? []), { slot, ref: c.ref }]
}
export const RW = ['не совсем)', 'неа)', 'близко)', 'хм, не то)', 'не не не)']
export let rwN = 0
export function PA(words, distractors, { wrongText, responseWrong, timeLimitSec, signals = [] }) {
  const n = main('phrase_assembly', { words: words.split(' '), distractors: distractors.map(t => ({ text: t })), responseWrong: responseWrong.replace(/^не совсем\)/, () => RW[rwN++ % RW.length]), ...(timeLimitSec ? { timeLimitSec } : {}) })
  for (const sg of signals) companion(n, sg)
  for (const t of distractors) n.triggers.push({ if: 'variant', variantLabel: t, then: null })
  wrong(n, wrongText, 'phrase_wrong')
  return n
}
export function TW(word, extraLetters, responseWrong, wrongText) {
  const n = main('type_word', { word, extraLetters, responseWrong })
  wrong(n, wrongText, 'type_wrong')
  return n
}
// say_phrase; после него — «дай послушать» → голосовой комментарий про навык (не про звук: при «Я не могу говорить» записи нет) → 🔥
export const ENDS = ['🔥', '🙌', '😎', '💯', '👌', '🚀', '🏆', '✨']
export let endN = 0
// После «дай послушать» → голос о навыке → реакция (эмодзи по кругу, не один 🔥); без listen — comment текстом или react эмодзи-реакцией
export function SAY(phraseText, translation, { pattern, startHint, hintMismatch, wrongText, listen, comment, react, hintsOff, signals = [] }) {
  const n = main('say_phrase', { lang: 'en-US', phrase: phraseText, translation, keywords: '', threshold: 70, strict: true, hintsOn: true, voiceReply: !!listen, hintSilence: 'Не слышу тебя) говори чуть громче и ближе к микрофону', hintPartial: 'Близко) верно: {ok}, не хватило: {missed}', ...(pattern ? { pattern, startHint, hintMismatch } : {}), ...(!pattern && hintMismatch ? { hintMismatch } : {}), ...(hintsOff ? { hintsOn: false } : {}) })
  for (const sg of signals) companion(n, sg)
  if (listen) { wrong(n, wrongText, 'say_wrong', 3); T(listen); A(comment); R(ENDS[endN++ % ENDS.length]) } else { wrong(n, wrongText, 'say_wrong', 1); if (react) R(react); else T(comment) }
  return n
}
// Ширины колонок — автоматически по самому узкому экрану (iPhone SE, 355px): сначала каждая ячейка в одну строку, потом баланс (tableWidths.js, правило автора)
// mergeLast — число (или true = все) первых строк, в которых последняя колонка с ОДНИМ значением рисуется одной большой ячейкой (rowspan), без дублей; distractors — слова-ловушки вне таблицы (manual)
export function TABLE(mode, chatCaption, head, rows, { script, widths, answer, wrongText, mergeLast = false, distractors = [] } = {}) {
  const cells = []
  head.forEach((v, c) => cells.push({ id: `h${c}`, col: c, row: 0, value: v, colspan: 1, rowspan: 1, fontSize: 11, isHeader: true }))
  // значение ячейки: строка или [строка, [варианты]] — ячейка-группа («he / she / it») с выпадающим меню вариантов (в ручной таблице ученик выбирает из них)
  rows.forEach((r, ri) => r.forEach((raw, c) => {
    const last = c === head.length - 1
    const span = mergeLast === true ? rows.length : mergeLast || 0
    if (span && last && ri > 0 && ri < span) return // покрыто большой ячейкой первой строки
    const [v, options] = Array.isArray(raw) ? raw : [raw]
    cells.push({ id: `r${ri}c${c}`, col: c, row: ri + 1, value: v, colspan: 1, rowspan: span && last && ri === 0 ? span : 1, fontSize: c === 1 && head.length === 3 ? 15 : 13, ...(options ? { options } : {}) })
  }))
  const rowCount = rows.length + 1
  const data = { mode, table: { rows: Array.from({ length: rowCount }, (_, i) => ({ id: `r${i}`, heightPct: Math.round(100 / rowCount) })), cells, columns: head.map((_, i) => ({ id: `c${i}`, widthPct: (widths ?? suggestWidths({ cells, columns: head.map(() => ({})), colCount: head.length }))[i] })), colCount: head.length, rowCount }, chatCaption, ...(mode === 'dictator' ? { script, sendToChat: true } : {}), ...(mode === 'manual' ? { answer, sendToChat: true, distractors: distractors.map(text => ({ text })) } : {}) }
  const n = main('table', data, mode === 'dictator' ? { needs: 'audio — только для режима dictator', note: `ОЗВУЧКА таблицы (скрипт идёт по ячейкам слева направо, сверху вниз; метку «Проверить» поставить при монтаже после последней ячейки): ${script}` } : { note: `Таблица I'm: ${chatCaption}` })
  if (mode === 'demo') n.triggers = [{ if: 'timer', ms: 2200 }]
  if (mode === 'manual') { n.note = `РУЧНАЯ таблица: ученик тапает ячейки по порядку и собирает «${answer}»`; n.triggers = n.triggers.filter(t => t.if !== 'table_wrong'); wrong(n, wrongText, 'table_wrong') }
  return n
}
export const SLOTS_OFFICE = { window: 'window', 'wall-art': 'picture', 'wall-board': 'whiteboard', 'wall-clock': 'wall-clock', 'desk-center': 'papers', 'floor-left': 'floor-lamp', 'floor-right': 'plant', table: 'table', 'desk-left': 'laptop', 'desk-right': 'mug' }
export function SCENE(id, title, mode, timeline, characters = CAT_PIT, location = 'cafe') {
  return main('scene', { scene: { version: 2, id, title, location, characters, slots: location === 'cafe' ? SLOTS_CAFE : SLOTS_OFFICE, timeline, options: { bubbles: true } }, mode, showBubbles: mode === 'bubble', start: 'auto', crop: { x: 0, y: 0, scale: 1 } }, { note: mode === 'circle' ? 'СЦЕНА: кружок Пита, один кот крупно, без облачков (текст реплик в кружке не показывается). Озвучку записать кнопкой «Озвучить» в редакторе сцены' : 'СЦЕНА: диалог двух котов в пузыре. Озвучку записать в редакторе сцены' })
}
export function zone(label, color) { zones.push({ label, color, x0: x - 150 }) }
export function endZone() { zones.at(-1).x1 = x - STEP + 308 + 150; x += GAP }



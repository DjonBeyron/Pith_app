// Генератор урока «I'm» (формат pithy-lesson) по скелету урока «To»: вход → 3 части → итог → тренировка 7 уровней → финал.
// Запуск: node lesson-drafts/gen/gen-im.mjs ; затем node scripts/lesson-gate.mjs lesson-drafts/im.json --fix-seq
// Правки по замечаниям судей (круги 1–3) вносятся сюда, урок пересобирается. История замечаний — PROJECT.md «Урок I'm»
import { writeFileSync } from 'node:fs'

const STEP = 560, GAP = 1300, LEVEL_GAP = 700, ERR_Y = 480
const nodes = [], zones = []
let x = 0, refN = 0
const newRef = () => `n${++refN}`
const byKey = {}
const laterLinks = []

const CAT_PIT = { a: { kind: 'cat', gender: 'male', name: 'Пит', palette: { fur: '#f2a65a', belly: '#fde7c8', accent: '#f6a9a3', eye: '#5aa36b', stripe: '#d9843d' }, stripes: true, voice: { pitch: 1, rate: 1 } } }
const SLOTS_CAFE = { table: 'table', 'table-left': 'pastry-plate', window: 'window', 'wall-menu': 'menu-board', 'wall-art': 'picture', ceiling: 'pendant-lamp', counter: 'coffee-machine', 'floor-left': 'plant', 'floor-right': 'floor-lamp', 'table-right': 'laptop' }

const NEXT = { text: 'timer', audio: 'played', photo: 'timer', sticker: 'timer', reaction: 'timer', system: 'timer', pin_message: 'timer', lesson_ref: 'timer', scene: 'played', table: 'table_correct', word_choice: 'word_correct', phrase_assembly: 'phrase_correct', type_word: 'type_correct', say_phrase: 'say_done' }
const MS = { text: 1500, photo: 2200, sticker: 1200, reaction: 1400, system: 1600, pin_message: 1800, lesson_ref: 2000, table: 2200 }
const plain = t => t.replace(/\{[a-z]:([^}]*)\}/g, '$1')

const mainRow = () => nodes.filter(n => !n._side)
function link(from, to) { const t = from?.triggers.find(t => t.then === undefined); if (t) t.then = to }
function main(type, data, extra = {}) {
  const p = mainRow().at(-1)
  const n = { type, data, triggers: [{ if: NEXT[type], ...(MS[type] && NEXT[type] === 'timer' ? { ms: MS[type] } : {}) }], ...extra, ref: newRef(), pos: [x, 0] }
  if (type === 'table') n.triggers.push({ if: 'table_wrong', then: null })
  nodes.push(n); x += STEP
  if (p) link(p, n.ref)
  return n
}
const T = c => main('text', { content: c, hardWrap: c.includes('\n') })
const A = (t, showText = true) => main('audio', { text: t, showText }, { needs: 'audio — озвучка реплики', note: `ОЗВУЧКА: ${plain(t)}` })
const P = (caption, imagePrompt) => main('photo', { caption, imagePrompt, crop: { x: 0, y: 0, scale: 1 } }, { needs: 'photo', note: 'ФОТО: сгенерировать в редакторе по imagePrompt' })
const S = imagePrompt => main('sticker', { imagePrompt, crop: { x: 0, y: 0, scale: 1 }, muted: true, isVideo: false, autoSound: false }, { needs: 'photo/video — сам стикер', note: 'СТИКЕР: сгенерировать в редакторе по imagePrompt' })
const R = emoji => main('reaction', { emoji, target: 'student' })
const SYS = c => main('system', { content: c })
const LEVEL = c => { x += LEVEL_GAP; return SYS(c) }
const PIN = c => main('pin_message', { content: c })
const REF = (caption, targetTitle) => main('lesson_ref', { caption, isModule: false, targetTitle }, { note: `ССЫЛКА: в редакторе выбрать урок «${targetTitle}» (targetId); без него плеер ноду пропустит` })

// Ветка ошибки: текст под заданием (y 480); возвращается в главный ряд, минуя похвалу после задания (skip нод)
const pendingWrong = []
// Вводное слово ветки ошибки — по кругу, чтобы соседние ветки начинались по-разному и ни одно не занимало больше четверти (R-opener, R-opener-adjacent)
const OPENERS = ['не совсем)', 'близко)', 'неа)', 'не то)', 'не не не)']
let openerN = 0
function wrong(task, content0, trig, skip = 1) {
  const content = content0.replace(/^(не совсем|близко|неа|не то|но нет|но-но-но|не-не-не|не не не)\)\s*/i, () => `${OPENERS[openerN++ % OPENERS.length]} `)
  const w = { type: 'text', data: { content, hardWrap: content.includes('\n') }, triggers: [{ if: 'timer', ms: 1500 }], _side: true, ref: newRef(), pos: [task.pos[0], ERR_Y] }
  nodes.push(w)
  task.triggers.push({ if: trig, then: w.ref })
  pendingWrong.push({ w, task, skip })
}
function closeWrongs() {
  for (const { w, task, skip } of pendingWrong) {
    const rest = mainRow().slice(mainRow().indexOf(task) + 1)
    w.triggers[0].then = rest[skip].ref
  }
}

function WC(options, { wrongText, voicePhrase, timeLimitSec } = {}) {
  const n = main('word_choice', { options: options.map((t, i) => ({ text: t, isCorrect: i === 0 })), sendPickToChat: true, ...(voicePhrase ? { voicePhrase } : {}), ...(timeLimitSec ? { timeLimitSec } : {}) })
  for (const t of options) n.triggers.push({ if: 'variant', variantLabel: t, then: null })
  if (wrongText) wrong(n, wrongText, 'word_wrong'); else n.triggers.push({ if: 'word_wrong', then: null })
  return n
}
function MENU(options, keys) {
  const n = main('word_choice', { reward: false, options: options.map(t => ({ text: t, isCorrect: true })), sendPickToChat: true }, { note: 'Меню-развилка, не тест' })
  n.triggers.push({ if: 'word_wrong', then: null })
  options.forEach((t, i) => { n.triggers.push({ if: 'variant', variantLabel: t, then: undefined }); laterLinks.push({ node: n, idx: n.triggers.length - 1, key: keys[i] }) })
  return n
}
function companion(task, { slot, type = 'text', text }) {
  const c = { type, data: type === 'audio' ? { text, showText: true } : { content: text }, triggers: [], _side: true, ref: newRef(), pos: [task.pos[0], 960], note: 'СИГНАЛ (нода-спутник): показывается при первой ошибке в этом слоте', ...(type === 'audio' ? { needs: 'audio — озвучка реплики' } : {}) }
  nodes.push(c)
  task.data.signals = [...(task.data.signals ?? []), { slot, ref: c.ref }]
}
const RW = ['не совсем)', 'неа)', 'близко)', 'хм, не то)', 'не не не)']
let rwN = 0
function PA(words, distractors, { wrongText, responseWrong, timeLimitSec, signals = [] }) {
  const n = main('phrase_assembly', { words: words.split(' '), distractors: distractors.map(t => ({ text: t })), responseWrong: responseWrong.replace(/^не совсем\)/, () => RW[rwN++ % RW.length]), ...(timeLimitSec ? { timeLimitSec } : {}) })
  for (const sg of signals) companion(n, sg)
  for (const t of distractors) n.triggers.push({ if: 'variant', variantLabel: t, then: null })
  wrong(n, wrongText, 'phrase_wrong')
  return n
}
function TW(word, extraLetters, responseWrong, wrongText) {
  const n = main('type_word', { word, extraLetters, responseWrong })
  wrong(n, wrongText, 'type_wrong')
  return n
}
// say_phrase; после него — «дай послушать» → голосовой комментарий про навык (не про звук: при «Я не могу говорить» записи нет) → 🔥
const ENDS = ['🔥', '🙌', '😎', '💯', '👌', '🚀', '🏆', '✨']
let endN = 0
// После «дай послушать» → голос о навыке → реакция (эмодзи по кругу, не один 🔥); без listen — comment текстом или react эмодзи-реакцией
function SAY(phraseText, translation, { pattern, startHint, hintMismatch, wrongText, listen, comment, react, hintsOff, signals = [] }) {
  const n = main('say_phrase', { lang: 'en-US', phrase: phraseText, translation, keywords: '', threshold: 70, strict: true, hintsOn: true, voiceReply: !!listen, hintSilence: 'Не слышу тебя) говори чуть громче и ближе к микрофону', hintPartial: 'Близко) верно: {ok}, не хватило: {missed}', ...(pattern ? { pattern, startHint, hintMismatch } : {}), ...(!pattern && hintMismatch ? { hintMismatch } : {}), ...(hintsOff ? { hintsOn: false } : {}) })
  for (const sg of signals) companion(n, sg)
  if (listen) { wrong(n, wrongText, 'say_wrong', 3); T(listen); A(comment); R(ENDS[endN++ % ENDS.length]) } else { wrong(n, wrongText, 'say_wrong', 1); if (react) R(react); else T(comment) }
  return n
}
const W3 = [18, 50, 32] // «Кто · Сейчас · Какой»: центральной колонке с частичкой больше места (замечание автора)
const W4 = [20, 27, 27, 26]
function TABLE(mode, chatCaption, head, rows, { script, widths, answer, wrongText } = {}) {
  const cells = []
  head.forEach((v, c) => cells.push({ id: `h${c}`, col: c, row: 0, value: v, colspan: 1, rowspan: 1, fontSize: 11, isHeader: true }))
  rows.forEach((r, ri) => r.forEach((v, c) => cells.push({ id: `r${ri}c${c}`, col: c, row: ri + 1, value: v, colspan: 1, rowspan: 1, fontSize: c === 1 && head.length === 3 ? 15 : 13 })))
  const rowCount = rows.length + 1
  const data = { mode, table: { rows: Array.from({ length: rowCount }, (_, i) => ({ id: `r${i}`, heightPct: Math.round(100 / rowCount) })), cells, columns: head.map((_, i) => ({ id: `c${i}`, widthPct: (widths ?? (head.length === 4 ? W4 : head.length === 3 ? W3 : [50, 50]))[i] })), colCount: head.length, rowCount }, chatCaption, ...(mode === 'dictator' ? { script, sendToChat: true } : {}), ...(mode === 'manual' ? { answer, sendToChat: true } : {}) }
  const n = main('table', data, mode === 'dictator' ? { needs: 'audio — только для режима dictator', note: `ОЗВУЧКА таблицы (скрипт идёт по ячейкам слева направо, сверху вниз; метку «Проверить» поставить при монтаже после последней ячейки): ${script}` } : { note: `Таблица I'm: ${chatCaption}` })
  if (mode === 'demo') n.triggers = [{ if: 'timer', ms: 2200 }]
  if (mode === 'manual') { n.note = `РУЧНАЯ таблица: ученик тапает ячейки по порядку и собирает «${answer}»`; n.triggers = n.triggers.filter(t => t.if !== 'table_wrong'); wrong(n, wrongText, 'table_wrong') }
  return n
}
const SLOTS_OFFICE = { window: 'window', 'wall-art': 'picture', 'wall-board': 'whiteboard', 'wall-clock': 'wall-clock', 'desk-center': 'papers', 'floor-left': 'floor-lamp', 'floor-right': 'plant', table: 'table', 'desk-left': 'laptop', 'desk-right': 'mug' }
function SCENE(id, title, mode, timeline, characters = CAT_PIT, location = 'cafe') {
  return main('scene', { scene: { version: 2, id, title, location, characters, slots: location === 'cafe' ? SLOTS_CAFE : SLOTS_OFFICE, timeline, options: { bubbles: true } }, mode, showBubbles: mode === 'bubble', start: 'auto', crop: { x: 0, y: 0, scale: 1 } }, { note: mode === 'circle' ? 'СЦЕНА: кружок Пита, один кот крупно, без облачков (текст реплик в кружке не показывается). Озвучку записать кнопкой «Озвучить» в редакторе сцены' : 'СЦЕНА: диалог двух котов в пузыре. Озвучку записать в редакторе сцены' })
}
function zone(label, color) { zones.push({ label, color, x0: x - 150 }) }
function endZone() { zones.at(-1).x1 = x - STEP + 308 + 150; x += GAP }


// Сюжет — ОДИН день Пита (суббота): утро дома → кафе с Кейт → парк → кино в шесть → ночь, переписка. Любовная линия Пит → Кейт
const KATE = { a: { kind: 'cat', gender: 'male', name: 'Пит', palette: CAT_PIT.a.palette, stripes: true, voice: { pitch: 1, rate: 1 } }, b: { kind: 'cat', gender: 'female', name: 'Кейт', palette: { fur: '#e9d3b3', belly: '#fbf3e6', accent: '#f1b7c4', eye: '#4f87c2', stripe: '#cdb08a' }, stripes: false, voice: { pitch: 1.4, rate: 1 } } }

// ───────────────────────────── ВХОД ─────────────────────────────
zone('Вход', '#b6fe3b')
SCENE('im-intro', 'Утро Пита', 'circle', [
  { who: 'a', text: 'Утро, валяюсь в кровати, а Кейт уже пишет: how are you?', emotion: 'tired' },
  { who: 'a', text: 'Хочу ответить: я сонный, я дома, я опаздываю. Сегодня разберём I\'m.', emotion: 'happy' },
], CAT_PIT, 'office')
T('а ну-ка, как сказать {t:«я сонный»}? выбирай:')
WC(['I\'m sleepy', 'I sleepy', 'Me sleepy'], { wrongText: 'не совсем) ничего страшного, сейчас всё расскажу: между {g:I} и состоянием {l:нужна связка}:\n{g:I\'m} ({g:I} + {g:am})' })
T('да)) {t:«я сонный»} 🎯')
T('Как тебе удобнее: сначала разберём основу или сразу в практику?')
MENU(['Сначала объясни 📖', 'Сразу к практике 💪'], ['part1', 'train'])
endZone()

// ───────────────────────────── ЧАСТЬ 1 · I'm = я есть ─────────────────────────────
zone('Часть 1 · I\'m = я есть', '#ffd166')
byKey.part1 = SYS('Часть 1 · I\'m и состояние').ref
P('Я валяюсь в кровати, одеяло до носа, телефон светится 😴', 'Мультяшный рыжий кот лежит в кровати под одеялом, рядом светится телефон, утро, без текста')
A('{g:I\'m} это сокращение от {g:I} + {g:am}, переводится как {t:я есть}')
A('Это {w:связка}: {l:слово, которое соединяет} {g:I} и то, какой ты. По-русски его нет, {t:я сонный}, а по-английски оно нужно всегда')
TABLE('demo', 'я и моё состояние', ['Кто', 'Сейчас', 'Какой'], [['I', 'am → I\'m', 'sleepy']])
A('Смотри: сначала {g:I}, потом частичка {g:am}, сокращённо это {g:I\'m}, потом состояние. По-русски звучит странно, {t:я есть сонный}, {g:I am sleepy}, но {l:так устроен английский}')
S('Мультяшный кот с чашкой кофе смотрит в телефон, светлый фон, без текста')
T('Кейт мне написала: встречаемся в десять у кафе, а у меня уже половина десятого')
T('😱')
A('Ну-ка, помоги мне ответить ей: {t:«я опаздываю»}')
PA('I\'m late', ['am', 'is', 'to'], { responseWrong: 'не совсем) про себя всегда {g:I\'m}, и сразу состояние', wrongText: 'не совсем) {t:я опаздываю} это {g:I\'m late}. Можно сказать и полной формой, {g:I am late} тоже верно, но здесь собираем короткую: {g:I\'m} уже содержит {g:am}' })
R('🏃')
A('Видишь? {g:I\'m} {l:приклеивается к любому состоянию}: сонный, опаздываю, дома')
TABLE('dictator', 'что со мной сейчас', ['Кто', 'Сейчас', 'Какой'], [['I', 'am → I\'m', 'sleepy'], ['I', 'am → I\'m', 'late']], { script: 'Смотри, теперь тут две фразы. I, am, коротко I\'m, и состояние sleepy, я сонный. И тут же I, am, I\'m, другое состояние, late, я опаздываю. Начало одно и то же, а дальше любое состояние' })
PIN('{g:I\'m} + {w:состояние}: какой я, что со мной, где я')
T('Я успел в назначенное время)) стою у кафе, а Кейт ещё нет, и живот уже урчит...')
P('Стою у входа в кафе и смотрю на витрину с круассанами 🥐', 'Мультяшный рыжий кот у входа в кафе смотрит на витрину с выпечкой, утро, без текста')
T('а как сказать {t:«я хочу есть»}? по-английски {w:голодный} это {g:hungry}')
PA('I\'m hungry', ['am', 'is', 'we'], { responseWrong: 'не совсем) про себя {g:I\'m}, а дальше состояние', wrongText: 'близко) {t:я хочу есть} это {g:I\'m hungry}: связка {g:I\'m} и состояние' })
T('ага)) вот и круассан 🥐')
T('Давай на слух 👂')
A('{g:I\'m busy}', false)
WC(['Я занят', 'Я дома', 'Я сонный'], { wrongText: 'неа) {g:busy} это {t:занятой}, поэтому {g:I\'m busy} это {t:я занят}', voicePhrase: 'I\'m busy' })
R('📵')
T('Кейт кста пишет: ты где? как думаешь, а здесь нужно {g:am}? выбирай:\n{g:I ___ here}')
WC(['am', 'is', 'are'], { wrongText: 'неа) про себя только {g:am}: {g:I am here}, или короче {g:I\'m here}' })
T('точно, {t:«я здесь»}, и Кейт уже бежит 📍')
A('{g:I\'m} это сокращённая форма. Полную {g:I am} используют {l:для усиления смысла} или в более формальных ситуациях')
S('Мультяшный кот прикладывает лапу к груди, серьёзное лицо, светлый фон, без текста')
A('Давай-ка вслух: скажи, как ты сейчас, начни с {g:I\'m}, а дальше любое слово, хоть {g:hungry}, хоть {g:busy}. Можешь сокращённой или полной формой')
SAY('I\'m sleepy', 'Я сонный(ая)', { pattern: '(I am|I\'m) **', startHint: 'I\'m — я', hintMismatch: 'Начни с I\'m и добавь любое слово, например sleepy)', wrongText: 'близко) начни с {g:I\'m} и добавь любое состояние)', listen: 'так-так, дай послушать)', comment: 'воу, Кейт бы одобрила, ты уже говоришь о себе по-английски' })
endZone()

// ───────────────────────────── ЧАСТЬ 2 · she's, you're, we're ─────────────────────────────
zone('Часть 2 · she\'s, we\'re', '#ef476f')
SYS('Часть 2 · про неё, про нас')
SCENE('im-duo', 'Кафе', 'bubble', [
  { who: 'a', text: 'Kate! You\'re late.', translation: 'Кейт! Ты опаздываешь.', emotion: 'surprised' },
  { who: 'b', text: 'I\'m late, I\'m sleepy, I\'m hungry!', translation: 'Я опаздываю, я сонная, я хочу есть!', emotion: 'tired' },
  { who: 'a', text: 'And I\'m hungry. I\'m here, Kate.', translation: 'И я хочу есть. Я здесь, Кейт.', emotion: 'happy' },
  { who: 'b', text: 'And I\'m here. I\'m hungry, Pete!', translation: 'И я здесь. Я хочу есть, Пит!', emotion: 'happy' },
], KATE)
A('Заметь: Кейт про себя говорит {g:I\'m}, а я ей: {g:you\'re}, {t:ты есть}. Связка меняется вместе с тем, {l:о ком речь}')
P('Кейт здесь, запыхалась после автобуса 🚌', 'Мультяшная кошка с рюкзаком вбегает в кафе, щёки румяные, за окном автобус, без текста')
T('а про неё связка {g:she\'s}, {t:она есть}. Собери {t:«она опаздывает»}')
PA('She\'s late', ['I\'m', 'are', 'am'], { responseWrong: 'не совсем) про неё связка {g:she\'s}, и сразу состояние', wrongText: 'близко) про неё не {x:I\'m}, а {g:she\'s}:\n{g:She\'s late}' })
R('🎉')
TABLE('dictator', 'кто есть кто', ['Кто', 'Сейчас', 'Какой'], [['I', 'am → I\'m', 'late'], ['you', 'are → you\'re', 'late'], ['she', 'is → she\'s', 'late']], { script: 'Смотри, что получается. Про себя I, am, коротко I\'m, I\'m late, я опаздываю. Про тебя частичка уже другая: you, are, коротко you\'re, you\'re late, ты опаздываешь. А про неё she, is, коротко she\'s, she\'s late, она опаздывает. Частичка меняется вместе с тем, кто, а состояние late остаётся' })
A('Про него точно так же: {g:he\'s}, это {g:he} + {g:is}, {t:он есть}')
A('А когда {l:нас двое или больше}: {g:we\'re}, это {g:we} + {g:are}, {t:мы есть}, и {g:they\'re}, это {g:they} + {g:are}, {t:они есть}')
A('Не пугайся, {l:частичек всего три}, {g:am}, {g:is}, {g:are}, сейчас всё разложим по полочкам и соберём пару фраз вместе')
TABLE('dictator', 'все местоимения разом', ['Кто', 'Сейчас', 'Какой'], [['I', 'am → I\'m', 'happy'], ['you', 'are → you\'re', 'happy'], ['he', 'is → he\'s', 'happy'], ['she', 'is → she\'s', 'happy'], ['we', 'are → we\'re', 'happy'], ['they', 'are → they\'re', 'happy']], { script: 'Собираем вместе, состояние одно, happy. I, am, I\'m happy, я счастлив. You, are, you\'re happy, ты счастлив. He, is, he\'s happy. She, is, she\'s happy. We, are, we\'re happy. They, are, they\'re happy. Видишь, частичка идёт за местоимением, а состояние не меняется' })
T('Теперь по очереди: {l:одну фразу собираю я, одну ты}. Я первый')
TABLE('dictator', 'моя очередь', ['Кто', 'Сейчас', 'Какой'], [['I', 'am → I\'m', 'tired']], { script: 'Смотри: I, am, коротко I\'m, tired, I\'m tired, я устал' })
T('твоя очередь: собери {t:«ты устал»}, тапай по ячейкам по порядку: кто, частичка, состояние')
TABLE('manual', 'твоя очередь', ['Кто', 'Сейчас', 'Какой'], [['I', 'am', 'tired'], ['you', 'are', 'tired'], ['she', 'is', 'tired']], { answer: 'you are tired', wrongText: 'не совсем) про тебя частичка {g:are}: {g:you are tired}, по порядку кто, частичка, состояние' })
R('👏')
T('Кейт прислала голосовое про Тома и Анну, разбери')
A('{g:They\'re at work}', false)
WC(['Они на работе', 'Они идут на работу', 'Мы на работе'], { wrongText: 'не совсем) {g:they\'re} это {t:они}, а {g:at work} это {t:на работе}: {t:они на работе}', voicePhrase: 'They\'re at work' })
R('💼')
REF('Про at, слово перед местом (at work, at home), ты можешь узнать в отдельном уроке', 'At')
T('Это Кейт про Тома и Анну: они сегодня работают, так что в кино вечером идём вдвоём')
S('Мультяшный кот хитро улыбается, прикрывая рот лапой, светлый фон, без текста')
A('Снова моя очередь, теперь про неё')
TABLE('dictator', 'снова я', ['Кто', 'Сейчас', 'Какой'], [['she', 'is → she\'s', 'sleepy']], { script: 'She, is, коротко she\'s, sleepy, she\'s sleepy, она сонная' })
T('и твоя: собери {t:«он сонный»}, тапай по ячейкам')
TABLE('manual', 'снова ты', ['Кто', 'Сейчас', 'Какой'], [['he', 'is', 'sleepy'], ['she', 'is', 'sleepy'], ['we', 'are', 'sleepy']], { answer: 'he is sleepy', wrongText: 'близко) про него частичка {g:is}, как и про неё: {g:he is sleepy}' })
R('😴')
A('Сидим, пьём кофе, Кейт фоткает чашки для подруги. Собери: {t:«мы счастливы»}')
PA('We\'re happy', ['am', 'is', 'I\'m'], { responseWrong: 'не совсем) про нас связка {g:we\'re}', wrongText: 'неа) нас двое, значит {g:we\'re}, а не {x:I\'m}:\n{g:We\'re happy}' })
T('{t:«мы счастливы»}, кофе творит чудеса ☕')
S('Мультяшный кот и кошка чокаются чашками кофе, светлый фон, без текста')
A('Последний круг: моя фраза про нас с Кейт')
TABLE('dictator', 'последняя моя', ['Кто', 'Сейчас', 'Какой'], [['we', 'are → we\'re', 'late']], { script: 'We, are, коротко we\'re, late, we\'re late, мы опаздываем. Ну да, в кино мы тоже чуть не опоздали' })
T('и последняя твоя: собери {t:«они опаздывают»}')
TABLE('manual', 'последняя твоя', ['Кто', 'Сейчас', 'Какой'], [['we', 'are', 'late'], ['they', 'are', 'late'], ['you', 'are', 'late']], { answer: 'they are late', wrongText: 'неа) про них частичка {g:are}: {g:they are late}' })
R('🏆')
PIN('{g:I\'m} · {g:you\'re} · {g:she\'s} / {g:he\'s} · {g:we\'re} · {g:they\'re}')
A('Скажи про друга или подругу, какие они: начни с {g:He\'s} или {g:She\'s}, можно и полное {g:He is}, а дальше любое слово, {g:funny}, {g:nice}, {g:busy}, слово на твой выбор')
SAY('She\'s nice', 'Она милая', { pattern: '(He\'s|She\'s|He is|She is) **', startHint: 'She\'s — она', hintMismatch: 'Начни с He\'s или She\'s и добавь любое слово, например nice)', wrongText: 'не то) начни с {g:He\'s} или {g:She\'s} и добавь любое слово)', listen: 'ага, послушаю)', comment: 'у тебя уже получается описывать других: {g:He\'s} или {g:She\'s} и любое слово' })
endZone()

// ───────────────────────────── ЧАСТЬ 3 · вчера и завтра ─────────────────────────────
zone('Часть 3 · вчера и завтра', '#9b5de5')
SYS('Часть 3 · was и I\'ll be')
A('У {g:I\'m} есть одна хитрость: оно только {l:про сейчас}. Про вчера и про завтра связка другая')
P('Я вчера: весь вечер на диване с ноутбуком и отчётом, глаза красные 🥱', 'Мультяшный рыжий кот лежит на диване с ноутбуком, вокруг бумаги, вечер, без текста')
T('Вчера я до ночи сидел с отчётом, и {l:про вчера} {g:I\'m} не годится: {g:I was}, {t:я был}')
T('давай проверим: как сказать {t:«вчера я был дома»}?')
PA('I was at home yesterday', ['I\'m', 'she', 'is'], { responseWrong: 'не совсем) вчера, значит {g:was}, а не {x:I\'m}', wrongText: 'не совсем) это про вчера, то есть прошлое, значит {g:was}: {g:I was at home yesterday}, без {x:I\'m}' })
R('🛋️')
TABLE('dictator', 'сейчас и вчера', ['Кто', 'Вчера', 'Сейчас'], [['I', 'was', 'am → I\'m']], { script: 'Добавим слева колонку про вчера. I, вчера was, I was tired, я был уставший, сейчас am, I\'m tired, я уставший. Состояние то же, а частичка говорит, когда' })
A('Для неё и для него тоже {g:was}: {g:she was}, {g:he was}')
S('Мультяшный кот загибает пальцы на лапе, считает, светлый фон, без текста')
T('Кейт вчера тоже опоздала, на работу)) а здесь что нужно? выбирай:\n{g:Yesterday Kate ___ late}')
WC(['was', 'is', 'were'], { wrongText: 'неа) вчера и про одного человека: {g:was}, {g:Yesterday Kate was late}' })
T('ага, {t:«вчера Кейт опоздала»}, а сегодня снова 😅')
A('А для нас, вас и них {g:were}, {l:когда людей несколько}')
P('Мы с Кейт вчера оба скучали: я с отчётом, она дома одна 🥱', 'Два кадра: мультяшный рыжий кот скучает над ноутбуком, кошка скучает на диване с телефоном, вечер, без текста')
A('А теперь собери: {t:«мы вчера скучали»}, {w:скучающий} это {g:bored}')
PA('We were bored yesterday', ['was', 'is', 'they'], { responseWrong: 'не совсем) нас двое и это вчера: {g:we were}', wrongText: 'близко) нас несколько, значит {g:were}: {g:We were bored yesterday}' })
T('вот и познакомились со скукой 🥱')
TABLE('dictator', 'вчера по лицам', ['Кто', 'Вчера', 'Сейчас'], [['I, he, she', 'was', 'am, is'], ['we, you, they', 'were', 'are']], { script: 'Про вчера две частички. Когда один человек, I, he, she, вчера was, а сейчас am или is. А когда нас несколько, we, you, they, вчера were, сейчас are' })
A('А {l:про завтра}: {g:I\'ll be}, это {g:I will be}, {t:я буду}. Завтра, кажется, мы с Кейт идём гулять')
S('Мультяшный кот мечтательно смотрит в окно, вокруг сердечки, светлый фон, без текста')
A('Ну-ка, собери фразу: {t:«завтра я буду свободен»}')
PA('I\'ll be free tomorrow', ['I\'m', 'was', 'is'], { responseWrong: 'не совсем) завтра, значит {g:I\'ll be}', wrongText: 'близко) это про завтра, то есть будущее, значит {g:I\'ll be}: {g:I\'ll be free tomorrow}, без {x:I\'m}' })
R('🗓️')
T('А это я Кейт наговорил, что тут?')
A('{g:I\'ll be at home at ten}', false)
WC(['Я буду дома в десять', 'Я был дома в десять', 'Я дома'], { wrongText: 'не совсем) {g:I\'ll be} это {t:я буду}, а {g:at ten} это {t:в десять}: {t:я буду дома в десять}', voicePhrase: 'I\'ll be at home at ten' })
R('🏠')
TABLE('dictator', 'три времени', ['Кто', 'Вчера', 'Сейчас', 'Завтра'], [['I', 'was', 'am', 'will be'], ['he, she', 'was', 'is', 'will be'], ['we, you, they', 'were', 'are', 'will be']], { script: 'Собираем всё вместе: слева вчера, в середине сейчас, справа завтра. I, was, am, will be: вчера I was at home, сейчас I\'m at home, завтра I\'ll be at home. He и she, was, is, will be. We, you, they, were, are, will be. Три колонки, три времени', widths: [22, 26, 26, 26] })
PIN('{g:I\'m} сейчас · {g:I was} вчера · {g:I\'ll be} завтра')
A('Про тебя: скажи, где ты будешь завтра, начни с {g:I\'ll be at} или {g:I will be at}, дальше любое место, хоть {g:home}')
SAY('I\'ll be at work', 'Я буду на работе', { pattern: '(I\'ll be|I will be) at **', startHint: 'I\'ll be at — я буду в', hintMismatch: 'Начни с I\'ll be at и добавь любое место, например work)', wrongText: 'не совсем) начни с {g:I\'ll be at} и добавь любое место)', listen: 'секунду, включаю запись)', comment: 'про завтра ты теперь говоришь без подсказки: {g:I\'ll be at} и место' })
endZone()

// ───────────────────────────── ИТОГ ─────────────────────────────
zone('Итог', '#06d6a0')
A('С основой разобрались: {g:I\'m} это связка между {g:I} и состоянием, у неё и у них связка своя, а про вчера и завтра {g:was} и {g:I\'ll be}')
A('Всю формулу соберём в самом конце, а пока выбирай: закончить или потренироваться')
MENU(['Закончить ✅', 'Ещё потренируюсь 💪'], ['final', 'train'])
endZone()

// ───────────────────────────── ТРЕНИРОВКА (день продолжается: парк → кино в шесть → ночь) ─────────────────────────────
zone('Ещё практика', '#118ab2')
byKey.train = T('Ну раз с {g:I\'m} ты уже знаком, давай проверим, как оно работает в деле 💪').ref
A('Будет семь уровней, и {l:каждый чуть сложнее} предыдущего')
byKey.lvl1 = LEVEL('Уровень 1 · разогрев').ref
T('После кафе мы с Кейт дошли до парка, сидим у пруда, кормим уток, и мне прям хорошо))')
T('а как сказать {t:«я счастлив»}?')
PA('I\'m happy', ['am', 'is', 'was'], { responseWrong: 'не совсем) про себя и про сейчас {g:I\'m}', wrongText: 'не совсем) {t:я счастлив} это {g:I\'m happy}, связка {g:I\'m}, без отдельного {x:am}' })
R('🦆')
P('Кейт устала после прогулки, сидит на скамейке и зевает 🥱', 'Мультяшная кошка сидит на скамейке в парке и зевает, рядом пруд с утками, без текста')
T('а ну-ка, какая связка:\n{g:She ___ sleepy}')
WC(['is', 'am', 'are'], { wrongText: 'неа) про неё связка {g:is}: {g:She is sleepy}, или короче {g:she\'s}' })
T('{t:«она сонная»}, {l:пять кругов вокруг пруда} 🥱')
T('голосовое от Тома про родителей, что он говорит?')
A('{g:They\'re at home}', false)
WC(['Они дома', 'Они идут домой', 'Мы дома'], { wrongText: 'близко) {g:they\'re} это {t:они}, а {g:at home} {t:дома}: {t:они дома}', voicePhrase: 'They\'re at home' })
R('🏡')
A('Уток покормили, идём дальше? Скажи вслух {t:«я готов»}: {w:готов} это {g:ready}, можно и {g:I am}, и {g:I\'m}')
SAY('I\'m ready', 'Я готов(а)', { pattern: '(I am|I\'m) ready', startHint: 'I\'m — я', hintMismatch: 'Начни с I\'m и добавь ready)', wrongText: 'близко) скажи {g:I\'m ready}, связка и состояние', comment: 'да)) и я готов 🚶' })
LEVEL('Уровень 2 · увереннее')
A('давай фразы подлиннее, но {l:связка всё та же}')
P('Кейт звонит подруге: мы сегодня заняты, гуляем, перезвоню вечером 📞', 'Мультяшная кошка говорит по телефону на дорожке в парке, рыжий кот рядом ждёт, без текста')
T('давай про нас: собери {t:«мы сегодня заняты»}')
PA('We\'re busy today', ['am', 'is', 'I\'m'], { responseWrong: 'не совсем) про нас связка {g:we\'re}', wrongText: 'не совсем) про нас не {x:I\'m}, а {g:we\'re}: {g:We\'re busy today}' })
T('да)) {t:«мы сегодня заняты»}')
T('ещё одно голосовое, от Анны про Тома')
A('{g:He\'s tired}', false)
WC(['Он устал', 'Он был уставший', 'Он занят'], { wrongText: 'неа) {g:he\'s} это {t:он}, про сейчас, а {g:tired} {t:уставший}: {t:он устал}', voicePhrase: 'He\'s tired' })
R('😴')
A('Своими словами: скажи, где ты сейчас, начни с {g:I\'m at}, можно и {g:I am at}, дальше любое место')
SAY('I\'m at work', 'Я на работе', { pattern: '(I am|I\'m) at **', startHint: 'I\'m at — я в', hintMismatch: 'Начни с I\'m at и добавь любое место, например work)', wrongText: 'не то) начни с {g:I\'m at} и добавь любое место)', listen: 'дай-ка послушаю твою запись)', comment: '{g:I\'m at} и место, ты уже отвечаешь по-английски, где ты' })
P('Кейт делает селфи у пруда, а я в кадр не попал 😂', 'Мультяшная кошка делает селфи у пруда, сбоку торчит ухо рыжего кота, без текста')
T('набери {t:«она счастлива»} полной формой, три слова, тапами по светящимся буквам')
TW('she is happy', 'ar', 'близко) про неё связка {g:is}, {l:между she и happy}', 'неа) {t:она счастлива} это {g:she is happy}, связка {g:is} посередине')
T('вооо, буква в букву ✍️')
T('Дальше всё поймёшь без объяснения, обещаю))')
LEVEL('Уровень 3 · повтори за мной')
T('Кейт говорит, Том и Анна освободятся в шесть и догонят нас у кино')
A('Соберём длинную фразу с конца, часть за частью: я говорю кусочек, ты отзеркаливаешь его вслух с тем же ритмом, а в конце соберёшь всё целиком')
A('{g:at six}', false)
SAY('at six', 'в шесть', { hintMismatch: 'Повтори: at six)', wrongText: 'не то) копируй ритм, {g:at six}', comment: 'даа)) {t:«в шесть»} 👌' })
T('Добавим начало, слушай')
A('{g:We\'ll be free at six}', false)
SAY('We\'ll be free at six', 'Мы будем свободны в шесть', { hintMismatch: 'Повтори: We\'ll be free at six)', wrongText: 'близко) кто будет? {g:We\'ll be free}, и дальше та же часть:\n{g:We\'ll be free at six}', comment: 'ору)) {t:«мы будем свободны в шесть»}' })
P('Идём с Кейт к кинотеатру, Том и Анна освободятся и догонят в шесть 🎟️', 'Мультяшный рыжий кот и кошка идут по вечерней улице к кинотеатру с билетами, без текста')
A('И новое из знакомых частей: собери {t:«они будут здесь в шесть»}')
PA('They\'ll be here at six', ['am', 'was', 'seven'], { responseWrong: 'не совсем) про них и про будущее {g:They\'ll be}, а дальше место и час', wrongText: 'неа) склей две части: {g:They\'ll be} и {g:here at six}' })
R('🧱')
LEVEL('Уровень 4 · ловушки')
T('Хитрые случаи 😏 {g:I\'m} {l:живёт рядом с состоянием}, а рядом с действием?')
T('{t:«я работаю»}, нужна ли тут связка?\n{g:I ___ work every day}')
WC(['ничего не нужно', 'am', 'is'], { wrongText: 'близко) {g:work} тут {w:действие}: просто {g:I work every day}' })
S('Мультяшный кот подмигивает и показывает большой палец, светлый фон, без текста')
A('{g:I\'m} нужно, когда говоришь, какой ты или где ты. А когда есть {w:действие}, {g:work}, {g:go}, {g:sleep}, связка {x:лишняя}: {g:work} {l:сам говорит, что ты делаешь}, связывать нечего. {g:I work}, {g:I sleep}')
P('Кейт в зале пишет подруге: мы готовы, фильм в шесть 🎬', 'Мультяшная кошка в кресле кинотеатра с телефоном, рядом рыжий кот с попкорном, без текста')
T('собери {t:«мы готовы»}: {w:готовы} это {g:ready}')
PA('We\'re ready', ['I\'m', 'they', 'is'], { responseWrong: 'не совсем) про нас связка {g:we\'re}, и сразу состояние', wrongText: 'неа) про нас {g:we\'re}, а не {x:I\'m}:\n{g:We\'re ready}' })
R('🍿')
T('Послушай, тут тоже ловушка 👂')
A('{g:She was at work}', false)
WC(['Она была на работе', 'Она на работе', 'Она будет на работе'], { wrongText: 'не совсем) {g:was} это {w:про вчера}, {g:She was at work} это {t:она была на работе}', voicePhrase: 'She was at work' })
R('🎬')
A('Скажи вслух {t:«я сплю»}: {w:спать} это {g:sleep}')
SAY('I sleep', 'я сплю', { hintMismatch: 'Два слова: I и sleep)', wrongText: 'не совсем) {w:действие}, значит без {x:I\'m}: просто {g:I sleep}', comment: 'да)) без связки 😎', signals: [{ slot: 0, type: 'audio', text: '{w:Сплю} это {w:действие}, связка не нужна: два слова, первое {g:I}' }] })
TABLE('dictator', 'когда связка не нужна', ['Фраза', 'Что это', 'Связка'], [['I\'m tired', 'состояние', 'I\'m'], ['I work', 'действие', 'не нужна']], { script: 'Подведём итог ловушек. I\'m tired, я уставший, это состояние, и связка I\'m на месте. I work, я работаю, это действие, связка не нужна. Состояние с I\'m, действие само по себе' })
PIN('{g:I\'m tired} {w:состояние} · {g:I work} {w:действие}, без связки')
LEVEL('Уровень 5 · своими словами')
T('После кино Кейт призналась, что вчера весь вечер скучала дома одна')
S('Мультяшный кот с круглыми глазами и сердечком над головой, светлый фон, без текста')
T('собери {t:«вчера она была одна»}: {w:одна} это {g:alone}')
PA('She was alone yesterday', ['I\'m', 'they', 'were'], { responseWrong: 'не совсем) про неё и про вчера {g:she was}', wrongText: 'не не не) она одна, и это вчера: {g:She was alone yesterday}', signals: [{ slot: 0, text: 'Кейт одна, значит {g:she}, а не {x:they}' }, { slot: 1, text: 'Про одного человека вчера {g:was}; {g:were} только когда людей несколько' }] })
R('💞')
A('Про тебя: а вчера где именно? Начни с {g:I was at} и назови любое место')
SAY('I was at work', 'Я был(а) на работе', { pattern: 'I was at **', startHint: 'I was at — вчера я в', hintMismatch: 'Начни с I was at и добавь любое место, например work)', wrongText: 'не совсем) нужно сказать {g:I was at} и любое место)', listen: 'ну-ка, что получилось)', comment: 'вчера про себя ты теперь тоже скажешь: {g:I was at} и место' })
T('Кейт про Тома и Анну, разбери')
A('{g:They were busy}', false)
WC(['Они были заняты', 'Они заняты', 'Они будут заняты'], { wrongText: 'неа) {g:were} это {w:про вчера}, {g:They were busy} это {t:они были заняты}', voicePhrase: 'They were busy' })
T('угу, они вчера тоже пахали 🗂️')
A('{g:were} у них, у нас и у вас, {l:когда людей несколько}')
A('Ты уже почти всё умеешь, остался последний рывок, держись, будет быстро')
LEVEL('Уровень 6 · на скорость ⏱')
T('выбери на слух ⏱')
A('{g:She\'s at school}', false)
WC(['Она в школе', 'Она была в школе', 'Она идёт в школу'], { wrongText: 'не совсем) {g:she\'s} это про сейчас: {g:She\'s at school}, {t:она в школе}', voicePhrase: 'She\'s at school', timeLimitSec: 7 })
R('⚡')
A('И ещё: собери {t:«они будут дома завтра»}')
PA('They\'ll be at home tomorrow', ['am', 'I\'m', 'was'], { responseWrong: 'не совсем) завтра и про них {g:They\'ll be}', wrongText: 'не то) это про завтра, то есть будущее, значит {g:They\'ll be}: {g:They\'ll be at home tomorrow}', timeLimitSec: 12 })
T('быстро 🚀')
A('И вслух про друга или подругу: начни с {g:He\'ll be} или {g:She\'ll be}, можно и полное {g:He will be}, дальше что угодно, лишь бы начало верное')
SAY('She\'ll be free', 'Она будет свободна', { pattern: '(He\'ll be|She\'ll be|He will be|She will be) **', startHint: 'She\'ll be — она будет', hintMismatch: 'Начни с He\'ll be или She\'ll be и добавь любое слово, например free)', wrongText: 'не то) начни с {g:He\'ll be} или {g:She\'ll be} и добавь любое слово)', listen: 'слушаю, что получилось)', comment: 'про завтра о других ты теперь тоже говоришь, Кейт бы не успела' })
T('и последняя на скорость ⏱ как сказать {t:«ты здесь»}?')
WC(['You\'re here', 'You was here', 'You\'ll here'], { wrongText: 'не совсем) про тебя и про сейчас связка {g:you\'re}:\n{g:You\'re here}', timeLimitSec: 6 })
R('🏁')
S('Мультяшный кот с секундомером и наушниками, светлый фон, без текста')
LEVEL('Уровень 7 · без подсказок')
S('Мультяшный кот в шоке с открытым ртом, добрался до последнего уровня, светлый фон, без текста')
T('У меня уже ночь, только дошёл до дома, а Кейт пишет: ты где? 🌙')
A('Скажи вслух, где ты сейчас, пока я добираюсь до кровати: начни с {g:I\'m at}, можно и {g:I am at}, место любое')
SAY('I\'m at home', 'Я дома', { pattern: '(I am|I\'m) at **', hintsOff: true, startHint: 'I\'m at — я в', hintMismatch: 'Начни с I\'m at и добавь любое место, например home)', wrongText: 'не то) начни так: {g:I\'m at}, это {t:я в}, и добавь любое место', listen: 'момент, включаю)', comment: 'ночной вопрос Кейт тебе уже не страшен: {g:I\'m at} и любое место' })
T('Кейт прислала голосовое про Анну, последнее на сегодня')
A('{g:She\'s sleepy}', false)
WC(['Она сонная', 'Она дома', 'Она была сонная'], { wrongText: 'неа) {g:she\'s} это {t:она}, про сейчас, а {g:sleepy} {t:сонная}: {t:она сонная}', voicePhrase: 'She\'s sleepy' })
T('ага)) все спать хотят 😊')
P('Вспоминаю: вчера Кейт была занята, а сегодня весь день со мной 😊', 'Мультяшный рыжий кот лежит в кровати с телефоном и улыбается, над ним облачко с кошкой, ночь, без текста')
T('набери {t:«она была занята»} тапами по светящимся буквам')
TW('she was busy', 'ei', 'не то) про вчера, то есть прошлое, связка {g:was}, {l:между she и busy}', 'не не не) {t:она была занята} это {g:she was busy}, связка {g:was} посередине')
R('😅')
A('Неожиданность: Кейт пишет: {g:good night, I\'m tired}. Скажи вслух, как ты сейчас: начни с {g:I\'m} или {g:I am}, слово любое, засчитаю всё')
SAY('I\'m happy', 'Я счастлив(а)', { pattern: '(I am|I\'m) **', hintsOff: true, startHint: 'I\'m — я', hintMismatch: 'Начни с I\'m и добавь любое слово, например happy)', wrongText: 'не совсем) начни с {g:I\'m} и добавь любое слово)', listen: 'ну-ка, ну-ка)', comment: 'любое состояние после {g:I\'m} у тебя теперь подбирается само' })
endZone()

// ───────────────────────────── ФИНАЛ ─────────────────────────────
zone('Финал', '#ff9f1c')
byKey.final = SYS('Финал').ref
A('Если коротко: {g:I\'m} это {t:я есть}, {l:связка между мной и состоянием}. Всё остальное, кто и когда, в одной таблице')
TABLE('dictator', 'вся формула I\'m', ['Кто / когда', 'Связка', 'Пример'], [['я', 'I\'m', 'I\'m here'], ['ты', 'you\'re', 'you\'re here'], ['она, он', 'she\'s / he\'s', 'she\'s here'], ['мы, они', 'we\'re / they\'re', 'we\'re here'], ['вчера', 'was / were', 'I was here'], ['завтра', 'I\'ll be', 'I\'ll be here'], ['действие', 'нет', 'I work']], { script: 'Смотри, всё вместе, и фраза одна, я здесь. Про себя, I\'m, I\'m here. Про тебя, you\'re, you\'re here. Про неё или него, she\'s, he\'s, she\'s here. Про нас и про них, we\'re, they\'re, we\'re here. Вчера связка меняется, was или were, I was here. Завтра, I\'ll be, I\'ll be here. А у действия связки нет, I work, я работаю, и всё' })
SCENE('im-outro', 'Пит перед сном', 'circle', [
  { who: 'a', text: 'Ну всё, I\'m теперь твой, говори о себе смело.', emotion: 'happy' },
  { who: 'a', text: 'А я… I\'m happy, и, кажется, не только из-за урока. Пока!', emotion: 'surprised' },
], CAT_PIT, 'office')
MENU(['Закончить ✅', 'Ещё один круг 💪'], ['bye', 'lvl1'])
const bye = T('Пока, и удачи с {g:I\'m} 👋'); byKey.bye = bye.ref; bye.triggers = [{ if: 'timer', ms: 1500, then: null }]
endZone()

closeWrongs()
for (const { node, idx, key } of laterLinks) node.triggers[idx].then = byKey[key]
for (const n of nodes) { for (const t of n.triggers) if (t.then === undefined) t.then = null; delete n._side }
for (const n of nodes) if (n.type === 'text' && /: \{g:[^}]+\}\)?$/.test(n.data.content)) { n.data.content = n.data.content.replace(/: (\{g:[^}]+\}\)?)$/, ':\n$1'); n.data.hardWrap = true }

const out = {
  format: 'pithy-lesson', version: 1,
  lesson: { title: 'I\'m', nodeCount: nodes.length },
  nodes: nodes.map((n, i) => ({ ref: n.ref, type: n.type, seq: i + 1, pos: n.pos, ...(n.note ? { note: n.note } : {}), ...(n.needs ? { needs: n.needs } : {}), data: n.data, triggers: n.triggers })),
  // высота зоны — по нодам внутри (+ ~150 вокруг): ряд y=0 → 560, ветки ошибок y=480 → 1040, сигнал y=960 → 1520
  zones: zones.map((z, i) => ({ id: `zone-im-${i + 1}`, x: z.x0, y: -150, width: z.x1 - z.x0, height: Math.max(...nodes.filter(n => n.pos[0] >= z.x0 && n.pos[0] <= z.x1).map(n => n.pos[1])) + 560, label: z.label, color: z.color })),
  wordCard: {
    tag: 'связка · я есть',
    nodes: [
      { type: 'text', text: '**I\'m** = I am, «я есть»: связка между мной и состоянием — какой я, что со мной, где я.' },
      { type: 'cases', items: [
        { label: 'сейчас', example: '**I\'m** tired', tr: 'я уставший', mark: 0 },
        { label: 'она, он, мы, они', example: '**She\'s** here', tr: 'она здесь' },
        { label: 'вчера и завтра', example: 'I **was** late, **I\'ll be** free', tr: 'я опоздал, я буду свободен' },
      ] },
      { type: 'dialog', lines: [
        { side: 'l', text: 'How are you?', tr: 'Как ты?' },
        { side: 'r', text: '**I\'m** sleepy. And **I\'m** late!', tr: 'Я сонный. И я опаздываю!' },
        { side: 'l', text: '**I\'m** not at home, **I\'m** at work.', tr: 'Я не дома, я на работе.', neg: true },
        { side: 'r', text: '**I\'ll be** there at ten!', tr: 'Буду там в десять!' },
      ] },
    ],
  },
}
writeFileSync(new URL('../im.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('nodes', nodes.length, 'zones', zones.length)

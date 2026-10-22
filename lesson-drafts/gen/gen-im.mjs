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
const OPENERS = ['не совсем)', 'близко)', 'неа)', 'не то)', 'не-не-не)']
let openerN = 0
function wrong(task, content0, trig, skip = 1) {
  const content = content0.replace(/^(не совсем|близко|неа|не то|но нет|но-но-но|не-не-не)\)\s*/i, () => `${OPENERS[openerN++ % OPENERS.length]} `)
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
  const c = { type, data: type === 'audio' ? { text, showText: true } : { content: text }, triggers: [], _side: true, ref: newRef(), pos: [task.pos[0] + 280, 240], note: 'СИГНАЛ (нода-спутник): показывается при первой ошибке в этом слоте', ...(type === 'audio' ? { needs: 'audio — озвучка реплики' } : {}) }
  nodes.push(c)
  task.data.signals = [...(task.data.signals ?? []), { slot, ref: c.ref }]
}
function PA(words, distractors, { wrongText, responseWrong, timeLimitSec, signals = [] }) {
  const n = main('phrase_assembly', { words: words.split(' '), distractors: distractors.map(t => ({ text: t })), responseWrong, ...(timeLimitSec ? { timeLimitSec } : {}) })
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
function SAY(phraseText, translation, { pattern, startHint, hintMismatch, wrongText, listen, comment, hintsOff, signals = [] }) {
  const n = main('say_phrase', { lang: 'en-US', phrase: phraseText, translation, keywords: '', threshold: 70, strict: true, hintsOn: true, voiceReply: true, hintSilence: 'Не слышу тебя) говори чуть громче и ближе к микрофону', hintPartial: 'Близко) верно: {ok}, не хватило: {missed}', ...(pattern ? { pattern, startHint, hintMismatch } : {}), ...(!pattern && hintMismatch ? { hintMismatch } : {}), ...(hintsOff ? { hintsOn: false } : {}) })
  for (const sg of signals) companion(n, sg)
  if (listen) { wrong(n, wrongText, 'say_wrong', 3); T(listen); A(comment); R('🔥') } else { wrong(n, wrongText, 'say_wrong', 1); T(comment) }
  return n
}
function TABLE(mode, chatCaption, head, rows, { script, widths } = {}) {
  const cells = []
  head.forEach((v, c) => cells.push({ id: `h${c}`, col: c, row: 0, value: v, colspan: 1, rowspan: 1, fontSize: 11, isHeader: true }))
  rows.forEach((r, ri) => r.forEach((v, c) => cells.push({ id: `r${ri}c${c}`, col: c, row: ri + 1, value: v, colspan: 1, rowspan: 1, fontSize: c === 1 && head.length === 3 ? 15 : 13 })))
  const rowCount = rows.length + 1
  const data = { mode, table: { rows: Array.from({ length: rowCount }, (_, i) => ({ id: `r${i}`, heightPct: Math.round(100 / rowCount) })), cells, columns: head.map((_, i) => ({ id: `c${i}`, widthPct: (widths ?? (head.length === 3 ? [38, 22, 40] : [50, 50]))[i] })), colCount: head.length, rowCount }, chatCaption, ...(mode === 'dictator' ? { script, sendToChat: true } : {}) }
  const n = main('table', data, mode === 'dictator' ? { needs: 'audio — только для режима dictator', note: `ОЗВУЧКА таблицы (скрипт идёт по ячейкам слева направо, сверху вниз; метку «Проверить» поставить при монтаже после последней ячейки): ${script}` } : { note: `Таблица I'm: ${chatCaption}` })
  if (mode === 'demo') n.triggers = [{ if: 'timer', ms: 2200 }]
  return n
}
function SCENE(id, title, mode, timeline, characters = CAT_PIT) {
  return main('scene', { scene: { version: 2, id, title, location: 'cafe', characters, slots: SLOTS_CAFE, timeline, options: { bubbles: true } }, mode, showBubbles: mode === 'bubble', start: 'auto', crop: { x: 0, y: 0, scale: 1 } }, { note: mode === 'circle' ? 'СЦЕНА: кружок Пита, один кот крупно, без облачков (текст реплик в кружке не показывается). Озвучку записать кнопкой «Озвучить» в редакторе сцены' : 'СЦЕНА: диалог двух котов в пузыре. Озвучку записать в редакторе сцены' })
}
function zone(label, color) { zones.push({ label, color, x0: x - 150 }) }
function endZone() { zones.at(-1).x1 = x - STEP + 308 + 150; x += GAP }


// Сюжет — ОДИН день Пита (суббота): утро дома → кафе с Кейт → парк → кино вечером → ночь, переписка. Любовная линия Пит → Кейт
const KATE = { a: { kind: 'cat', gender: 'male', name: 'Пит', palette: CAT_PIT.a.palette, stripes: true, voice: { pitch: 1, rate: 1 } }, b: { kind: 'cat', gender: 'female', name: 'Кейт', palette: { fur: '#e9d3b3', belly: '#fbf3e6', accent: '#f1b7c4', eye: '#4f87c2', stripe: '#cdb08a' }, stripes: false, voice: { pitch: 1.4, rate: 1 } } }

// ───────────────────────────── ВХОД ─────────────────────────────
zone('Вход', '#b6fe3b')
SCENE('im-intro', 'Утро Пита', 'circle', [
  { who: 'a', text: 'Утро, лежу в кровати, а Кейт уже пишет: how are you?', emotion: 'tired' },
  { who: 'a', text: 'Хочу ответить: я сонный, я дома, я опаздываю. Сегодня разберём I\'m.', emotion: 'happy' },
])
WC(['I\'m sleepy', 'I sleepy', 'Me sleepy'], { wrongText: 'не совсем) по-русски {w:я сонный} и всё, а по-английски между {g:I} и состоянием {l:нужна связка}:\n{g:I\'m sleepy}' })
T('Да)) 🎯')
T('Как тебе удобнее: сначала разберём основу или сразу в практику?')
MENU(['Сначала объясни 📖', 'Сразу к практике 💪'], ['part1', 'train'])
endZone()

// ───────────────────────────── ЧАСТЬ 1 · I'm = я есть ─────────────────────────────
zone('Часть 1 · I\'m = я есть', '#ffd166')
byKey.part1 = SYS('Часть 1 · I\'m и состояние').ref
P('Пит в кровати, одеяло до носа, телефон светится 😴', 'Мультяшный рыжий кот лежит в кровати под одеялом, рядом светится телефон, утро, без текста')
A('{g:I\'m} это {g:I am}, {t:я есть}: по-русски это слово мы пропускаем, «я сонный», а по-английски {l:оно обязательно}')
TABLE('demo', 'я и моё состояние', ['Кто', 'Какой', 'По-русски'], [['I\'m', 'sleepy', 'я сонный']])
A('Смотри: сначала {g:I\'m}, потом {l:состояние}, какой ты или что с тобой, и предложение готово')
S('Мультяшный кот в панике смотрит на часы, одеяло летит в сторону, светлый фон, без текста')
T('Кейт пишет: встречаемся в десять у кафе, а у меня уже половина(( как сказать {t:«я опаздываю»}?')
PA('I\'m late', ['am', 'is', 'to'], { responseWrong: 'не совсем) про себя всегда {g:I\'m}, и сразу состояние', wrongText: 'не совсем) {w:я опаздываю} это {g:I\'m late}: {g:I\'m} и сразу состояние, отдельный {x:am} тут не нужен' })
R('🏃')
A('Видишь? {g:I\'m} приклеивается к любому состоянию: сонный, опаздываю, дома. Само оно {l:не меняется}, меняется только то, что после')
TABLE('dictator', 'что со мной сейчас', ['Кто', 'Какой', 'По-русски'], [['I\'m', 'sleepy', 'я сонный'], ['I\'m', 'late', 'я опаздываю']], { script: 'Смотри, теперь две фразы. I\'m, sleepy, я сонный. I\'m, late, я опаздываю. Начало одно и то же, I\'m, а дальше любое состояние' })
PIN('{g:I\'m} + {w:состояние}: какой я, что со мной, где я')
T('Добежал)) стою у кафе, а Кейт ещё нет')
P('Пит у входа в кафе, крутит головой, Кейт пока не видно ☕', 'Мультяшный рыжий кот стоит у входа в кафе и смотрит по сторонам, утро, без текста')
T('а как сказать {t:«я в кафе»}?')
PA('I\'m at the cafe', ['am', 'is', 'we'], { responseWrong: 'не совсем) про себя {g:I\'m}, а дальше где ты', wrongText: 'близко) {w:я в кафе} это {g:I\'m at the cafe}: связка {g:I\'m} и место' })
R('☕')
REF('Про at, слово перед местом, у нас есть отдельный урок', 'At')
T('Давай на слух 👂')
A('{g:I\'m hungry}', false)
WC(['Я хочу есть', 'Я хочу спать', 'Я дома'], { wrongText: 'неа) {g:hungry} это {t:голодный}, поэтому {g:I\'m hungry} это {t:я хочу есть}', voicePhrase: 'I\'m hungry' })
R('🥐')
T('Кейт кста пишет: ты где? а здесь что нужно? выбирай:\n{g:I ___ here}')
WC(['am', 'is', 'are'], { wrongText: 'неа) про себя только {g:am}: {g:I am here}, или короче {g:I\'m here}' })
T('да)) {t:«я здесь»} 📍')
A('{g:I\'m} это короткая форма, в переписке почти всегда она. Полная {g:I am} звучит медленнее и {l:важнее}, когда хочешь подчеркнуть')
S('Мультяшный кот прикладывает лапу к груди, серьёзное лицо, светлый фон, без текста')
A('Давай-ка вслух: скажи, как ты сейчас, начни с {g:I\'m}, а дальше любое слово, хоть {g:hungry}, хоть {g:busy}')
SAY('I\'m sleepy', 'Мне хочется спать', { pattern: '(I am|I\'m) **', startHint: 'I\'m — я', hintMismatch: 'Начни с I\'m и добавь любое слово, например sleepy)', wrongText: 'близко) начни с {g:I\'m} и добавь любое состояние)', listen: 'так-так, дай послушать)', comment: 'воу, {g:I\'m} и состояние, ты уже говоришь о себе по-английски' })
endZone()

// ───────────────────────────── ЧАСТЬ 2 · she's, you're, we're ─────────────────────────────
zone('Часть 2 · she\'s, we\'re', '#ef476f')
SYS('Часть 2 · про неё, про нас')
SCENE('im-duo', 'Кафе', 'bubble', [
  { who: 'a', text: 'Kate! You\'re late again.', translation: 'Кейт! Ты снова опаздываешь.', emotion: 'surprised' },
  { who: 'b', text: 'I\'m sorry! The bus was so slow.', translation: 'Прости! Автобус еле ехал.', emotion: 'tired' },
  { who: 'a', text: 'It\'s okay. I\'m happy now.', translation: 'Ничего. Теперь мне хорошо.', emotion: 'happy' },
  { who: 'b', text: 'Me too. We\'re here, and the coffee is hot!', translation: 'И мне. Мы на месте, и кофе горячий!', emotion: 'happy' },
], KATE)
A('Заметь: Кейт про себя говорит {g:I\'m}, а я ей: {g:you\'re}, {t:ты есть}. Связка меняется вместе с тем, {l:о ком речь}')
TABLE('dictator', 'кто есть кто', ['Кто', 'Связка', 'Пример'], [['я', 'I\'m', 'I\'m late'], ['ты', 'you\'re', 'you\'re late']], { script: 'Про себя, I\'m, I\'m late, я опаздываю. Про тебя, you\'re, you\'re late, ты опаздываешь. Начало меняется, а состояние late остаётся' })
P('Кейт наконец пришла, щёки красные, бежала от автобуса 🚌', 'Мультяшная кошка с рюкзаком вбегает в кафе, щёки румяные, за окном автобус, без текста')
T('собери {t:«она здесь»}')
PA('She\'s here', ['I\'m', 'are', 'am'], { responseWrong: 'не совсем) про неё связка {g:she\'s}, и сразу где она', wrongText: 'близко) про неё не {x:I\'m}, а {g:she\'s}:\n{g:She\'s here}' })
R('🎉')
A('Про него точно так же, {g:he\'s}. А когда {l:нас двое или больше}: {g:we\'re}, мы, и {g:they\'re}, они')
TABLE('dictator', 'вся семья I\'m', ['Кто', 'Связка', 'Пример'], [['я', 'I\'m', 'I\'m here'], ['ты', 'you\'re', 'you\'re here'], ['она / он', 'she\'s / he\'s', 'she\'s here'], ['мы', 'we\'re', 'we\'re here'], ['они', 'they\'re', 'they\'re here']], { script: 'Вот вся семья. Я, I\'m, I\'m here, я здесь. Ты, you\'re, you\'re here, ты здесь. Она или он, she\'s, he\'s, she\'s here, она здесь. Мы, we\'re, we\'re here, мы здесь. Они, they\'re, they\'re here, они здесь. Пять связок, а состояние после них одно и то же' })
T('Сидим, пьём кофе, Кейт фоткает чашки для подруги)) а здесь что нужно? выбирай:\n{g:We ___ at the cafe}')
WC(['are', 'am', 'is'], { wrongText: 'неа) про нас, {g:we}, связка {g:are}: {g:We are at the cafe}, или короче {g:we\'re}' })
T('да)) {t:«мы в кафе»} ☕')
PIN('{g:I\'m} · {g:you\'re} · {g:she\'s} / {g:he\'s} · {g:we\'re} · {g:they\'re}')
T('Теперь послушай 👂')
A('{g:They\'re at work}', false)
WC(['Они на работе', 'Они идут на работу', 'Мы на работе'], { wrongText: 'не совсем) {g:they\'re} это {t:они}, а {g:at work} это {t:на работе}: {t:они на работе}', voicePhrase: 'They\'re at work' })
R('💼')
T('Это Кейт про Тома и Анну: они сегодня работают, так что в кино вечером идём вдвоём 😏')
S('Мультяшный кот хитро улыбается, прикрывая рот лапой, светлый фон, без текста')
A('Скажи про друга или подругу, какие они: начни с {g:He\'s} или {g:She\'s}, а дальше любое слово, {g:funny}, {g:nice}, {g:busy}')
SAY('She\'s nice', 'Она милая', { pattern: '(He\'s|She\'s|He is|She is) **', startHint: 'She\'s — она', hintMismatch: 'Начни с He\'s или She\'s и добавь любое слово, например nice)', wrongText: 'не то) начни с {g:He\'s} или {g:She\'s} и добавь любое слово)', listen: 'ага, послушаю)', comment: 'связка на месте, а дальше любое слово, так это и работает' })
endZone()

// ───────────────────────────── ЧАСТЬ 3 · вчера и завтра ─────────────────────────────
zone('Часть 3 · вчера и завтра', '#9b5de5')
SYS('Часть 3 · was и I\'ll be')
A('У {g:I\'m} есть одна хитрость: оно только {l:про сейчас}. Про вчера и про завтра связка другая')
P('Пит вчера: весь вечер на диване с ноутбуком и отчётом, глаза красные 🥱', 'Мультяшный рыжий кот лежит на диване с ноутбуком, вокруг бумаги, вечер, без текста')
T('Вчера я до ночи сидел с отчётом, и {l:про вчера} {g:I\'m} не годится: {g:I was}, {t:я был}')
TABLE('dictator', 'сейчас и вчера', ['Когда', 'Связка', 'Пример'], [['сейчас', 'I\'m', 'I\'m tired'], ['вчера', 'I was', 'I was tired']], { script: 'Про сейчас, I\'m, I\'m tired, я уставший. Про вчера, I was, I was tired, я был уставший. Состояние то же, а связка говорит, когда' })
T('как сказать {t:«вчера я был дома»}?')
PA('I was at home yesterday', ['I\'m', 'she', 'is'], { responseWrong: 'не совсем) вчера, значит {g:was}, а не {x:I\'m}', wrongText: 'не совсем) вчера это {g:was}: {g:I was at home yesterday}, без {x:I\'m}' })
R('🛋️')
A('Для неё и для него тоже {g:was}: {g:she was}, {g:he was}. А для нас, вас и них {g:were}, {l:когда людей несколько}: {g:we were}')
TABLE('dictator', 'вчера по лицам', ['Кто', 'Вчера', 'Пример'], [['I / she / he', 'was', 'she was late'], ['we / you / they', 'were', 'we were late']], { script: 'Про вчера две связки. Я, она, он, was, she was late, она опоздала. Мы, вы, они, were, we were late, мы опоздали. Один человек, was, несколько, were' })
T('Кейт вчера тоже опоздала, на работу)) выбирай:\n{g:Yesterday Kate ___ late}')
WC(['was', 'is', 'were'], { wrongText: 'неа) вчера и про одного человека: {g:was}, {g:Yesterday Kate was late}' })
T('да)) {t:«вчера Кейт опоздала»} 😅')
A('А {l:про завтра}: {g:I\'ll be}, это {g:I will be}, {t:я буду}. Завтра я буду свободен, и, кажется, мы с Кейт идём гулять')
S('Мультяшный кот мечтательно смотрит в окно, вокруг сердечки, светлый фон, без текста')
A('Собери фразу: завтра я буду свободен')
PA('I\'ll be free tomorrow', ['I\'m', 'was', 'is'], { responseWrong: 'не совсем) завтра, значит {g:I\'ll be}', wrongText: 'близко) завтра это {g:I\'ll be}: {g:I\'ll be free tomorrow}, без {x:I\'m}' })
R('🗓️')
T('И на слух 👂')
A('{g:I\'ll be at home at seven}', false)
WC(['Я буду дома в семь', 'Я был дома в семь', 'Я дома'], { wrongText: 'не совсем) {g:I\'ll be} это {t:я буду}, а {g:at seven} это {t:в семь}: {t:я буду дома в семь}', voicePhrase: 'I\'ll be at home at seven' })
R('🏠')
TABLE('dictator', 'три времени', ['Когда', 'Связка', 'Пример'], [['сейчас', 'I\'m', 'I\'m at home'], ['вчера', 'I was', 'I was at home'], ['завтра', 'I\'ll be', 'I\'ll be at home']], { script: 'Собираем всё вместе. Сейчас, I\'m, I\'m at home, я дома. Вчера, I was, I was at home, я был дома. Завтра, I\'ll be, I\'ll be at home, я буду дома. Место одно, а связка показывает, когда' })
PIN('{g:I\'m} сейчас · {g:I was} вчера · {g:I\'ll be} завтра')
A('Про тебя: скажи, где ты будешь завтра, начни с {g:I\'ll be at}, дальше любое место')
SAY('I\'ll be at home', 'Я буду дома', { pattern: '(I\'ll be|I will be) at **', startHint: 'I\'ll be at — я буду в', hintMismatch: 'Начни с I\'ll be at и добавь любое место, например home)', wrongText: 'не совсем) начни с {g:I\'ll be at} и добавь любое место)', listen: 'секунду, включаю запись)', comment: '{g:I\'ll be} у тебя звучит само, а место подставляется любое' })
endZone()

// ───────────────────────────── ИТОГ ─────────────────────────────
zone('Итог', '#06d6a0')
A('Вот и вся основа: {g:I\'m} это связка между {g:I} и состоянием, у неё и у них связка своя, а про вчера и завтра {g:was} и {g:I\'ll be}. Всю формулу соберём в самом конце, а пока выбирай: закончить или потренироваться')
MENU(['Закончить ✅', 'Ещё потренируюсь 💪'], ['final', 'train'])
endZone()

// ───────────────────────────── ТРЕНИРОВКА (день продолжается: парк → кино → ночь) ─────────────────────────────
zone('Ещё практика', '#118ab2')
byKey.train = T('Ну раз с {g:I\'m} ты уже знаком, давай проверим, как оно работает в деле 💪').ref
A('Будет семь уровней, и {l:каждый чуть сложнее} предыдущего')
byKey.lvl1 = LEVEL('Уровень 1 · разогрев').ref
T('После кафе мы с Кейт дошли до парка, сидим у пруда, кормим уток))')
T('как сказать {t:«я в парке»}?')
PA('I\'m at the park', ['am', 'is', 'was'], { responseWrong: 'не совсем) про себя и про сейчас {g:I\'m}', wrongText: 'не совсем) {w:я в парке} это {g:I\'m at the park}, связка {g:I\'m}, без отдельного {x:am}' })
R('🦆')
P('Кейт устала после прогулки, сидит на скамейке и зевает 🥱', 'Мультяшная кошка сидит на скамейке в парке и зевает, рядом пруд с утками, без текста')
T('а ну-ка, какая связка:\n{g:She ___ tired}')
WC(['is', 'am', 'are'], { wrongText: 'неа) про неё связка {g:is}: {g:She is tired}, или короче {g:she\'s}' })
T('даа)) {t:«она устала»}')
T('а ну-ка зацени на слух 👂')
A('{g:We\'re happy}', false)
WC(['Мы счастливы', 'Мы дома', 'Они счастливы'], { wrongText: 'близко) {g:we\'re} это {t:мы}, а {g:happy} {t:счастливы}: {t:мы счастливы}', voicePhrase: 'We\'re happy' })
R('😊')
A('Скажи вслух {t:«я здесь»}: здесь это {g:here}, начало ты знаешь')
SAY('I\'m here', 'Я здесь', { pattern: '(I am|I\'m) here', startHint: 'I\'m — я', hintMismatch: '', wrongText: 'близко) скажи {g:I\'m here}, связка и место', comment: 'да)) 📍' })
LEVEL('Уровень 2 · увереннее')
A('давай фразы подлиннее, но {l:связка всё та же}')
P('Кейт звонит подруге: мы сегодня заняты, гуляем, перезвоню вечером 📞', 'Мультяшная кошка говорит по телефону на дорожке в парке, рыжий кот рядом ждёт, без текста')
T('собери {t:«мы сегодня заняты»}')
PA('We\'re busy today', ['am', 'is', 'I\'m'], { responseWrong: 'не совсем) про нас связка {g:we\'re}', wrongText: 'не совсем) про нас не {x:I\'m}, а {g:we\'re}: {g:We\'re busy today}' })
R('👌')
T('а теперь на слух 👂')
A('{g:He\'s at work today}', false)
WC(['Он сегодня на работе', 'Он был на работе', 'Он идёт на работу'], { wrongText: 'неа) {g:he\'s} это {t:он}, про сейчас, а {g:at work} {t:на работе}: {t:он сегодня на работе}', voicePhrase: 'He\'s at work today' })
R('💼')
A('Своими словами: скажи, где ты сейчас, начни с {g:I\'m at}, дальше любое место')
SAY('I\'m at work', 'Я на работе', { pattern: '(I am|I\'m) at **', startHint: 'I\'m at — я в', hintMismatch: 'Начни с I\'m at и добавь любое место, например work)', wrongText: 'не то) начни с {g:I\'m at} и добавь любое место)', listen: 'дай-ка послушаю твою запись)', comment: 'после {g:I\'m at} ты просто ставишь своё место, вот и вся хитрость' })
P('Кейт делает селфи у пруда, а Пит в кадр не попал 😂', 'Мультяшная кошка делает селфи у пруда, сбоку торчит ухо рыжего кота, без текста')
T('напечатай {t:«она счастлива»}, полной формой, два слова: печатай тапами по светящимся буквам')
TW('she is happy', 'ar', 'близко) про неё связка {g:is}, {l:между she и happy}', 'неа) {w:она счастлива} это {g:she is happy}, связка {g:is} посередине')
T('вооо, точность 🎯')
A('Ты быстро справляешься с заданиями, дальше всё поймёшь без объяснения, обещаю')
LEVEL('Уровень 3 · повтори за мной')
A('Соберём длинную фразу с конца, часть за частью: я говорю кусочек, ты его отзеркаливаешь вслух, с тем же ритмом')
A('{g:at the cinema}', false)
SAY('at the cinema', 'в кино', { hintMismatch: '', wrongText: 'не то) копируй ритм, {g:at the cinema}', comment: 'ритм что надо 👌' })
T('Добавим начало, слушай')
A('{g:We\'ll be at the cinema}', false)
SAY('We\'ll be at the cinema', 'Мы будем в кино', { hintMismatch: '', wrongText: 'близко) кто будет? {g:We\'ll be}, и дальше та же часть:\n{g:We\'ll be at the cinema}', comment: 'звучит великолепно! 🔥' })
P('Пит и Кейт у кинотеатра, билеты в руках, сеанс в шесть 🎟️', 'Мультяшный рыжий кот и кошка стоят у входа в кинотеатр с билетами, вечер, без текста')
A('И новое из знакомых частей: собери, мы будем в кино в шесть')
PA('We\'ll be at the cinema at six', ['am', 'was', 'seven'], { responseWrong: 'не совсем) про завтра и про нас {g:We\'ll be}, а дальше место и час', wrongText: 'неа) склей две части: {g:We\'ll be} и {g:at the cinema at six}' })
T('вот так оно и строится 🧱')
LEVEL('Уровень 4 · ловушки')
T('Хитрые случаи 😏 {t:«я работаю»}, нужна ли тут связка?\n{g:I ___ work every day}')
WC(['ничего не нужно', 'am', 'is'], { wrongText: 'близко) {g:work} тут действие, а {g:I\'m} {l:только для состояния}: просто {g:I work every day}' })
S('Мультяшный кот подмигивает и показывает большой палец, светлый фон, без текста')
A('{g:I\'m} нужно, когда говоришь, {l:какой ты или где ты}. А когда есть действие, {g:work}, {g:go}, {g:sleep}, связка {x:лишняя}: {g:I work}, {g:I sleep}')
P('Кейт в зале пишет подруге: мы на месте, фильм в семь 🎬', 'Мультяшная кошка в кресле кинотеатра с телефоном, рядом рыжий кот с попкорном, без текста')
T('собери {t:«мы на месте»}')
PA('We\'re here', ['I\'m', 'they', 'is'], { responseWrong: 'не совсем) про нас связка {g:we\'re}, и где мы', wrongText: 'неа) про нас {g:we\'re}, а не {x:I\'m}:\n{g:We\'re here}' })
R('🍿')
T('Послушай, тут тоже ловушка 👂')
A('{g:I was at the cinema}', false)
WC(['Я был в кино', 'Я в кино', 'Я буду в кино'], { wrongText: 'не совсем) {g:was} это {t:про вчера}, {g:I was at the cinema} это {t:я был в кино}', voicePhrase: 'I was at the cinema' })
R('🎬')
A('Скажи вслух {t:«я работаю»}, двумя словами, без связки')
SAY('I work', 'я работаю', { hintMismatch: '', wrongText: 'не совсем) действие, значит без {g:I\'m}: просто {g:I work}', comment: 'отлично! именно так 😎', signals: [{ slot: 0, type: 'audio', text: 'Работаю это действие, связка не нужна: два слова, первое {g:I}' }] })
TABLE('dictator', 'когда связка не нужна', ['Фраза', 'Что это', 'Связка'], [['I\'m tired', 'состояние', 'I\'m'], ['I work', 'действие', 'не нужна']], { script: 'Подведём итог ловушек. I\'m tired, я уставший, это состояние, связка нужна. I work, я работаю, это действие, связка не нужна. Состояние с I\'m, действие само по себе' })
PIN('{g:I\'m tired} состояние · {g:I work} действие, без связки')
LEVEL('Уровень 5 · своими словами')
T('После кино Кейт призналась, что вчера весь вечер была дома одна и скучала 😏')
S('Мультяшный кот с круглыми глазами и сердечком над головой, светлый фон, без текста')
T('длинное предложение, получится? собери {t:«вчера она была дома, а сейчас она здесь»}')
PA('She was at home yesterday but now she\'s here', ['I\'m', 'they', 'were'], { responseWrong: 'не совсем) первая часть про вчера, {g:was}, вторая про сейчас, {g:she\'s}', wrongText: 'не-не-не) вчера {g:was}, сейчас {g:she\'s}:\n{g:She was at home yesterday but now she\'s here}' })
R('💞')
A('Первая часть про вчера, {g:was}, вторая про сейчас, {g:she\'s}: {l:связка показывает время}')
A('Про тебя: а вчера где именно? Начни с {g:I was at} и назови любое место')
SAY('I was at home', 'Вчера дома', { pattern: 'I was at **', startHint: 'I was at — вчера я в', hintMismatch: 'Начни с I was at и добавь любое место, например home)', wrongText: 'не совсем) нужно сказать {g:I was at} и любое место)', listen: 'ну-ка, что получилось)', comment: 'про вчера у тебя {g:was}, и место на месте, так и строится' })
T('Послушай внимательно 👂')
A('{g:They were at the park}', false)
WC(['Они были в парке', 'Они в парке', 'Они будут в парке'], { wrongText: 'неа) {g:were} это {t:про вчера}, {g:They were at the park} это {t:они были в парке}', voicePhrase: 'They were at the park' })
R('🌳')
A('{g:were}, как и {g:was}, {l:про вчера}, только для нескольких: они, мы, вы')
A('Остался последний рывок, держись, будет быстро')
LEVEL('Уровень 6 · на скорость ⏱')
T('выбери верную фразу ⏱ {t:«она дома»}')
WC(['She\'s at home', 'She at home', 'She\'m at home'], { wrongText: 'не совсем) про неё связка {g:she\'s}:\n{g:She\'s at home}', timeLimitSec: 7 })
R('⚡')
A('И ещё: собери, завтра мы будем заняты')
PA('We\'ll be busy tomorrow', ['am', 'I\'m', 'was'], { responseWrong: 'не совсем) завтра и про нас {g:We\'ll be}', wrongText: 'не то) завтра это {g:We\'ll be}: {g:We\'ll be busy tomorrow}', timeLimitSec: 12 })
T('быстро 🚀')
A('И то же вслух: начни с {g:We\'ll be}, дальше любое слово')
SAY('We\'ll be busy', 'Мы будем заняты', { pattern: '(We\'ll be|We will be) **', startHint: 'We\'ll be — мы будем', hintMismatch: 'Начни с We\'ll be и добавь любое слово, например busy)', wrongText: 'не то) начни с {g:We\'ll be} и добавь любое слово)', listen: 'слушаю, что получилось)', comment: 'молния, и {g:We\'ll be} на месте' })
S('Мультяшный кот с секундомером и наушниками, светлый фон, без текста')
A('{g:You\'re late}', false)
WC(['Ты опаздываешь', 'Ты дома', 'Ты опоздал вчера'], { wrongText: 'не совсем) {g:you\'re} это {t:ты}, про сейчас, а {g:late} {t:опаздываешь}', voicePhrase: 'You\'re late', timeLimitSec: 6 })
R('🏁')
LEVEL('Уровень 7 · без подсказок')
S('Мультяшный кот в шоке с открытым ртом, добрался до последнего уровня, светлый фон, без текста')
T('У меня уже ночь, только дошёл до дома, а Кейт пишет: ты где? 🌙')
A('Ответь ей вслух, что ты дома: начни с {g:I\'m at}, дальше по-своему')
SAY('I\'m at home', 'Я дома', { pattern: '(I am|I\'m) at **', hintsOff: true, startHint: 'I\'m at — я в', hintMismatch: 'Начни с I\'m at и добавь любое место, например home)', wrongText: 'не то) начни так: {g:I\'m at}, это {t:я в}, и добавь любое место', listen: 'так-так, послушаю)', comment: 'Кейт спокойна, {g:I\'m at} и место, никаких лишних слов' })
A('{g:She\'s happy}', false)
WC(['Она счастлива', 'Она дома', 'Она была счастлива'], { wrongText: 'неа) {g:she\'s} это {t:она}, про сейчас, а {g:happy} {t:счастлива}', voicePhrase: 'She\'s happy' })
R('👏')
P('Кейт пишет: завтра в семь? Пит лежит и улыбается в потолок 😊', 'Мультяшный рыжий кот лежит в кровати с телефоном и улыбается, ночь, луна в окне, без текста')
T('напечатай {t:«я опоздал»}, как я сегодня утром, полной формой: печатай тапами по светящимся буквам')
TW('I was late', 'ei', 'не то) про вчера и про утро связка was, между I и late', 'не-не-не) {w:я опоздал} это {g:I was late}, связка {g:was} посередине')
R('😅')
A('Неожиданность: Кейт пишет: {g:good night, I\'m tired}. Ответь ей: скажи, как ты сейчас, начни с {g:I\'m}, слово любое, засчитаю всё')
SAY('I\'m happy', 'Мне хорошо', { pattern: '(I am|I\'m) **', hintsOff: true, startHint: 'I\'m — я', hintMismatch: 'Начни с I\'m и добавь любое слово, например happy)', wrongText: 'не совсем) начни с {g:I\'m} и добавь любое слово)', listen: 'секунду, слушаю)', comment: 'ответ отправлен, {g:I\'m} тебе уже как родной' })
endZone()

// ───────────────────────────── ФИНАЛ ─────────────────────────────
zone('Финал', '#ff9f1c')
byKey.final = SYS('Финал').ref
T('Если коротко: {g:I\'m} это {t:я есть}, {l:связка между мной и состоянием}; у неё и у них связка своя, про вчера {g:was}, про завтра {g:I\'ll be}, а у действия связки нет')
TABLE('dictator', 'вся формула I\'m', ['Кто / когда', 'Связка', 'Пример'], [['я', 'I\'m', 'I\'m here'], ['она, он', 'she\'s / he\'s', 'she\'s here'], ['мы, они', 'we\'re / they\'re', 'we\'re here'], ['вчера', 'was / were', 'I was here'], ['завтра', 'I\'ll be', 'I\'ll be here']], { script: 'Смотри, всё вместе. Я, I\'m, I\'m here, я здесь. Она или он, she\'s, he\'s, she\'s here, она здесь. Мы или они, we\'re, they\'re, we\'re here, мы здесь. Вчера, was или were, I was here, я был здесь. Завтра, I\'ll be, I\'ll be here, я буду здесь. Одно место, а связка говорит, кто и когда' })
SCENE('im-outro', 'Пит перед сном', 'circle', [
  { who: 'a', text: 'Ну всё, I\'m теперь твой, говори о себе смело.', emotion: 'happy' },
  { who: 'a', text: 'А я… I\'m in love, кажется. Пока!', emotion: 'surprised' },
])
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
  zones: zones.map((z, i) => ({ id: `zone-im-${i + 1}`, x: z.x0, y: -150, width: z.x1 - z.x0, height: 1040, label: z.label, color: z.color })),
  wordCard: {
    tag: 'связка',
    nodes: [
      { type: 'text', text: '**I\'m** = I am, «я есть»: связка между «я» и состоянием — какой я, что со мной, где я.' },
      { type: 'cases', items: [
        { label: 'сейчас', example: '**I\'m** tired', tr: 'я уставший', mark: 0 },
        { label: 'она, он, мы, они', example: '**She\'s** here. **We\'re** late', tr: 'она здесь. мы опаздываем' },
        { label: 'вчера', example: 'I **was** at home', tr: 'я был дома' },
        { label: 'завтра', example: '**I\'ll be** free', tr: 'я буду свободен' },
      ] },
      { type: 'dialog', lines: [
        { side: 'l', text: 'How are you?', tr: 'Как ты?' },
        { side: 'r', text: '**I\'m** sleepy. And **I\'m** late!', tr: 'Я сонный. И я опаздываю!' },
        { side: 'l', text: '**I\'m** not at home, **I\'m** at the cafe.', tr: 'Я не дома, я в кафе.', neg: true },
        { side: 'r', text: '**I\'ll be** there at ten!', tr: 'Буду там в десять!' },
      ] },
    ],
  },
}
writeFileSync(new URL('../im.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('nodes', nodes.length, 'zones', zones.length)

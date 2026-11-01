// Генератор урока «Both» (тип 3: просто слово, не слово-правило). Запуск: node lesson-drafts/gen/gen-both.mjs ; затем node scripts/lesson-gate.mjs lesson-drafts/both.json --fix-seq
// Скелет как у gen-at.mjs: вход → 3 части + диалог → итог → тренировка 3 уровня → финал. Пит ссылается на Мию (не Кейт).
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
const OPENERS = ['не совсем)', 'близко)', 'неа)', 'не то)', 'почти)']
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
function PA(words, distractors, { wrongText, responseWrong, timeLimitSec, signals = [], answers }) {
  const n = main('phrase_assembly', { words: words.split(' '), distractors: distractors.map(t => ({ text: t })), ...(answers ? { answers } : {}), responseWrong, ...(timeLimitSec ? { timeLimitSec } : {}) })
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
  const n = main('table', data, mode === 'dictator' ? { needs: 'audio — только для режима dictator', note: `ОЗВУЧКА таблицы (скрипт идёт по ячейкам слева направо, сверху вниз; метку «Проверить» поставить при монтаже после последней ячейки): ${script}` } : { note: `Таблица both: ${chatCaption}` })
  if (mode === 'demo') n.triggers = [{ if: 'timer', ms: 2200 }]
  return n
}
function SCENE(id, title, mode, timeline, characters = CAT_PIT) {
  return main('scene', { scene: { version: 2, id, title, location: 'cafe', characters, slots: SLOTS_CAFE, timeline, options: { bubbles: true } }, mode, showBubbles: mode === 'bubble', start: 'auto', crop: { x: 0, y: 0, scale: 1 } }, { note: mode === 'circle' ? 'СЦЕНА: кружок Пита, один кот крупно, без облачков (текст реплик в кружке не показывается). Озвучку записать кнопкой «Озвучить» в редакторе сцены' : 'СЦЕНА: диалог двух котов в пузыре. Озвучку записать в редакторе сцены' })
}
function zone(label, color) { zones.push({ label, color, x0: x - 150 }) }
function endZone() { zones.at(-1).x1 = x - STEP + 308 + 150; x += GAP }

const CAT_MIA = { a: { kind: 'cat', gender: 'male', name: 'Пит', skin: 'kit', voice: { pitch: 0.8, rate: 0.95 } }, b: { kind: 'cat', gender: 'female', name: 'Мия', skin: 'mia2', voice: { pitch: 1.3, rate: 0.9 } } }

// ───────────────────────────── ВХОД ─────────────────────────────
zone('Вход', '#b6fe3b')
SCENE('both-intro', 'Кот с двумя чашками', 'circle', [
  { who: 'a', text: 'Мия хочет и кофе, и чай, так что беру оба.', emotion: 'happy' },
  { who: 'a', text: 'Как сказать по-английски оба? Сегодня учим both.', emotion: 'surprised' },
])
WC(['I want both', 'I want all', 'I want two'], { wrongText: 'не совсем) когда нужно и то и другое, то есть двое сразу, подходит слово {g:both}:\n{g:I want both}' })
R('☕')
T('как тебе удобнее: сначала разберём основу или сразу в практику?')
MENU(['Сначала объясни 📖', 'Сразу к практике 💪'], ['part1', 'train'])
endZone()

// ───────────────────────────── ЧАСТЬ 1 · both = двое ─────────────────────────────
zone('Часть 1 · both = двое', '#ffd166')
byKey.part1 = SYS('Часть 1 · both это двое').ref
A('{g:both} это {w:оба}, то есть {l:и то и другое}, и речь всегда про двоих')
P('Мия взяла себе кофе и чай ☕', 'Мультяшная девушка держит в одной руке чашку кофе, в другой чашку чая, довольная, кафе, светлый фон, без текста')
T('кста, у Мии дома два кота, и она обожает обоих 😍')
T('а как сказать {t:«Мия любит обоих котов»}?')
PA('Mia likes both cats', ['all', 'cat', 'two'], { responseWrong: 'не совсем) котов двое, значит нужно {g:both}', wrongText: 'не совсем) котов двое, значит {g:both}, а слово {g:cats} во множественном числе:\n{g:Mia likes both cats}' })
R('🐱')
A('Мия и Том застряли в пробке, оба злятся. Как сказать {t:«оба из них»}?')
WC(['both of them', 'both them', 'all of them'], { wrongText: 'неа) перед {g:them} нужно ещё одно маленькое слово, {g:of}:\n{g:both of them}' })
R('🚗')
A('Видишь? Вместо существительного стоит {g:them}, и между ними появилось {g:of}: {g:both of} и {l:кто-то}, {g:us}, {g:you} или {g:them}')
S('Мультяшный кот машет двумя лапами сразу, светлый фон, без текста')
T('Мия пишет: я люблю и рок, и джаз 🎸')
T('как сказать {t:«она любит и рок, и джаз»}?')
PA('She likes both rock and jazz', ['all', 'or', 'they'], { responseWrong: 'не совсем) нужна пара {g:both} и {g:and}', wrongText: 'не то) две вещи соединяет пара {g:both} и {g:and}, а не {x:or}:\n{g:She likes both rock and jazz}' })
R('🎸')
TABLE('dictator', 'как используем both', ['Начало', 'Дальше', 'Значит'], [['both', 'cats', 'оба кота'], ['both of', 'them', 'оба из них'], ['both', 'rock and jazz', 'и рок, и джаз']], { widths: [32, 36, 32], script: 'Смотри, всё вместе. Both и cats, оба кота. Both of и them, оба из них. И both, rock and jazz, это и рок, и джаз. Ничего сложного, во всех случаях речь про двоих' })
PIN('{g:both} + {w:двое}: {g:both cats}, {g:both of us}')
A('{g:Tom helps both of us}', false)
WC(['Том помогает нам обоим', 'Том помогает всем', 'Том помогает мне'], { wrongText: 'близко) {g:both of us} это {t:мы оба}, поэтому {g:Tom helps both of us} это {t:Том помогает нам обоим}', voicePhrase: 'Tom helps both of us' })
R('🙌')
endZone()

// ───────────────────────────── ЧАСТЬ 2 · где стоит both ─────────────────────────────
zone('Часть 2 · где стоит both', '#ef476f')
SYS('Часть 2 · где стоит both')
T('мы с Мией оба обожаем кофе, оба!!')
T('как сказать {t:«мы оба любим кофе»}?')
PA('We both like coffee', ['all', 'they', 'likes'], { answers: [['Both', 'of', 'us', 'like', 'coffee']], responseWrong: 'не совсем) {g:both} встаёт сразу после {g:we}', wrongText: 'не совсем) {g:both} встаёт сразу после {g:we}, перед глаголом:\n{g:We both like coffee}' })
R('☕')
A('Смотри: {g:both} стоит после {g:we}, прямо перед {g:like}. С обычными глаголами {g:both} идёт {l:перед ними}')
P('Мы с Мией после смены, оба вымотались 😮‍💨', 'Мультяшный кот и кошка сидят на диване в кафе, оба уставшие, откинулись на спинку, светлый фон, без текста')
T('а как сказать {t:«мы оба устали»}?')
WC(['We are both tired', 'We both tired are', 'We are tired both'], { wrongText: 'неа) с {g:are} всё наоборот: {g:both} встаёт {w:после} него:\n{g:We are both tired}' })
R('😴')
TABLE('dictator', 'где стоит both', ['Глагол', 'Где both', 'Пример'], [['обычный', 'перед', 'We both like tea'], ['am, is, are', 'после', 'We are both tired']], { script: 'Смотри, где стоит both. С обычным глаголом both идёт перед ним, we both like tea. А с am, is, are наоборот, both идёт после, we are both tired' })
T('даа 😏 порядок такой: {g:are} и сразу {g:both}')
A('{g:They are both late}', false)
WC(['Они оба опоздали', 'Они оба дома', 'Они оба рады'], { wrongText: 'близко) {g:late} это {t:поздно}, значит {g:They are both late} это {t:они оба опоздали}', voicePhrase: 'They are both late' })
R('⏰')
A('Теперь вслух про нас с Мией: мы оба голодные, начни с {g:We are both}, а дальше любое слово')
SAY('We are both hungry', 'Мы оба голодные', { pattern: '(We are|We\'re) both **', startHint: 'We are both — мы оба', hintMismatch: 'Начни с We are both и добавь любое слово, например hungry)', wrongText: 'близко) начни с {g:We are both} и добавь любое слово)', listen: 'так-так, дай послушать)', comment: 'ого, ты уже строишь фразу с {g:both} сам: {g:We are both} и дальше любое слово' })
endZone()

// ───────────────────────────── ДИАЛОГ ─────────────────────────────
zone('Диалог', '#118ab2')
SCENE('both-duo', 'Пит и Мия в кафе', 'bubble', [
  { who: 'a', text: 'Mia, we both need coffee.', emotion: 'tired', translation: 'Мия, нам обоим нужен кофе.' },
  { who: 'b', text: 'Yes! We are both so tired.', emotion: 'tired', translation: 'Да! Мы оба так устали.' },
  { who: 'a', text: 'Let\'s order both: coffee and tea.', emotion: 'happy', translation: 'Давай закажем оба: кофе и чай.' },
  { who: 'b', text: 'Great idea! Both of us win.', emotion: 'happy', translation: 'Отличная идея! Мы оба в выигрыше.' },
], CAT_MIA)
endZone()

// ───────────────────────────── ЧАСТЬ 3 · both, all, neither ─────────────────────────────
zone('Часть 3 · похожие слова', '#9b5de5')
SYS('Часть 3 · both, all, neither')
A('Рядом с {g:both} живут похожие слова: если двое, это {g:both}, а если трое и больше, это {g:all}. {l:Считай, сколько их}')
P('Нас за столиком трое: я, Мия и Том, едим пончики 🍩', 'Мультяшные кот, кошка и парень сидят за столиком в кафе, на столе пончики, светлый фон, без текста')
T('а как сказать {t:«мы все любим пончики»}, ведь нас трое?')
WC(['We all like donuts', 'We both like donuts', 'We all likes donuts'], { wrongText: 'неа) нас трое, а {g:both} только про двоих, значит {g:all}:\n{g:We all like donuts}' })
R('🍩')
T('Мия смотрит на кофе и чай, и ей не хочется ни того, ни другого((')
T('как сказать одним словом {t:«ни то, ни другое»}?')
WC(['neither', 'both', 'all'], { wrongText: 'неа) двое, и не подходит ни один, это {g:neither}, наоборот от {g:both}' })
R('🙅')
A('{g:neither} это {w:ни тот, ни другой}, а {g:both} это {w:и тот, и другой}: {l:слова-зеркала}')
S('Мультяшный кот держит два зеркальных отражения себя, светлый фон, без текста')
TABLE('dictator', 'сколько их', ['Сколько', 'Слово', 'Пример'], [['двое', 'both', 'We both like tea'], ['трое и больше', 'all', 'We all like tea'], ['ни один из двоих', 'neither', 'neither of us']], { script: 'Смотри, считаем, сколько их. Двое, both, we both like tea. Трое и больше, all, we all like tea. А если не подходит ни один из двоих, neither, neither of us' })
PIN('{g:both} двое, {g:all} трое и больше, {g:neither} ни один')
A('{g:We all like sushi}', false)
PA('We all like sushi', ['both', 'likes', 'they'], { responseWrong: 'не совсем) {g:all} это все, а не двое', wrongText: 'неа) {g:all} это {t:все}, а не двое: {g:We all like sushi}' })
R('🍣')
endZone()

// ───────────────────────────── ИТОГ ─────────────────────────────
zone('Итог', '#06d6a0')
A('С основой разобрались: {g:both} это {l:двое}, а {g:all} и {g:neither} его соседи. Всю формулу соберём в самом конце, а пока выбирай: закончить или потренироваться')
MENU(['Закончить ✅', 'Ещё потренируюсь 💪'], ['final', 'train'])
endZone()

// ───────────────────────────── ТРЕНИРОВКА ─────────────────────────────
zone('Ещё практика', '#118ab2')
byKey.train = T('Ну раз с {g:both} ты уже знаком, давай проверим, как оно работает в деле 💪').ref
A('Будет три уровня, и {l:каждый чуть сложнее} предыдущего')
byKey.lvl1 = LEVEL('Уровень 1 · разогрев').ref
T('Мия зовёт меня в кино, и мы оба в восторге 🤩')
T('помоги ответить ей: {t:«мы оба любим кино»}')
PA('Both of us love movies', ['all', 'them', 'you'], { answers: [['We', 'both', 'love', 'movies']], responseWrong: 'не совсем) двое, значит {g:both}', wrongText: 'не совсем) нас двое, значит {g:Both of us love movies}, или короче {g:We both love movies}' })
R('🎬')
T('а ну-ка зацени на слух 👂')
A('{g:Both cats sleep}', false)
WC(['Оба кота спят', 'Все коты спят', 'Оба кота едят'], { wrongText: 'близко) {g:both} это {t:оба}, поэтому {g:Both cats sleep} это {t:оба кота спят}', voicePhrase: 'Both cats sleep' })
R('😸')
A('Скажи вслух {t:«мы оба хотим чай»}: начни с {g:We both want}, а дальше любое слово')
SAY('We both want tea', 'Мы оба хотим чай', { pattern: 'We both want **', startHint: 'We both want — мы оба хотим', hintMismatch: 'Начни с We both want и добавь любое слово, например tea)', wrongText: 'близко) начни с {g:We both want} и добавь любое слово)', comment: 'да)) 🍵' })
byKey.lvl2 = LEVEL('Уровень 2 · оба, все или ни один').ref
A('Давай смешаем похожие слова, а ты {l:считай, сколько их}')
P('Идём втроём по улице: я, Мия и Том 🚶', 'Мультяшные кот, кошка и парень идут по улице втроём, весёлые, светлый фон, без текста')
T('а здесь нужно {g:all}, {g:both} или {g:neither}?\n{g:Mia, Tom and I ___ love sushi}')
WC(['all', 'both', 'neither'], { wrongText: 'неа) нас трое, а {g:both} только про двоих, значит {g:all}' })
R('🍣')
T('а теперь только мы с Мией:\n{g:Mia and I ___ like jazz}')
WC(['both', 'all', 'neither'], { wrongText: 'не то) нас двое, значит {g:both}:\n{g:Mia and I both like jazz}' })
R('🎷')
P('Мия и Том сегодня в хорошем настроении 😊', 'Мультяшные девушка и парень смеются вместе, вокруг яркий день, без текста')
A('Собери фразу {t:«Мия и Том оба рады»}')
PA('Mia and Tom are both happy', ['all', 'is', 'neither'], { responseWrong: 'не совсем) после {g:are} слово {g:both} идёт следом', wrongText: 'не совсем) с {g:are} слово {g:both} идёт после него: {g:Mia and Tom are both happy}' })
R('😄')
T('напечатай {t:«оба кота»}: тапай по светящимся буквам')
TW('both cats', 'dk', 'не то) котов двое, значит перед {g:cats} нужно {g:both}', 'но нет) котов двое, {g:both cats}')
R('🐾')
byKey.lvl3 = LEVEL('Уровень 3 · без подсказок').ref
S('Мультяшный кот в шоке с открытым ртом, добрался до последнего уровня, светлый фон, без текста')
T('Мия пишет: тебе больше нравится лето или зима? 😅')
S('Мультяшная кошка с телефоном задумчиво смотрит в экран, светлый фон, без текста')
A('Ответь ей вслух, что тебе нравятся оба времени года: начни с {g:I like both}, дальше по-своему')
SAY('I like both summer and winter', 'Мне нравятся и лето, и зима', { pattern: 'I like both **', hintsOff: true, startHint: 'I like both — мне нравятся оба', hintMismatch: 'Начни с I like both и добавь любое слово, например summer and winter)', wrongText: 'не то) начни с {g:I like both} и добавь любое слово)', listen: 'слушаю, что получилось)', comment: 'у тебя уже получается строить такие фразы без подсказок: {g:I like both} и дальше любое слово' })
A('{g:Mia and Tom are both here}', false)
WC(['Мия и Том оба здесь', 'Мия и Том оба дома', 'Мии и Тома здесь нет'], { wrongText: 'неа) {g:here} это {t:здесь}, поэтому {g:Mia and Tom are both here} это {t:Мия и Том оба здесь}', voicePhrase: 'Mia and Tom are both here' })
R('👏')
A('Неожиданность: Мия зовёт нас на вечеринку. Скажи, что вы с ней оба готовы, начни с {g:We are both}')
SAY('We are both ready', 'Мы оба готовы', { pattern: '(We are|We\'re) both **', hintsOff: true, startHint: 'We are both — мы оба', hintMismatch: 'Начни с We are both и добавь любое слово, например ready)', wrongText: 'не совсем) начни с {g:We are both} и добавь любое слово)', comment: 'огонь)) 🎉' })
endZone()

// ───────────────────────────── ФИНАЛ ─────────────────────────────
zone('Финал', '#ff9f1c')
byKey.final = SYS('Финал').ref
T('Если коротко: {g:both} это {l:двое сразу}, а трое и больше уже {g:all}')
TABLE('dictator', 'вся формула both', ['Как', 'Слово', 'Пример'], [['с вещью', 'both', 'Mia likes both cats'], ['с местоимением', 'both of', 'both of us'], ['парой', 'both and', 'both rock and jazz'], ['с глаголом', 'we both', 'We both like tea'], ['после are', 'are both', 'We are both tired']], { widths: [33, 23, 44], script: 'Смотри, всё вместе. С вещью, both, Mia likes both cats. С местоимением, both of, both of us. Парой, both и and, both rock and jazz. С обычным глаголом, we both, we both like tea. А после are, are both, we are both tired. Везде речь про двоих' })
SCENE('both-outro', 'Кот и Мия идут за кофе', 'circle', [
  { who: 'a', text: 'Теперь ты знаешь both: оба, и то и другое.', emotion: 'happy' },
  { who: 'a', text: 'Нас с Мией двое, значит скажем: we both! Повторим?', emotion: 'surprised' },
])
MENU(['Закончить ✅', 'Ещё один круг 💪'], ['bye', 'lvl1'])
const bye = T('Пока, и удачи с {g:both} 👋'); byKey.bye = bye.ref; bye.triggers = [{ if: 'timer', ms: 1500, then: null }]
endZone()

closeWrongs()
for (const { node, idx, key } of laterLinks) node.triggers[idx].then = byKey[key]
for (const n of nodes) { for (const t of n.triggers) if (t.then === undefined) t.then = null; delete n._side }
for (const n of nodes) if (n.type === 'text' && /: \{g:[^}]+\}\)?$/.test(n.data.content)) { n.data.content = n.data.content.replace(/: (\{g:[^}]+\}\)?)$/, ':\n$1'); n.data.hardWrap = true }

const out = {
  format: 'pithy-lesson', version: 1,
  lesson: { title: 'Both', nodeCount: nodes.length },
  nodes: nodes.map((n, i) => ({ ref: n.ref, type: n.type, seq: i + 1, pos: n.pos, ...(n.note ? { note: n.note } : {}), ...(n.needs ? { needs: n.needs } : {}), data: n.data, triggers: n.triggers })),
  zones: zones.map((z, i) => ({ id: `zone-both-${i + 1}`, x: z.x0, y: -150, width: z.x1 - z.x0, height: 1040, label: z.label, color: z.color })),
  wordCard: {
    tag: 'слово · оба',
    nodes: [
      { type: 'text', text: '**both** значит «оба»: речь всегда про двоих, и то и другое.' },
      { type: 'cases', items: [
        { label: 'рядом с вещью', example: 'Mia likes **both** cats', tr: 'Мия любит обоих котов', mark: 0 },
        { label: 'с местоимением', example: '**both** of us', tr: 'мы оба' },
        { label: 'рядом с глаголом', example: 'We **both** like tea', tr: 'мы оба любим чай' },
      ] },
      { type: 'dialog', left: 'Пит', right: 'Мия', lines: [
        { side: 'l', text: 'Coffee or tea, Mia?', tr: 'Кофе или чай, Мия?' },
        { side: 'r', text: 'I want **both**!', tr: 'Я хочу оба!' },
        { side: 'l', text: 'I don\'t want **both**, one is enough.', tr: 'Я не хочу оба, одного хватит.', neg: true },
        { side: 'r', text: 'Fine, we **both** get tea.', tr: 'Ладно, оба берём чай.' },
      ] },
    ],
  },
}
writeFileSync(new URL('../both.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('nodes', nodes.length, 'zones', zones.length)

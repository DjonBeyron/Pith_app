// Генератор урока «At» (формат pithy-lesson) по скелету урока «To»: вход → 3 части → итог → тренировка 7 уровней → финал.
// Запуск: node lesson-drafts/gen/gen-at.mjs ; затем node scripts/lesson-gate.mjs lesson-drafts/at.json --fix-seq
// Правки по замечаниям судей (круги 1–3) вносятся сюда, урок пересобирается. История замечаний — PROJECT.md «Урок At»
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
  const n = main('table', data, mode === 'dictator' ? { needs: 'audio — только для режима dictator', note: `ОЗВУЧКА таблицы (скрипт идёт по ячейкам слева направо, сверху вниз; метку «Проверить» поставить при монтаже после последней ячейки): ${script}` } : { note: `Таблица at: ${chatCaption}` })
  if (mode === 'demo') n.triggers = [{ if: 'timer', ms: 2200 }]
  return n
}
function SCENE(id, title, mode, timeline, characters = CAT_PIT) {
  return main('scene', { scene: { version: 2, id, title, location: 'cafe', characters, slots: SLOTS_CAFE, timeline, options: { bubbles: true } }, mode, showBubbles: mode === 'bubble', start: 'auto', crop: { x: 0, y: 0, scale: 1 } }, { note: mode === 'circle' ? 'СЦЕНА: кружок Пита, один кот крупно, без облачков (текст реплик в кружке не показывается). Озвучку записать кнопкой «Озвучить» в редакторе сцены' : 'СЦЕНА: диалог двух котов в пузыре. Озвучку записать в редакторе сцены' })
}
function zone(label, color) { zones.push({ label, color, x0: x - 150 }) }
function endZone() { zones.at(-1).x1 = x - STEP + 308 + 150; x += GAP }

// ───────────────────────────── ВХОД ─────────────────────────────
zone('Вход', '#b6fe3b')
SCENE('at-intro', 'Кот у кафе', 'circle', [
  { who: 'a', text: 'Стою у кафе, жду Кейт. Она пишет: where are you?', emotion: 'happy' },
  { who: 'a', text: 'Как ответить, что я у кафе? Сегодня разберём at.', emotion: 'surprised' },
])
WC(['I am at the cafe', 'I am on the cafe', 'I am to the cafe'], { wrongText: 'не совсем) когда ты в какой-то точке, нужно маленькое слово {g:at}:\n{g:I am at the cafe}' })
T('Да)) 🎯')
T('Как тебе удобнее: сначала разберём основу или сразу в практику?')
MENU(['Сначала объясни 📖', 'Сразу к практике 💪'], ['part1', 'train'])
endZone()

// ───────────────────────────── ЧАСТЬ 1 · at + место ─────────────────────────────
zone('Часть 1 · at + место', '#ffd166')
byKey.part1 = SYS('Часть 1 · at + место').ref
P('{g:at} это {l:точка на карте}: где ты сейчас, там и {g:at}', 'Мультяшная карта города с одной большой красной булавкой, рядом кот, без текста')
A('Кста, на русский {g:at} чаще всего переводят как {w:в} или {w:у}, но смысл один: {l:ты в конкретной точке}')
TABLE('demo', 'точка на карте', ['Кто', 'Точка', 'Где'], [['I am', 'at', 'home']])
A('Смотри: сначала кто, потом {g:at}, {l:и только потом место}, где ты находишься')
P('Том на работе, уже третий кофе ☕', 'Мультяшный парень за столом в офисе с ноутбуком и кофе, дневной свет, без текста')
T('как сказать {t:«Том на работе»}?')
PA('Tom is at work', ['in', 'to', 'she'], { responseWrong: 'не совсем) работа это точка, значит перед {g:work} нужно {g:at}', wrongText: 'не совсем) {w:работа} это точка, значит {g:Tom is at work}, без {x:in} и без {x:to}' })
R('💼')
A('Видишь? Работа это точка, и {g:at} её {l:показывает}. С домом и школой точно так же')
TABLE('dictator', 'где я нахожусь', ['Кто', 'Точка', 'Где'], [['I am', 'at', 'home'], ['Tom is', 'at', 'work']], { script: 'Смотри, теперь тут две фразы. I am, at, home, я дома. Tom is, at, work, Том на работе. И в обеих at стоит на одном месте, прямо перед точкой, где человек находится' })
PIN('{g:am} / {g:is} / {g:are} + {g:at} + {w:место}')
T('Мы с Кейт кстати застряли в аэропорту, рейс задерживают((')
S('Мультяшный кот сидит на чемодане в аэропорту и грустно смотрит на табло, светлый фон, без текста')
T('а как сказать {t:«мы в аэропорту»}?')
PA('We are at the airport', ['on', 'to', 'he'], { responseWrong: 'не совсем) аэропорт это точка, значит {g:at} перед {g:the airport}', wrongText: 'близко) мы в точке {w:аэропорт}, значит {g:We are at the airport}, слово {g:at} перед {g:the airport}' })
R('👏')
T('Давай на слух 👂')
A('{g:Tom is at school}', false)
WC(['Том в школе', 'Том идёт в школу', 'Том любит школу'], { wrongText: 'неа) {g:at school} это {t:в школе}, точка {w:школа}, поэтому {g:Tom is at school} это {t:Том в школе}', voicePhrase: 'Tom is at school' })
R('🙌')
A('Ой, а Кейт пишет, что опоздает, она застряла на вокзале')
P('', 'Мультяшная девушка с чемоданом на вокзале смотрит на табло, толпа, без текста')
A('Собери фразу: она на вокзале')
PA('She is at the station', ['on', 'to', 'at', 'he'], { responseWrong: 'не совсем) вокзал это точка, значит {g:at} перед {g:the station}', wrongText: 'неа) {w:вокзал} тоже точка, значит {g:She is at the station}, и {g:at} один раз' })
T('ага)), и вокзал туда же 🚉')
T('а здесь что нужно? выбирай:\n{g:I am ___ the gym}')
WC(['at', 'to', 'in'], { wrongText: 'неа) ты в точке {w:спортзал}, значит {g:at}:\n{g:I am at the gym}' })
T('да)) это {t:«я в спортзале»} 💪')
T('а {g:at} тут показывает, что {l:ты именно в этой точке}, а не идёшь туда')
A('Давай-ка вслух: скажи, где ты сейчас, начни с {g:I am at}, а дальше любое место')
SAY('I am at home', 'Я дома', { pattern: '(I am|I\'m) at **', startHint: 'I am at — я в', hintMismatch: 'Начни с I am at и добавь любое место, например home)', wrongText: 'близко) начни с {g:I am at} и добавь любое место)', listen: 'так-так, дай послушать)', comment: 'воу, ты уже говоришь про место без подсказок: {g:I am at} и дальше любая точка' })
endZone()

// ───────────────────────────── ЧАСТЬ 2 · at + время ─────────────────────────────
zone('Часть 2 · at + время', '#ef476f')
SYS('Часть 2 · at + время')
A('У {g:at} есть и вторая работа: оно {l:показывает точку во времени}, час или момент')
S('Мультяшный кот в шоке смотрит на часы, глаза круглые, светлый фон, без текста')
T('Вот кста пример: мы с Кейт встречаемся в семь, и час это тоже {l:точка}, только на часах ⏰')
P('Пит смотрит на часы на руке, Кейт на телефон, оба ждут семи ⏰', 'Два кадра рядом: мультяшный кот смотрит на наручные часы у кафе, девушка смотрит на телефон на улице, вечер, без текста')
T('как сказать {t:«мы встречаемся в семь»}?')
WC(['We meet at seven', 'We meet in seven', 'We meet on seven'], { wrongText: 'не совсем) час это точка на часах, значит {g:at}:\n{g:We meet at seven}' })
R('👏')
T('Смотри, как это выглядит рядом с местом')
TABLE('dictator', 'точка на часах', ['Кто', 'Точка', 'Где или когда'], [['I am', 'at', 'home'], ['We meet', 'at', 'seven']], { script: 'Ещё раз. I am, at, home, я дома, это точка на карте. We meet, at, seven, мы встречаемся в семь, это точка на часах. Слово одно, работа та же, показать точку' })
T('постараюсь тебя не запутать, но с частями дня есть хитрость)))')
S('Мультяшный кот хитро прищурился и улыбается, светлый фон, без текста')
P('Пит спит как убитый, за окном луна 😴', 'Мультяшный кот спит в кровати, за окном луна и звёзды, без текста')
A('Собери фразу: я сплю ночью')
PA('I sleep at night', ['in', 'on', 'we'], { responseWrong: 'не совсем) ночь это точка, значит {g:at} перед {g:night}', wrongText: 'близко) {w:ночь} это точка, значит {g:I sleep at night}, без {x:in}' })
R('😴')
A('Ночь англичане считают точкой, как и время на часах, поэтому {l:ночь это точка}, {g:at night}. А утро и вечер у них не точки, там своё слово, {g:in}')
REF('Про in и on ты можешь узнать в отдельном уроке', 'In')
TABLE('dictator', 'вся картина целиком', ['Что', 'Точка', 'Пример'], [['момент', 'at', 'at night'], ['час', 'at', 'at seven'], ['место', 'at', 'at work']], { script: 'Ох, сколько всего умеет это словечко! Начнём с ночи. Момент, at, at night, ночью, точка в сутках. Час, at, at seven, в семь, точка на часах. И уже знакомое место, at, at work, на работе, точка на карте. Везде одно и то же: показать точку' })
PIN('{g:at}: {w:точка} на карте и на часах')
T('У меня уже ночь, а я всё ещё не лёг((')
T('Напечатай {t:«в полночь»}, всего два слова: печатай тапами по светящимся буквам')
TW('at midnight', 'ea', 'близко) полночь это точка на часах, значит перед midnight нужно at', 'неа) {w:полночь} это точка на часах, значит {g:at midnight}')
T('огонь 🔥')
T('Теперь послушай 👂')
A('{g:We have lunch at one}', false)
WC(['Мы обедаем в час', 'Мы обедаем утром', 'Мы идём на обед'], { wrongText: 'близко) {g:lunch} это {t:обед}, а {g:at one} это {t:в час}, поэтому {g:We have lunch at one} это {t:мы обедаем в час}', voicePhrase: 'We have lunch at one' })
R('🍝')
A('А теперь про тебя: скажи, во сколько ты обычно ужинаешь, начни с {g:I have dinner at}, дальше любое время, засчитаю любое')
SAY('I have dinner at seven', 'Я ужинаю в семь', { pattern: 'I have dinner at **', startHint: 'I have dinner at — я ужинаю в', hintMismatch: 'Начни с I have dinner at и добавь любое время, например seven)', wrongText: 'не то) я никому не скажу, что ты делаешь по ночам, начни с {g:I have dinner at})', listen: 'ага, послушаю твой ужин)', comment: 'час после {g:at} у тебя встаёт сам, без запинки' })
endZone()

// ───────────────────────────── ЧАСТЬ 3 · look at, smile at ─────────────────────────────
zone('Часть 3 · at + взгляд', '#9b5de5')
SYS('Часть 3 · куда смотрим')
SCENE('at-duo', 'Кафе', 'bubble', [
  { who: 'a', text: 'Look at this cat!', emotion: 'surprised' },
  { who: 'b', text: 'Where? I am looking at my coffee.', emotion: 'neutral' },
  { who: 'a', text: 'He is at the window. He smiles at us!', emotion: 'happy' },
  { who: 'b', text: 'Oh. Now I see him. He is at the door.', emotion: 'happy' },
], { a: { kind: 'cat', gender: 'female', name: 'Кейт' }, b: { kind: 'cat', gender: 'male', name: 'Том' } })
A('Заметь, что говорила Кейт: {g:look at}, {t:посмотри на}. {l:Взгляд летит в точку}, и эту точку снова показывает {g:at}')
P('Кот смотрит прямо на тебя, не моргая 👀', 'Мультяшный кот смотрит прямо в камеру большими глазами, крупный план, без текста')
T('{g:look at me}, {t:посмотри на меня}: взгляд это {w:стрелка}, а {g:at} говорит, {l:куда она летит}')
T('Собери {t:«посмотри на это фото»}')
PA('Look at this photo', ['to', 'in', 'on'], { responseWrong: 'не совсем) взгляд летит в точку, значит {g:at} сразу после {g:Look}', wrongText: 'близко) взгляд летит в точку, значит {g:Look at this photo}, без {x:to}', signals: [{ slot: 2, text: '{g:this} это {t:этот}: мы показываем на конкретное фото, то самое' }] })
T('да)) взгляд долетел до фото 🎯')
T('зацени на слух 👂')
A('{g:She smiles at me}', false)
WC(['Она улыбается мне', 'Она идёт ко мне', 'Она смотрит на меня'], { wrongText: 'неа) {g:smiles at} это {t:улыбается кому-то}, поэтому {g:She smiles at me} это {t:она улыбается мне}', voicePhrase: 'She smiles at me' })
R('😊')
A('{l:Улыбка тоже летит в точку}: {g:smile at}, {t:улыбнуться кому-то}')
P('Том весь вечер улыбается, глядя на неё, а Кейт делает вид, что не замечает 😏', 'Мультяшный парень улыбается девушке за столиком кафе, вечер, свечи, без текста')
T('собери {t:«Том улыбается Кейт»}')
PA('Tom smiles at Kate', ['to', 'in', 'she'], { responseWrong: 'не совсем) улыбка летит к человеку, значит {g:at} перед именем', wrongText: 'неа) улыбка летит к человеку, значит {g:Tom smiles at Kate}, слово {g:at} перед именем' })
R('🔥')
A('Про себя: скажи, на что ты сейчас смотришь, начни с {g:I am looking at} или короче, {g:I\'m looking at}, подойдёт любой предмет')
SAY('I am looking at my phone', 'Я смотрю на телефон', { pattern: '(I am|I\'m) looking at **', startHint: 'I am looking at — я смотрю на', hintMismatch: 'Начни с I am looking at и добавь любое слово, например my phone)', wrongText: 'неа) {g:I am looking at} и любой предмет, хоть холодильник)', listen: 'секунду, включаю запись)', comment: 'ну вот, {g:looking at} у тебя уже звучит по-английски, осталось только выбирать, на что смотреть' })
endZone()

// ───────────────────────────── ИТОГ ─────────────────────────────
zone('Итог', '#06d6a0')
A('Вот и вся основа: {g:at} показывает {l:точку}, на карте, на часах и там, куда летит взгляд. Всю формулу соберём в самом конце, а пока выбирай: закончить или потренироваться')
MENU(['Закончить ✅', 'Ещё потренируюсь 💪'], ['final', 'train'])
endZone()

// ───────────────────────────── ТРЕНИРОВКА ─────────────────────────────
zone('Ещё практика', '#118ab2')
byKey.train = T('Ну раз с {g:at} ты уже знаком, давай проверим, как оно работает в деле 💪').ref
A('Будет семь уровней, и {l:каждый чуть сложнее} предыдущего')
byKey.lvl1 = LEVEL('Уровень 1 · разогрев').ref
T('Я в отпуске сижу в отеле и ем круассаны))')
T('как сказать {t:«я в отеле»}?')
PA('I am at the hotel', ['on', 'to', 'she'], { responseWrong: 'не совсем) отель это точка, значит {g:at} перед {g:the hotel}', wrongText: 'не совсем) {w:отель} это точка, значит {g:I am at the hotel}, без {x:on}' })
R('🥐')
P('Кейт сегодня в восемь встречает Тома, волнуется))', 'Мультяшная девушка собирается перед зеркалом, рядом часы показывают восемь, без текста')
T('а ну-ка, где тут точка на часах:\n{g:Kate meets Tom ___ eight}')
WC(['at', 'in', 'on'], { wrongText: 'неа) час это точка на часах, значит {g:at}:\n{g:Kate meets Tom at eight}' })
T('даа)) {t:«Кейт встречает Тома в восемь»}')
T('а ну-ка зацени на слух 👂')
A('{g:We are at the park}', false)
WC(['Мы в парке', 'Мы идём в парк', 'Мы любим парк'], { wrongText: 'близко) {g:at the park} это {t:в парке}, точка {w:парк}, поэтому {g:We are at the park} это {t:мы в парке}', voicePhrase: 'We are at the park' })
R('🌳')
A('Скажи вслух {t:«я на пляже»}: пляж это {g:beach}, начало ты знаешь')
SAY('I am at the beach', 'Я на пляже', { pattern: '(I am|I\'m) at the beach', startHint: 'I am at — я на', hintMismatch: '', wrongText: 'близко) скажи {g:I am at the beach}, пляж это точка', comment: 'да)) 🏖️' })
LEVEL('Уровень 2 · увереннее')
A('давай фразы подлиннее, но {l:точка всё та же}')
P('Кейт застряла в очереди в банке, пишет мне каждые пять минут((', 'Мультяшная девушка стоит в очереди в банке с телефоном, скучает, без текста')
T('собери {t:«она ждёт в банке»}')
PA('She is waiting at the bank', ['on', 'to', 'he'], { responseWrong: 'не совсем) банк это точка, значит {g:at} перед {g:the bank}', wrongText: 'не совсем) ждёт в точке {w:банк}, значит {g:She is waiting at the bank}' })
R('👌')
T('И на слух 👂')
A('{g:Tom gets up at five}', false)
WC(['Том встаёт в пять', 'Том спит до пяти', 'Том встаёт утром'], { wrongText: 'неа) {g:gets up} это {t:встаёт}, а {g:at five} это {t:в пять}, вместе {t:Том встаёт в пять}', voicePhrase: 'Tom gets up at five' })
R('⏰')
A('Своими словами: во сколько ты обычно встаёшь? Начни с {g:I get up at}, и любой час')
SAY('I get up at ten', 'Я встаю в десять', { pattern: 'I get up at **', startHint: 'I get up at — я встаю в', hintMismatch: 'Начни с I get up at и добавь любое время, например ten)', wrongText: 'не то) начни с {g:I get up at} и добавь любое время)', listen: 'дай-ка послушаю твою запись)', comment: 'после {g:at} ты просто ставишь свой час, вот и вся хитрость' })
P('Кейт в кафе не сводит глаз с Тома 👀', 'Мультяшная девушка в кафе смотрит на парня за соседним столиком, крупный план, без текста')
T('напечатай {t:«смотреть на Тома»}: взгляд летит {l:в точку}, печатай тапами по светящимся буквам')
TW('look at Tom', '', 'не то) взгляд летит к Тому, значит перед Tom нужно at', 'но нет) взгляд летит в точку, к Тому, значит {g:look at Tom}')
T('вооо, точность 🎯')
A('Ты быстро справляешься с заданиями, дальше всё поймёшь без объяснения, обещаю')
LEVEL('Уровень 3 · повтори за мной')
A('Соберём длинную фразу с конца, часть за частью: я говорю кусочек, ты его отзеркаливаешь вслух, с тем же ритмом')
A('{g:at the bus stop}', false)
SAY('at the bus stop', 'на остановке', { hintMismatch: '', wrongText: 'но нет) копируй ритм, {g:at the bus stop}', comment: 'ритм что надо 👌' })
T('Добавим начало, слушай')
A('{g:We wait at the bus stop}', false)
SAY('We wait at the bus stop', 'Мы ждём на остановке', { hintMismatch: '', wrongText: 'близко) кто ждёт? {g:We}, и дальше та же часть:\n{g:We wait at the bus stop}', comment: 'звучит великолепно! 🔥' })
P('Пит и Кейт у кинотеатра, билеты в руках 🎟️', 'Мультяшный кот и девушка стоят у входа в кинотеатр с билетами, вечер, без текста')
A('И новое из знакомых частей: собери, мы встречаемся у кинотеатра')
PA('We meet at the cinema', ['on', 'to', 'they'], { responseWrong: 'не совсем) кинотеатр это точка, значит {g:at} перед {g:the cinema}', wrongText: 'неа) склей две части: {g:We meet} и {g:at the cinema}' })
T('вот так оно и строится 🧱')
LEVEL('Уровень 4 · ловушки')
T('Хитрые случаи 😏 {t:«мы идём домой»}, нужна ли тут точка?\n{g:We go ___ home}')
WC(['ничего не нужно', 'at', 'to'], { wrongText: 'близко) идём это {w:движение}, а {g:at} это стою в точке, поэтому просто {g:We go home}' })
S('Мультяшный кот подмигивает и показывает большой палец, светлый фон, без текста')
A('{g:at home} это стою дома, в точке. А {g:go home} это движение, слово {g:home} уже само значит {t:домой}, поэтому {g:at} здесь {x:лишний}')
P('Кейт просит позвонить ей в полдень и напомнить купить сахар 📞', 'Мультяшный кот с телефоном и пакетом сахара на кухне, часы показывают полдень, без текста')
T('собери {t:«я тебе позвоню в полдень»}')
PA('I will call you at noon', ['in', 'ten', 'we'], { responseWrong: 'не совсем) полдень это точка на часах, значит {g:at} перед {g:noon}', wrongText: 'неа) {w:полдень} это точка на часах, значит {g:I will call you at noon}' })
T('полдень это точка 🕛')
T('Послушай, тут тоже ловушка 👂')
A('{g:Kate is at the door}', false)
WC(['Кейт у двери', 'Кейт идёт к двери', 'Кейт за дверью'], { wrongText: 'не совсем) {g:at the door} это {t:у двери}, точка {w:дверь}', voicePhrase: 'Kate is at the door' })
R('🚪')
A('Скажи вслух {t:«иди домой»}, двумя словами')
SAY('go home', 'иди домой', { hintMismatch: '', wrongText: 'не совсем) просто {g:go home}, точка тут {x:лишняя}', comment: 'отлично! именно так 😎', signals: [{ slot: 0, type: 'audio', text: 'Домой это движение, поэтому без {g:at}: два слова, первое {g:go}' }] })
TABLE('dictator', 'когда точка не нужна', ['Фраза', 'Нужен?', 'Почему'], [['go home', 'нет', 'движение'], ['at home', 'да', 'стою в точке']], { script: 'Подведём итог ловушек. Go home, иди домой, это движение. At home, дома, я стою в точке. Одно слово home, а разница в движении и конкретном месте' })
PIN('{g:go home} без точки, {g:at home} с точкой')
LEVEL('Уровень 5 · своими словами')
T('Том сидит в библиотеке и изучает карту, завтра в поход))')
S('Мультяшный кот с лупой внимательно разглядывает карту, светлый фон, без текста')
T('длинное предложение, получится? собери {t:«Том смотрит на карту в библиотеке»}, тут {g:at} понадобится два раза')
PA('Tom looks at the map at the library', ['in', 'to', 'she'], { responseWrong: 'не совсем) первый {g:at} ведёт взгляд, второй показывает место', wrongText: 'но-но-но) {g:looks at}, а потом ещё один {g:at}:\n{g:Tom looks at the map at the library}' })
T('Супер 😎')
A('Первый {g:at} ведёт взгляд к карте, а {l:второй показывает место}, библиотеку')
A('Где ты встречаешься с другом? Начни с {g:I meet}, назови имя, потом {g:at} и место')
SAY('I meet Kate at the cafe', 'Я встречаюсь с Кейт в кафе', { pattern: 'I meet * at **', startHint: 'I meet — я встречаю', hintMismatch: 'Начни с I meet, назови имя и добавь at и любое место, например at the cafe)', wrongText: 'не совсем) нужно сказать {g:I meet}, имя, {g:at} и любое место)', listen: 'ну-ка, что получилось)', comment: 'длинная фраза, а порядок на месте: {g:I meet}, имя, {g:at}, точка' })
T('Послушай внимательно 👂')
A('{g:Kate laughs at my jokes}', false)
WC(['Кейт смеётся над моими шутками', 'Кейт любит мои шутки', 'Кейт рассказывает шутки'], { wrongText: 'неа) {g:laughs at} это {t:смеётся над}, поэтому {g:Kate laughs at my jokes} это {t:Кейт смеётся над моими шутками}', voicePhrase: 'Kate laughs at my jokes' })
R('😂')
A('Смех, как и взгляд, {l:летит в точку}, поэтому {g:laughs at}, {t:смеётся над}')
A('Остался последний рывок, держись, будет быстро')
LEVEL('Уровень 6 · на скорость ⏱')
T('выбери верную фразу ⏱ {t:«Кейт улыбается мне»}')
WC(['Kate smiles at me', 'Kate smiles to me', 'Kate smiles me'], { wrongText: 'не совсем) улыбка летит в точку:\n{g:Kate smiles at me}', timeLimitSec: 7 })
R('⚡')
A('И ещё: собери, они встречаются в четыре')
PA('They meet at four', ['in', 'five', 'we'], { responseWrong: 'не совсем) час это точка, значит {g:at} перед {g:four}', wrongText: 'не то) час это точка, {g:They meet at four}', timeLimitSec: 12 })
T('быстро 🚀')
A('И то же вслух: начни с {g:They meet at}, время любое')
SAY('They meet at four', 'Они встречаются в четыре', { pattern: 'They meet at **', startHint: 'They meet at — они встречаются в', hintMismatch: 'Начни с They meet at и добавь любое время, например four)', wrongText: 'не то) начни с {g:They meet at} и добавь любое время)', listen: 'слушаю, что получилось)', comment: 'молния, и час после {g:at} на месте' })
S('Мультяшный кот с секундомером и наушниками, светлый фон, без текста')
A('{g:Look at the sky}', false)
WC(['Посмотри на небо', 'Посмотри в окно', 'Нарисуй небо'], { wrongText: 'не совсем) {g:look at} это {t:посмотри на}, а {g:sky} это {t:небо}', voicePhrase: 'Look at the sky', timeLimitSec: 6 })
R('🏁')
LEVEL('Уровень 7 · без подсказок')
S('Мультяшный кот в шоке с открытым ртом, добрался до последнего уровня, светлый фон, без текста')
T('Кейт пишет: я потерялась в торговом центре, ты где? 🛍️')
S('Мультяшная кошка в панике посреди торгового центра, светлый фон, без текста')
A('Ответь ей вслух, что ты ждёшь у входа: начни с {g:I am waiting at}, дальше по-своему')
SAY('I am waiting at the entrance', 'Я жду у входа', { pattern: '(I am|I\'m) waiting at **', hintsOff: true, startHint: 'I am waiting at — я жду у', hintMismatch: 'Начни с I am waiting at и добавь любое место, например the entrance)', wrongText: 'не то) начни так: {g:I am waiting at}, это {t:я жду у}, и добавь любое место', listen: 'так-так, послушаю)', comment: 'Кейт спасена, {g:I am waiting at} и точка, никаких лишних слов' })
A('{g:Look at the clock}', false)
WC(['Посмотри на часы', 'Посмотри в окно', 'Поставь часы'], { wrongText: 'неа) {g:look at} это {t:посмотри на}, а {g:clock} это {t:часы}', voicePhrase: 'Look at the clock' })
R('👏')
P('Пит шепчет Кейт: ну улыбнись ты ему уже 😊', 'Мультяшный кот шепчет девушке на ухо в кафе, парень за соседним столиком, без текста')
T('напечатай {t:«улыбнись ему»}')
TW('smile at him', 'et', 'не то) улыбка летит к нему, значит перед him нужно at', 'но нет) улыбка летит в точку, к нему, значит {g:smile at him}')
R('😊')
A('Неожиданность: Кейт зовёт тебя в кино, сеанс в шесть. Скажи ей, что встретимся в шесть, начни с {g:Let\'s meet at}')
SAY('Let\'s meet at six', 'Давай встретимся в шесть', { pattern: 'Let\'s meet at **', hintsOff: true, startHint: 'Let\'s meet at — давай встретимся в', hintMismatch: 'Начни с Let\'s meet at и добавь любое время, например six)', wrongText: 'не совсем) начни с {g:Let\'s meet at} и добавь любое время)', listen: 'секунду, слушаю)', comment: 'встреча назначена, {g:at} с часом тебе уже как родной' })
endZone()

// ───────────────────────────── ФИНАЛ ─────────────────────────────
zone('Финал', '#ff9f1c')
byKey.final = SYS('Финал').ref
T('Если коротко: {g:at} это {l:точка}, на карте, на часах и во взгляде, а при движении, {g:go home}, точка не нужна')
TABLE('dictator', 'вся формула at', ['Точка', 'at', 'Пример'], [['место', 'at', 'I am at work'], ['час', 'at', 'We meet at seven'], ['взгляд', 'at', 'Look at me'], ['не нужна', 'нет', 'go home']], { script: 'Смотри, всё вместе. Место, at, I am at work, я на работе. Час, at, We meet at seven, мы встречаемся в семь. Взгляд, at, Look at me, посмотри на меня. И когда точка не нужна: go home, иди домой, это движение. Три дела у одного слова, и одна ловушка' })
SCENE('at-outro', 'Кот уходит в кино', 'circle', [
  { who: 'a', text: 'Ну всё, at теперь твой, пользуйся на здоровье.', emotion: 'happy' },
  { who: 'a', text: 'А я убегаю, встречаемся с Кейт at six!', emotion: 'surprised' },
])
MENU(['Закончить ✅', 'Ещё один круг 💪'], ['bye', 'lvl1'])
const bye = T('Пока, и удачи с {g:at} 👋'); byKey.bye = bye.ref; bye.triggers = [{ if: 'timer', ms: 1500, then: null }]
endZone()

closeWrongs()
for (const { node, idx, key } of laterLinks) node.triggers[idx].then = byKey[key]
for (const n of nodes) { for (const t of n.triggers) if (t.then === undefined) t.then = null; delete n._side }
for (const n of nodes) if (n.type === 'text' && /: \{g:[^}]+\}\)?$/.test(n.data.content)) { n.data.content = n.data.content.replace(/: (\{g:[^}]+\}\)?)$/, ':\n$1'); n.data.hardWrap = true }

const out = {
  format: 'pithy-lesson', version: 1,
  lesson: { title: 'At', nodeCount: nodes.length },
  nodes: nodes.map((n, i) => ({ ref: n.ref, type: n.type, seq: i + 1, pos: n.pos, ...(n.note ? { note: n.note } : {}), ...(n.needs ? { needs: n.needs } : {}), data: n.data, triggers: n.triggers })),
  zones: zones.map((z, i) => ({ id: `zone-at-${i + 1}`, x: z.x0, y: -150, width: z.x1 - z.x0, height: 1040, label: z.label, color: z.color })),
  wordCard: {
    tag: 'служебное слово',
    nodes: [
      { type: 'text', text: '**at** показывает точку: где ты, во сколько, куда смотришь.' },
      { type: 'cases', items: [
        { label: 'место', example: 'I am **at** home', tr: 'я дома', mark: 0 },
        { label: 'час и момент', example: 'We meet **at** seven', tr: 'мы встречаемся в семь' },
        { label: 'взгляд', example: 'Look **at** me', tr: 'посмотри на меня' },
      ] },
      { type: 'dialog', lines: [
        { side: 'l', text: 'Where are you?', tr: 'Ты где?' },
        { side: 'r', text: 'I am **at** the cafe.', tr: 'Я в кафе.' },
        { side: 'l', text: 'I am not **at** home, I am **at** work.', tr: 'Я не дома, я на работе.', neg: true },
        { side: 'r', text: 'Let\'s meet **at** six!', tr: 'Давай встретимся в шесть!' },
      ] },
    ],
  },
}
writeFileSync(new URL('../at.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('nodes', nodes.length, 'zones', zones.length)

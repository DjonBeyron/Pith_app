// Генератор урока «At» (формат pithy-lesson) по скелету урока «To»: вход → 3 части → итог → тренировка 7 уровней → финал.
// Запуск: node lesson-drafts/gen/gen-at.mjs ; затем node scripts/lesson-gate.mjs lesson-drafts/at.json --fix-seq
// Правки по замечаниям судей (круг 1, 11 групп) вносятся сюда, урок пересобирается. История замечаний — PROJECT.md «Урок At»
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
function wrong(task, content, trig, skip = 1) {
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
function PA(words, distractors, { wrongText, responseWrong, timeLimitSec }) {
  const n = main('phrase_assembly', { words: words.split(' '), distractors: distractors.map(t => ({ text: t })), responseWrong, ...(timeLimitSec ? { timeLimitSec } : {}) })
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
function SAY(phraseText, translation, { pattern, startHint, hintMismatch, wrongText, listen, comment }) {
  const n = main('say_phrase', { lang: 'en-US', phrase: phraseText, translation, keywords: '', threshold: 70, strict: true, hintsOn: true, voiceReply: true, hintSilence: 'Не слышу тебя) говори чуть громче и ближе к микрофону', hintPartial: 'Близко) верно: {ok}, не хватило: {missed}', ...(pattern ? { pattern, startHint, hintMismatch } : { hintMismatch }) })
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
  { who: 'a', text: 'Как ответить, что я у кафе? Слово at сегодня.', emotion: 'surprised' },
])
WC(['I am at the cafe', 'I am in cafe', 'I am to the cafe'], { wrongText: 'не совсем) когда ты в какой-то точке, нужно маленькое слово {g:at}:\n{g:I am at the cafe}' })
T('Да)) именно так!')
T('Как тебе удобнее: сначала разберём основу или сразу в практику?')
MENU(['Сначала объясни 📖', 'Сразу к практике 💪'], ['part1', 'train'])
endZone()

// ───────────────────────────── ЧАСТЬ 1 · at + место ─────────────────────────────
zone('Часть 1 · at + место', '#b6fe3b')
byKey.part1 = SYS('Часть 1 · at + место').ref
T('{g:at} это {l:точка на карте}: где ты сейчас, там и {g:at}')
A('Кста, на русский {g:at} чаще всего переводят как {w:в} или {w:у}, но смысл один: {l:ты в конкретной точке}')
TABLE('demo', 'точка на карте', ['Кто', 'Точка', 'Где'], [['I am', 'at', 'home']])
A('Смотри: сначала кто, потом {g:at}, {l:и только потом место}, где ты находишься')
P('собери фразу {t:«я на работе»}', 'Мультяшный парень за столом в офисе с ноутбуком и кофе, дневной свет, без текста')
PA('I am at work', ['in', 'to', 'she'], { responseWrong: 'не совсем) нужны слова: я, есть, точка и работа', wrongText: 'не совсем) работа это точка, значит {g:I am at work}, без {x:in} и без {x:to}' })
T('да)) 💼')
A('Видишь? Работа это точка, и {g:at} её {l:показывает}. С домом и школой точно так же')
TABLE('dictator', 'где я нахожусь', ['Кто', 'Точка', 'Где'], [['I am', 'at', 'home'], ['Kate is', 'at', 'work']], { script: 'Смотри, теперь тут две фразы. I am, at, home, я дома. Kate is, at, work, Кейт на работе. И в обеих at стоит на одном месте, прямо перед точкой, где человек находится' })
PIN('{g:am} / {g:is} / {g:are} + {g:at} + {w:место}')
T('Я кстати застрял в аэропорту, рейс задерживают((')
S('Мультяшный кот сидит на чемодане в аэропорту и грустно смотрит на табло, светлый фон, без текста')
T('Ну как сказать {t:«мы в аэропорту»}?')
PA('We are at the airport', ['in', 'to', 'he'], { responseWrong: 'не совсем) нужны слова: we, are, at, the и airport', wrongText: 'близко) мы в точке {w:аэропорт}, значит {g:We are at the airport}, слово {g:at} перед {g:the airport}' })
R('👏')
T('Давай на слух 👂')
A('{g:Tom is at school}', false)
WC(['Том в школе', 'Том идёт в школу', 'Том любит школу'], { wrongText: 'не то) {g:at school} это {t:в школе}, точка {w:школа}, поэтому {g:Tom is at school} это {t:Том в школе}', voicePhrase: 'Tom is at school' })
T('ору, как быстро))')
A('Ой, а Кейт пишет, что опоздает, она застряла на вокзале')
P('собери {t:«она на вокзале»}', 'Мультяшная девушка с чемоданом на вокзале смотрит на табло, толпа, без текста')
PA('She is at the station', ['in', 'to', 'at', 'he'], { responseWrong: 'не совсем) нужны слова: she, is, at, the и station', wrongText: 'неа) вокзал тоже точка, значит {g:She is at the station}, и {g:at} один раз' })
T('да)) о май гащ, как быстро 😩')
T('Давай проверим, где прячется точка:\n{g:I am ___ the gym}')
WC(['at', 'in', 'to'], { wrongText: 'не то) ты в точке {w:спортзал}, значит {g:at}:\n{g:I am at the gym}' })
T('да)) это {t:«я в спортзале»}')
T('а {g:at} тут показывает, что {l:ты именно в этой точке}, а не идёшь туда')
endZone()

// ───────────────────────────── ЧАСТЬ 2 · at + время ─────────────────────────────
zone('Часть 2 · at + время', '#ffd166')
SYS('Часть 2 · at + время')
A('У {g:at} есть и вторая работа: оно {l:показывает точку во времени}, час или момент')
S('Мультяшный кот в шоке смотрит на часы, глаза круглые, светлый фон, без текста')
T('Вот кста пример: мы с Кейт встречаемся в семь, и час это тоже {l:точка}, только на часах ⏰')
P('как сказать {t:«мы встречаемся в семь»}?', 'Мультяшные парень и девушка смотрят на большие уличные часы, вечер, кафе на фоне, без текста')
WC(['We meet at seven', 'We meet in seven', 'We meet on seven'], { wrongText: 'но нет) час это точка на часах, значит {g:at}:\n{g:We meet at seven}' })
R('👏')
T('Смотри, как это выглядит рядом с местом')
TABLE('dictator', 'точка на часах', ['Кто', 'Точка', 'Когда'], [['We meet', 'at', 'seven'], ['I sleep', 'at', 'night']], { script: 'Ещё раз. We meet, at, seven, мы встречаемся в семь, это точка на часах. I sleep, at, night, я сплю ночью, это точка в сутках. Слово одно, работа та же, показать точку' })
T('постараюсь тебя не запутать, но с частями дня есть хитрость)))')
S('Мультяшный кот хитро прищурился и улыбается, светлый фон, без текста')
P('я ночью сплю как убитый 😴 собери {t:«я сплю ночью»}', 'Мультяшный парень спит в кровати, за окном луна и звёзды, без текста')
PA('I sleep at night', ['in', 'on', 'we'], { responseWrong: 'не совсем) нужны слова: I, sleep, at и night', wrongText: 'близко) ночь это точка, значит {g:I sleep at night}, без {x:in}' })
R('😴')
A('Ночь это короткий момент, в него не живёшь, а попадаешь, поэтому {l:ночь это точка} и {g:at night}')
A('А утро, день и вечер это долгие отрезки, в них можно быть часами, поэтому они идут с {g:in}: {g:in the morning}, {g:in the evening}')
A('Про {g:in} и {g:on} ты можешь узнать в отдельном уроке')
REF('Про in и on, в отдельном уроке', 'In')
TABLE('dictator', 'вся картина целиком', ['Что', 'Точка', 'Пример'], [['место', 'at', 'at work'], ['час', 'at', 'at seven'], ['момент', 'at', 'at night']], { script: 'Ох, сколько всего умеет at! Давай по порядку. Место, at, at work, на работе, точка на карте. Час, at, at seven, в семь, точка на часах. Момент, at, at night, ночью, точка в сутках. Везде одно и то же: at это точка' })
PIN('{g:at}: {w:точка} на карте и на часах')
T('У меня уже ночь, а я всё ещё не лёг((')
T('Напечатай {t:«в полночь»}, всего два слова')
TW('at midnight', 'ea', 'не то) полночь это точка на часах, значит at midnight', 'но нет) полночь это точка на часах, значит {g:at midnight}')
T('огонь))')
T('Теперь послушай 👂')
A('{g:We have lunch at one}', false)
WC(['Мы обедаем в час', 'Мы обедаем утром', 'Мы ужинаем в час'], { wrongText: 'близко) {g:lunch} это {t:обед}, а {g:at one} это {t:в час}, поэтому {g:We have lunch at one} это {t:мы обедаем в час}', voicePhrase: 'We have lunch at one' })
T('да))')
endZone()

// ───────────────────────────── ЧАСТЬ 3 · look at, smile at ─────────────────────────────
zone('Часть 3 · at + взгляд', '#ef476f')
SYS('Часть 3 · куда смотрим')
SCENE('at-duo', 'Кафе', 'bubble', [
  { who: 'a', text: 'Look at this cat!', emotion: 'surprised' },
  { who: 'b', text: 'Where? I am looking at my coffee.', emotion: 'neutral' },
  { who: 'a', text: 'He is at the window. He smiles at us!', emotion: 'happy' },
  { who: 'b', text: 'Oh. Now I see him. He is at the door.', emotion: 'happy' },
], { a: { kind: 'cat', gender: 'female', name: 'Кейт' }, b: { kind: 'cat', gender: 'male', name: 'Том' } })
A('Заметь, что говорила Кейт: {g:look at}, {t:посмотри на}. {l:Взгляд летит в точку}, и эту точку снова показывает {g:at}')
P('{g:look at me}, {t:посмотри на меня}: взгляд это {w:стрелка}, а {g:at} говорит, {l:куда она летит} 👀', 'Мультяшный кот смотрит прямо в камеру большими глазами, крупный план, без текста')
T('Собери {t:«посмотри на это фото»}')
PA('Look at this photo', ['to', 'in', 'on'], { responseWrong: 'не совсем) нужны слова: посмотри, точка, это и фото', wrongText: 'не то) взгляд летит в точку, значит {g:Look at this photo}, без {x:to}' })
T('ага, стрелка попала)')
T('Послушай-ка 👂')
A('{g:She smiles at me}', false)
WC(['Она улыбается мне', 'Она смеётся надо мной', 'Она смотрит на меня'], { wrongText: 'неа) {g:smiles at} это {t:улыбается кому-то}, поэтому {g:She smiles at me} это {t:она улыбается мне}', voicePhrase: 'She smiles at me' })
T('именно так)')
P('кста, Том сегодня весь вечер улыбается Кейт, а она делает вид, что не замечает 😏', 'Мультяшный парень улыбается девушке за столиком кафе, вечер, свечи, без текста')
T('Собери {t:«Том улыбается Кейт»}')
PA('Tom smiles at Kate', ['to', 'in', 'she'], { responseWrong: 'не совсем) нужны слова: Tom, smiles, at и Kate', wrongText: 'неа) улыбка летит к человеку, значит {g:Tom smiles at Kate}, слово {g:at} перед именем' })
R('😏')
A('{l:Улыбка тоже летит в точку}: {g:smile at}, {t:улыбнуться кому-то}. И смех тоже: {g:laugh at}, {t:смеяться над}, как в {g:Tom laughs at my jokes}')
A('Скажи вообще что угодно про то, где ты сейчас: начни с {g:I am at}, можно и короче, {g:I\'m at}, а дальше любое место, засчитаю любое')
SAY('I am at home', 'Я дома', { pattern: '(I am|I\'m) at **', startHint: 'I am at — я в\nI\'m at — то же, короче', hintMismatch: 'Начни с I am at или I\'m at и добавь любое место, например home)', wrongText: 'близко) начни с {g:I am at} и добавь любое место)', listen: 'так-так, дай послушать)', comment: 'воу, ты уже говоришь про место без подсказок: {g:I am at} и дальше любая точка' })
A('Ещё про себя: скажи, на что ты сейчас смотришь, начни с {g:I am looking at}, дальше любой предмет, засчитаю любой')
SAY('I am looking at my phone', 'Я смотрю на телефон', { pattern: '(I am|I\'m) looking at **', startHint: 'I am looking at — я смотрю на', hintMismatch: 'Начни с I am looking at и добавь любое слово, например my phone)', wrongText: 'не то) нужно сказать {g:I am looking at} и любой предмет)', comment: 'кек, я тоже сейчас смотрю в телефон 😄' })
endZone()

// ───────────────────────────── ИТОГ ─────────────────────────────
zone('Итог', '#06d6a0')
A('Мы повторили три работы {g:at}, и самое главное: {g:at} показывает {l:точку}, на карте, на часах и там, куда летит взгляд. С основой разобрались, теперь ты будешь слышать {g:at} в каждой второй фразе')
MENU(['Закончить ✅', 'Ещё потренируюсь 💪'], ['final', 'train'])
endZone()

// ───────────────────────────── ТРЕНИРОВКА ─────────────────────────────
zone('Ещё практика', '#118ab2')
byKey.train = T('Ну что, с {g:at} ты уже знаком, давай проверим, как оно работает в деле').ref
A('Будет семь уровней, и {l:каждый чуть сложнее} предыдущего')
byKey.lvl1 = LEVEL('Уровень 1 · разогрев').ref
T('Я в отпуске сижу в отеле и ем круассаны)) как сказать {t:«я в отеле»}?')
PA('I am at the hotel', ['in', 'to', 'she'], { responseWrong: 'не совсем) нужны слова: I, am, at, the и hotel', wrongText: 'не совсем) отель это точка, значит {g:I am at the hotel}, без {x:in}' })
T('В точку 👌')
P('Кейт сегодня встречает Тома в восемь, волнуется с утра))', 'Мультяшная девушка собирается перед зеркалом, рядом часы показывают восемь, без текста')
T('Вставь пропущенное слово:\n{g:Kate meets Tom ___ eight}')
WC(['at', 'in', 'on'], { wrongText: 'неа) час это точка на часах, значит {g:at}:\n{g:Kate meets Tom at eight}' })
T('даа)) {g:at} тут точка на часах')
T('Ну-ка, послушай 👂')
A('{g:We are at the park}', false)
WC(['Мы в парке', 'Мы идём в парк', 'Мы любим парк'], { wrongText: 'близко) {g:at the park} это {t:в парке}, точка {w:парк}, поэтому {g:We are at the park} это {t:мы в парке}', voicePhrase: 'We are at the park' })
T('красава)')
A('Скажи вслух {t:«я на пляже»}: пляж это {g:beach}, а начало ты знаешь, полное {g:I am} или короткое {g:I\'m}, обе формы в ходу')
SAY('I am at the beach', 'Я на пляже', { pattern: '(I am|I\'m) at the beach', startHint: 'I am at — я на', hintMismatch: 'Скажи: I am at the beach, можно I\'m at the beach)', wrongText: 'не то) скажи {g:I am at the beach}, пляж это точка', comment: 'да)) 🏖️' })
LEVEL('Уровень 2 · увереннее')
A('Теперь фразы подлиннее, но {l:точка всё та же}')
P('Кейт застряла в очереди в банке, пишет мне каждые пять минут(( собери {t:«она ждёт в банке»}', 'Мультяшная девушка стоит в очереди в банке с телефоном, скучает, без текста')
PA('She is waiting at the bank', ['in', 'to', 'he'], { responseWrong: 'не совсем) нужны слова: she, is, waiting, at, the и bank', wrongText: 'не совсем) ждёт в точке {w:банк}, значит {g:She is waiting at the bank}' })
R('👌')
T('А теперь на слух 👂')
A('{g:Tom gets up at five}', false)
WC(['Том встаёт в пять', 'Том спит до пяти', 'Том встаёт утром'], { wrongText: 'неа) {g:gets up} это {t:встаёт}, а {g:at five} это {t:в пять}, вместе {t:Том встаёт в пять}', voicePhrase: 'Tom gets up at five' })
T('да)')
A('Теперь своими словами: скажи, во сколько ты обычно встаёшь, начни с {g:I get up at}, а дальше любое время, засчитаю любое')
SAY('I get up at ten', 'Я встаю в десять', { pattern: 'I get up at **', startHint: 'I get up at — я встаю в', hintMismatch: 'Начни с I get up at и добавь любое время, например ten)', wrongText: 'не то) начни с {g:I get up at} и добавь любое время)', listen: 'включаю твою запись, слушаю)', comment: 'после {g:at} ты просто ставишь свой час, вот и вся хитрость' })
P('Теперь напечатай {t:«смотреть на Сэма»}: сначала {g:look}, а остальное допиши без подсказки', 'Мультяшный кот смотрит на парня в кафе, крупный план, без текста')
TW('look at Sam', '', 'не то) взгляд летит к Сэму, значит look at Sam', 'но нет) взгляд летит в точку, к Сэму, значит {g:look at Sam}')
T('вооо, точность))')
A('Ты быстро справляешься с заданиями, а теперь повторяй за мной, тут всё поймёшь без объяснения')
LEVEL('Уровень 3 · повтори за мной')
A('Соберём длинную фразу с конца, кусок за куском: я говорю кусочек, а ты повторяешь его вслух за мной, с тем же ритмом')
A('{g:at the bus stop}', false)
SAY('at the bus stop', 'на остановке', { hintMismatch: 'Скажи ровно этот кусок: at the bus stop)', wrongText: 'не то) копируй ритм, {g:at the bus stop}', comment: 'ритм тот самый 👌' })
P('Теперь добавим начало и скажем целиком, голосом: {t:«мы ждём на остановке»}', 'Мультяшные парень и девушка стоят на автобусной остановке под навесом, дождь, без текста')
SAY('We wait at the bus stop', 'Мы ждём на остановке', { hintMismatch: 'Скажи всю фразу: We wait at the bus stop)', wrongText: 'близко) кто ждёт? {g:We}, и дальше тот же кусок:\n{g:We wait at the bus stop}', comment: 'ага, звучит как надо 🔥' })
T('Теперь соберём новое из знакомых кусков: {t:«я жду у кинотеатра»}, оба куска ты уже знаешь')
PA('I wait at the cinema', ['in', 'to', 'they'], { responseWrong: 'не совсем) нужны слова: I, wait, at, the и cinema', wrongText: 'но нет) склей два куска: {g:I wait} и {g:at the cinema}' })
T('Вот так оно и строится)')
LEVEL('Уровень 4 · ловушки')
T('А теперь хитрые случаи 😏 {t:«мы идём домой»}, нужна ли тут точка?\n{g:We go ___ home}')
WC(['ничего не нужно', 'at', 'to'], { wrongText: 'близко) идём это движение, а {g:at} это стою в точке, поэтому просто {g:We go home}' })
S('Мультяшный кот подмигивает и показывает большой палец, светлый фон, без текста')
A('{g:at home} это стою дома, в точке. А {g:go home} это движение, слово {g:home} уже само значит домой, поэтому {g:at} здесь {l:лишний}')
P('И ещё одна ловушка: Кейт просит позвонить ей в полдень, собери {t:«я тебе позвоню в полдень»}', 'Мультяшный парень с телефоном смотрит на часы, стрелки на двенадцати, без текста')
PA('I will call you at noon', ['in', 'on', 'we'], { responseWrong: 'не совсем) нужны слова: I, will, call, you, at и noon', wrongText: 'неа) полдень это точка на часах, значит {g:I will call you at noon}' })
T('полдень это точка 😎')
T('Послушай, тут тоже ловушка 👂')
A('{g:They go home at nine}', false)
WC(['Они идут домой в девять', 'Они дома в девять', 'Они идут домой утром'], { wrongText: 'не совсем) {g:go home} это {t:идут домой}, а {g:at nine} это {t:в девять}', voicePhrase: 'They go home at nine' })
T('в точку))')
A('Скажи вслух {t:«иди домой»}, двумя словами и без точки')
SAY('go home', 'иди домой', { hintMismatch: 'Скажи: go home, без at)', wrongText: 'не то) просто {g:go home}, точка тут {x:лишняя}', comment: 'вот так, без лишнего)' })
TABLE('dictator', 'когда точка не нужна', ['Фраза', 'at?', 'Почему'], [['go home', 'нет', 'движение, не точка'], ['in the morning', 'нет', 'долгий отрезок']], { script: 'Подведём итог ловушек. Go home, нет, это движение, а не точка. In the morning, нет, утро долгий отрезок, а не точка. Зато ночь и полдень это точки, at night, at noon' })
PIN('точка не нужна: {g:go home}, {g:in the morning}')
LEVEL('Уровень 5 · своими словами')
S('Мультяшный кот в шоке с открытым ртом, светлый фон, без текста')
T('Кейт ночью не спит, сидит и смотрит на звёзды)) длинное предложение, получится? {t:«Кейт смотрит на небо ночью»}')
PA('Kate looks at the sky at night', ['in', 'to', 'she'], { responseWrong: 'не совсем) нужны слова: Kate, looks, at, the, sky, at и night', wrongText: 'неа) {g:looks at}, а потом ещё один {g:at}:\n{g:Kate looks at the sky at night}' })
T('Супер 😎')
A('Первый {g:at} ведёт взгляд к небу, а {l:второй показывает момент}, ночь')
A('Скажи вслух, где ты встречаешься с Кейт или с другом: начни с {g:I meet}, назови имя, потом {g:at} и любое место, засчитаю любое')
SAY('I meet Kate at the cafe', 'Я встречаюсь с Кейт в кафе', { pattern: 'I meet * at **', startHint: 'I meet — я встречаю', hintMismatch: 'Начни с I meet, назови имя и добавь at и любое место, например at the cafe)', wrongText: 'не совсем) нужно сказать {g:I meet}, имя, {g:at} и любое место)', comment: 'ого, длинная фраза, а порядок на месте 🤝' })
T('Послушай внимательно 👂')
A('{g:Tom laughs at my jokes}', false)
WC(['Том смеётся над моими шутками', 'Том любит мои шутки', 'Том рассказывает шутки'], { wrongText: 'неа) {g:laughs at} это {t:смеётся над}, поэтому {g:Tom laughs at my jokes} это {t:Том смеётся над моими шутками}', voicePhrase: 'Tom laughs at my jokes' })
T('кек, Том такой)')
A('Смех, как и взгляд, {l:летит в точку}, поэтому {g:laughs at}')
A('Ничего себе, как ты быстро, остался последний рывок на скорость')
LEVEL('Уровень 6 · на скорость ⏱')
T('На скорость ⏱ выбери верную фразу: {t:«Том улыбается Анне»}')
WC(['Tom smiles at Anna', 'Tom smiles to Anna', 'Tom smiles Anna'], { wrongText: 'не совсем) улыбка летит в точку:\n{g:Tom smiles at Anna}', timeLimitSec: 7 })
T('быстро 🚀')
A('И ещё раз, на скорость: собери {t:«они встречаются в четыре»}')
PA('They meet at four', ['in', 'on', 'we'], { responseWrong: 'не совсем) нужны слова: they, meet, at и four', wrongText: 'не то) час это точка, {g:They meet at four}', timeLimitSec: 12 })
T('Ого, как быстро)')
P('И ещё быстрее ⏱ выбери {t:«посмотри на небо»}', 'Мультяшный кот задрал голову и смотрит в звёздное небо, без текста')
WC(['Look at the sky', 'Look in the sky', 'Look to the sky'], { wrongText: 'не совсем) взгляд летит в точку, {g:Look at the sky}', timeLimitSec: 5 })
T('молния))')
LEVEL('Уровень 7 · без подсказок')
S('Мультяшный кот в шоке с открытым ртом, добрался до последнего уровня, светлый фон, без текста')
T('Кейт пишет: я потерялась в торговом центре, ты где?')
S('Мультяшная кошка в панике посреди торгового центра, светлый фон, без текста')
A('Ответь ей вслух, что ты ждёшь у входа, и говори по-своему, без подсказок, засчитаю любое место')
SAY('I am waiting at the entrance', 'Я жду у входа', { pattern: '(I am|I\'m) waiting at **', startHint: 'I am waiting at — я жду у', hintMismatch: 'Начни с I am waiting at и добавь любое место, например the entrance)', wrongText: 'не то) начни так: {g:I am waiting at}, это я жду у, и добавь любое место', comment: 'ну всё, Кейт спасена))' })
T('И без подсказок, на слух 👂')
A('{g:Look at the clock}', false)
WC(['Посмотри на часы', 'Посмотри на небо', 'Поставь часы'], { wrongText: 'неа) {g:look at} это {t:посмотри на}, а {g:clock} это {t:часы}', voicePhrase: 'Look at the clock' })
R('👏')
P('и ещё без подсказок: напечатай {t:«улыбнись Тому»}', 'Мультяшная девушка улыбается парню через столик кафе, тёплый свет, без текста')
TW('smile at Tom', '', 'не то) улыбка летит к Тому, значит smile at Tom', 'но нет) улыбка летит в точку, к Тому, значит {g:smile at Tom}')
T('Вот так 🔥')
A('Неожиданность: Кейт нашлась и зовёт тебя в кино, сеанс в шесть. Скажи ей, что встретимся в шесть: начни с {g:Let\'s meet at}, дальше любое время, засчитаю любое')
SAY('Let\'s meet at six', 'Давай встретимся в шесть', { pattern: 'Let\'s meet at **', startHint: 'Let\'s meet at — давай встретимся в', hintMismatch: 'Начни с Let\'s meet at и добавь любое время, например six)', wrongText: 'не совсем) начни с {g:Let\'s meet at} и добавь любое время)', listen: 'Дай послушать)', comment: 'Ну всё, встреча назначена, {g:at} с часом тебе уже как родной' })
endZone()

// ───────────────────────────── ФИНАЛ ─────────────────────────────
zone('Финал', '#06d6a0')
byKey.final = SYS('Финал').ref
T('Мы повторили всё, и самое главное: {g:at} это всегда {l:точка}')
A('Давай соберём всё в одну картинку, чтобы точно не потерялось')
TABLE('dictator', 'вся формула at', ['Точка', 'at', 'Пример'], [['место', 'at', 'I am at work'], ['час', 'at', 'We meet at seven'], ['взгляд', 'at', 'Look at me'], ['не нужна', 'нет', 'go home']], { script: 'Смотри, всё вместе. Место, at, I am at work, я на работе. Час, at, We meet at seven, мы встречаемся в семь. Взгляд, at, Look at me, посмотри на меня. И когда точка не нужна, нет, go home, иди домой. Три дела у одного слова, и одна ловушка' })
SCENE('at-outro', 'Кот уходит в кино', 'circle', [
  { who: 'a', text: 'Итог: at показывает точку, место, час и взгляд.', emotion: 'happy' },
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

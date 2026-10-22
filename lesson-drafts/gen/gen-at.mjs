// Генератор урока «At» (формат pithy-lesson) по скелету урока «To»: вход → 3 части → итог → тренировка 7 уровней → финал.
// Запуск: node gen-at.mjs > /home/user/Pith_app/lesson-drafts/at.json ; затем шлюз с --fix-seq
import { writeFileSync } from 'node:fs'

const STEP = 560, GAP = 1300, ERR_Y = 480, SIDE_Y = 240
const nodes = [], zones = []
let x = 0, refN = 0
const newRef = () => `n${++refN}`
const byKey = {}
const laterLinks = [] // [{node, trig, key}] — ссылки на ещё не созданные ноды

const CAT_PIT = { a: { kind: 'cat', gender: 'male', name: 'Пит', palette: { fur: '#f2a65a', belly: '#fde7c8', accent: '#f6a9a3', eye: '#5aa36b', stripe: '#d9843d' }, stripes: true, voice: { pitch: 1, rate: 1 } } }
const SLOTS_CAFE = { table: 'table', 'table-left': 'pastry-plate', window: 'window', 'wall-menu': 'menu-board', 'wall-art': 'picture', ceiling: 'pendant-lamp', counter: 'coffee-machine', 'floor-left': 'plant', 'floor-right': 'floor-lamp', 'table-right': 'laptop' }

function push(n, { key, y = 0, dx = STEP } = {}) {
  n.ref ??= newRef()
  n.pos ??= [x, y]
  if (y === 0 && !n._side) x += dx
  nodes.push(n)
  if (key) byKey[key] = n.ref
  return n
}
const prev = () => nodes.filter(n => n.pos[1] === 0 && !n._side).at(-1)
// Связать последнюю ноду главного ряда со следующей, если у неё ещё нет перехода «дальше»
function link(from, to, trig) {
  if (!from) return
  const t = from.triggers.find(t => t.then === undefined)
  if (t) t.then = to
}
const NEXT = { text: 'timer', audio: 'played', photo: 'timer', sticker: 'timer', reaction: 'timer', system: 'timer', pin_message: 'timer', lesson_ref: 'timer', scene: 'played', table: 'table_correct', word_choice: 'word_correct', phrase_assembly: 'phrase_correct', type_word: 'type_correct', say_phrase: 'say_done' }
const MS = { text: 1500, photo: 2200, sticker: 1200, reaction: 1400, system: 1600, pin_message: 1800, lesson_ref: 2000, table: 2200 }

// Добавить ноду в главный ряд и подцепить к предыдущей
function main(type, data, extra = {}) {
  const p = prev()
  const n = { type, data, triggers: [], ...extra }
  const trig = { if: NEXT[type] }
  if (MS[type] && NEXT[type] === 'timer') trig.ms = MS[type]
  n.triggers.push(trig)
  if (type === 'table') n.triggers.push({ if: 'table_wrong', then: null })
  push(n, extra._opts ?? {})
  if (p) link(p, n.ref, NEXT[p.type])
  return n
}
const text = (content, extra) => main('text', { content, hardWrap: content.includes('\n') }, extra)
const audio = (t, showText = true, extra) => main('audio', { text: t, showText }, { needs: 'audio — озвучка реплики', note: `ОЗВУЧКА: ${t.replace(/\{[a-z]:([^}]*)\}/g, '$1')}`, ...extra })
const photo = (caption, imagePrompt, extra) => main('photo', { caption, imagePrompt, crop: { x: 0, y: 0, scale: 1 } }, { needs: 'photo', note: 'ФОТО: сгенерировать в редакторе по imagePrompt', ...extra })
const sticker = imagePrompt => main('sticker', { imagePrompt, crop: { x: 0, y: 0, scale: 1 }, muted: true, isVideo: false, autoSound: false }, { needs: 'photo/video — сам стикер', note: 'СТИКЕР: сгенерировать в редакторе по imagePrompt' })
const reaction = emoji => main('reaction', { emoji, target: 'student' })
const system = content => main('system', { content })
const pin = content => main('pin_message', { content })
const lessonRef = (caption, targetTitle) => main('lesson_ref', { caption, isModule: false, targetTitle }, { note: `ССЫЛКА: в редакторе выбрать урок «${targetTitle}» (targetId)` })

// Ветка ошибки: текст под заданием (y = 480), возвращается в главный ряд ПОСЛЕ реакции на верный ответ (как в «To»)
const pendingWrong = []
function wrong(task, content, trigName) {
  const w = { type: 'text', data: { content, hardWrap: content.includes('\n') }, triggers: [{ if: 'timer', ms: 1500 }], _side: true, pos: [task.pos[0], ERR_Y] }
  push(w)
  task.triggers.push({ if: trigName, then: w.ref })
  pendingWrong.push({ w, after: task })
}
// После реакции на задание: ветка ошибки минует реакцию и идёт в следующую ноду главного ряда
function closeWrongs() {
  for (const { w, after } of pendingWrong) {
    const i = nodes.indexOf(after)
    const rest = nodes.slice(i + 1).filter(n => !n._side && n.pos[1] === 0)
    const target = rest[0]?.type === 'reaction' || /^(в точку|да\)|ага|ору|точно|чётко|вооо|супер|огонь|именно|быстро|молния|вот так|ну всё|слышу|да\)\))/i.test(String(rest[0]?.data?.content ?? '')) ? rest[1] : rest[0]
    w.triggers[0].then = target.ref
  }
  pendingWrong.length = 0
}

function wordChoice(options, { wrongText, correctIndex = 0, voicePhrase } = {}) {
  const n = main('word_choice', { options: options.map((t, i) => ({ text: t, isCorrect: i === correctIndex })), sendPickToChat: true, ...(voicePhrase ? { voicePhrase } : {}) })
  for (const t of options) n.triggers.push({ if: 'variant', variantLabel: t, then: null })
  if (wrongText) wrong(n, wrongText, 'word_wrong'); else n.triggers.push({ if: 'word_wrong', then: null })
  return n
}
function menu(options, keys) {
  const n = main('word_choice', { reward: false, options: options.map(t => ({ text: t, isCorrect: true })), sendPickToChat: true }, { note: 'Меню-развилка, не тест' })
  n.triggers.push({ if: 'word_wrong', then: null })
  options.forEach((t, i) => { n.triggers.push({ if: 'variant', variantLabel: t, then: undefined }); laterLinks.push({ node: n, idx: n.triggers.length - 1, key: keys[i] }) })
  return n
}
function phrase(words, distractors, { wrongText, responseWrong, answers }) {
  const n = main('phrase_assembly', { words: words.split(' '), distractors: distractors.map(t => ({ text: t })), responseWrong, ...(answers ? { answers: answers.map(a => a.split(' ')) } : {}) })
  for (const t of distractors) n.triggers.push({ if: 'variant', variantLabel: t, then: null })
  wrong(n, wrongText, 'phrase_wrong')
  return n
}
function typeWord(word, extraLetters, responseWrong, wrongText) {
  const n = main('type_word', { word, extraLetters, responseWrong })
  wrong(n, wrongText, 'type_wrong')
  return n
}
function say(phraseText, translation, { pattern, startHint, hintMismatch, wrongText, keywords = '' }) {
  const n = main('say_phrase', { lang: 'en-US', phrase: phraseText, translation, keywords, threshold: 70, strict: true, hintsOn: true, voiceReply: true, hintSilence: 'Не слышу тебя) говори чуть громче и ближе к микрофону', hintPartial: 'Близко) верно: {ok}, не хватило: {missed}', ...(pattern ? { pattern, startHint, hintMismatch } : { hintMismatch }) })
  wrong(n, wrongText, 'say_wrong')
  return n
}
// Голосовой комментарий к записи ученика: text «дай послушать» → audio сбоку (y 240) → дальше
function ownVoice(listenText, comment) {
  const t = text(listenText)
  const a = { type: 'audio', data: { text: comment, showText: true }, triggers: [{ if: 'played' }], _side: true, pos: [t.pos[0], SIDE_Y], needs: 'audio — озвучка реплики', note: `ОЗВУЧКА: ${comment.replace(/\{[a-z]:([^}]*)\}/g, '$1')}` }
  push(a)
  t.triggers[0].then = a.ref
  const r = { type: 'reaction', data: { emoji: '🔥', target: 'student' }, triggers: [{ if: 'timer', ms: 1400 }], _side: true, pos: [t.pos[0] + 280, SIDE_Y] }
  push(r)
  a.triggers[0].then = r.ref
  pendingSide = r
}
let pendingSide = null
const _main = main
function mainWrap(type, data, extra) {
  const n = _main(type, data, extra)
  if (pendingSide) { pendingSide.triggers[0].then = n.ref; pendingSide = null }
  return n
}

function table(mode, chatCaption, head, rows, { script, widths } = {}) {
  const cells = []
  head.forEach((v, c) => cells.push({ id: `h${c}`, col: c, row: 0, value: v, colspan: 1, rowspan: 1, fontSize: 11, isHeader: true }))
  rows.forEach((r, ri) => r.forEach((v, c) => cells.push({ id: `r${ri}c${c}`, col: c, row: ri + 1, value: v, colspan: 1, rowspan: 1, fontSize: c === 1 && head.length === 3 ? 15 : 13 })))
  const rowCount = rows.length + 1
  const data = {
    mode,
    table: { rows: Array.from({ length: rowCount }, (_, i) => ({ id: `r${i}`, heightPct: Math.round(100 / rowCount) })), cells, columns: head.map((_, i) => ({ id: `c${i}`, widthPct: (widths ?? (head.length === 3 ? [38, 22, 40] : [50, 50]))[i] })), colCount: head.length, rowCount },
    chatCaption,
    ...(mode === 'dictator' ? { script, sendToChat: true } : {}),
  }
  const extra = mode === 'dictator' ? { needs: 'audio — только для режима dictator', note: `ОЗВУЧКА таблицы: ${script}` } : { note: `Таблица at: ${chatCaption}` }
  const n = mainWrap('table', data, extra)
  if (mode === 'demo') { n.triggers = [{ if: 'timer', ms: 2200 }] }
  return n
}
function scene(id, title, mode, timeline, characters = CAT_PIT, location = 'cafe') {
  return mainWrap('scene', { scene: { version: 2, id, title, location, characters, slots: SLOTS_CAFE, timeline, options: { bubbles: true } }, mode, showBubbles: mode === 'bubble', start: 'auto', crop: { x: 0, y: 0, scale: 1 } }, { note: mode === 'circle' ? 'СЦЕНА: кружок Пита, один кот крупно, без облачков. Озвучку записать кнопкой «Озвучить» в редакторе сцены' : 'СЦЕНА: диалог двух котов в пузыре. Озвучку записать в редакторе сцены' })
}
function zone(label, color) {
  const z = { label, color, x0: x - 150 }
  zones.push(z)
  return z
}
function endZone() { const z = zones.at(-1); z.x1 = x - STEP + 308 + 150; x += GAP }

// Переопределяем main на обёртку с боковыми аудио
const T = (c, e) => { const n = mainWrap('text', { content: c, hardWrap: c.includes('\n') }, e); return n }
const A = (t, show = true) => mainWrap('audio', { text: t, showText: show }, { needs: 'audio — озвучка реплики', note: `ОЗВУЧКА: ${t.replace(/\{[a-z]:([^}]*)\}/g, '$1')}` })
const P = (caption, imagePrompt) => mainWrap('photo', { caption, imagePrompt, crop: { x: 0, y: 0, scale: 1 } }, { needs: 'photo', note: 'ФОТО: сгенерировать в редакторе по imagePrompt' })
const S = imagePrompt => mainWrap('sticker', { imagePrompt, crop: { x: 0, y: 0, scale: 1 }, muted: true, isVideo: false, autoSound: false }, { needs: 'photo/video — сам стикер', note: 'СТИКЕР: сгенерировать в редакторе по imagePrompt' })
const R = emoji => mainWrap('reaction', { emoji, target: 'student' })
const SYS = c => mainWrap('system', { content: c })
const PIN = c => mainWrap('pin_message', { content: c })
const REF = (caption, targetTitle) => mainWrap('lesson_ref', { caption, isModule: false, targetTitle }, { note: `ССЫЛКА: в редакторе выбрать урок «${targetTitle}» (targetId)` })
// word_choice / phrase / type / say через обёртку
const WC = (opts, o) => { const n = wordChoice(opts, o); if (pendingSide) { pendingSide.triggers[0].then = n.ref; pendingSide = null } return n }
const PA = (w, d, o) => { const n = phrase(w, d, o); if (pendingSide) { pendingSide.triggers[0].then = n.ref; pendingSide = null } return n }
const TW = (w, e, r, t) => { const n = typeWord(w, e, r, t); if (pendingSide) { pendingSide.triggers[0].then = n.ref; pendingSide = null } return n }
const SAY = (p, tr, o) => { const n = say(p, tr, o); if (pendingSide) { pendingSide.triggers[0].then = n.ref; pendingSide = null } return n }
const MENU = (o, k) => { const n = menu(o, k); if (pendingSide) { pendingSide.triggers[0].then = n.ref; pendingSide = null } return n }

// ───────────────────────────── ВХОД ─────────────────────────────
zone('Вход', '#b6fe3b')
scene('at-intro', 'Кот у кафе', 'circle', [
  { who: 'a', text: 'Стою у кафе, жду Кейт. Она пишет: where are you?', emotion: 'happy' },
  { who: 'a', text: 'Как ответить «я у кафе»? Слово at сегодня.', emotion: 'surprised' },
])
WC(['I am at the cafe', 'I am in cafe', 'I am to the cafe'], { wrongText: 'не совсем) когда ты в какой-то точке, нужно маленькое слово {g:at}: {g:I am at the cafe}' })
T('Да)) именно так!')
T('как тебе удобнее: сначала разберём основу или сразу в практику?')
MENU(['Сначала объясни 📖', 'Сразу к практике 💪'], ['part1', 'train'])
endZone()

// ───────────────────────────── ЧАСТЬ 1 · at + место ─────────────────────────────
zone('Часть 1 · at + место', '#b6fe3b')
byKey.part1 = null
const p1 = SYS('Часть 1 · at + место'); byKey.part1 = p1.ref
T('{g:at} это {l:точка на карте}: где ты сейчас, там и {g:at}')
A('Кста, на русский {g:at} чаще всего переводят как в или у, но смысл один: {l:ты в конкретной точке}')
table('demo', 'точка на карте', ['Кто', 'Точка', 'Где'], [['I am', 'at', 'home']])
A('Смотри: сначала кто, потом {g:at}, {l:и только потом место}, где ты находишься')
P('а ну-ка попробуй сказать {t:«я дома»}, точку покажет {g:at}', 'Мультяшный парень лежит на диване дома с чашкой чая, уютная комната, тёплый свет, без текста')
PA('I am at home', ['in', 'to', 'she'], { responseWrong: 'не совсем) нужны слова: я, есть, точка и дом', wrongText: 'не совсем) ты в точке {w:дом}, значит {g:I am at home}, без {g:in} и без {g:to}' })
T('да)) 🏠')
A('Видишь? Дом это точка, и {g:at} её {l:показывает}. С работой и школой точно так же')
table('dictator', 'где я нахожусь', ['Кто', 'Точка', 'Где'], [['I am', 'at', 'home'], ['Kate is', 'at', 'work']], { script: 'Смотри, теперь тут две фразы. I am at home, я дома, и Kate is at work, Кейт на работе. И в обеих at стоит на одном месте, прямо перед точкой, где человек находится' })
PIN('{g:am} / {g:is} / {g:are} + {g:at} + {w:место}')
T('я кстати сейчас сижу в кафе и пью третий кофе))')
S('Мультяшный кот с огромной чашкой кофе, довольный, светлый фон, без текста')
T('ну как сказать {t:«мы в кафе»}? точку снова покажет {g:at}')
PA('We are at the cafe', ['in', 'to', 'she'], { responseWrong: 'не совсем) нужны слова: мы, есть, точка, артикль и кафе', wrongText: 'близко) мы в точке {w:кафе}, значит {g:We are at the cafe}, слово {g:at} прямо перед {g:the cafe}' })
R('👏')
T('давай на слух 👂')
A('{g:Tom is at school}', false)
WC(['Том в школе', 'Том идёт в школу', 'Том любит школу'], { wrongText: 'не то) {g:at school} это в школе, в точке {w:школа}, поэтому {g:Tom is at school} это {t:Том в школе}', voicePhrase: 'Tom is at school' })
T('В точку)')
A('Ой, а Кейт пишет, что опоздает, она застряла на вокзале')
P('а ну-ка скажи {t:«она на вокзале»}, точка та же, слово то же', 'Мультяшная девушка с чемоданом на вокзале смотрит на табло, толпа, без текста')
PA('She is at the station', ['in', 'to', 'at', 'he'], { responseWrong: 'не совсем) нужны слова: она, есть, точка, артикль и вокзал', wrongText: 'неа) вокзал тоже точка, значит {g:She is at the station}, и {g:at} один раз' })
T('да)) о май гащ, как быстро 😩')
T('давай проверим, где прячется точка:\n{g:I am ___ the gym}')
WC(['at', 'in', 'to'], { wrongText: 'не то) ты в точке {w:спортзал}, значит {g:at}: {g:I am at the gym}' })
T('В точку) это переводится как {t:«я в спортзале»}')
T('а {g:at} тут показывает, что {l:ты именно в этой точке}, а не идёшь туда')
endZone()

// ───────────────────────────── ЧАСТЬ 2 · at + время ─────────────────────────────
zone('Часть 2 · at + время', '#ffd166')
SYS('Часть 2 · at + время')
A('У {g:at} есть и вторая работа: оно {l:показывает точку во времени}, час или момент')
S('Мультяшный кот в шоке смотрит на часы, глаза круглые, светлый фон, без текста')
T('вот кста пример: мы с Кейт встречаемся в семь, {g:at seven}, это {l:точка на часах} ⏰')
P('как сказать {t:«мы встречаемся в семь»}?', 'Мультяшные парень и девушка смотрят на большие уличные часы, вечер, кафе на фоне, без текста')
WC(['We meet at seven', 'We meet in seven', 'We meet on seven'], { wrongText: 'но нет) час это точка на часах, значит {g:at}: {g:We meet at seven}' })
R('👏')
table('dictator', 'точка на часах', ['Кто', 'Точка', 'Когда'], [['We meet', 'at', 'seven'], ['I sleep', 'at', 'night']], { script: 'Ещё раз. В I am at home at показывает точку на карте. В We meet at seven он показывает точку на часах, семь. А в I sleep at night это точка в сутках, ночь. Слово одно, работа та же, показать точку' })
T('постараюсь тебя не запутать, но с частями дня есть хитрость)))')
S('Мультяшный кот хитро прищурился и улыбается, светлый фон, без текста')
A('Утро, день и вечер идут с {g:in}: {g:in the morning}, {g:in the evening}. А вот {l:ночь это точка}, поэтому {g:at night}')
P('как сказать {t:«я сплю ночью»}?', 'Мультяшный парень спит в кровати, за окном луна и звёзды, без текста')
PA('I sleep at night', ['in', 'on', 'the', 'she'], { responseWrong: 'не совсем) нужны слова: я, сплю, точка и ночь', wrongText: 'близко) ночь это точка, значит {g:I sleep at night}, без {g:in} и без {g:the}' })
R('🔥')
A('Вот тут {g:at} ведёт к моменту, а не к месту, но {l:работа у него та же}, показать точку')
A('А про {g:in the morning} и {g:on Monday} у нас есть отдельные уроки, там свои точки')
REF('Про in и on, откроешь позже', 'In')
table('dictator', 'вся картина целиком', ['Что', 'Точка', 'Пример'], [['место', 'at', 'at home'], ['час', 'at', 'at seven'], ['момент', 'at', 'at night']], { script: 'Ох, сколько всего умеет at! Давай по порядку. Сначала at показывает место, точку на карте, как в I am at home. Потом час, точку на часах, We meet at seven. И момент, точку в сутках, I sleep at night. Везде одно и то же: at это точка' })
PIN('{g:at}: {w:точка} на карте и на часах')
T('У меня уже ночь, а я всё ещё не лёг((')
T('напечатай {t:«в полночь»}: точка и слово полночь, всего два слова')
TW('at midnight', 'ea', 'не то) нужны слова: точка и полночь', 'но нет) сначала {g:at}, потом {g:midnight}, два слова')
T('Отлично, всё на месте)')
T('теперь послушай 👂')
A('{g:Kate works at night}', false)
WC(['Кейт работает ночью', 'Кейт работает утром', 'Кейт спит ночью'], { wrongText: 'близко) {g:works} это работает, а {g:at night} это ночью, поэтому {g:Kate works at night} это {t:Кейт работает ночью}', voicePhrase: 'Kate works at night' })
T('Ага, именно так)')
endZone()

// ───────────────────────────── ЧАСТЬ 3 · look at, smile at ─────────────────────────────
zone('Часть 3 · at + взгляд', '#ef476f')
SYS('Часть 3 · куда смотрим')
scene('at-duo', 'Кафе', 'bubble', [
  { who: 'a', text: 'Look at this cat!', emotion: 'surprised' },
  { who: 'b', text: 'Where? I am looking at my coffee.', emotion: 'neutral' },
  { who: 'a', text: 'He is at the window. He smiles at us!', emotion: 'happy' },
  { who: 'b', text: 'Oh. Now I see him. He is at the door.', emotion: 'happy' },
], { a: { kind: 'cat', gender: 'female', name: 'Кейт' }, b: { kind: 'cat', gender: 'male', name: 'Том' } })
A('Заметь, что говорила Кейт: {g:look at}, посмотри на. {l:Взгляд летит в точку}, и эту точку снова показывает {g:at}')
P('{g:look at me}, посмотри на меня: взгляд это стрелка, а {g:at} говорит, {l:куда она летит} 👀', 'Мультяшный кот смотрит прямо в камеру большими глазами, крупный план, без текста')
P('а ну-ка скажи {t:«посмотри на это фото»}, стрелку взгляда покажет {g:at}', 'Мультяшный кот показывает лапой на фото в рамке, удивлённые глаза, без текста')
PA('Look at this photo', ['to', 'in', 'on'], { responseWrong: 'не совсем) нужны слова: посмотри, точка, это и фото', wrongText: 'не то) взгляд летит в точку, значит {g:Look at this photo}, без {g:to}' })
T('ага, стрелка попала)')
A('{l:Улыбка тоже летит в точку}: {g:smile at}, улыбнуться кому-то. И смех тоже, {g:laugh at}')
P('кста, Том сегодня улыбается Кейт весь вечер 😏 скажи по-английски {t:«Том улыбается Кейт»}', 'Мультяшный парень улыбается девушке за столиком кафе, вечер, свечи, без текста')
PA('Tom smiles at Kate', ['to', 'in', 'she'], { responseWrong: 'не совсем) нужны слова: Том, улыбается, точка и Кейт', wrongText: 'неа) улыбка летит к человеку, значит {g:Tom smiles at Kate}, слово {g:at} перед именем' })
R('🔥')
A('Ты уже так уверенно строишь фразы с {g:at}, {l:пора говорить вслух}')
A('Скажи вообще что угодно про то, где ты сейчас, начни с {g:I am at}, а дальше любое место, я послушаю только произношение')
SAY('I am at home', 'Я дома', { pattern: 'I am at **', startHint: 'I — я\nam at — нахожусь в', hintMismatch: 'Начни с I am at и добавь любое место, например home)', wrongText: 'близко) начни с {g:I am at} и добавь любое место)' })
ownVoice('так-так, дай послушать)', 'у тебя уже получается говорить про место без подсказок: {g:I am at} и дальше любая точка. Звучит живо, так и продолжай')
A('Ещё про себя: скажи, на что ты сейчас смотришь, начни с {g:I am looking at}')
SAY('I am looking at my phone', 'Я смотрю на телефон', { pattern: 'I am looking at **', startHint: 'I am looking at — я смотрю на', hintMismatch: 'Начни с I am looking at и добавь любое слово, например my phone)', wrongText: 'не то) нужно сказать {g:I am looking at} и любой предмет)' })
ownVoice('секунду, послушаю тебя)', 'ты спокойно говоришь про взгляд по-английски, и это главный навык. С {g:looking at} у тебя выходит хорошо')
R('🔥')
endZone()

// ───────────────────────────── ИТОГ ─────────────────────────────
zone('Итог', '#06d6a0')
T('Если коротко, {g:at} показывает {l:точку}: на карте, на часах и там, куда летит взгляд')
A('А чтобы не забыть про {g:at}, давай соберём всю формулу вместе')
table('dictator', 'вся формула at, чтобы не забыть', ['Точка', 'at', 'Пример'], [['место', 'at', 'I am at home'], ['час', 'at', 'We meet at seven'], ['взгляд', 'at', 'Look at me']], { script: 'Смотри, всё вместе. Где ты находишься, I am at home, это точка на карте. Когда встречаемся, We meet at seven, это точка на часах. Куда смотришь, Look at me, это точка взгляда. Три разных дела, а слово одно, at' })
T('Супер, на сегодня всё, теперь ты будешь слышать {g:at} в каждой второй фразе 😄')
MENU(['Закончить ✅', 'Ещё потренируюсь 💪'], ['bye', 'train'])
const bye = T('До встречи в следующем уроке 👋'); byKey.bye = bye.ref; bye.triggers = [{ if: 'timer', ms: 1500, then: null }]
endZone()

// ───────────────────────────── ТРЕНИРОВКА ─────────────────────────────
zone('Ещё практика', '#118ab2')
const tr = T('ну что, с {g:at} ты уже знаком, давай проверим, как оно работает в деле'); byKey.train = tr.ref
A('Будет семь уровней, и {l:каждый чуть сложнее} предыдущего')
PIN('Тренировка: 7 уровней, от простого к сложному')
const lvl1 = SYS('Уровень 1 · разогрев'); byKey.lvl1 = lvl1.ref
T('как сказать {t:«я на работе»}?')
PA('I am at work', ['in', 'to', 'she'], { responseWrong: 'не совсем) нужны слова: я, есть, точка и работа', wrongText: 'не совсем) работа это точка, значит {g:I am at work}, без {g:in}' })
T('В точку 👌')
T('Кейт встречает Тома в восемь, вставь пропущенное слово:\n{g:Kate meets Tom ___ eight}')
WC(['at', 'in', 'on'], { wrongText: 'неа) час это точка на часах, значит {g:at}: {g:Kate meets Tom at eight}' })
T('даа)) {t:«Кейт встречает Тома в восемь»}')
T('ну-ка, послушай 👂')
A('{g:We are at the park}', false)
WC(['Мы в парке', 'Мы идём в парк', 'Мы любим парк'], { wrongText: 'близко) {g:at the park} это в парке, точка {w:парк}, поэтому {g:We are at the park} это {t:мы в парке}', voicePhrase: 'We are at the park' })
T('Отлично 👏')
T('теперь напечатай {t:«на пляже»}: сначала точка, потом артикль, потом пляж')
TW('at the beach', 'ie', 'не то) нужны слова: точка, артикль и пляж', 'но нет) сначала {g:at}, потом {g:the}, потом {g:beach}')
T('Чётко 🔥')
A('Первый уровень позади, идём дальше')
SYS('Уровень 2 · увереннее')
A('Теперь фразы подлиннее, но {l:точка всё та же}')
table('dictator', 'вспоминаем: где точка', ['Что', 'at', 'Пример'], [['место', 'at', 'at the cafe'], ['час', 'at', 'at seven']], { script: 'Давай вспомним. Место, где ты находишься, at the cafe, at home. Час, когда что-то происходит, at seven, at night. Оба раза at показывает точку' })
P('а ну-ка скажи {t:«она ждёт на вокзале»}, точку покажет {g:at}', 'Мультяшная девушка сидит на скамейке на вокзале с кофе, поезд вдали, без текста')
PA('She is waiting at the station', ['in', 'to', 'he'], { responseWrong: 'не совсем) нужны слова: она, есть, ждёт, точка, артикль и вокзал', wrongText: 'не совсем) ждёт в точке {w:вокзал}, значит {g:She is waiting at the station}' })
T('ага, вот так')
A('Теперь своими словами: скажи, во сколько ты обычно встаёшь, начни с {g:I get up at}, а дальше добавь любое время')
SAY('I get up at seven', 'Я встаю в семь', { pattern: 'I get up at **', startHint: 'I get up at — я встаю в', hintMismatch: 'Начни с I get up at и добавь любое время, например seven)', wrongText: 'не то) начни с {g:I get up at} и добавь любое время)' })
ownVoice('включаю твою запись, слушаю)', 'слышно, что {g:at seven} уже не пугает: после {g:at} ты просто ставишь свой час. Это очень классно')
T('теперь напечатай {t:«смотреть на Кейт»}: сначала {g:look}, потом точка, а имя допиши без подсказки')
TW('look at Kate', '', 'не то) нужны слова: смотреть, точка и Кейт', 'но нет) {g:look}, потом {g:at}, потом {g:Kate}')
T('Вот это точность 👏')
A('Ты уже уверенно строишь фразы, а теперь повторяй за мной')
SYS('Уровень 3 · повтори за мной')
A('Соберём длинную фразу с конца, кусок за куском: я говорю кусочек, а ты повторяешь его вслух за мной, с тем же ритмом')
A('{g:at the bus stop}', false)
SAY('at the bus stop', 'на остановке', { hintMismatch: 'Скажи ровно этот кусок: at the bus stop)', wrongText: 'не то) копируй ритм, {g:at the bus stop}' })
T('ага, ритм тот самый 👌')
T('Теперь добавим кусок спереди')
A('{g:wait at the bus stop}', false)
SAY('wait at the bus stop', 'ждать на остановке', { hintMismatch: 'Скажи ровно этот кусок: wait at the bus stop)', wrongText: 'но нет) добавь {g:wait} в начало:\n{g:wait at the bus stop}' })
T('Вот так')
A('А теперь соберём всю фразу целиком')
P('а теперь соберём всю фразу голосом: {t:«мы ждём на остановке»}', 'Мультяшные парень и девушка стоят на автобусной остановке под навесом, дождь, без текста')
SAY('We wait at the bus stop', 'Мы ждём на остановке', { hintMismatch: 'Скажи всю фразу: We wait at the bus stop)', wrongText: 'близко) {g:We wait at the bus stop}, точка и остановка' })
T('ага, звучит как надо 🔥')
T('теперь соберём новое из знакомых кусков: {t:«я жду в кафе»}, оба куска ты уже знаешь')
PA('I wait at the cafe', ['in', 'to', 'she'], { responseWrong: 'не совсем) нужны слова: я, жду, точка, артикль и кафе', wrongText: 'но нет) склей два куска: {g:I wait} и {g:at the cafe}' })
T('Вот так оно и строится)')
SYS('Уровень 4 · ловушки')
table('dictator', 'когда точка не нужна', ['Фраза', 'at?', 'Почему'], [['go home', 'нет', 'home уже значит домой'], ['in the morning', 'нет', 'утро идёт с in']], { script: 'Ещё помнишь два случая без at. Слово home само значит домой, поэтому просто go home. А утро, день и вечер идут с in, in the morning. Зато ночь это точка, at night' })
T('а теперь хитрые случаи 😏 как сказать {t:«мы идём домой»}?')
WC(['We go home', 'We go at home', 'We go to home'], { wrongText: 'близко) со словом {g:home} точка не нужна:\n{g:We go home}' })
S('Мультяшный кот подмигивает и показывает большой палец, светлый фон, без текста')
A('Слово {g:home} уже само значит домой, поэтому {g:at} здесь {l:лишний}')
P('а ну-ка скажи {t:«я бегаю утром»}, точка тут лишняя', 'Мультяшный парень бежит по парку ранним утром, солнце встаёт, без текста')
PA('I run in the morning', ['at', 'on', 'they'], { responseWrong: 'не совсем) нужны слова: я, бегаю, в, артикль и утро', wrongText: 'неа) утро идёт с {g:in}, получится {g:I run in the morning}' })
T('ага, утро без точки) 😏')
T('и ещё одна ловушка, {t:«я тебе позвоню ночью»}:\n{g:I will call you ___ night}')
WC(['at', 'in', 'ничего не нужно'], { wrongText: 'неа) ночь это точка, значит {g:at}: {g:I will call you at night}' })
T('ага, точка на месте)')
PIN('точка не нужна: {g:go home}, {g:in the morning}')
A('Ловушки пройдены, теперь будем говорить своими словами')
SYS('Уровень 5 · своими словами')
S('Мультяшный кот в шоке с открытым ртом, светлый фон, без текста')
T('длинное предложение, получится? {t:«Кейт смотрит на кота у окна»}, тут аж два {g:at}')
PA('Kate looks at the cat at the window', ['in', 'to', 'she'], { responseWrong: 'не совсем) нужны слова: Кейт, смотрит, точка, артикль, кот, точка, артикль и окно', wrongText: 'неа) {g:looks at}, а потом ещё один {g:at}: {g:Kate looks at the cat at the window}, сначала взгляд, потом место' })
T('Супер 😎')
A('Первый {g:at} ведёт взгляд к коту, а {l:второй показывает место}, окно')
A('Скажи вслух, где ты встречаешься с Кейт или с другом: начни с {g:I meet} и назови имя и точку')
SAY('I meet Kate at the cafe', 'Я встречаюсь с Кейт в кафе', { pattern: 'I meet * at **', startHint: 'I meet — я встречаю', hintMismatch: 'Начни с I meet, назови имя и добавь at и любое место, например at the cafe)', wrongText: 'не совсем) нужно сказать {g:I meet}, имя, {g:at} и любое место)' })
ownVoice('ну-ка, дай послушать)', 'длинная фраза, и звучит она цельно: {g:I meet}, имя, {g:at} и дальше точка. Это хороший уровень')
T('послушай внимательно 👂')
A('{g:Tom laughs at my jokes}', false)
WC(['Том смеётся над моими шутками', 'Том любит мои шутки', 'Том рассказывает шутки'], { wrongText: 'неа) {g:laughs at} это смеётся над, поэтому {g:Tom laughs at my jokes} это {t:Том смеётся над моими шутками}', voicePhrase: 'Tom laughs at my jokes' })
T('именно так)')
A('{g:laughs at} значит {l:смеётся над}, а {g:jokes} это шутки, вместе Том смеётся над моими шутками')
A('Ничего себе, как ты быстро, остался последний рывок на скорость')
SYS('Уровень 6 · на скорость ⏱')
T('на скорость ⏱ выбери верную фразу: {t:«мы дома»}')
WC(['We are at home', 'We are in home', 'We are to home'], { wrongText: 'не совсем) дом это точка:\n{g:We are at home}' })
T('Быстро 🚀')
T('и ещё раз ⏱ {t:«они встречаются в девять»}')
PA('They meet at nine', ['in', 'on', 'we'], { responseWrong: 'не совсем) нужны слова: они, встречаются, точка и девять', wrongText: 'не то) час это точка, {g:They meet at nine}' })
T('Ого, как быстро)')
T('и ещё быстрее ⏱ {t:«посмотри на небо»}')
WC(['Look at the sky', 'Look in the sky', 'Look to the sky'], { wrongText: 'не совсем) взгляд летит в точку, {g:Look at the sky}' })
T('Молния 🚀')
SYS('Уровень 7 · без подсказок')
T('Кейт пишет: я потерялась в торговом центре, ты где? 😱')
A('Ответь ей вслух, где ты, и говори по-своему, без подсказок')
SAY('I am at the entrance', 'Я у входа', { pattern: 'I am at **', startHint: 'I am at — я у', hintMismatch: 'Начни с I am at и добавь любое место, например the entrance)', wrongText: 'не то) начни так: {g:I am at}, это я в точке, и добавь любое место' })
ownVoice('так-так, послушаю)', 'и с местом у тебя всё ровно: {g:I am at} и точка, никаких лишних слов. Приятно слушать')
P('и без подсказок: напечатай {t:«улыбнись Тому»}', 'Мультяшная девушка улыбается парню через столик кафе, тёплый свет, без текста')
TW('smile at Tom', '', 'не то) нужны слова: улыбнись, точка и Том', 'но нет) {g:smile}, потом {g:at}, потом {g:Tom}')
T('Точно 👏')
A('Неожиданность: Кейт нашлась и зовёт тебя в кино, сеанс в шесть. Скажи ей, что встретимся в шесть, начни с {g:Let us meet at}')
SAY('Let us meet at six', 'Давай встретимся в шесть', { pattern: 'Let us meet at **', startHint: 'Let us meet at — давай встретимся в', hintMismatch: 'Начни с Let us meet at и добавь любое время, например six)', wrongText: 'не совсем) начни с {g:Let us meet at} и добавь любое время)' })
ownVoice('дай послушать, как это звучит)', 'вот теперь {g:at} с часом у тебя звучит спокойно. Это сильный навык, так держать')
endZone()

// ───────────────────────────── ФИНАЛ ─────────────────────────────
zone('Финал', '#06d6a0')
SYS('Финал')
scene('at-outro', 'Кот уходит в кино', 'circle', [
  { who: 'a', text: 'Итог: at показывает точку, место, час и взгляд.', emotion: 'happy' },
  { who: 'a', text: 'А я убегаю, встречаемся с Кейт at six!', emotion: 'surprised' },
])
MENU(['Закончить ✅', 'Ещё один круг 💪'], ['bye2', 'lvl1'])
const bye2 = T('Пока, и удачи с {g:at} 👋'); byKey.bye2 = bye2.ref; bye2.triggers = [{ if: 'timer', ms: 1500, then: null }]
endZone()

closeWrongs()
// Отложенные связи меню
for (const { node, idx, key } of laterLinks) node.triggers[idx].then = byKey[key]
// Последняя нода финала: «До встречи» уже с then null
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
        { label: 'место', example: 'I am **at** home', tr: 'я дома' },
        { label: 'час и момент', example: 'We meet **at** seven', tr: 'мы встречаемся в семь', mark: 1 },
        { label: 'взгляд', example: 'Look **at** me', tr: 'посмотри на меня' },
      ] },
      { type: 'dialog', lines: [
        { side: 'l', text: 'Where are you?', tr: 'Ты где?' },
        { side: 'r', text: 'I am **at** the cafe.', tr: 'Я в кафе.' },
        { side: 'l', text: 'I am not **at** home, I am **at** work.', tr: 'Я не дома, я на работе.', neg: true },
        { side: 'r', text: 'Let us meet **at** six!', tr: 'Давай встретимся в шесть!' },
      ] },
    ],
  },
}
writeFileSync(new URL('../at.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('nodes', nodes.length, 'zones', zones.length)

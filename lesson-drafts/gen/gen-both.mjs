// Генератор урока «Both» (тип 3: просто слово, не слово-правило). Запуск: node lesson-drafts/gen/gen-both.mjs ; затем node scripts/lesson-gate.mjs lesson-drafts/both.json --fix-seq
// Версия 2 (решения автора 2026-11-02): маскоты kit / mia2, завязка в кафе, лапы и уши вместо котов, мини-блок «как звучит», photo_choice, финал с Мией в чате.
// Скелет как у gen-at.mjs: вход → 3 части + мини-блок + диалог → итог → тренировка 3 уровня → финал. Пит ссылается на Мию (не Кейт).
import { writeFileSync } from 'node:fs'

const STEP = 560, GAP = 1300, LEVEL_GAP = 700, ERR_Y = 480
const nodes = [], zones = []
let x = 0, refN = 0
const newRef = () => `n${++refN}`
const byKey = {}
const laterLinks = []

const CAT_PIT = { a: { kind: 'cat', gender: 'male', name: 'Пит', skin: 'kit', voice: { pitch: 0.8, rate: 0.95 } } }
const SLOTS_CAFE = { table: 'table', 'table-left': 'pastry-plate', window: 'window', 'wall-menu': 'menu-board', 'wall-art': 'picture', ceiling: 'pendant-lamp', counter: 'coffee-machine', 'floor-left': 'plant', 'floor-right': 'floor-lamp', 'table-right': 'laptop' }

const NEXT = { photo_choice: 'photo_correct', text: 'timer', audio: 'played', photo: 'timer', sticker: 'timer', reaction: 'timer', system: 'timer', pin_message: 'timer', lesson_ref: 'timer', scene: 'played', table: 'table_correct', word_choice: 'word_correct', phrase_assembly: 'phrase_correct', type_word: 'type_correct', say_phrase: 'say_done' }
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
const OPENERS = ['не совсем)', 'близко)', 'неа)', 'не то)', 'почти)', 'упс)']
const HINTS = ['подумай, сколько их', 'проверь слово про количество', 'вспомни, где стоит это слово', 'посмотри на слово про количество']
let hintN = 0
const shortWrong = () => `${OPENERS[openerN++ % OPENERS.length]} ${HINTS[hintN++ % HINTS.length]}`
const reopen = t => (t ?? '').replace(/^(не совсем|близко|неа|не то|но нет|почти|упс)\)\s*/i, () => `${OPENERS[openerN++ % OPENERS.length]} `)
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
  const n = main('phrase_assembly', { words: words.split(' '), distractors: distractors.map(t => ({ text: t })), ...(answers ? { answers } : {}), responseWrong: shortWrong(), ...(timeLimitSec ? { timeLimitSec } : {}) })
  for (const sg of signals) companion(n, sg)
  for (const t of distractors) n.triggers.push({ if: 'variant', variantLabel: t, then: null })
  wrong(n, wrongText, 'phrase_wrong')
  return n
}
function TW(word, extraLetters, responseWrong, wrongText) {
  const n = main('type_word', { word, extraLetters, responseWrong: shortWrong() })
  wrong(n, wrongText, 'type_wrong')
  return n
}
// say_phrase; после него — «дай послушать» → голосовой комментарий про навык (не про звук: при «Я не могу говорить» записи нет) → 🔥
const EMO = ['🔥', '👏', '😎', '🙌', '💪', '🤝']
let emoN = 0
function SAY(phraseText, translation, { pattern, startHint, hintMismatch, wrongText, listen, comment, hintsOff, signals = [] }) {
  const n = main('say_phrase', { lang: 'en-US', phrase: phraseText, translation, keywords: '', threshold: 70, strict: true, hintsOn: true, voiceReply: true, hintSilence: 'Не слышу тебя) говори чуть громче и ближе к микрофону', hintPartial: 'Близко) верно: {ok}, не хватило: {missed}', ...(pattern ? { pattern, startHint, hintMismatch } : {}), ...(!pattern && hintMismatch ? { hintMismatch } : {}), ...(hintsOff ? { hintsOn: false } : {}) })
  for (const sg of signals) companion(n, sg)
  if (listen) { wrong(n, wrongText, 'say_wrong', 3); T(listen); A(comment); R(EMO[emoN++ % EMO.length]) } else { wrong(n, wrongText, 'say_wrong', 1); T(comment) }
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


// Про-режим: английская фраза с переводом по кнопке на пузыре (text с pro + proText)
const PRO = (content, proText) => main('text', { content, hardWrap: content.includes('\n'), pro: true, proText })
// Выбор фото: photos [{label, imagePrompt}], верный — первый
function PCH(photos, wrongText) {
  const n = main('photo_choice', { photos, correctIndexes: [0] })
  wrong(n, wrongText, 'photo_wrong')
  return n
}
const MIA = { kind: 'cat', gender: 'female', name: 'Мия', skin: 'mia2', voice: { pitch: 1.3, rate: 0.9 } }
const DUO = { a: CAT_PIT.a, b: MIA }

// ───────────────────────────── ВХОД ─────────────────────────────
zone('Вход', '#b6fe3b')
SCENE('both-open', 'Пит у стойки кафе', 'circle', [
  { who: 'a', text: 'Бариста спрашивает меня: coffee or tea?', emotion: 'neutral', face: 'base' },
  { who: 'a', text: 'А я хочу и то и другое. Как ответить? Слово both.', emotion: 'surprised', face: 'pretend' },
])
WC(['I want both', 'I want all', 'I want two'], { wrongText: 'не совсем) когда нужно и то и другое, то есть двое сразу, подходит слово {g:both}:\n{g:I want both}' })
R('☕')
T('даа 😉 {t:«я хочу оба»}\nМия просила принести ей то же самое, и кофе, и чай)')
T('кста, как тебе удобнее: сначала разберём основу или сразу в практику?')
MENU(['Сначала объясни 📖', 'Сразу к практике 💪'], ['part1', 'train'])
endZone()

// ───────────────────────────── ЧАСТЬ 1 · both = двое ─────────────────────────────
zone('Часть 1 · both = двое', '#ffd166')
byKey.part1 = SYS('Часть 1 · both это двое').ref
A('{g:both} это {w:оба}, то есть {l:и то и другое}, и речь всегда про двоих')
P('Мия греет обе лапы о горячую чашку ☕', 'Мультяшная тёмно-серая кошка обхватывает горячую чашку обеими лапами, кафе, светлый фон, без текста')
T('а как сказать {t:«Мия греет обе лапы»}? лапы это {g:paws}')
PA('Mia warms both paws', ['all', 'paw', 'two'], { wrongText: 'не совсем) греет это {g:warms}, лап двое, значит {g:both}, а {g:paws} с {o:s} на конце:\n{g:Mia warms both paws}' })
R('☕')
T('{g:both} ставим {l:перед} {g:paws} так же, как и перед любой парой предметов')
P('Бариста показывает два пирожных, оба выглядят вкусно 🍰', 'Мультяшный бариста-кот показывает на витрине два пирожных, дневной свет, без текста')
A('Как сказать {t:«мне нравятся оба из них»}?')
WC(['I like both of them', 'I like both them', 'I like all of them'], { wrongText: 'сори) но перед {g:them} нужно ещё одно маленькое слово, {o:of}:\n{g:I like both of them}' })
R('😋')
A('Видишь? Вместо названия предмета теперь {g:them}, а между ними появляется {o:of}. {o:Of} {l:связывает} {g:both} с местоимением и показывает, что речь о двоих из одной группы')
P('Я листаю плейлист: там и рок, и реп 🎸', 'Мультяшный фиолетовый кот в очках листает плейлист на телефоне, на экране иконки гитары и микрофона, кафе, светлый фон, без текста')
T('как сказать по-английски {t:«я люблю и рок, и реп»}?')
PA('I like both rock and rap', ['all', 'or', 'she'], { wrongText: 'не то) две вещи соединяет пара {g:both} и {g:and}, а не {x:or}:\n{g:I like both rock and rap}' })
R('🎸')
T('а с роком и репом всё так же: {g:both} встаёт {l:перед первым} из двух')
TABLE('dictator', 'как используем both', ['Начало', 'Дальше', 'Значит'], [['both', 'paws', 'обе лапы'], ['both of', 'them', 'оба из них']], { widths: [32, 36, 32], script: 'Смотри, когда после both стоит предмет, of не нужно: both paws, обе лапы. И с рок и репом так же, это просто два предмета. А когда вместо предмета стоит местоимение, появляется of: both of them, оба из них' })
PIN('{g:both} + {w:двое}: {g:both paws}, {g:both of us}')
T('теперь на слух 👂')
A('{g:Mia hugs both of us}', false)
WC(['Мия обнимает нас обоих', 'Мия обнимает всех', 'Мия обнимает меня'], { wrongText: 'близко) после {g:both} стоит местоимение {g:us}, а перед ним нужно {o:of}: {g:both of us}, это про нас двоих', voicePhrase: 'Mia hugs both of us' })
R('🤗')
T('напечатай {t:«обе руки»}: тапай по светящимся буквам')
TW('both hands', 'mk', 'не то) рук двое, значит перед {g:hands} нужно {g:both}', 'но нет) рук двое, значит {g:both hands}')
R('🙌')
endZone()

// ───────────────────────────── КАК ЗВУЧИТ ─────────────────────────────
zone('Как звучит both', '#06d6a0')
SYS('Как звучит both')
T('Давай научу тебя правильно произносить это слово:\n{g:[boʊθ]}')
REF('Как читать такие значки, в отдельном уроке', 'Английская транскрипция')
A('Многие говорят {w:бос} или {w:бот}, а тут надо чуть прошипеть {g:th}: {l:язык между зубами}. Получается примерно {w:боус}')
A('Повтори за мной: {g:both of us}')
SAY('both of us', 'Оба из нас', { hintMismatch: 'Скажи both of us, а в both на конце тихое th)', wrongText: 'близко) скажи {g:both of us}, а в {g:both} на конце {g:th}, язык между зубами', listen: 'ага, ну-ка слушаю 👂', comment: 'у тебя отлично получается произносить {g:th} на конце слова', hintsOff: false })
endZone()

// ───────────────────────────── ЧАСТЬ 2 · где стоит both ─────────────────────────────
zone('Часть 2 · где стоит both', '#ef476f')
SYS('Часть 2 · где стоит both')
T('мы с Мией ждём заказ и оба голодные!!')
T('Как сказать {t:«мы оба хотим суп»}?')
PA('We both want soup', ['all', 'they', 'wants'], { answers: [['Both', 'of', 'us', 'want', 'soup']], wrongText: 'не совсем) {g:both} встаёт сразу после {g:we}, перед глаголом:\n{g:We both want soup}' })
R('🍲')
A('Смотри: {g:both} стоит после {g:we}, прямо перед {g:want}. С обычными глаголами {g:both} идёт {l:перед ними}')
P('Мия сидит усталая, и я тоже 😮‍💨', 'Мультяшные кот и кошка сидят за столиком в кафе, оба уставшие, откинулись на спинки, светлый фон, без текста')
T('Давай переведём {t:«мы оба устали»}')
WC(['We are both tired', 'We both tired are', 'We are tired both'], { wrongText: 'близко) после {g:are} идёт {g:both}, а почему, объясню чуть позже:\n{g:We are both tired}' })
R('😴')
T('{g:are} и так связывает слова, поэтому {g:both} встаёт {l:после} него')
TABLE('dictator', 'где стоит both', ['Глагол', 'Где both', 'Пример'], [['обычный', 'перед', 'We both want soup'], ['am, is, are', 'после', 'We are both tired']], { script: 'Смотри. В первом предложении want это обычное действие, поэтому are не нужно: we both want soup, мы оба хотим суп. А во втором tired это состояние, и ему нужен are, чтобы связать его с we. Поэтому both ставим после are: we are both tired, мы оба устали' })
T('теперь только звук, без текста')
A('{g:They are both late}', false)
WC(['Они оба опоздали', 'Они оба дома', 'Они оба рады'], { wrongText: 'близко) {g:late} значит опоздали, а {g:both} про двоих', voicePhrase: 'They are both late' })
R('⏰')
A('Теперь вслух про нас с Мией: {t:«мы оба голодные»}')
A('Можно и {g:We are}, и {g:We\'re}: полная форма звучит чуть строже, короткая живее')
SAY('We are both hungry', 'Мы оба голодные', { pattern: '(We are|We\'re) both **', startHint: 'We are both — мы оба', hintMismatch: 'Начни с We are both и добавь любое слово, например hungry)', wrongText: 'близко) начни с {g:We are both} и добавь любое слово)', comment: 'вот и фраза про двоих))' })
endZone()

// ───────────────────────────── ДИАЛОГ ─────────────────────────────
zone('Диалог', '#118ab2')
SCENE('both-duo', 'Мия и Пит у стойки', 'bubble', [
  { who: 'a', text: 'Mia, the barista asks: coffee or tea?', emotion: 'neutral', face: 'base', translation: 'Мия, бариста спрашивает: кофе или чай?' },
  { who: 'b', text: 'Both. I will be at our table.', emotion: 'neutral', face: 'pathos', translation: 'Оба. Я буду за нашим столиком.' },
  { who: 'a', text: 'Both? Got it!', emotion: 'surprised', face: 'shy', translation: 'Оба? Понял!' },
], DUO)
endZone()

// ───────────────────────────── ЧАСТЬ 3 · both, all, neither ─────────────────────────────
zone('Часть 3 · похожие слова', '#9b5de5')
SYS('Часть 3 · both, all, neither')
T('Мия забирает наши заказы со стойки, и ей нужно всё сразу 😅')
T('какая картинка подходит к фразе:\n{g:Mia takes both cups}')
PCH([
  { label: '1', imagePrompt: 'Мультяшная тёмно-серая кошка берёт со стойки кафе ровно две чашки, по одной в каждую лапу, светлый фон, без текста' },
  { label: '2', imagePrompt: 'Мультяшная тёмно-серая кошка несёт на подносе пять чашек, кафе, светлый фон, без текста' },
  { label: '3', imagePrompt: 'Мультяшная тёмно-серая кошка берёт одну чашку, кафе, светлый фон, без текста' },
], 'неа) стаканов двое, а {g:all} про трёх и больше, значит {g:Mia takes both cups}')
T('даа 😉 {t:«Мия берёт оба стакана»}')
A('Рядом с {g:both} живут похожие слова: если двое, это {g:both}, а если трое и больше, это {g:all}. {l:Считай, сколько их}')
P('Бариста предлагает сироп или сливки, а мне не нужно ни то, ни другое 🙅', 'Мультяшный фиолетовый кот в очках отмахивается от бутылочки сиропа и кувшинчика сливок, кафе, светлый фон, без текста')
T('как сказать одним словом {t:«ни то, ни другое»}?')
WC(['neither', 'both', 'all'], { wrongText: 'неа) двое, и не подходит ни один, это {g:neither}, наоборот от {g:both}' })
R('🙅')
T('какая картинка подходит к фразе:\n{g:Mia takes neither cup}')
PCH([
  { label: '1', imagePrompt: 'Мультяшная тёмно-серая кошка отодвигает лапой обе чашки на столе, не берёт ни одну, кафе, светлый фон, без текста' },
  { label: '2', imagePrompt: 'Мультяшная тёмно-серая кошка берёт две чашки, по одной в каждую лапу, кафе, светлый фон, без текста' },
  { label: '3', imagePrompt: 'Мультяшная тёмно-серая кошка берёт одну чашку из двух, кафе, светлый фон, без текста' },
], 'неа) {g:neither} это ни тот, ни другой, значит ни одну чашку она не берёт')
T('даа)) {t:«Мия не берёт ни тот, ни другой»}')
A('{g:neither} это {w:ни тот, ни другой}, а {g:both} это {w:и тот, и другой}: {l:слова-зеркала}')
P('Нас трое за столиком: я, Мия и бариста на перерыве 🍕', 'Мультяшные кот, кошка и ещё один кот-бариста сидят за столиком, на столе пицца, светлый фон, без текста')
TABLE('dictator', 'сколько их', ['Сколько', 'Слово', 'Пример'], [['двое', 'both', 'We both like pie'], ['трое и больше', 'all', 'We all like pie'], ['ни один из двоих', 'neither', 'neither of us']], { script: 'Теперь про количество. Двое, both, we both like pie, мы оба любим пирог. Трое и больше, all, we all like pie, мы все любим пирог. А если не подходит ни один из двоих, neither, neither of us, ни один из нас' })
PIN('{g:both} двое, {g:all} трое и больше, {g:neither} ни один')
T('и ещё одна без текста: собери то, что услышишь')
A('{g:We all like pizza}', false)
PA('We all like pizza', ['both', 'likes', 'they'], { wrongText: 'неа) {g:all} это все, а не двое: {g:We all like pizza}' })
R('🍕')
T('даа)) {t:«мы все любим пиццу»}')
T('напечатай {t:«ни один из нас»}: тапай по светящимся буквам')
TW('neither of us', 'ma', 'не то) нас двое, и не подходит ни один, это {g:neither}', 'но нет) нас двое, и ни один не подходит, значит {g:neither of us}')
R('🙅')
endZone()

// ───────────────────────────── ИТОГ ─────────────────────────────
zone('Итог', '#06d6a0')
A('С основой разобрались: {g:both} это {l:двое}, а {g:all} и {g:neither} его соседи. Выбирай: закончить или потренироваться')
MENU(['Закончить ✅', 'Ещё потренируюсь 💪'], ['final', 'train'])
endZone()

// ───────────────────────────── ТРЕНИРОВКА ─────────────────────────────
zone('Ещё практика', '#118ab2')
byKey.train = T('Ну раз с {g:both} ты уже знаком, давай проверим в деле: три уровня, {l:каждый чуть сложнее} 💪').ref
byKey.lvl1 = LEVEL('Уровень 1 · разогрев').ref
T('Мия листает афишу на стене кафе и зовёт в кино, мы оба в восторге 🤩')
T('Помоги ответить Мии: {t:«мы оба любим кино»}')
PA('Both of us love movies', ['all', 'them', 'you'], { answers: [['We', 'both', 'love', 'movies']], wrongText: 'не совсем) нас двое, значит {g:Both of us love movies}, или проще {g:We both love movies}' })
R('🎬')
T('зацени на слух 👂')
A('{g:Both plates are empty}', false)
WC(['Обе тарелки пустые', 'Все тарелки пустые', 'Обе тарелки полные'], { wrongText: 'близко) {g:empty} значит пустые, а {g:both} про двоих', voicePhrase: 'Both plates are empty' })
R('🥤')
A('Скажи вслух {t:«нам обоим нужен отдых»}: начни с {g:We both need}, а дальше любое слово')
SAY('We both need rest', 'Нам обоим нужен отдых', { pattern: 'We both need **', startHint: 'We both need — нам обоим нужно', hintMismatch: 'Начни с We both need и добавь любое слово, например rest)', wrongText: 'близко) начни с {g:We both need} и добавь любое слово)', listen: 'так-так, дай послушать)', comment: 'эта рамка пригодится, когда будешь говорить про себя или друга' })
byKey.lvl2 = LEVEL('Уровень 2 · оба, все или ни один').ref
A('Давай смешаем похожие слова, а ты {l:считай, сколько их}')
P('Нас за столом трое: я, Мия и её подруга 🍝', 'Мультяшные кот и две кошки сидят за столом в кафе, на столе паста, светлый фон, без текста')
T('А здесь нужно {g:all}, {g:both} или {g:neither}?\n{g:Mia, Anna and I ___ love pasta}')
WC(['all', 'both', 'neither'], { wrongText: 'неа) нас трое, а {g:both} только про двоих, значит {g:all}' })
R('🍝')
T('А здесь нужно {g:both}, {g:all} или {g:neither}?\n{g:Mia and I ___ like chess}')
WC(['both', 'all', 'neither'], { wrongText: 'не то) нас двое, значит {g:both}:\n{g:Mia and I both like chess}' })
R('♟️')
T('да)) {t:«мы с Мией оба любим шахматы»}')
P('Мия и Анна радуются, что заказ наконец принесли 😊', 'Мультяшные две кошки радуются, что им принесли заказ, кафе, светлый фон, без текста')
A('А теперь про них: собери {t:«Мия и Анна обе рады»}')
PA('Mia and Anna are both happy', ['all', 'is', 'neither'], { wrongText: 'не совсем) с {g:are} слово {g:both} идёт после него: {g:Mia and Anna are both happy}' })
R('😄')
T('зацени ещё раз без текста')
A('{g:Both of them work here}', false)
WC(['Оба из них работают здесь', 'Все они работают здесь', 'Никто не работает здесь'], { wrongText: 'близко) {g:Both of them} это {t:оба из них}, значит они оба работают', voicePhrase: 'Both of them work here' })
R('🧑‍🍳')
T('бариста и повар оба знают меня, я тут частый гость)')
T('собери по-английски {t:«оба из них знают меня»}')
PA('Both of them know me', ['all', 'us', 'knows'], { wrongText: 'не совсем) {g:both of them} это {t:оба из них}: {g:Both of them know me}' })
R('😉')
T('напечатай {t:«оба глаза»}: тапай по светящимся буквам')
TW('both eyes', 'dv', 'не то) глаз двое, значит перед {g:eyes} нужно {g:both}', 'но нет) глаз двое, значит {g:both eyes}')
R('👀')
A('Скажи вслух {t:«оба из них любят суши»}, начни с {g:Both of them} и добавь любое слово')
SAY('Both of them love sushi', 'Оба из них любят суши', { pattern: 'Both of them **', startHint: 'Both of them — оба из них', hintMismatch: 'Начни с Both of them и добавь любое слово, например love)', wrongText: 'близко) начни с {g:Both of them} и добавь любое слово)', comment: 'ага, и без {g:we} можно))' })
byKey.lvl3 = LEVEL('Уровень 3 · без подсказок').ref
T('😲')
T('кстати, пока я стою в очереди за кофе, Мия пишет: лето или зима, что тебе больше нравится?')
A('Ответь ей вслух, что нравятся оба: скажи по-английски {t:«мне нравятся и лето, и зима»}')
SAY('I like both summer and winter', 'Мне нравятся и лето, и зима', { pattern: 'I like both **', hintsOff: true, hintMismatch: 'Скажи про оба времени года и добавь любое слово)', wrongText: 'не то) например, {g:I like both summer and winter}, главное слово {g:both})', comment: 'в точку))' })
T('последняя на слух 👂')
A('{g:Her friends are both home}', false)
WC(['Её подруги обе дома', 'Её подруги обе на работе', 'Её подруг нет дома'], { wrongText: 'неа) вслушайся в слова {g:both} и {g:home}', voicePhrase: 'Her friends are both home' })
R('👏')
A('Мия листает афишу на стене кафе и зовёт на вечеринку в субботу. Скажи ей по-английски {t:«мы оба готовы»}')
A('Можно и {g:We are}, и {g:We\'re}: полная форма звучит чуть строже, короткая живее')
SAY('We are both ready', 'Мы оба готовы', { pattern: '(Both of us are|We are both|We\'re both) **', hintsOff: true, hintMismatch: 'Скажи, что вы оба готовы, и добавь любое слово)', wrongText: 'не совсем) скажи, что вы оба готовы: {g:We are both} и слово {g:ready})', comment: 'огонь))' })
endZone()

// ───────────────────────────── ФИНАЛ ─────────────────────────────
zone('Финал', '#ff9f1c')
byKey.final = SYS('Финал').ref
SYS('Мия присоединилась к чату')
SCENE('both-end-mia', 'Кружок Мии', 'circle', [
  { who: 'a', text: 'Pit. I asked for both.', emotion: 'neutral', face: 'sneer' },
  { who: 'a', text: 'Where is my tea?', emotion: 'neutral', face: 'grump' },
], { a: MIA })
T('😡')
SCENE('both-end-pit', 'Кружок Пита', 'circle', [
  { who: 'a', text: 'Sorry, Mia! Both are here.', emotion: 'surprised', face: 'shy' },
  { who: 'a', text: 'Coffee and tea.', emotion: 'neutral', face: 'pretend' },
])
A('фух, пронесло. Тапни на её кружок и послушай ещё раз, а потом собери по-английски, что она сказала: {t:«я просила оба»}')
PA('I asked for both', ['all', 'we', 'two'], { wrongText: 'близко) Мия просила оба напитка, и слово про двоих {g:both} стоит в конце:\n{g:I asked for both}' })
R('👌')
PRO('да, она сказала так:\n{g:I asked for both. Where is my tea?}', 'Я просила оба. Где мой чай?')
T('а я ей ответил:')
PRO('{g:Sorry, Mia! Both are here. Coffee and tea.}', 'Прости, Мия! Оба здесь. Кофе и чай.')
R('😌')
T('Если коротко: {g:both} это {l:двое сразу}, а трое и больше уже {g:all}')
TABLE('dictator', 'вся формула both', ['Как', 'Слово', 'Пример'], [['с вещью', 'both', 'Mia warms both paws'], ['с местоимением', 'both of', 'both of us'], ['парой', 'both and', 'both rock and rap'], ['с глаголом', 'we both', 'We both want soup'], ['после are', 'are both', 'We are both tired']], { widths: [33, 23, 44], script: 'Смотри, всё вместе. С вещью, both, Mia warms both paws. С местоимением, both of, both of us. Парой, both и and, both rock and rap. С обычным глаголом, we both, we both want soup. А после are, are both, we are both tired. Везде речь про двоих' })
T('ну всё, теперь {g:both} у тебя в кармане 😏')
MENU(['Закончить ✅', 'Ещё один круг 💪'], ['bye', 'lvl1'])
const bye = T('Пока, и удачи с {g:both} 👋'); byKey.bye = bye.ref; bye.triggers = [{ if: 'timer', ms: 1500, then: null }]
endZone()

closeWrongs()
for (const { node, idx, key } of laterLinks) node.triggers[idx].then = byKey[key]
for (const n of nodes) { for (const t of n.triggers) if (t.then === undefined) t.then = null; delete n._side }
for (const n of nodes) if (n.type === 'text' && !n.data.pro && /: \{g:[^}]+\}\)?$/.test(n.data.content)) { n.data.content = n.data.content.replace(/: (\{g:[^}]+\}\)?)$/, ':\n$1'); n.data.hardWrap = true }

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
        { label: 'рядом с вещью', example: 'Mia covers **both** ears', tr: 'Мия закрыла оба уха', mark: 0 },
        { label: 'с местоимением', example: '**both** of us', tr: 'мы оба' },
        { label: 'рядом с глаголом', example: 'We **both** want soup', tr: 'мы оба хотим суп' },
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

// Пакеты персонажей (pack_boy.json / pack_girl.json) → JSON маскотов конструктора сцен: src/features/scene/v2/sprites/mascot/{kit,mia}.json.
// Разбор в деревья делает рантайм (sprites/mascot/markupTree.js), здесь только подготовка: хвост переносится в начало координат своего основания
// (CSS-покачивание вокруг точки 0 0, как у остальных котов), считается посадка в коробку спрайта 200×240, из пакета убирается лишнее.
// Запуск: node scripts/mascot/export_sprites.mjs <work>
import { readFileSync, writeFileSync } from 'node:fs'
const work = process.argv[2]
if (!work) { console.error('нужен каталог с pack_boy.json / pack_girl.json'); process.exit(1) }
const OUT = new URL('../../src/features/scene/v2/sprites/mascot/', import.meta.url)
const TAIL_BASE = { boy: [428, 652], girl: [428, 654] }   // первая точка REST в tail.mjs
const NAMES = { boy: { id: 'kit', title: 'Пит', gender: 'male' }, girl: { id: 'mia', title: 'Мия', gender: 'female' } }

// «M425.1 688.9L432.7 689.5…Z» — только абсолютные M/L/Z: пары чисел сдвигаются на основание
const shift = (markup, [bx, by]) => markup.replace(/ d="([^"]*)"/g, (_, d) =>
  ` d="${d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (__, x, y) => `${+(x - bx).toFixed(1)} ${+(y - by).toFixed(1)}`)}"`)

// Усы: белый залитый контур из четырёх штрихов по щекам (у Пита начинается с «M145.1 327.2», fill #ffffff) режется на четыре path
// с классами wh wh-l|wh-r (сторона) wh-u|wh-d (верхний/нижний): «живой Пит v2» вращает каждый ус вокруг корня (scene-v2-pit.css,
// якорь — край fill-box у морды). +3 узла к маскоту (64 → 67 при лимите 100). НЕ путать с двумя чёрными чёрточками
// «M122.2 299.1H90.2M500.1 299.1H467.5» — это концы дужек очков (так было помечено до v3.3.39). У Мии усов в рисунке нет.
// Проверка — mascotWhiskers.test.js
const WHISKERS = /<path d="(M145\.1 327\.2[^"]*)" fill="#ffffff"\/>/g
const FACE_X = 296 // середина морды: ус левее — левый (корень у правого края), правее — правый
const splitWhiskers = d => d.split(/(?=M)/).filter(Boolean).map(sub => {
  const pts = [...sub.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(m => [+m[1], +m[2]])
  const side = Math.max(...pts.map(p => p[0])) < FACE_X ? 'l' : 'r'
  const row = Math.min(...pts.map(p => p[1])) < 340 ? 'u' : 'd'
  return `<path class="wh wh-${side} wh-${row}" d="${sub}" fill="#ffffff"/>`
}).join('')
const markWhiskers = head => head.replace(WHISKERS, (_, d) => splitWhiskers(d))

for (const [key, meta] of Object.entries(NAMES)) {
  const pk = JSON.parse(readFileSync(`${work}/pack_${key}.json`, 'utf8'))
  const m = pk.parts.body.match(/^(<g class="tail">[\s\S]*?<\/g>)([\s\S]*)$/)
  if (!m) throw new Error(`${key}: в теле нет группы хвоста`)
  const [vx, vy, vw, vh] = pk.viewBox
  const k = Math.min(200 / vw, 240 / vh)
  const out = {
    id: meta.id, title: meta.title, gender: meta.gender, native: 'left',
    fit: { k: +k.toFixed(5), tx: +(-vx * k).toFixed(3), ty: +(240 - (vy + vh) * k).toFixed(3) },
    tailBase: TAIL_BASE[key],
    tail: shift(m[1], TAIL_BASE[key]).replace(/^<g class="tail">|<\/g>$/g, ''),
    body: m[2], head: markWhiskers(pk.parts.head), mouthTable: pk.mouthTable,
    neck: [297, 440], // центр поворота наклона головы
    states: pk.states,
  }
  // «6.0» → «6» и «.85» → «0.85» в атрибутах (Python пишет числа так): короче, и разбор в деревья даёт те же строки, что и разбор спрайта из SVG
  const text = JSON.stringify(out).replace(/=\\"(-?\d+)\.0\\"/g, '=\\"$1\\"').replace(/=\\"(-?)\.(\d+)\\"/g, '=\\"$10.$2\\"')
  writeFileSync(new URL(`${meta.id}.json`, OUT), text)
  console.log(meta.id, Math.round(text.length / 1024) + ' КБ', Object.keys(out.states).join(','))
}

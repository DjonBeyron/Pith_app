// Концепт нового персонажа: дымчато-серая кошка (по фото) на основе Мии. Берёт готовый спрайт sprites/mascot/mia.json и меняет только внешний вид:
// мех и обводка перекрашены, бантик / ошейник / серёжки / белая мордочка и капля убраны, нос тёмный, глаза — крупные, почти круглые, жёлто-зелёный и янтарный,
// зрачок — тонкая вертикальная щель. Анимаций нет: статичная картинка для согласования внешности.
// Запуск: node scripts/mascot/concept_gray.mjs <папка_результата>   → gray.svg (+ gray.json — спрайт в формате маскотов, состояние только base)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { edgeLocks, chestRuff, furTicks } from './gray_fluff.mjs'
const out = process.argv[2]
if (!out) { console.error('нужна папка результата'); process.exit(1) }
mkdirSync(out, { recursive: true })
const mia = JSON.parse(readFileSync(new URL('../../src/features/scene/v2/sprites/mascot/mia.json', import.meta.url), 'utf8'))

// палитра: старый цвет Мии → новый. Белое (мордочка, грудь, носочки) заменяется отдельно — у фото кошки светлых пятен нет, только чуть светлее мех на груди и мордочке
const FUR = '#656772', SHADE = '#50525d', OL = '#26252e', LIGHT = '#767883', PAW = '#5b5d68', EAR = '#8a6b73', NOSE = '#4a3b45'
const MAP = { '#b7bfcc': FUR, '#98a1b3': SHADE, '#575164': OL, '#e6e9f0': PAW, '#ffcfd8': EAR, '#ff8db5': NOSE }

function recolor(s) {
  return s.replace(/#[0-9a-fA-F]{3,6}\b/g, c => MAP[c.toLowerCase()] ?? c)
}

// ── голова: убрать украшения (серьги, бантик, брови-группу), белую мордочку и каплю перекрасить в светлый мех ──
function cutDeco(head) {
  const a = head.indexOf('<g class="girl-deco">'), b = head.indexOf('<g class="dc"></g>')
  return head.slice(0, a) + head.slice(b)
}
function muzzle(head) {   // узел 1 — белая мордочка + капля: капля уходит совсем, мордочка — чуть светлее остального меха
  return head.replace(/<path d="(M296 346\.8[^"]*?)(M296 192[^"]*)" fill="#ffffff"\/>/, (_, m) => `<path d="${m}" fill="${LIGHT}"/>`)
}
// усы белые (fill #ffffff, M147.7…) и на тёмной морде должны остаться светлыми — слегка приглушаем
const whisk = h => h.replace(/(<path d="M147\.7 327[^"]*") fill="#ffffff"/, '$1 fill="#d9dbe4"')
// щёки: розовый румянец Мии → едва заметный
const blush = h => h.replace(/fill="#f58aaa" opacity="0\.55"/, `fill="${SHADE}" opacity="0.5"`)
// мордочка: чёрный контур рта темнее меха, но мягче чистого чёрного
const mouth = h => h.replace(/stroke="#000"/g, `stroke="${OL}"`)

// ── глаза ──
const EYES = [{ cx: 205, s: -1, iris: ['#7f8a3f', '#a9b05a', '#cfd37a', '#e9e7a6'] },    // левый — жёлто-зелёный
              { cx: 387, s: 1, iris: ['#a8701a', '#d29a2c', '#ecbf55', '#f7dc8f'] }]   // правый — янтарный
const CY = 299
// форма глаза (почти круглый миндаль): внутренний уголок у носа чуть ниже и острее, наружный выше и мягче. u — наружу, (0,0) — центр глаза
function eyeShape(cx, s, k = 1) {
  const P = (u, y) => `${(cx + s * u * k).toFixed(1)} ${(CY + y * k).toFixed(1)}`
  return `M${P(-47, 6)}C${P(-44, -22)} ${P(-22, -38)} ${P(2, -38)}C${P(30, -38)} ${P(50, -22)} ${P(52, -2)}C${P(46, 24)} ${P(24, 38)} ${P(-2, 38)}C${P(-26, 38)} ${P(-42, 26)} ${P(-47, 6)}Z`
}
const circle = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${extra}/>`
function eye({ cx, s, iris }) {
  const gx = cx + s * 3                                   // радужка чуть смещена наружу
  const upper = `M${cx + s * -47} ${CY + 6}C${cx + s * -44} ${CY - 22} ${cx + s * -22} ${CY - 38} ${cx + s * 2} ${CY - 38}C${cx + s * 30} ${CY - 38} ${cx + s * 50} ${CY - 22} ${cx + s * 52} ${CY - 2}C${cx + s * 34} ${CY - 25} ${cx + s * 8} ${CY - 29} ${cx + s * -20} ${CY - 22}C${cx + s * -33} ${CY - 17} ${cx + s * -42} ${CY - 6} ${cx + s * -47} ${CY + 6}Z`
  return (
    `<path d="${eyeShape(cx, s, 1.06)}" fill="${OL}"/>` +                                   // тёмная обводка (шерсть вокруг глаза)
    `<path d="${eyeShape(cx, s)}" fill="${iris[0]}"/>` +                                      // край радужки
    circle(gx, CY + 1, 32, iris[1]) + circle(gx, CY + 1, 24, iris[2]) + circle(gx, CY + 1, 15, iris[3]) +
    `<path class="pu" data-x="${gx}" data-y="${CY + 1}" d="M${gx} ${CY - 31}C${gx + 8} ${CY - 14} ${gx + 8} ${CY + 16} ${gx} ${CY + 33}C${gx - 8} ${CY + 16} ${gx - 8} ${CY - 14} ${gx} ${CY - 31}Z" fill="#16151b"/>` +
    `<path d="${upper}" fill="${OL}" opacity=".3"/>` +                                      // тень верхнего века
    `<ellipse cx="${gx - 13}" cy="${CY - 15}" rx="8" ry="6.5" fill="#ffffff" opacity=".95"/>` + circle(gx + 13, CY + 17, 3.3, '#ffffff', ' opacity=".7"') +
    `<path d="M${cx + s * -44} ${CY + 3}C${cx + s * -42} ${CY - 25} ${cx + s * -20} ${CY - 41} ${cx + s * 3} ${CY - 41}C${cx + s * 32} ${CY - 41} ${cx + s * 54} ${CY - 24} ${cx + s * 56} ${CY - 3}" fill="none" stroke="${OL}" stroke-width="7" stroke-linecap="round"/>`   // веко
  )
}
// длинные светлые волоски над глазами (как на фото)
const brow = ({ cx, s }) => [[-10, -58, 36, -92, 70, -86], [-26, -52, 8, -78, 34, -90]].map(([u0, y0, u1, y1, u2, y2]) =>
  `<path d="M${cx + s * u0} ${CY + y0}Q${cx + s * u1} ${CY + y1} ${cx + s * u2} ${CY + y2}" fill="none" stroke="#c9cbd4" stroke-width="3" stroke-linecap="round" opacity=".7"/>`).join('')

// ── тело: убрать ошейник и сердечко (узлы 18–21), белую грудь заменить светлым мехом ──
function body(b) {
  const parts = b.match(/<path [^>]*\/>/g)
  const kept = parts.filter((_, i) => i < 18)
  return recolor(kept.join('')).replace(/fill="#ffffff"/g, `fill="${LIGHT}"`)   // грудь и носочки — чуть светлее основного меха
}
const tail = t => recolor(t).replace(/fill="#ffffff"/g, `fill="${FUR}"`)       // кончик хвоста — того же цвета, что хвост

// режим: fluffy (по умолчанию), smooth — гладкая, mia — Мия как есть (белые пятна, бантик, ошейник, серьги), только перекрашена, глаза новые
const mode = process.argv[3] ?? 'fluffy'
const fluffy = mode === 'fluffy'
// Пушистость (gray_fluff.mjs): пряди по контуру щёк и подбородка, воротник на груди, штрихи шерсти, лохматый хвост
const outlineD = (xml, w) => xml.match(new RegExp(`<path d="([^"]*)" fill="none" stroke="${OL}" stroke-width="${w}"`))[1]
function furHead(h) {
  const d = outlineD(h, 7), c = { fill: FUR, ol: OL }
  const cheeks = edgeLocks(d, { ...c, gap: 30, filter: (x, y) => y > 262 && y < 440 && (x < 190 || x > 402 || y > 425), len: 34, w: 30, sweep: .5, sw: 6, seed: 3 })
  const i = h.indexOf('/>', h.indexOf(`stroke="${OL}" stroke-width="7"`)) + 2
  return h.slice(0, i) + cheeks + h.slice(i)
}
function furTail(t) {   // хвост в своих координатах (начало — основание); пряди по обоим краям
  const d = t.match(/<path class="tl-fill" d="([^"]*)"/)[1]
  const locks = edgeLocks(d, { fill: FUR, ol: OL, gap: 30, filter: () => true, len: 15, w: 24, sweep: .3, sw: 5, seed: 7, jitter: .25 })
  return t.replace(/(<path class="tl-fill"[^>]*\/>)/, `$1${locks}`)
}
const headS = mode === 'mia' ? recolor(mia.head) : recolor(mouth(blush(whisk(muzzle(cutDeco(mia.head))))))
const head = fluffy ? furHead(headS) + furTicks(SHADE) : headS
const bodyS = mode === 'mia' ? recolor(mia.body) : body(mia.body)
const bodyF = fluffy ? bodyS + chestRuff({ fill: LIGHT, fill2: FUR, ol: OL }) : bodyS
const tailS = mode === 'mia' ? recolor(mia.tail) : tail(mia.tail)
const tailF = fluffy ? furTail(tailS) : tailS
const eyes = EYES.map(eye).join('') + EYES.map(brow).join('')

const sprite = {
  ...mia, id: 'gray', title: 'Серая кошка (концепт)',
  tail: tailF, body: bodyF, head,
  states: { base: { ...mia.states.base, eyes, brows: '', deco: '' } },
}
const name = mode === 'mia' ? 'gray_mia' : 'gray'
writeFileSync(`${out}/${name}.json`, JSON.stringify(sprite))

const [bx, by] = mia.tailBase
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 40 640 720" width="640" height="720"><rect x="40" y="40" width="640" height="720" fill="#f4f1ec"/>` +
  `<g transform="translate(${bx} ${by})">${sprite.tail}</g>${sprite.body}${sprite.head}${eyes}</svg>`
writeFileSync(`${out}/${name}.svg`, svg)
console.log('готово:', out)

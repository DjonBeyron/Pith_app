// Сборка «истории»: фон кафе и предметы — спрайты проекта; два героя из пакетов (pack_boy.json / pack_girl.json) с состояниями мимики; реплики и окна состояний — из story.json
import { readFileSync, writeFileSync } from 'node:fs'
const REPO = new URL('../../src/features/scene/v2/', import.meta.url)   // спрайты проекта (фон кафе и предметы)
const { backgroundSprite, getSprite } = await import(new URL('sprites/spriteRegistry.js', REPO).href)
const { slotsInDrawOrder, CAT_PLACEMENT } = await import(new URL('sprites/slots.js', REPO).href)
const { treeToString } = await import(new URL('sprites/svgTree.js', REPO).href)
const { demoCafeScene } = await import(new URL('demoScenes.js', REPO).href)
const [work, out, storyJson] = process.argv.slice(2)
const story = JSON.parse(readFileSync(storyJson, 'utf8'))
const A = JSON.parse(readFileSync(`${work}/pack_boy${process.env.PACKSUF || ''}.json`, 'utf8')), B = JSON.parse(readFileSync(`${work}/pack_girl${process.env.PACKSUF || ''}.json`, 'utf8'))
const scene = demoCafeScene
const bg = treeToString(backgroundSprite(scene.location).build())
const props = slotsInDrawOrder(scene.location).map(slot => {
  const id = scene.slots?.[slot.id]; const sp = id ? getSprite(id) : null
  if (!sp || sp.kind !== 'prop') return ''
  const s = slot.scale ?? 1
  return `<g data-slot="${slot.id}" transform="translate(${slot.x} ${slot.y})${s !== 1 ? ` scale(${s})` : ''}">${treeToString(sp.build())}</g>`
}).join('')
const [vx, vy, vw, vh] = A.viewBox
const k = Math.min(200 / vw, 240 / vh), ty = 240 - (vy + vh) * k
function catLayers(who, flip, place, sc, pack) {
  const m = pack.parts.body.match(/^(<g class="tail">[\s\S]*?<\/g>)([\s\S]*)$/)
  const sp = { x: place.x, y: place.y + sc * (ty + k * vy), w: 200 * sc, h: k * vh * sc }
  const pct = (v, tot) => (v / tot * 100).toFixed(3) + '%'
  const svg = (cls, inner) => `<svg class="${cls}" viewBox="${vx} ${vy} ${vw} ${vh}" aria-hidden="true">${inner}</svg>`
  return `<div class="catbox cat" id="cat-${who}" style="left:${pct(sp.x, 360)};top:${pct(sp.y, 640)};width:${pct(sp.w, 360)};height:${pct(sp.h, 640)}${flip ? ';transform:scaleX(-1)' : ''}">` +
    svg('tail-g', m[1]) + svg('body-g', m[2]) + svg('face-g', `${pack.parts.head}<g class="ey"></g><g class="eyes-closed">${pack.parts.eyes_closed}</g>`) + '</div>'
}
const layered = catLayers('a', true, CAT_PLACEMENT.a, CAT_PLACEMENT.scale, A) + catLayers('b', false, CAT_PLACEMENT.b, CAT_PLACEMENT.scale, B)
const packs = { a: { id: 'Кит', tailProfile: A.tailProfile, mouthTable: A.mouthTable, states: A.states }, b: { id: 'Мия', tailProfile: B.tailProfile, mouthTable: B.mouthTable, states: B.states } }
const tailJs = readFileSync(new URL('./tail.mjs', import.meta.url), 'utf8').replace(/^export /gm, '')
let html = readFileSync(new URL('./story_template.html', import.meta.url), 'utf8')
html = html.replace('__TAILJS__', () => tailJs + "\nuseTailProfile('boy');").replace('__BG__', () => bg + props).replace('__CATSHTML__', () => layered)
  .replace('__PACKS__', () => JSON.stringify(packs)).replace('__LINES__', () => JSON.stringify(story.lines)).replace('__WINDOWS__', () => JSON.stringify(story.windows))
  .replaceAll('__TITLE__', story.title || 'Кит и Мия: знакомство').replace('__NOTE__', story.note || 'Конструктор: состояния мимики (глаза, брови, декор, рот), реакция зрачков и дополнительная мимика включаются флажками. Нажмите «Играть», включите звук.')
writeFileSync(out, html)
console.log('история записана:', out, Math.round(html.length / 1024) + ' КБ')

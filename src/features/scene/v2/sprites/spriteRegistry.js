import { countNodes } from './svgTree.js'
import { buildCat, CAT_VIEWBOX, CAT_PARTS, DEFAULT_PALETTE } from './catSprite.js'
import { OFFICE_PROPS } from './propsOffice.js'
import { CAFE_PROPS } from './propsCafe.js'
import { COMMON_PROPS } from './propsCommon.js'
import { BACKGROUNDS, SCENE_VIEWBOX } from './backgrounds.js'
import { SLOTS_BY_LOCATION } from './slots.js'
import { buildMascot } from './mascot/mascotSprite.js'
import { MASCOT_PACKS, SKINS, SKIN_TITLES } from './mascot/mascots.js'

// Реестр спрайтов конструктора сцен. Каждая запись: id, title (рус.),
// category ('character-part' | 'office' | 'cafe' | 'common' | 'background'),
// kind ('cat' | 'prop' | 'background'), slots (в какие слоты ставится — у
// предметов), size, anchor, nodeCount (считается из дерева), status-бейдж
// ('builtin' — встроенный; 'designer' появится на этапе 2 для загруженных) и
// build(props) → дерево svgTree. Админка этапа 2 показывает этот список.

export const CAT_VARIANTS = [
  { id: 'cat-male', title: 'Кот (мужской)', gender: 'male' },
  { id: 'cat-female', title: 'Кошка (женский)', gender: 'female' },
]

function slotsAccepting(spriteId) {
  const out = []
  for (const [location, slots] of Object.entries(SLOTS_BY_LOCATION)) {
    for (const s of slots) if (s.accepts.includes(spriteId)) out.push(`${location}/${s.id}`)
  }
  return out
}

function propEntry(p) {
  const tree = p.build()
  return {
    ...p,
    kind: 'prop',
    status: 'builtin',
    viewBox: `${-p.size.w / 2} ${p.anchor === 'top' ? 0 : p.anchor === 'center' ? -p.size.h / 2 : -p.size.h} ${p.size.w} ${p.size.h}`,
    slots: slotsAccepting(p.id),
    nodeCount: countNodes(tree),
  }
}

function catEntry(v) {
  const build = (props = {}) => buildCat({ ...props, gender: v.gender })
  return {
    id: v.id,
    title: v.title,
    category: 'character-part',
    kind: 'cat',
    gender: v.gender,
    status: 'builtin',
    viewBox: CAT_VIEWBOX,
    size: { w: 200, h: 240 },
    anchor: 'bottom',
    slots: [],
    parts: CAT_PARTS,
    nodeCount: countNodes(build({ palette: DEFAULT_PALETTE })),
    build,
  }
}

// Маскоты (Пит, Мия) — тот же вид записи 'cat', но с skin: рисуются из пакета (sprites/mascot), а не из палитры
function mascotEntry(skin) {
  const build = (props = {}) => buildMascot(skin, props)
  return {
    id: `mascot-${skin}`,
    title: SKIN_TITLES[skin],
    category: 'character-part',
    kind: 'cat',
    checkKind: 'mascot', // правила spriteCheck.js для маскота
    skin,
    gender: MASCOT_PACKS[skin].gender,
    status: 'builtin',
    viewBox: CAT_VIEWBOX,
    size: { w: 200, h: 240 },
    anchor: 'bottom',
    slots: [],
    parts: CAT_PARTS,
    nodeCount: countNodes(build()),
    build,
  }
}

function backgroundEntry(b) {
  return {
    id: `bg-${b.id}`,
    title: `Фон: ${b.title}`,
    category: 'background',
    kind: 'background',
    location: b.id,
    status: 'builtin',
    viewBox: SCENE_VIEWBOX,
    size: { w: 360, h: 640 },
    anchor: 'center',
    slots: [],
    nodeCount: countNodes(b.build()),
    build: b.build,
  }
}

export const SPRITES = [
  ...CAT_VARIANTS.map(catEntry),
  ...SKINS.map(mascotEntry),
  ...OFFICE_PROPS.map(propEntry),
  ...CAFE_PROPS.map(propEntry),
  ...COMMON_PROPS.map(propEntry),
  ...Object.values(BACKGROUNDS).map(backgroundEntry),
]

const BY_ID = new Map(SPRITES.map(s => [s.id, s]))

export function getSprite(id) {
  return BY_ID.get(id) ?? null
}

export function isPropId(id) {
  return BY_ID.get(id)?.kind === 'prop'
}

export const PROP_IDS = SPRITES.filter(s => s.kind === 'prop').map(s => s.id)

export function catSprite(gender) {
  return BY_ID.get(gender === 'female' ? 'cat-female' : 'cat-male')
}

// Спрайт персонажа сцены: маскот по skin, иначе обычный кот по полу
export function characterSprite(character) {
  return (character?.skin && BY_ID.get(`mascot-${character.skin}`)) || catSprite(character?.gender)
}

export function backgroundSprite(location) {
  return BY_ID.get(`bg-${location}`) ?? BY_ID.get('bg-office')
}

// Предметы, которые можно поставить в данный слот (для выпадашки сборщика)
export function spritesForSlot(slot) {
  return slot.accepts.map(id => BY_ID.get(id)).filter(Boolean)
}

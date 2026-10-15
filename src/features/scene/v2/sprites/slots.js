// Слоты — именованные ячейки сцены, в которые ставятся предметы. У каждого:
// id, подпись, якорь (x, y в viewBox сцены 0 0 360 640), масштаб, слой
// отрисовки и список совместимых спрайтов (accepts). Пять слотов общие для
// обеих локаций, пять — свои у офиса и у кафе. Значение слота в сцене — id
// спрайта или null (пусто). Якорь трактуется по anchor спрайта: bottom —
// предмет стоит на точке, center — висит центром, top — подвешен за точку.
//
// Компактная композиция (стандарт 2026-10-15): настенные предметы собраны к центру кадра — окно y 177…347, доска/меню
// 195…265, картина 278…332, часы 130…186, подвесная лампа 100…170 (шнур уходит вверх за кадр); раньше они жались к верху
// (y 28…277), и между ними и котами была пустая стена. Коты, стол, пол, стойка кафе — на прежних местах. Над y ≈ 130 в ленте
// на телефонах лежит верхняя панель — важного там нет. Кадр ниже 640 — «безопасный пол» (фон продолжается, см. backgrounds.js).
//
// Геометрия: коты стоят внизу (их верх ≈ y 444), поэтому всё, что выше
// y ≈ 440, котами не перекрывается; стол (y 410–470) стоит на полу, его
// столешница и предметы на ней — выше голов, облачко — выше предметов.

export const LAYERS = ['wall', 'floor', 'table', 'tabletop']

// Где стоят коты (viewBox сцены): a слева, b справа; масштаб кота 200×240 → 140×168.
// solo — одиночный кот (scenePit.js): центр головы (x 100 в спрайте → 70 после масштаба) ровно на оси сцены x 180
export const CAT_PLACEMENT = { a: { x: 22, y: 444 }, b: { x: 198, y: 444 }, solo: { x: 110, y: 444 }, scale: 0.7 }

// Позиция кота: у одиночной сцены единственный кот a стоит по центру
export function catPlacement(who, solo = false) {
  return solo ? CAT_PLACEMENT.solo : CAT_PLACEMENT[who]
}

const COMMON_SLOTS = [
  { id: 'window', title: 'Окно на стене слева', x: 128, y: 262, layer: 'wall', accepts: ['window'] },
  { id: 'wall-art', title: 'Стена справа, ниже', x: 262, y: 305, layer: 'wall', accepts: ['picture', 'wall-clock', 'menu-board'] },
  { id: 'floor-left', title: 'Пол у левой стены', x: 26, y: 468, layer: 'floor', scale: 0.9, accepts: ['plant', 'floor-lamp'] },
  { id: 'floor-right', title: 'Пол у правой стены', x: 334, y: 468, layer: 'floor', scale: 0.9, accepts: ['plant', 'floor-lamp'] },
  { id: 'table', title: 'Стол между персонажами', x: 180, y: 470, layer: 'table', accepts: ['table'] },
]

const OFFICE_SLOTS = [
  { id: 'wall-board', title: 'Стена справа, выше (доска)', x: 262, y: 230, layer: 'wall', accepts: ['whiteboard', 'picture', 'menu-board'] },
  { id: 'wall-clock', title: 'Часы над окном', x: 300, y: 158, layer: 'wall', accepts: ['wall-clock'] },
  { id: 'desk-left', title: 'На столе слева', x: 142, y: 412, layer: 'tabletop', needs: 'table', accepts: ['laptop', 'mug', 'papers', 'coffee-cup'] },
  { id: 'desk-center', title: 'На столе в центре', x: 180, y: 412, layer: 'tabletop', needs: 'table', accepts: ['laptop', 'mug', 'papers', 'coffee-cup', 'pastry-plate'] },
  { id: 'desk-right', title: 'На столе справа', x: 220, y: 412, layer: 'tabletop', needs: 'table', accepts: ['laptop', 'mug', 'papers', 'coffee-cup'] },
]

const CAFE_SLOTS = [
  { id: 'wall-menu', title: 'Стена справа, выше (меню)', x: 262, y: 230, layer: 'wall', accepts: ['menu-board', 'picture', 'whiteboard'] },
  { id: 'ceiling', title: 'Потолок над столом', x: 180, y: 100, layer: 'wall', accepts: ['pendant-lamp'] },
  { id: 'counter', title: 'Стойка у правой стены', x: 300, y: 392, layer: 'floor', accepts: ['coffee-machine', 'coffee-cup', 'pastry-plate', 'mug'] },
  { id: 'table-left', title: 'На столе слева', x: 148, y: 412, layer: 'tabletop', needs: 'table', accepts: ['coffee-cup', 'pastry-plate', 'mug', 'papers'] },
  { id: 'table-right', title: 'На столе справа', x: 214, y: 412, layer: 'tabletop', needs: 'table', accepts: ['coffee-cup', 'pastry-plate', 'mug', 'laptop'] },
]

export const SLOTS_BY_LOCATION = {
  office: [...COMMON_SLOTS, ...OFFICE_SLOTS],
  cafe: [...COMMON_SLOTS, ...CAFE_SLOTS],
}

export const COMMON_SLOT_IDS = COMMON_SLOTS.map(s => s.id)

export function slotsFor(location) {
  return SLOTS_BY_LOCATION[location] ?? []
}

export function getSlot(location, slotId) {
  return slotsFor(location).find(s => s.id === slotId) ?? null
}

export function slotAccepts(slot, spriteId) {
  return !!slot && slot.accepts.includes(spriteId)
}

// Пустой набор слотов локации: { [slotId]: null }
export function emptySlots(location) {
  return Object.fromEntries(slotsFor(location).map(s => [s.id, null]))
}

// Порядок отрисовки слотов: стена → пол → стол → на столе (внутри — как в списке)
export function slotsInDrawOrder(location) {
  return [...slotsFor(location)].sort((a, b) => LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer))
}

import { CAT_PARTS, CAT_VIEWBOX } from '../../../scene/v2/sprites/catSprite.js'
import { SCENE_VIEWBOX } from '../../../scene/v2/sprites/backgrounds.js'
import { FORBIDDEN_TAGS, SPRITE_KINDS } from '../../../scene/v2/spriteCheck.js'
import { NODE_BUDGET } from '../../../scene/v2/sceneBudget.js'
import { MOUTH_CYCLE, MOUTH_STEP_MS } from '../../../scene/v2/mouthDriver.js'
import { LAYERS, SLOTS_BY_LOCATION } from '../../../scene/v2/sprites/slots.js'
import { TAG_WORDS } from '../designerHowToTexts.js'
import { APP_VERSION } from '../../../../shared/lib/version.js'

// Константы ядра одним объектом — то, что уходит в автономные файлы пакета дизайнера
// (HTML-проверщик, печатный документ). Единственный источник правды — ядро scene/v2:
// пакет никогда не хранит свои копии чисел. Тесты пакета сверяют вывод с этими значениями.

export const PACK_FILES = {
  checker: 'pithy-svg-check.html',
  doc: 'pithy-designer-spec.html',
  templates: 'pithy-svg-templates.html',
}

// Слоты для предпросмотра предмета в проверщике: по одному на слой + потолок
export const PREVIEW_SLOTS = [
  { id: 'desk-center', label: 'На столе', location: 'office' },
  { id: 'wall-art', label: 'На стене', location: 'office' },
  { id: 'floor-left', label: 'На полу', location: 'office' },
  { id: 'ceiling', label: 'Под потолком', location: 'cafe' },
].map(p => {
  const s = SLOTS_BY_LOCATION[p.location].find(x => x.id === p.id)
  return { id: p.id, label: p.label, x: s.x, y: s.y, scale: s.scale ?? 1, layer: s.layer }
})

export const EMOTIONS = ['neutral', 'happy', 'tired', 'surprised']

export function packConstants() {
  return {
    version: APP_VERSION,
    CAT_PARTS, CAT_VIEWBOX, SCENE_VIEWBOX, FORBIDDEN_TAGS, SPRITE_KINDS, NODE_BUDGET,
    MOUTH_CYCLE, MOUTH_STEP_MS, LAYERS, TAG_WORDS, EMOTIONS, PREVIEW_SLOTS,
    tableRect: { x: 105, y: 410, w: 150, h: 60 },
    floorY: 430,
  }
}

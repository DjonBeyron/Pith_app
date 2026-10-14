import { CAT_VIEWBOX } from '../../scene/v2/sprites/catSprite.js'

// Шаблоны SVG для внешнего дизайнера («Для дизайнера» → «Скачать шаблон»): готовые
// пустые именованные группы data-part и бледный контур-подсказка, куда что рисовать.
// Оба шаблона проходят checkSpriteSvg своего типа (см. designerTemplates.test.js) —
// дизайнер заменяет контуры своими фигурами, сохраняя группы и их имена.

const HINT = 'fill="none" stroke="#b0b8c4" stroke-width="1.5" stroke-dasharray="4 3"'

export function catTemplateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CAT_VIEWBOX}" width="200" height="240">
  <title>Шаблон кота Pithy (viewBox 0 0 200 240)</title>
  <desc>Замените пунктирные контуры своими фигурами. Группы data-part и data-viseme обязательны, имена менять нельзя. Цвета fill — #rrggbb. Запрещены: filter, mask, clipPath, gradient, image, use, script, style, анимации.</desc>
  <!-- Хвост: справа у основания тела, точка (0,0) группы — у крестца -->
  <g data-part="tail" transform="translate(148 200)">
    <path d="M0 0 C 26 -6, 44 -42, 30 -78" ${HINT}/>
  </g>
  <!-- Тело: овал внизу, лапы — отдельная группа внутри -->
  <g data-part="body">
    <ellipse cx="100" cy="176" rx="56" ry="54" ${HINT}/>
    <g data-part="paws">
      <ellipse cx="74" cy="224" rx="19" ry="10" ${HINT}/>
      <ellipse cx="126" cy="224" rx="19" ry="10" ${HINT}/>
    </g>
  </g>
  <!-- Голова: центр в (100,96), радиус ≈ 48; всё лицо — в её координатах -->
  <g data-part="head" transform="translate(100 96)">
    <g data-part="ears">
      <polygon points="-44,-16 -36,-64 -6,-40" ${HINT}/>
      <polygon points="44,-16 36,-64 6,-40" ${HINT}/>
    </g>
    <circle r="48" ${HINT}/>
    <g data-part="face">
      <!-- Глаза: два овала по бокам; эмоции (happy/tired/surprised) — отдельными файлами или веками -->
      <g data-part="eyes">
        <ellipse cx="-18" cy="-4" rx="11" ry="13" ${HINT}/>
        <ellipse cx="18" cy="-4" rx="11" ry="13" ${HINT}/>
      </g>
      <polygon data-part="nose" points="-5,12 5,12 0,18" ${HINT}/>
      <path data-part="whiskers" d="M-28 14 L-56 8 M-28 20 L-56 22 M28 14 L56 8 M28 20 L56 22" ${HINT}/>
      <!-- Рот: три формы лежат одновременно, приложение показывает одну по data-viseme -->
      <g data-part="mouth" transform="translate(0 22)">
        <g data-viseme="closed"><path d="M-9 0 Q-4.5 5 0 1 Q4.5 5 9 0" ${HINT}/></g>
        <g data-viseme="half"><ellipse cy="5" rx="6" ry="3.5" ${HINT}/></g>
        <g data-viseme="open"><ellipse cy="7" rx="8" ry="7.5" ${HINT}/></g>
      </g>
    </g>
  </g>
</svg>
`
}

// Предмет: точка (0,0) — якорь. Для напольных/настольных — нижняя середина (предмет
// растёт вверх, в минус по y); для настенных — центр; для потолочных — верхняя середина
export function propTemplateSvg({ id = 'my-prop', w = 60, h = 60, anchor = 'bottom' } = {}) {
  const y0 = anchor === 'top' ? 0 : anchor === 'center' ? -h / 2 : -h
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2} ${y0} ${w} ${h}" width="${w}" height="${h}">
  <title>Шаблон предмета Pithy: ${id} (${w}×${h}, якорь ${anchor})</title>
  <desc>Точка (0,0) — якорь предмета: ${anchor === 'bottom' ? 'нижняя середина, предмет стоит на ней' : anchor === 'center' ? 'центр, предмет висит на стене' : 'верхняя середина, предмет подвешен'}. Одна группа data-part с именем предмета, до 12 фигур, цвета #rrggbb, без фильтров/градиентов/картинок.</desc>
  <g data-part="${id}">
    <rect x="${-w / 2 + 1}" y="${y0 + 1}" width="${w - 2}" height="${h - 2}" rx="4" ${HINT}/>
    <path d="M-6 0 H6 M0 -6 V6" stroke="#e0564e" stroke-width="1.5" fill="none"/>
  </g>
</svg>
`
}

export const TEMPLATE_FILES = [
  { id: 'cat', title: 'Шаблон кота', file: 'pithy-cat-template.svg', make: catTemplateSvg },
  { id: 'prop', title: 'Шаблон предмета (напольный)', file: 'pithy-prop-template.svg', make: () => propTemplateSvg() },
  { id: 'prop-wall', title: 'Шаблон настенного предмета', file: 'pithy-prop-wall-template.svg', make: () => propTemplateSvg({ id: 'my-wall-prop', w: 80, h: 60, anchor: 'center' }) },
]

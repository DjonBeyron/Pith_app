import { MIA_TAIL_FRAMES } from './miaTailData.js'

// Хвост Мии в игре — 9 кадров рисунка (miaTailData.js) вместо прежней гнущейся кривой; кадры сменяются CSS-анимацией (race-mia.css, `.mt:nth-child(n)`).
// Цвета те же, что у тела пака mia2 (заливка #646774, обводка #262432), белые штрихи — #e6e8ee. Только для эпизода Мии: общий пак mia2 (уроки, сборщик сцен) не меняется.
export const TAIL_FILL = '#646774'
export const TAIL_LINE = '#262432'
export const TAIL_MARK = '#e6e8ee'
export const TAIL_LINE_W = '4.9' // толщина обводки в единицах пака (≈ 2,7 px гифки)
export const TAIL_FRAME_MS = 160
export const TAIL_CALM = 3 // кадр, на котором хвост замирает, когда Мия довольна (хвост поднят — кадр 4; штрихи в этом состоянии скрыты CSS)

const node = (tag, attrs) => ({ tag, attrs, children: [] })

/** Дерево кадров: на каждый кадр группа `g.mt` с силуэтом хвоста и (если есть) путём штрихов `.mk` */
export function miaTailTree() {
  return MIA_TAIL_FRAMES.map(f => ({
    tag: 'g', attrs: { class: 'mt' },
    children: [
      node('path', { d: f.tail, fill: TAIL_FILL, stroke: TAIL_LINE, strokeWidth: TAIL_LINE_W, strokeLinejoin: 'round' }),
      ...(f.marks ? [node('path', { class: 'mk', d: f.marks, fill: TAIL_MARK, fillOpacity: '0.92' })] : []),
    ],
  }))
}

/** Подменяет хвост у дерева Мии (buildMascot) на кадры: внутри part tail остаётся обёртка g.cat-tail (на неё действует состояние «довольна») */
export function withTailFrames(cat) {
  const part = cat.children.find(c => c.attrs['data-part'] === 'tail')
  const wrap = part?.children?.find(c => (c.attrs?.class ?? '').split(' ').includes('cat-tail'))
  if (wrap) wrap.children = miaTailTree()
  return cat
}

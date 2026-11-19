import { MIA_TAIL_FRAMES, MIA_TAIL_MARKS } from './miaTailData.js'

// Хвост Мии в игре (владелец, v3.3.293: «мне нравилась анимация до ускорения, просто было мало fps — не перерисовывай, попробуй ускорить»): девять утверждённых кадров «психованного» хвоста (miaTailData.js), без промежуточных; быстрее — за счёт --tail-ms в CSS.
// Здесь только дерево узлов: 9 контуров `.mt` (заливка + обводка) и пути белых штрихов `.mk`; какой кадр виден, решает CSS (race-mia.css: opacity по слотам цикла, --s — номер кадра, data-n — сколько слотов виден).
// Цвета те же, что у тела пака mia2 (заливка #646774, обводка #262432). Только для эпизода Мии: общий пак mia2 (уроки, сборщик сцен) не меняется.
export const TAIL_FILL = '#646774'
export const TAIL_LINE = '#262432'
export const TAIL_MARK = '#e6e8ee'
export const TAIL_LINE_W = '4.9' // толщина обводки в единицах пака (≈ 2,7 px гифки)

const node = (tag, attrs) => ({ tag, attrs, children: [] })

/** Дерево хвоста: контуры кадров и штрихи поз */
export function miaTailTree() {
  return [
    ...MIA_TAIL_FRAMES.map(f => node('path', { class: 'mt', 'data-n': String(f.n), style: `--s:${f.s}`, d: f.d, fill: TAIL_FILL, stroke: TAIL_LINE, strokeWidth: TAIL_LINE_W, strokeLinejoin: 'round' })),
    ...MIA_TAIL_MARKS.map(m => node('path', { class: 'mk', 'data-n': String(m.n), style: `--s:${m.s}`, d: m.d, fill: TAIL_MARK, fillOpacity: '0.92' })),
  ]
}

/** Подменяет хвост у дерева Мии (buildMascot) на кадры: внутри part tail остаётся обёртка g.cat-tail (на неё действует состояние «довольна») */
export function withTailFrames(cat) {
  const part = cat.children.find(c => c.attrs['data-part'] === 'tail')
  const wrap = part?.children?.find(c => (c.attrs?.class ?? '').split(' ').includes('cat-tail'))
  if (wrap) wrap.children = miaTailTree()
  return cat
}

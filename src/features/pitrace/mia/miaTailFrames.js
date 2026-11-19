import { tailPose, tailPath, MARK_SLOTS, OUT_W } from './miaTailDrive.js'

// Хвост Мии в игре — не картинки, а одна форма, которую каждый кадр экрана пересчитывает miaTailDrive.js по девяти ключевым позам рисунка владельца (miaTailData.js).
// Здесь только дерево узлов: контур хвоста (.mt-tail: заливка + обводка) и MARK_SLOTS путей белых штрихов движения (.mk). Цвета те же, что у тела пака mia2 (заливка #646774, обводка #262432).
// Только для эпизода Мии: общий пак mia2 (уроки, сборщик сцен) не меняется.
export const TAIL_FILL = '#646774'
export const TAIL_LINE = '#262432'
export const TAIL_MARK = '#e6e8ee'

const node = (tag, attrs) => ({ tag, attrs, children: [] })

/** Дерево хвоста: контур в позе 0 (до первого кадра драйвера) и пустые пути штрихов */
export function miaTailTree() {
  return [
    node('path', { class: 'mt-tail', d: tailPath(tailPose(0)), fill: TAIL_FILL, stroke: TAIL_LINE, strokeWidth: String(OUT_W), strokeLinejoin: 'round' }),
    ...Array.from({ length: MARK_SLOTS }, () => node('path', { class: 'mk', d: '', fill: TAIL_MARK, fillOpacity: '0.92', opacity: '0' })),
  ]
}

/** Подменяет хвост у дерева Мии (buildMascot) на форму с драйвером: внутри part tail остаётся обёртка g.cat-tail */
export function withTailFrames(cat) {
  const part = cat.children.find(c => c.attrs['data-part'] === 'tail')
  const wrap = part?.children?.find(c => (c.attrs?.class ?? '').split(' ').includes('cat-tail'))
  if (wrap) wrap.children = miaTailTree()
  return cat
}

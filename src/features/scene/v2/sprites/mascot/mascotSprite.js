import { el, part } from '../svgTree.js'
import { parseMarkup, findByClass, walk, cloneTrees } from './markupTree.js'
import { MASCOT_PACKS, BASE_FACE, isSkin, isFaceOf } from './mascots.js'
import { mouthShapeFor } from './mascotMouth.js'

// Маскот (кот Пит, кошка Мия) как спрайт конструктора: то же дерево svgTree и те же именованные части, что у обычного кота
// (tail / body / head / eyes / mouth) и те же CSS-классы cat-tail / cat-body / cat-head / cat-eyes — дыхание, покачивание головы,
// моргание и хвост идут общими стилями scene-v2-cat.css. Отличия:
//   • рот — не три виземы, а четыре узла (mm, mt, mf, ml) с таблицей из 9 форм Rhubarb: форму пишет mascotMouth.js прямо в DOM;
//   • лицо — состояние (face): глаза + брови + декор + рот в покое + наклон головы + реакция зрачка, подставляются в дерево
//     при сборке (смена реплики перерисовывает кота, как смена эмоции у обычного);
//   • реакция зрачков (pupilReaction) — масштаб зрачка по состоянию и пульс сердечек; extraFace=false — только обычное лицо.
// Спрайт в коробке 200×240, как у кота; родная сторона взгляда — влево (поэтому зеркалится левый персонаж, а не правый).

const parsed = new Map() // skin -> разобранный пакет (деревья), разбор один раз

function parsedPack(skin) {
  let p = parsed.get(skin)
  if (!p) {
    const src = MASCOT_PACKS[skin]
    p = {
      tail: parseMarkup(src.tail), body: parseMarkup(src.body), head: parseMarkup(src.head),
      states: Object.fromEntries(Object.entries(src.states).map(([k, s]) => [k, {
        eyes: parseMarkup(s.eyes), brows: parseMarkup(s.brows), deco: parseMarkup(s.deco),
      }])),
    }
    parsed.set(skin, p)
  }
  return p
}

// Заменяет пустую группу-контейнер (brows / dc) её содержимым: пустая группа в DOM не нужна
function fillContainer(trees, cls, kids) {
  const i = trees.findIndex(t => (t.attrs.class ?? '').split(' ').includes(cls))
  if (i >= 0) { trees.splice(i, 1, ...kids); return }
  for (const t of trees) fillContainer(t.children, cls, kids)
}

function setPupils(eyes, st, pupilReaction, isLove) {
  const [sx, sy] = pupilReaction ? st.pupil : [1, 1]
  walk(eyes, t => {
    if (!(t.attrs.class ?? '').split(' ').includes('pu')) return
    const x = t.attrs['data-x']; const y = t.attrs['data-y']
    delete t.attrs['data-x']; delete t.attrs['data-y']
    if (sx !== 1 || sy !== 1) t.attrs.transform = `translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})`
    if (pupilReaction && isLove) t.attrs.class = 'pu mx-pulse'
  })
}

// Начальная форма рта в дереве: закрытый рот состояния лица (или форма Rhubarb для превью с mouth half / open)
function setMouth(head, skin, face, shape) {
  const e = mouthShapeFor(skin, face, shape)
  const set = (cls, attrs) => { const n = findByClass(head, cls); if (n) Object.assign(n.attrs, attrs) }
  set('mm', { d: e.m.d, fill: e.m.fill, strokeWidth: e.m.sw })
  set('mt', { d: e.t }); set('mf', { d: e.f })
  set('ml', e.l ? { d: e.l.d, strokeWidth: e.l.sw } : { d: '' })
}

// Полное дерево маскота. flip — персонаж справа (взгляд влево): у маскотов это «родная» сторона
export function buildMascot(skin, { face = BASE_FACE, flip = false, pupilReaction = true, extraFace = true, mouth = 'closed' } = {}) {
  if (!isSkin(skin)) throw new Error(`Неизвестный маскот '${skin}'`)
  const pack = MASCOT_PACKS[skin]
  const name = extraFace && isFaceOf(skin, face) ? face : BASE_FACE
  const st = pack.states[name]
  const p = parsedPack(skin)
  const head = cloneTrees(p.head)
  const eyes = cloneTrees(p.states[name].eyes)
  fillContainer(head, 'brows', cloneTrees(p.states[name].brows))
  fillContainer(head, 'dc', cloneTrees(p.states[name].deco))
  const mouthGroup = findByClass(head, 'mouth') ?? findByClass(head, 'mm') // у Мии рот лежит прямо в голове, без группы
  if (mouthGroup) mouthGroup.attrs = { 'data-part': 'mouth', ...mouthGroup.attrs } // data-part первым — так же пишет part()
  if (st.mouth || mouth !== 'closed') setMouth(head, skin, name, mouth)
  setPupils(eyes, st, pupilReaction, name === 'love')

  const [bx, by] = pack.tailBase
  const faceKids = [...head, part('eyes', { class: 'cat-eyes' }, eyes)]
  // Слой наклона головы есть ВСЕГДА (а не только у лиц с наклоном): иначе при смене лица у головы меняется состав детей, она перемонтируется,
  // а наклон прыгает сразу на несколько градусов. Постоянный слой + CSS-переход (.mx-tilt) — наклон плавно доезжает за 0,3 с
  const headKids = [el('g', { class: 'mx-tilt', style: `transform:rotate(${st.tilt}deg)` }, faceKids)]
  const { k, tx, ty } = pack.fit
  return el('g', {
    'data-part': 'cat', 'data-skin': skin, 'data-gender': pack.gender, 'data-face': name, 'data-mouth': mouth, class: 'cat',
    transform: `${flip ? '' : 'translate(200 0) scale(-1 1) '}translate(${tx} ${ty}) scale(${k})`,
  }, [
    part('tail', { transform: `translate(${bx} ${by})` }, [el('g', { class: 'cat-tail' }, cloneTrees(p.tail))]),
    part('body', { class: 'cat-body' }, cloneTrees(p.body)),
    part('head', { class: 'cat-head' }, headKids),
  ])
}

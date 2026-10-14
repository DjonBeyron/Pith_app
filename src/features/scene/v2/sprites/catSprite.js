import { el, part } from './svgTree.js'
import { buildCatFace } from './catFaceSprite.js'

// Кот v2 (viewBox 0 0 200 240), собранный из именованных групп data-part:
// tail / body / paws / head / ears / face(eyes, mouth, whiskers). Цвета — из
// палитры персонажа. Пол меняет силуэт и детали:
//   male   — шире тело, кисточки-щёки на голове, ошейник с жетоном, брови гуще;
//   female — стройнее, бантик на правом ухе, ресницы, стройный хвост с кисточкой.
// Анимируемые группы несут class (cat-tail/cat-body/cat-head/cat-eyes) — CSS
// в scene-v2-cat.css крутит только transform, узлы не пересобираются.

export const CAT_VIEWBOX = '0 0 200 240'
export const CAT_PARTS = ['tail', 'body', 'paws', 'head', 'ears', 'face', 'eyes', 'mouth', 'whiskers']

export const DEFAULT_PALETTE = {
  fur: '#f2a65a',
  belly: '#fde7c8',
  accent: '#f6a9a3', // внутренняя часть уха, нос
  eye: '#5aa36b',
  stripe: '#d9843d',
}

function tail(pal, gender, stripes) {
  const slim = gender === 'female'
  const kids = [
    el('path', {
      d: slim ? 'M0 0 C 30 -4, 50 -40, 34 -84' : 'M0 0 C 26 -6, 44 -42, 30 -78',
      fill: 'none', stroke: pal.fur, strokeWidth: slim ? 12 : 16, strokeLinecap: 'round',
    }),
  ]
  if (stripes) {
    kids.push(el('path', {
      d: slim ? 'M42 -58 C 45 -68, 42 -78, 34 -84' : 'M38 -52 C 42 -62, 40 -72, 30 -78',
      fill: 'none', stroke: pal.stripe, strokeWidth: slim ? 12 : 16, strokeLinecap: 'round',
    }))
  }
  return el('g', { 'data-part': 'tail', transform: 'translate(148 200)' }, [el('g', { class: 'cat-tail' }, kids)])
}

function body(pal, gender, stripes) {
  const wide = gender === 'male'
  const kids = [
    el('ellipse', { cx: 100, cy: 176, rx: wide ? 60 : 52, ry: 54, fill: pal.fur }),
    el('ellipse', { cx: 100, cy: 190, rx: wide ? 38 : 32, ry: 32, fill: pal.belly }),
  ]
  if (stripes) {
    kids.push(el('path', {
      d: 'M50 146 q10 8 18 0 M48 162 q10 8 18 0 M132 146 q10 8 18 0 M134 162 q10 8 18 0',
      fill: 'none', stroke: pal.stripe, strokeWidth: 4, strokeLinecap: 'round',
    }))
  }
  if (wide) {
    kids.push(el('path', { 'data-part': 'collar', d: 'M62 132 Q100 150 138 132', fill: 'none', stroke: '#d8403a', strokeWidth: 7, strokeLinecap: 'round' }))
    kids.push(el('circle', { cx: 100, cy: 146, r: 5, fill: '#f6c94b' }))
  }
  kids.push(part('paws', {}, [
    el('ellipse', { cx: 74, cy: 224, rx: 19, ry: 10, fill: pal.fur }),
    el('ellipse', { cx: 126, cy: 224, rx: 19, ry: 10, fill: pal.fur }),
    el('path', {
      d: 'M68 228 v4 M76 229 v4 M120 228 v4 M128 229 v4',
      fill: 'none', stroke: pal.stripe, strokeWidth: 1.8, strokeLinecap: 'round', opacity: 0.7,
    }),
  ]))
  return part('body', { class: 'cat-body' }, kids)
}

function ears(pal, gender) {
  const kids = [
    el('polygon', { points: '-44,-16 -36,-64 -6,-40', fill: pal.fur }),
    el('polygon', { points: '-37,-22 -33,-52 -14,-37', fill: pal.accent }),
    el('polygon', { points: '44,-16 36,-64 6,-40', fill: pal.fur }),
    el('polygon', { points: '37,-22 33,-52 14,-37', fill: pal.accent }),
  ]
  if (gender === 'female') {
    // Бантик на правом ухе: два лепестка одним path + узелок
    kids.push(el('path', {
      'data-part': 'bow',
      d: 'M36 -54 l-14 -8 l2 16 z M36 -54 l14 -10 l-1 17 z',
      fill: '#e2567a', stroke: '#c43f63', strokeWidth: 1.5, strokeLinejoin: 'round',
    }))
    kids.push(el('circle', { cx: 36, cy: -54, r: 3.4, fill: '#f6c94b' }))
  }
  return part('ears', {}, kids)
}

function head(pal, gender, stripes, emotion) {
  const kids = [ears(pal, gender)]
  if (gender === 'male') {
    // Кисточки-щёки по бокам головы — «взрослый кот»
    kids.push(el('path', { 'data-part': 'tufts', d: 'M-46 4 l-12 6 l12 8 z M46 4 l12 6 l-12 8 z', fill: pal.fur }))
  }
  kids.push(el('circle', { r: gender === 'male' ? 49 : 46, fill: pal.fur }))
  if (stripes) {
    kids.push(el('path', {
      d: 'M-12 -40 q4 10 0 20 M0 -44 q4 12 0 24 M12 -40 q4 10 0 20',
      fill: 'none', stroke: pal.stripe, strokeWidth: 4, strokeLinecap: 'round',
    }))
  }
  kids.push(el('ellipse', { cy: 18, rx: gender === 'male' ? 27 : 23, ry: 18, fill: pal.belly, opacity: 0.9 }))
  kids.push(buildCatFace({ pal, emotion, gender }))
  return el('g', { 'data-part': 'head', transform: 'translate(100 96)' }, [el('g', { class: 'cat-head' }, kids)])
}

// Полное дерево кота. flip — зеркально (правый персонаж смотрит влево)
export function buildCat({ gender = 'male', palette, stripes = true, emotion = 'neutral', flip = false } = {}) {
  const pal = { ...DEFAULT_PALETTE, ...(palette ?? {}) }
  return el('g', {
    'data-part': 'cat',
    'data-gender': gender,
    'data-mouth': 'closed',
    class: 'cat',
    transform: flip ? 'translate(200 0) scale(-1 1)' : undefined,
  }, [
    tail(pal, gender, stripes),
    body(pal, gender, stripes),
    head(pal, gender, stripes, emotion),
  ])
}

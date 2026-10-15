import { CAT_PLACEMENT, catPlacement } from '../../scene/v2/sprites/slots.js'
import { resolveFeedFrame } from '../../scene/v2/sceneFeedFrame.js'
import {
  feedZones, ZONE_GAP, BUBBLE_GAP, HUD_RIGHT, HUD_W, HUD_CLEAR,
} from './feedSlideGeometry.js'

// Чистый расчёт кадра сцены на слайде ленты: размер слайда + занятые зоны + options.feedFrame →
// transform сцены (CSS), положение облачка/иконки паузы и рамка котов на экране. Без React и DOM.
//
// Почему так. Сцена — viewBox 360×640 (9:16). До 3.2.2003 SVG лежал по верху слайда во всю ширину, высота = ширина·16/9
// (390 → 693 px) независимо от высоты слайда: на телефоне в браузере (Safari с панелями — слайд 390×664) низ сцены
// вылезал за слайд, а блок фразы и кнопка «Изучить фразу» ложились поверх котов. Теперь «ноги» котов ставятся
// прямо над самой высокой занятой зоной (блок фразы на 2 строки), а лишний верх сцены (небо, окно) уходит за край.
// Масштаб — только по пользовательскому feedFrame.scale, вокруг ног котов: персонажей не режем, режется фон.
// Низ слайда под ногами котов (блок фразы, кнопка, нижняя панель) — не полоса: фон сцены продолжается за viewBox
// (backgrounds.js, BLEED; SVG в ленте с overflow: visible), там тот же пол. Ручной сдвиг/масштаб feedFrame дыр не оставляет.
// solo (одиночная сцена, scenePit.js) — рамка одного кота a по центру (CAT_PLACEMENT.solo), иначе обоих.

export const SCENE_W = 360
export const SCENE_H = 640
export const FLOOR_Y = 430 // линия пола фона (вьюбокс), см. дизайнерскую спецификацию

// Чернила кота (getBBox спрайта 200×240 до масштаба/переворота): левый a — x 40…188, правый b (зеркальный) — x 9…156
const CAT_INK = { a: { x: 40, w: 148 }, b: { x: 8.86, w: 147.14 }, y: 29.8, h: 204.2 }

// Рамка чернил котов во вьюбоксе сцены (solo — только кот a по центру)
export function catsInkBox(solo = false) {
  const s = CAT_PLACEMENT.scale
  const box = who => {
    const p = catPlacement(who, solo)
    return {
      l: p.x + CAT_INK[who].x * s, r: p.x + (CAT_INK[who].x + CAT_INK[who].w) * s,
      t: p.y + CAT_INK.y * s, b: p.y + (CAT_INK.y + CAT_INK.h) * s,
    }
  }
  const a = box('a')
  if (solo) return a
  const b = box('b')
  return { l: Math.min(a.l, b.l), r: Math.max(a.r, b.r), t: Math.min(a.t, b.t), b: Math.max(a.b, b.b) }
}

const intersects = (p, z) => p.l < z.r && p.r > z.l && p.t < z.b && p.b > z.t
const round1 = v => Math.round(v * 10) / 10

// Что вообще предупреждаем: котам нельзя в эти зоны. Тексты — для предпросмотра сборщика
const WARN_TEXT = {
  top: 'коты заходят под верхнюю панель (уровень/билеты/энергия)',
  hud: 'коты частично под HUD (лайк/закладка/репост)',
  phrase: 'коты частично под блоком фразы (шарики)',
  learn: 'коты частично под кнопкой «Изучить фразу»',
  nav: 'коты частично под нижней панелью',
}

// { w, h } — размер слайда; navH — высота нижней панели (с safe-area); safeTop — safe-area сверху;
// frame — options.feedFrame (или undefined → умолчание); solo — сцена с одним котом. Результат: см. поля ниже (px слайда)
export function computeFeedFrame({ w, h, navH, safeTop = 0, frame, solo = false }) {
  const f = resolveFeedFrame({ feedFrame: frame })
  const s0 = w / SCENE_W
  const ink = catsInkBox(solo)
  const zones = feedZones({ w, h, navH, safeTop })
  const zone = id => zones.find(z => z.id === id)
  const fbot = zone('phrase').t - ZONE_GAP // ниже ног котов быть не должно
  const ftop = zone('top').b + ZONE_GAP
  const feetY = ink.b * s0
  let base = 0 // верх SVG на слайде до пользовательских правок
  if (f.anchor === 'bottom') base = Math.min(0, fbot - feetY)
  else if (f.anchor === 'center') base = Math.min(0, (ftop + fbot) / 2 - ((ink.t + ink.b) / 2) * s0)
  const ox = w / 2
  const oy = feetY
  const tx = f.x * w
  const ty = base + f.y * h
  const k = f.scale
  const mapX = u => tx + ox + (u * s0 - ox) * k
  const mapY = v => ty + oy + (v * s0 - oy) * k
  const cats = { l: mapX(ink.l), r: mapX(ink.r), t: mapY(ink.t), b: mapY(ink.b) }
  const warnings = []
  if (cats.l < 0 || cats.r > w) warnings.push({ zone: 'edge', text: 'коты выходят за боковой край экрана' })
  if (cats.b > h) warnings.push({ zone: 'edge', text: 'коты выходят за нижний край экрана' })
  for (const z of zones) if (intersects(cats, z)) warnings.push({ zone: z.id, text: WARN_TEXT[z.id] })
  return {
    k, tx: round1(tx), ty: round1(ty), ox: round1(ox), oy: round1(oy), s0, base: round1(base),
    cats, zones, warnings,
    bubbleBottom: round1(h - (cats.t - BUBBLE_GAP)), // отступ облачка от низа слайда
    pauseY: round1(cats.t - BUBBLE_GAP / 2),
    floorY: round1(mapY(FLOOR_Y)), // линия пола на слайде (запасной градиент корня до загрузки SVG и под скелетоном)
  }
}

// CSS-переменные корня слайда-сцены (feed-scene.css) — применяются без перерисовки React
export function feedFrameVars(r) {
  const px = v => `${v}px`
  return {
    '--sf-k': String(r.k), '--sf-tx': px(r.tx), '--sf-ty': px(r.ty), '--sf-ox': px(r.ox), '--sf-oy': px(r.oy),
    '--sf-bubble': px(r.bubbleBottom), '--pause-y': px(r.pauseY), '--sf-floor-y': px(r.floorY),
    '--sf-hud-w': px(HUD_RIGHT + HUD_W + HUD_CLEAR),
  }
}

// Перетаскивание сцены пальцем/мышью в предпросмотре: сдвиг в px слайда → новые x, y (доли ширины/высоты),
// обратная операция к tx = x·w, ty = base + y·h
export function dragFeedFrame(frame, dx, dy, { w, h }) {
  const f = resolveFeedFrame({ feedFrame: frame })
  const clamp = v => Math.min(1, Math.max(-1, Math.round(v * 1000) / 1000))
  return { ...f, x: clamp(f.x + dx / w), y: clamp(f.y + dy / h) }
}

// Коробка Мии (прототип «Мия», 2026-11-14): картонная коробка над Питом, нарисованная в 3D-расчёте (камера 8°, правая грань вдвое шире левой, как утвердил
// владелец) вместе с четырьмя нижними клапанами, которые можно задрать на любой угол, и прорезью-ручкой на правой грани, в которой видны глаза Пита.
// Рисунок строится ОДИН раз (createBox), дальше update(state) пишет только числа в атрибуты: форму клапанов, положение глаз и звуковые линии — кадр не пересобирает
// разметку. Координаты рисунка — собственные (≈ ±170 по x), на экран их переводит RaceMia.jsx одним transform: глаза Пита в прорези совмещаются с настоящими
// глазами головы Пита (EYE_MID, ART_PER_EYE). Глаза — те же, что у Пита в игре (kit.json, обычное лицо), без очков; верх их прикрывает кромка прорези.
// Цвет — вариант 2 «оранжевый приглушённый» (владелец, 2026-11-14).
import { MASCOT_PACKS } from '../../scene/v2/sprites/mascot/mascots.js'
const kit = MASCOT_PACKS.kit

const D = Math.PI / 180
const e = 8 * D, beta = 26.57 * D, alpha = Math.PI / 2 - beta          // камера 8°; правая грань повёрнута к камере на 26,57° (грани 2:1)
const a = 138, b = 138, h = 133                                         // размеры коробки в условных единицах
const A = [-a * Math.cos(alpha), a * Math.sin(alpha)], B = [b * Math.cos(beta), b * Math.sin(beta)]
const W = (s, t) => [s * A[0] + t * B[0], s * A[1] + t * B[1]]
const proj = (x, y, z) => [x, -(y * Math.sin(e)) - z * Math.cos(e)]
const P = (s, t, z = 0) => proj(...W(s, t), z)
const nL = [-Math.cos(beta), -Math.sin(beta)], nR = [Math.cos(alpha), -Math.sin(alpha)]    // наружу у ближних граней
const fnR = [Math.cos(beta), Math.sin(beta)], fnL = [-Math.cos(alpha), Math.sin(alpha)]   // наружу у дальних граней

export const PAL = { top: '#E3B67E', left: '#CD9A5E', right: '#B98649', nl: '#DEB074', nr: '#CD9A5E', fl: '#A5763F', fr: '#8F6535' }
const f2 = n => n.toFixed(2)
const pts = ps => ps.map(p => `${f2(p[0])} ${f2(p[1])}`).join(' L')
const d = ps => `M${pts(ps)}Z`
export const shade = (hex, f) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('')
const dark = th => 1 - 0.22 * Math.sin(th)                                // задранный клапан виден наружной стороной — темнее

/** Клапан от ребра p–q наружу по нормали n глубиной dep, приподнят на th (рад): четыре точки рисунка */
function flap(p, q, n, dep, th) {
  const ox = n[0] * dep * Math.cos(th), oy = n[1] * dep * Math.cos(th), oz = dep * Math.sin(th)
  return [proj(p[0], p[1], 0), proj(q[0], q[1], 0), proj(q[0] + ox, q[1] + oy, oz), proj(p[0] + ox, p[1] + oy, oz)]
}
/** Четыре клапана при угле th (градусы): { nearL, nearR, farL, farR } */
export const flaps = (thNear, thFar) => {
  const tn = thNear * D, tf = thFar * D
  return {
    farL: flap(W(1, 0), W(1, 1), fnL, b / 2, tf), farR: flap(W(0, 1), W(1, 1), fnR, a / 2, tf),
    nearL: flap(W(0, 0), W(1, 0), nL, b / 2, tn), nearR: flap(W(0, 0), W(0, 1), nR, a / 2, tn),
  }
}

const Nb = P(0, 0), Rb = P(0, 1), Lb = P(1, 0), Nt = P(0, 0, h), Lt = P(1, 0, h), Rt = P(0, 1, h), Ft = P(1, 1, h)
// плоскость правой грани: реальные единицы (x вдоль ребра, y вниз) → рисунок
const ux = (Rt[0] - Nt[0]) / b, uy = (Rt[1] - Nt[1]) / b, vx = (Nb[0] - Nt[0]) / h, vy = (Nb[1] - Nt[1]) / h
const SX = 0.20, SY = 0.18, COVER = 0.22                                  // глаза Пита: масштаб по x / y; низ глаз прикрывает кромка (вариант владельца)
const X0 = 0.19 * b, X1 = X0 + 0.563 * b, Y0 = 0.127 * h, Y1o = Y0 + 0.167 * h, CY0 = (Y0 + Y1o) / 2, EYE_H = 103.6 * SY
const Y1 = CY0 + EYE_H / 2 - COVER * EYE_H, CX = (X0 + X1) / 2, HALF = 182.3 * SX / 2, R = (Y1 - Y0) / 2
const tex = (x, y) => [Nt[0] + x * ux + y * vx, Nt[1] + x * uy + y * vy]

/** Опорные точки рисунка: глаза Пита (середина), расстояние между ними, центр крышки и центр основания */
export const ART = { EYE_MID: tex(CX, CY0), PER_EYE: 2 * HALF * ux, TOP: P(0.5, 0.5, h), BOTTOM: P(0.5, 0.5, 0), H: h }

const NS = 'http://www.w3.org/2000/svg'
const mk = (tag, at = {}, par = null) => { const el = document.createElementNS(NS, tag); for (const k in at) el.setAttribute(k, at[k]); par?.appendChild(el); return el }
const hsh = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }
const eyesRaw = kit.states.base.eyes.replace(/\sdata-[xy]="[^"]*"/g, '')
const cut = eyesRaw.indexOf('<path d="M432.7 305.5')
const four = m => m.match(/<path[^>]*\/>/g) ?? []
const eyeMarkup = (p, dx) => p[0] + p[1] + `<g transform="translate(${dx} 0)">` + p[2] + p[3] + '</g>' // зрачок и блик — по центру радужки: взгляд вдоль нормали грани

/** Коробка: { el, update } — el — <g> в координатах рисунка; update({ thNear, thFar, open, look, scale, talk, t }) — угол клапанов (°), раскрытость глаз 0…1, взгляд (ед. грани), рост глаз, громкость речи 0…1, время (с) */
export function createBox(uid = 'wlMia') {
  const g = mk('g')
  const defs = mk('defs', {}, g)
  mk('clipPath', { id: `${uid}Clip` }, defs).append(mk('rect', { x: f2(X0), y: f2(Y0), width: f2(X1 - X0), height: f2(Y1 - Y0), rx: f2(R) }))
  const grad = mk('linearGradient', { id: `${uid}Slot`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs)
  ;[['0', '#050302'], ['.6', '#0E0704'], ['1', '#190D06']].forEach(([o, c]) => mk('stop', { offset: o, 'stop-color': c }, grad))
  const fl = { farL: mk('path', {}, g), farR: mk('path', {}, g) }
  mk('path', { fill: PAL.left, d: d([Nt, Lt, Lb, Nb]) }, g); mk('path', { fill: PAL.right, d: d([Nt, Rt, Rb, Nb]) }, g); mk('path', { fill: PAL.top, d: d([Nt, Lt, Ft, Rt]) }, g)
  mk('path', { fill: '#fff', 'fill-opacity': '.18', d: d([P(.44, 0, h), P(.44, 1, h), P(.63, 1, h), P(.63, 0, h)]) }, g)
  const hole = mk('g', { transform: `matrix(${ux.toFixed(5)} ${uy.toFixed(5)} ${vx.toFixed(5)} ${vy.toFixed(5)} ${f2(Nt[0])} ${f2(Nt[1])})` }, g)
  mk('rect', { x: f2(X0), y: f2(Y0), width: f2(X1 - X0), height: f2(Y1 - Y0), rx: f2(R), fill: `url(#${uid}Slot)` }, hole)
  const lines = []
  // звуковые линии — тоньше прежних (1,5 вместо 2,3), но заметнее: белый штрих поверх тёмной подложки, длиннее и ярче (владелец, 2026-11-14)
  for (let i = 0; i < 6; i++) {
    const sh = mk('line', { stroke: '#4A2E14', 'stroke-width': '2.9', 'stroke-linecap': 'round', opacity: 0, x1: 0, y1: 0, x2: 0, y2: 0 }, hole)
    lines.push([sh, mk('line', { stroke: '#FFFFFF', 'stroke-width': '1.5', 'stroke-linecap': 'round', opacity: 0, x1: 0, y1: 0, x2: 0, y2: 0 }, hole)])
  }
  const eyes = mk('g', { 'clip-path': `url(#${uid}Clip)` }, hole)
  const eyeL = mk('g', {}, eyes), eyeR = mk('g', {}, eyes)
  eyeL.innerHTML = eyeMarkup(four(eyesRaw.slice(0, cut)), -8.2); eyeR.innerHTML = eyeMarkup(four(eyesRaw.slice(cut)), 10)
  fl.nearL = mk('path', {}, g); fl.nearR = mk('path', {}, g)                 // ближние клапаны поверх граней: задранные закрывают низ
  let lastStep = -1
  const eye = (el, cx, csrc, s) => el.setAttribute('transform', `translate(${f2(cx + (s.look || 0))} ${f2(CY0)}) scale(${(SX * (s.scale || 1)).toFixed(4)} ${(SY * Math.max(0.02, s.open) * (s.scale || 1)).toFixed(4)}) translate(-${csrc} -305.6)`)
  function update(s) {
    const f = flaps(s.thNear, s.thFar), tn = s.thNear * D, tf = s.thFar * D
    fl.farL.setAttribute('d', d(f.farL)); fl.farL.setAttribute('fill', shade('#A5763F', dark(tf)))
    fl.farR.setAttribute('d', d(f.farR)); fl.farR.setAttribute('fill', shade('#8F6535', dark(tf)))
    fl.nearL.setAttribute('d', d(f.nearL)); fl.nearL.setAttribute('fill', shade(PAL.nl, dark(tn)))
    fl.nearR.setAttribute('d', d(f.nearR)); fl.nearR.setAttribute('fill', shade(PAL.nr, dark(tn)))
    const on = s.open > 0.01
    eyes.setAttribute('display', on ? 'inline' : 'none')
    if (on) { eye(eyeL, CX - HALF, 200.9, s); eye(eyeR, CX + HALF, 383.2, s) }
    const talk = s.talk || 0, step = Math.floor((s.t || 0) * 12)               // звуковые линии (замена рта Пита): комикс-штрихи в плоскости грани, 12 кадров/с
    if (talk <= 0.04) { if (lastStep !== -2) { lines.forEach(l => l.forEach(x => x.setAttribute('opacity', 0))); lastStep = -2 }; return }
    if (step === lastStep && !s.live) return
    lastStep = step
    const ym = (Y0 + Y1) / 2
    let k = 0
    for (const sign of [-1, 1]) [-40, 0, 40].forEach((ang, i) => {
      const r = hsh(step * 7 + i * 13 + (sign > 0 ? 5 : 0)), an = ang * D, len = (7 + 13 * talk) * (0.65 + 0.35 * r), r0 = 3.5 + 3 * r + 2.5 * talk, dy = sign < 0 ? -1 : 1
      const x0 = (sign < 0 ? X0 - 2 : X1 + 2) + sign * Math.cos(an) * r0, y0 = ym + Math.sin(an) * r0 * dy, ln = lines[k++]
      const x1 = x0 + sign * Math.cos(an) * len, y1 = y0 + Math.sin(an) * len * dy
      ln.forEach((l, j) => { l.setAttribute('x1', f2(x0)); l.setAttribute('y1', f2(y0)); l.setAttribute('x2', f2(x1)); l.setAttribute('y2', f2(y1)); l.setAttribute('opacity', j ? (0.85 + 0.15 * talk).toFixed(2) : '0.5') })
    })
  }
  update({ thNear: 0, thFar: 0, open: 0, talk: 0, t: 0 })
  return { el: g, update }
}

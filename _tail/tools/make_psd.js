const fs = require('fs')
const agpsd = require('ag-psd')
const { createCanvas, loadImage } = require('canvas')
agpsd.initializeCanvas((w, h) => createCanvas(w, h))
const SC = 8 // px на единицу вьюбокса спрайта 200x240 → холст 1600x1920
const W = 1600, H = 1920
const K = 0.33014, TX = -13.998, TY = -6.451
const conv = (x, y) => { const nx = x + 484, ny = y + 678, vx = 200 - (TX + K * nx), vy = TY + K * ny; return [vx * SC, vy * SC] }
const src = fs.readFileSync('/home/user/Pith_app/src/features/pitrace/mia/miaTailData.js', 'utf8')
const part = (a, b) => src.slice(src.indexOf(a), b ? src.indexOf(b) : undefined)
const frames = [...part('export const MIA_TAIL_FRAMES', 'export const MIA_TAIL_MARKS').matchAll(/\{ s: (\d+), n: 1, d: '([^']+)' \}/g)].map(m => m[2])
const marks = {}; for (const m of part('export const MIA_TAIL_MARKS').matchAll(/\{ s: (\d+), n: 1, d: '([^']+)' \}/g)) marks[+m[1]] = m[2]
if (frames.length !== 9) throw new Error('кадров ' + frames.length)
// разбор пути: M x y (C x y x y x y)* Z  |  M x y (L x y)* Z  → список сегментов
function parse(d) {
  const toks = [...d.matchAll(/([MLCZ])([^MLCZ]*)/g)].map(m => [m[1], m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)])
  const pts = []; let cur = null; const segs = []
  for (const [c, n] of toks) {
    if (c === 'M') { cur = conv(n[0], n[1]); pts.push(cur); segs.push({ type: 'M', p: cur }) }
    else if (c === 'L') for (let i = 0; i < n.length; i += 2) { const p = conv(n[i], n[i + 1]); segs.push({ type: 'L', p }); cur = p }
    else if (c === 'C') for (let i = 0; i < n.length; i += 6) { const c1 = conv(n[i], n[i + 1]), c2 = conv(n[i + 2], n[i + 3]), p = conv(n[i + 4], n[i + 5]); segs.push({ type: 'C', c1, c2, p }); cur = p }
  }
  return segs
}
// сегменты → узлы PSD [вх.ручка, якорь, исх.ручка]; замкнутый контур: последний якорь = первому
function knots(segs) {
  // якорь i = segs[i].p; сегмент i (i ≥ 1) идёт от якоря i-1 к якорю i: c1 — выходная ручка якоря i-1, c2 — входная ручка якоря i
  const n = segs.length, a = segs.map(s => s.p)
  const same = Math.hypot(a[n - 1][0] - a[0][0], a[n - 1][1] - a[0][1]) < 0.01
  const count = same ? n - 1 : n
  const outH = j => { const nx = j + 1 < n ? segs[j + 1] : null; return nx && nx.type === 'C' ? nx.c1 : a[j] }
  const inH = j => { const sg = j === 0 ? (same ? segs[n - 1] : null) : segs[j]; return sg && sg.type === 'C' ? sg.c2 : a[j] }
  const res = []
  for (let j = 0; j < count; j++) {
    const i = inH(j), o = outH(j)
    res.push({ linked: false, points: [i[0], i[1], a[j][0], a[j][1], o[0], o[1]] })
  }
  return res
}
function drawShape(ctx, segs, ox, oy) {
  ctx.beginPath(); ctx.moveTo(segs[0].p[0] - ox, segs[0].p[1] - oy)
  for (let i = 1; i < segs.length; i++) { const s = segs[i]; if (s.type === 'C') ctx.bezierCurveTo(s.c1[0] - ox, s.c1[1] - oy, s.c2[0] - ox, s.c2[1] - oy, s.p[0] - ox, s.p[1] - oy); else ctx.lineTo(s.p[0] - ox, s.p[1] - oy) }
  ctx.closePath()
}
function bbox(segs, pad) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const s of segs) for (const p of [s.p, s.c1, s.c2]) if (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
  return { x0: Math.floor(x0 - pad), y0: Math.floor(y0 - pad), x1: Math.ceil(x1 + pad), y1: Math.ceil(y1 + pad) }
}
const FILL = { r: 0x64, g: 0x67, b: 0x74 }, LINE = { r: 0x26, g: 0x24, b: 0x32 }, WHITE = { r: 0xe6, g: 0xe8, b: 0xee }
const STROKE = 4.87 * K * SC
let nextId = 10
const tailLayer = (k) => {
  const segs = parse(frames[k]), bb = bbox(segs, STROKE + 4), w = bb.x1 - bb.x0, h = bb.y1 - bb.y0
  const cv = createCanvas(w, h), ctx = cv.getContext('2d'); drawShape(ctx, segs, bb.x0, bb.y0)
  ctx.fillStyle = '#646774'; ctx.fill(); ctx.lineWidth = STROKE; ctx.lineJoin = 'round'; ctx.strokeStyle = '#262432'; ctx.stroke()
  return {
    id: nextId++, name: `Хвост ${k + 1}`, canvas: cv, left: bb.x0, top: bb.y0,
    vectorFill: { type: 'color', color: FILL },
    vectorStroke: { strokeEnabled: true, fillEnabled: true, lineWidth: { value: STROKE, units: 'Pixels' }, lineCapType: 'round', lineJoinType: 'round', lineAlignment: 'center', miterLimit: 100, content: { type: 'color', color: LINE }, opacity: 1, blendMode: 'normal' },
    vectorMask: { paths: [{ open: false, operation: 'combine', fillRule: 'non-zero', knots: knots(segs) }] },
  }
}
const marksLayer = (k) => {
  const segs = parse(marks[k]); const subs = []; let cur = null
  for (const s of segs) { if (s.type === 'M') { cur = [s]; subs.push(cur) } else cur.push(s) }
  const all = segs, bb = bbox(all, 4), w = bb.x1 - bb.x0, h = bb.y1 - bb.y0
  const cv = createCanvas(w, h), ctx = cv.getContext('2d'); ctx.fillStyle = '#e6e8ee'
  for (const sub of subs) { drawShape(ctx, sub, bb.x0, bb.y0); ctx.fill() }
  return {
    id: nextId++, name: `Штрихи ${k + 1}`, canvas: cv, left: bb.x0, top: bb.y0, opacity: 0.92,
    vectorFill: { type: 'color', color: WHITE },
    vectorMask: { paths: subs.map(sub => ({ open: false, operation: 'combine', fillRule: 'non-zero', knots: knots(sub) })) },
  }
}
;(async () => {
  const body = await loadImage('/tmp/psdwork/mia_body.png')
  const bcv = createCanvas(W, H); bcv.getContext('2d').drawImage(body, 0, 0)
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const groups = ids.map((fid, k) => {
    const children = [tailLayer(k)]; if (marks[k]) children.push(marksLayer(k))
    children.forEach(c => { c.animationFrames = [{ frames: ids, enable: true }] })
    return { id: nextId++, name: `Кадр ${fid}`, opened: false, hidden: k !== 0, children,
      animationFrames: [{ frames: [fid], enable: true }, { frames: ids.filter(x => x !== fid), enable: false }] }
  })
  const bodyLayer = { id: nextId++, name: 'Мия (тело, без хвоста) — сверху: хвост уходит под неё', canvas: bcv, left: 0, top: 0, animationFrames: [{ frames: ids, enable: true }] }
  // композит для предпросмотра: тело + кадр 1
  const comp = createCanvas(W, H), cx = comp.getContext('2d')
  const t1 = groups[0].children[0]; cx.drawImage(t1.canvas, t1.left, t1.top); if (groups[0].children[1]) cx.drawImage(groups[0].children[1].canvas, groups[0].children[1].left, groups[0].children[1].top)
  cx.drawImage(bcv, 0, 0)
  const psd = {
    width: W, height: H, canvas: comp,
    children: [...groups.slice().reverse(), bodyLayer].reverse().reverse(),
    imageResources: {
      resolutionInfo: { horizontalResolution: 72, horizontalResolutionUnit: 'PPI', widthUnit: 'Centimeters', verticalResolution: 72, verticalResolutionUnit: 'PPI', heightUnit: 'Centimeters' },
      animations: { activeAnimation: 1, frames: ids.map(id => ({ id, delay: 0.09, dispose: 'auto' })), animations: [{ id: 1, frames: ids, repeats: 0, activeFrame: 1 }] },
    },
    animationFrameFlags: undefined,
  }
  // порядок PSD: children[0] — самый нижний слой. Кадры снизу вверх 1…9, поверх — тело Мии
  psd.children = [...groups, bodyLayer]
  const buf = agpsd.writePsd(psd, { generateThumbnail: true, trimImageData: false })
  fs.writeFileSync('/tmp/psdwork/mia_tail_animation.psd', Buffer.from(buf)); console.log('PSD', buf.byteLength, 'байт')
})()

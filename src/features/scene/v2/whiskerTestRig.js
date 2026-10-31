import { createWhiskerDrive } from './whiskerDrive.js'

// Подделки для тестов привода усов (whiskerDrive.test.js, whiskerDriveTime.test.js): ус с тремя способами записи, корень, ручные часы и rAF
// Ус: классы, три способа записи (style.rotate / style.transform / атрибут transform), getBBox. ops — сколько раз в него писали; frames — угол, который увидел бы глаз после каждого кадра (rig.tick снимает его)
const BOX = { x: 10, y: 20, width: 40, height: 6 }
export function fakeWh(cls, bbox = BOX) {
  const set = new Set(cls.split(' '))
  const attrs = { d: `M${cls}` }
  const el = { isConnected: true, ops: 0, frames: [], attrs, bbox, classList: { contains: c => set.has(c) } }
  const st = { rotate: '', transform: '', transformOrigin: '', transformBox: '' }
  el.style = new Proxy(st, { set(o, k, v) { o[k] = v; el.ops += 1; return true } })
  el.getAttribute = n => attrs[n] ?? null
  el.setAttribute = (n, v) => { attrs[n] = String(v); el.ops += 1 }
  el.removeAttribute = n => { delete attrs[n]; el.ops += 1 }
  el.getBBox = () => el.bbox
  return el
}
const num = s => parseFloat(/-?\d+(\.\d+)?/.exec(s ?? '')?.[0]) || 0
export const angle = el => (el.style.rotate ? num(el.style.rotate) : el.style.transform ? num(el.style.transform) : el.attrs.transform ? num(el.attrs.transform) : 0)
export const clean = el => !el.style.rotate && !el.style.transform && !el.attrs.transform && !el.style.transformOrigin && !el.style.transformBox
export const fakeSet = () => ['wh wh-l wh-u', 'wh wh-l wh-d', 'wh wh-r wh-u', 'wh wh-r wh-d'].map(c => fakeWh(c))
export const fakeRoot = (whs = fakeSet(), scrolling = false) => ({
  whs, scrolling, isConnected: true, querySelectorAll: () => whs, closest() { return this.scrolling ? {} : null },
})
// Ручные часы и rAF: tick(ms, ts) выполняет следующий кадр через ms миллисекунд (ts — метка кадра rAF; без неё привод берёт now())
export function rig({ root = fakeRoot(), reduced = false, mode = 'rotate' } = {}) {
  let t = 1000, queue = null
  const o = { mode }
  const drive = createWhiskerDrive({
    getRoot: () => root, now: () => t, mode: () => o.mode, raf: f => { queue = f; return 1 }, caf: () => { queue = null },
    reduced: () => reduced, held: r => !!r.scrolling,
  })
  const tick = (ms = 16.7, ts) => { t += ms; const f = queue; queue = null; if (f) { f(ts); for (const w of root.whs) w.frames.push(angle(w)) } }
  return { drive, root, tick, o, deg: angle, running: () => queue !== null, time: () => t }
}
export const maxStep = (el, from = 1) => { let m = 0; for (let i = Math.max(1, from); i < el.frames.length; i++) m = Math.max(m, Math.abs(el.frames[i] - el.frames[i - 1])); return m }

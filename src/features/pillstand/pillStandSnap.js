// Снимок пилюли для записи стенда (CONCEPT_PILLSTAND.md, «Запись и просмотр») и обратный рендер из снимка — без клонирования DOM: лёгкий объект на кадр.
// snapPillEl(el) — атрибуты data-* (вид, lock, live, full, nudge, cap…), место и размер, заливка (transform слоя — ровно то, что на экране), слой уровня (.wlPillSparks i: кромка широкой пилюли) и линия
// уровня вертикальной (<b>: scaleX и opacity), встречный сдвиг тёмной подписи поверх жидкости (.wlPillInkIn), вычисленные scale / transform / opacity / outline пилюли (хлопок, дрожь и обводка промаха идут
// WAAPI — в атрибутах их не видно), вспышки щелчка (узлы-накладки), пузыри в жидкости (bb: набор .wlBubs — wordLaneBubbles.js: transform набора, «вылетели» (data-out) и у каждого видимого пузыря место,
// opacity и transform кадра) и маска слов «Скажи» (текст, data-w, --peek).
// applySnap(el, s) — то же на пилюлю плеера: атрибуты и стили пишутся как есть, CSS-анимации в плеере выключены (pill-stand-player.css), поэтому кадр — только снимок, а не логика.
import { maskCell } from '../pitrace/racePhraseMaskView.js'
const OWN = new Set(['data-pill', 'data-testid'])
const BASE_CLIP = new Set(['wlGhost', 'wlPillFill', 'wlPace'])
const BASE_PILL = new Set(['wlPillClip', 'wlPillSparks', 'racePhraseMask'])

const shot = (c, cs, where) => { const st = cs(c); return { w: where, css: c.style.cssText, op: st.opacity, tf: st.transform } }
const flashes = (host, base, where, cs) => [...(host?.children ?? [])].filter(c => !base.has(c.className) && !c.classList?.contains('psFlash')).map(c => shot(c, cs, where))
const maskOf = host => [...(host?.children ?? [])].find(c => c.classList?.contains('racePhraseMask')) ?? null // маска самой пилюли (её тёмная копия лежит в слое заливки)
const tfOp = n => (n ? { tf: n.style.transform, op: n.style.opacity } : null)

/** Снимок пилюли el (null — пилюли нет); cs — getComputedStyle (подставляется в тестах) */
export function snapPillEl(el, cs = e => globalThis.getComputedStyle(e)) {
  if (!el) return null
  const a = {}
  for (const at of el.attributes) if (at.name.startsWith('data-') && !OWN.has(at.name)) a[at.name] = at.value
  const fill = el.querySelector('.wlPillFill'), clip = el.querySelector('.wlPillClip'), bubs = [...el.querySelectorAll('.wlBubs')].find(b => !b.classList.contains('psFlash'))
  const c = cs(el)
  return {
    a, box: { left: el.style.left, width: el.style.width, height: el.style.height, translate: el.style.translate },
    fill: fill?.style.transform ?? '', ink: el.querySelector('.wlPillInkIn')?.style.transform ?? '',
    sp: tfOp(el.querySelector('.wlPillSparks i')), ln: tfOp(el.querySelector('.wlPillSparks b')),
    fx: { scale: c.scale ?? '', tf: c.transform ?? '', op: c.opacity ?? '', ol: c.outline ?? '' },
    fl: [...flashes(clip, BASE_CLIP, 'clip', cs), ...flashes(el, BASE_PILL, 'pill', cs)],
    bb: bubs ? { tf: bubs.style.transform, out: bubs.hasAttribute('data-out'), n: [...bubs.children].filter(n => !n.hasAttribute('data-off')).map(n => shot(n, cs, 'bub')) } : null,
    mask: [...(maskOf(el)?.querySelectorAll('b') ?? [])].map(b => ({ t: b.textContent, w: b.getAttribute('data-w') ?? '', p: b.style.getPropertyValue('--peek') })),
  }
}

/** Пилюля плеера el принимает вид снимка s (null — пилюля скрыта) */
export function applySnap(el, s) {
  if (!el) return
  for (const at of [...el.attributes]) if (at.name.startsWith('data-') && !OWN.has(at.name)) el.removeAttribute(at.name)
  el.querySelectorAll('.psFlash').forEach(n => n.remove())
  const fill = el.querySelector('.wlPillFill'), sp = el.querySelector('.wlPillSparks i'), ln = el.querySelector('.wlPillSparks b'), clip = el.querySelector('.wlPillClip'), ink = el.querySelector('.wlPillInkIn'), doc = el.ownerDocument
  const masks = () => [maskOf(el), maskOf(ink)].filter(Boolean)
  if (!s) { el.style.visibility = 'hidden'; masks().forEach(b => b.remove()); return }
  el.style.visibility = 'visible'
  for (const [k, v] of Object.entries(s.a)) el.setAttribute(k, v)
  Object.assign(el.style, { left: s.box.left, width: s.box.width, height: s.box.height, translate: s.box.translate, scale: s.fx.scale === 'none' ? '' : s.fx.scale, transform: s.fx.tf === 'none' ? '' : s.fx.tf, opacity: s.fx.op, outline: s.fx.ol })
  if (fill) fill.style.transform = s.fill
  if (ink) { ink.style.transform = s.ink ?? ''; if (s.a['data-cap']) ink.setAttribute('data-cap', s.a['data-cap']); else ink.removeAttribute('data-cap') }
  if (sp && s.sp) { sp.style.transform = s.sp.tf; sp.style.opacity = s.sp.op }
  if (ln && s.ln) { ln.style.transform = s.ln.tf; ln.style.opacity = s.ln.op }
  const put = (f, cls, host) => { const n = doc.createElement(cls === 'wlBub' ? 'span' : 'div'); n.className = cls; n.style.cssText = f.css; n.style.opacity = f.op; if (f.tf && f.tf !== 'none') n.style.transform = f.tf; host?.appendChild(n) }
  for (const f of s.fl) put(f, 'psFlash', f.w === 'clip' ? clip : el)
  if (s.bb) { // пузыри кадра: вид — классы игры, место и миг — из снимка
    const box = doc.createElement('span'); box.className = 'psFlash wlBubs'; box.style.transform = s.bb.tf
    if (s.bb.out) box.setAttribute('data-out', '1')
    for (const f of s.bb.n) put(f, 'wlBub', box)
    el.querySelector('.wlPillSparks')?.appendChild(box)
  }
  if (!s.mask.length) { masks().forEach(b => b.remove()); return }
  if (!maskOf(el) || maskOf(el).querySelectorAll('b').length !== s.mask.length) {
    masks().forEach(b => b.remove())
    for (const host of [el, ink]) { // маска и её тёмная копия в слое заливки (как в игре — racePhraseMaskView.js)
      if (!host) continue
      const box = doc.createElement('span'); box.className = 'racePhraseMask'
      s.mask.forEach((_, i) => { if (i) box.appendChild(doc.createTextNode(' ')); box.appendChild(maskCell(doc, '')) })
      host.appendChild(box)
    }
  }
  for (const box of masks()) box.querySelectorAll('b').forEach((b, i) => { const m = s.mask[i], w = b.children[0] ?? b; if (w.textContent !== m.t) w.textContent = m.t; b.setAttribute('data-w', m.w); if (m.p) b.style.setProperty('--peek', m.p); else b.style.removeProperty('--peek') })
}

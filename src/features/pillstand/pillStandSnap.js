// Снимок пилюли для записи стенда (CONCEPT_PILLSTAND.md, «Запись и просмотр») и обратный рендер из снимка — без клонирования DOM: лёгкий объект на кадр.
// snapPillEl(el) — атрибуты data-* (вид, lock, live, nudge, cap…), место и размер, заливка (transform слоя — ровно то, что на экране), кромка / искры (.wlPillSparks i), вычисленные scale / transform /
// opacity / outline пилюли (хлопок, дрожь и обводка промаха идут WAAPI — в атрибутах их не видно), вспышки щелчка (узлы-накладки), капли из жидкости (jt: узлы .wlJet — wordLaneJets.js: место, opacity и
// transform кадра) и маска слов «Скажи» (текст, data-w, --peek).
// applySnap(el, s) — то же на пилюлю плеера: атрибуты и стили пишутся как есть, CSS-анимации в плеере выключены (pill-stand-player.css), поэтому кадр — только снимок, а не логика.
const OWN = new Set(['data-pill', 'data-testid'])
const BASE_CLIP = new Set(['wlGhost', 'wlPillFill', 'wlPace'])
const BASE_PILL = new Set(['wlPillClip', 'wlPillSparks', 'racePhraseMask'])

const isJet = c => c.classList?.contains('wlJet')
const shot = (c, cs, where) => { const st = cs(c); return { w: where, css: c.style.cssText, op: st.opacity, tf: st.transform } }
const flashes = (host, base, where, cs) => [...(host?.children ?? [])].filter(c => !base.has(c.className) && !c.classList?.contains('psFlash') && !isJet(c)).map(c => shot(c, cs, where))

/** Снимок пилюли el (null — пилюли нет); cs — getComputedStyle (подставляется в тестах) */
export function snapPillEl(el, cs = e => globalThis.getComputedStyle(e)) {
  if (!el) return null
  const a = {}
  for (const at of el.attributes) if (at.name.startsWith('data-') && !OWN.has(at.name)) a[at.name] = at.value
  const fill = el.querySelector('.wlPillFill'), sp = el.querySelector('.wlPillSparks i'), clip = el.querySelector('.wlPillClip')
  const c = cs(el)
  return {
    a, box: { left: el.style.left, width: el.style.width, height: el.style.height, translate: el.style.translate },
    fill: fill?.style.transform ?? '',
    sp: sp ? { tf: sp.style.transform, op: sp.style.opacity, f: sp.style.getPropertyValue('--fill'), h: sp.style.getPropertyValue('--pill-h') } : null,
    fx: { scale: c.scale ?? '', tf: c.transform ?? '', op: c.opacity ?? '', ol: c.outline ?? '' },
    fl: [...flashes(clip, BASE_CLIP, 'clip', cs), ...flashes(el, BASE_PILL, 'pill', cs)],
    jt: [...el.children].filter(c => isJet(c) && !c.classList.contains('psFlash')).map(c => shot(c, cs, 'pill')),
    mask: [...el.querySelectorAll('.racePhraseMask b')].map(b => ({ t: b.textContent, w: b.getAttribute('data-w') ?? '', p: b.style.getPropertyValue('--peek') })),
  }
}

/** Пилюля плеера el принимает вид снимка s (null — пилюля скрыта) */
export function applySnap(el, s) {
  if (!el) return
  for (const at of [...el.attributes]) if (at.name.startsWith('data-') && !OWN.has(at.name)) el.removeAttribute(at.name)
  el.querySelectorAll('.psFlash').forEach(n => n.remove())
  if (!s) { el.style.visibility = 'hidden'; el.querySelector('.racePhraseMask')?.remove(); return }
  el.style.visibility = 'visible'
  for (const [k, v] of Object.entries(s.a)) el.setAttribute(k, v)
  Object.assign(el.style, { left: s.box.left, width: s.box.width, height: s.box.height, translate: s.box.translate, scale: s.fx.scale === 'none' ? '' : s.fx.scale, transform: s.fx.tf === 'none' ? '' : s.fx.tf, opacity: s.fx.op, outline: s.fx.ol })
  const fill = el.querySelector('.wlPillFill'), sp = el.querySelector('.wlPillSparks i'), clip = el.querySelector('.wlPillClip')
  if (fill) fill.style.transform = s.fill
  if (sp && s.sp) { sp.style.transform = s.sp.tf; sp.style.opacity = s.sp.op; sp.style.setProperty('--fill', s.sp.f); sp.style.setProperty('--pill-h', s.sp.h) }
  const put = (f, cls) => { const n = el.ownerDocument.createElement('div'); n.className = cls; n.style.cssText = f.css; n.style.opacity = f.op; if (f.tf && f.tf !== 'none') n.style.transform = f.tf; (f.w === 'clip' ? clip : el)?.appendChild(n) }
  for (const f of s.fl) put(f, 'psFlash')
  for (const f of s.jt ?? []) put(f, 'psFlash wlJet') // капля кадра: вид — класс игры, место и миг полёта — из снимка
  let box = el.querySelector('.racePhraseMask')
  if (!s.mask.length) { box?.remove(); return }
  if (!box || box.querySelectorAll('b').length !== s.mask.length) {
    box?.remove(); box = el.ownerDocument.createElement('span'); box.className = 'racePhraseMask'
    s.mask.forEach((_, i) => { if (i) box.appendChild(el.ownerDocument.createTextNode(' ')); box.appendChild(el.ownerDocument.createElement('b')) })
    el.appendChild(box)
  }
  box.querySelectorAll('b').forEach((b, i) => { const m = s.mask[i]; if (b.textContent !== m.t) b.textContent = m.t; b.setAttribute('data-w', m.w); if (m.p) b.style.setProperty('--peek', m.p); else b.style.removeProperty('--peek') })
}

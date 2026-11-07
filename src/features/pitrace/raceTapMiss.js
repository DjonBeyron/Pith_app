// Лёгкая подсветка «мимо» на широкой ленте (racePhraseScene.js, raceTapHit.js): тап не попал ни в одну живую пилюлю — в точке касания коротко вспыхивает и гаснет мягкое кольцо.
// Один узел на сцену (как подпись смысла), положение — свойство translate, вспышка — только opacity (WAAPI, 0,35 с); filter нет. Без DOM (тесты) — ничего не делает.
export const MISS_MS = 350

export function tapMissMark(root) {
  const doc = root?.ownerDocument
  const el = doc?.createElement?.('div')
  if (el) { el.className = 'raceTapMiss'; el.setAttribute('aria-hidden', 'true'); el.setAttribute('data-testid', 'race-tap-miss'); root.appendChild(el) }
  return {
    show(pt) {
      if (!el || !pt) return
      const box = root.getBoundingClientRect?.() ?? { left: 0, top: 0 }
      el.style.translate = `${Math.round(pt.x - box.left)}px ${Math.round(pt.y - box.top)}px`
      el.animate?.([{ opacity: 0.55 }, { opacity: 0 }], { duration: MISS_MS, easing: 'ease-out' })
    },
    remove: () => el?.remove(),
  }
}

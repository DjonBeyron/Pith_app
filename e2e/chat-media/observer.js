// Наблюдатель стенда «медиа в чате» (ставится page.addInitScript до загрузки страницы): в момент появления строки ленты
// ([data-entry-key] без data-pending) — ДО отрисовки кадра — снимает состояние медиа внутри неё; повтор на следующем кадре
// и через 300 мс. Галерея «выбери фото» (.pcGalleryOverlay) — отдельная запись pc-gallery. Итог — window.__bench
;(function () {
  window.__bench = []
  const seen = new WeakSet()
  function snap(root) {
    const imgs = [...root.querySelectorAll('img')].map(i => ({
      cls: i.className.slice(0, 24), complete: i.complete, naturalWidth: i.naturalWidth,
      opacity: getComputedStyle(i).opacity, visibility: getComputedStyle(i).visibility,
    }))
    const v = root.querySelector('video')
    const wave = root.querySelector('.playerAudioWave')
    const dur = root.querySelector('.playerAudioDur')
    return {
      key: root.dataset?.entryKey ?? null,
      imgs,
      video: v ? { readyState: v.readyState, poster: !!v.getAttribute('poster'), opacity: getComputedStyle(v).opacity, visibility: getComputedStyle(v).visibility } : null,
      canvases: [...root.querySelectorAll('canvas')].map(c => ({ cls: c.className.slice(0, 20), w: c.width, h: c.height })),
      wave: wave ? wave.className : null,
      dur: dur ? dur.textContent : null,
      placeholder: !!root.querySelector('.playerMediaPlaceholder, .stickerPlaceholder, .playerPhotoEmptyFrame'),
    }
  }
  function record(root, key) {
    if (seen.has(root)) return
    seen.add(root)
    const rec = { t: Math.round(performance.now()), key, atAppear: snap(root), nextFrame: null, after300: null }
    window.__bench.push(rec)
    requestAnimationFrame(() => { rec.nextFrame = snap(root) })
    setTimeout(() => { rec.after300 = snap(root) }, 300)
  }
  function considerRow(r) { if (!r.hasAttribute('data-pending')) record(r, r.dataset.entryKey) }
  function check(el) {
    if (!(el instanceof Element)) return
    if (el.matches('[data-entry-key]')) considerRow(el)
    el.querySelectorAll('[data-entry-key]').forEach(considerRow)
    if (el.matches('.pcGalleryOverlay')) record(el, 'pc-gallery')
    el.querySelectorAll('.pcGalleryOverlay').forEach(g => record(g, 'pc-gallery'))
  }
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(check)
      else if (m.target instanceof Element && m.target.matches('[data-entry-key]')) considerRow(m.target)
    }
  })
  const arm = () => {
    if (!document.documentElement) return setTimeout(arm, 0)
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pending'] })
  }
  arm()
})()

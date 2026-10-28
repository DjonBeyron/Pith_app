// Наблюдатель стенда «лента рекомендаций» (page.addInitScript): момент, когда слайд стал активным (класс swiper-slide-active),
// и что на нём видно: постер (фон .feedPosterBg + загружен ли файл постера по Resource Timing), скелетон, <video> (readyState,
// opacity, currentTime). Дальше опрос каждые 50 мс до 10 с: когда видео реально показано (opacity 1, кадр есть, время идёт).
// Сигнал ленты «первый кадр видео» (window.__pithyReady — в приложении его зовёт сплэш index.html) тоже записывается
;(function () {
  const records = []
  window.__feedBench = { records, splash: null }
  window.__pithyReady = why => { if (!window.__feedBench.splash) window.__feedBench.splash = { t: Math.round(performance.now()), why } }
  const active = new WeakSet()
  // Загруженные ресурсы — через PerformanceObserver (buffered): буфер Resource Timing приложение может чистить, наблюдатель — нет
  const loaded = new Set()
  try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.responseEnd > 0) loaded.add(e.name) })).observe({ type: 'resource', buffered: true }) } catch { /* нет PerformanceObserver — posterLoaded останется false */ }
  const posterLoaded = url => !!url && loaded.has(url)
  function snap(slide) {
    const poster = slide.querySelector('.feedPosterBg')
    const bg = poster ? getComputedStyle(poster).backgroundImage : ''
    const url = (bg.match(/url\("?([^")]+)"?\)/) || [])[1] || null
    const v = slide.querySelector('video')
    return {
      poster: !!poster, posterUrl: url, posterLoaded: posterLoaded(url), skeleton: !!slide.querySelector('.feedSkeleton'),
      loader: !!slide.querySelector('.feedVideoLoader'),
      video: v ? { readyState: v.readyState, opacity: v.style.opacity || getComputedStyle(v).opacity, currentTime: Math.round(v.currentTime * 1000) / 1000, paused: v.paused, url: (v.dataset.url || '').split('/').pop() } : null,
    }
  }
  const shown = s => !!s.video && s.video.opacity === '1' && s.video.readyState >= 2 && s.video.currentTime > 0
  function activated(slide) {
    if (active.has(slide)) return
    active.add(slide)
    const t = Math.round(performance.now())
    const rec = { t, index: slide.getAttribute('data-swiper-slide-index'), atActive: snap(slide), shownAt: null, shownAfterMs: null, last: null }
    records.push(rec)
    if (shown(rec.atActive)) { rec.shownAt = t; rec.shownAfterMs = 0; return }
    const started = performance.now()
    const poll = () => {
      if (!slide.classList.contains('swiper-slide-active')) { rec.last = snap(slide); active.delete(slide); return }
      const s = snap(slide)
      rec.last = s
      if (shown(s)) { rec.shownAt = Math.round(performance.now()); rec.shownAfterMs = rec.shownAt - t; return }
      if (performance.now() - started < 10000) setTimeout(poll, 50)
    }
    setTimeout(poll, 50)
  }
  function check(el) {
    if (!(el instanceof Element)) return
    if (el.classList.contains('swiper-slide-active')) activated(el)
    el.querySelectorAll('.swiper-slide-active').forEach(activated)
  }
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(check)
      else if (m.target instanceof Element && m.target.classList.contains('swiper-slide-active')) activated(m.target)
    }
  })
  const arm = () => {
    if (!document.documentElement) return setTimeout(arm, 0)
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  }
  arm()
})()

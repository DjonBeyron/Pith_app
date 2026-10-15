import { useEffect } from 'react'
import { densityFor } from './density.js'

// Следит за шириной элемента (ResizeObserver) и ставит data-density = compact | normal |
// roomy прямо на DOM-узел — без setState: класс плотности меняется редко, а ресайз
// колонки идёт по пикселю. Троттлинг через requestAnimationFrame (одно измерение на кадр).
// Без ResizeObserver (старый браузер, тесты) — остаётся normal из разметки.
export function useDensity(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    let raf = 0
    const apply = width => {
      const d = densityFor(width)
      if (el.dataset.density !== d) el.dataset.density = d
    }
    apply(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; apply(w ?? el.getBoundingClientRect().width) })
    })
    ro.observe(el)
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [ref])
}

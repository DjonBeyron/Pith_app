import { useEffect } from 'react'
import { densityFor } from './density.js'

// Следит за шириной элемента (ResizeObserver) и ставит data-density = compact | normal |
// roomy прямо на DOM-узел — без setState: класс плотности меняется редко, а ресайз
// колонки идёт по пикселю. Троттлинг через requestAnimationFrame (одно измерение на кадр).
// Меряем ВНЕШНЮЮ ширину (border-box), а не contentRect: плотность меняет padding панели,
// и ширина контента от неё зависит — на телефонах ~430px контент прыгал через порог 360
// туда-обратно (compact ↔ normal) по 600 раз в секунду, и весь сборщик дрожал.
// Без ResizeObserver (старый браузер, тесты) — остаётся normal из разметки.
const outerWidth = (entry, el) => entry?.borderBoxSize?.[0]?.inlineSize ?? el.getBoundingClientRect().width

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
      const w = outerWidth(entries[0], el)
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; apply(w) })
    })
    try { ro.observe(el, { box: 'border-box' }) } catch { ro.observe(el) }
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [ref])
}

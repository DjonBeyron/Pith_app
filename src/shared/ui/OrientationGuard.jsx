import { useEffect, useRef } from 'react'
import { pLog } from '../lib/debug.js'

// Жёсткий запрет альбомной ориентации на телефонах. Два слоя защиты:
// 1) screen.orientation.lock — реально блокирует поворот, но браузеры
//    разрешают его только в fullscreen или установленном PWA (standalone,
//    см. manifest.webmanifest: "orientation":"portrait" — там ОС уже не даёт
//    повернуть экран). В обычной вкладке браузера API просто откажет — это
//    ожидаемо, ловим и молчим.
// 2) CSS-заглушка на весь экран (см. orientation-guard.css) — работает
//    ВСЕГДА, без API: показывается в landscape только на touch-устройствах
//    (pointer:coarse), не трогает десктоп в альбомной ориентации.
export default function OrientationGuard() {
  const ref = useRef(null)

  useEffect(() => {
    const lock = () => screen.orientation?.lock?.('portrait').catch(() => {})
    lock()
    document.addEventListener('fullscreenchange', lock)
    return () => document.removeEventListener('fullscreenchange', lock)
  }, [])

  // Диагностика ноды «переверни телефон»: при каждой смене ориентации и
  // каждом изменении атрибута data-allow-landscape пишем в лог, видна ли
  // заглушка. Сама она — только CSS: показать её может лишь снятый атрибут
  // или медиазапрос (landscape + touch). По логу видно, что из двух
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const report = why => {
      // После смены ориентации стили пересчитываются — смотрим на следующем кадре
      requestAnimationFrame(() => {
        const el = ref.current
        const shown = el ? getComputedStyle(el).display !== 'none' : null
        pLog(`[guard] ${why}: landscape=${mq.matches} attr=${document.documentElement.hasAttribute('data-allow-landscape')} заглушка=${shown ? 'ВИДНА' : 'скрыта'} ${window.innerWidth}×${window.innerHeight}`)
      })
    }
    const onChange = () => report('смена ориентации')
    mq.addEventListener?.('change', onChange)
    mq.addListener?.(onChange)
    const mo = new MutationObserver(() => report('атрибут изменился'))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-allow-landscape'] })
    return () => { mq.removeEventListener?.('change', onChange); mq.removeListener?.(onChange); mo.disconnect() }
  }, [])

  return (
    <div ref={ref} className="orientationGuard" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="10" height="16" rx="2" transform="rotate(90 12 10)" />
        <path d="M12 19v2M9 22h6" />
      </svg>
      <div className="orientationGuardTitle">Поверните телефон вертикально</div>
      <div className="orientationGuardHint">Приложение работает только в портретной ориентации</div>
    </div>
  )
}

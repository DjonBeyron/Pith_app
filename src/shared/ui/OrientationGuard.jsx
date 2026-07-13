import { useEffect } from 'react'

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
  useEffect(() => {
    const lock = () => screen.orientation?.lock?.('portrait').catch(() => {})
    lock()
    document.addEventListener('fullscreenchange', lock)
    return () => document.removeEventListener('fullscreenchange', lock)
  }, [])

  return (
    <div className="orientationGuard" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="10" height="16" rx="2" transform="rotate(90 12 10)" />
        <path d="M12 19v2M9 22h6" />
      </svg>
      <div className="orientationGuardTitle">Поверните телефон вертикально</div>
      <div className="orientationGuardHint">Приложение работает только в портретной ориентации</div>
    </div>
  )
}

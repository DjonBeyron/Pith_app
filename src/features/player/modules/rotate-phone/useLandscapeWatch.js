import { useEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

// Ждёт, пока телефон повернут в альбомное положение, и один раз зовёт onRotate.
//
// Датчик — не акселерометр, а ориентация экрана: matchMedia('(orientation:
// landscape)') срабатывает при повороте и на Android, и на iOS (включая старые
// версии Safari), и не требует разрешений. DeviceOrientationEvent для этого
// не нужен — на iOS он просит явного разрешения в жесте, а поворот экрана
// видно и так.
//
// Пока ждём, приложение ВПУСКАЕТ альбомную ориентацию: снимаем lock и
// прячем заглушку «Поверните телефон вертикально» (OrientationGuard) — иначе
// ученик, послушно повернув телефон, увидел бы не урок, а требование
// повернуть обратно. Всё это только на время ожидания; после — как было.
//
// Оговорка про Android-PWA: там манифест держит портрет на уровне ОС
// ("orientation": "portrait"), и экран не повернётся вовсе — сработает не
// датчик, а лимит на число показов стрелки (см. RotatePhoneModule).
export const ALLOW_LANDSCAPE_ATTR = 'data-allow-landscape'

export function useLandscapeWatch(active, onRotate) {
  useEffect(() => {
    if (!active) return
    const mq = window.matchMedia('(orientation: landscape)')
    const root = document.documentElement
    root.setAttribute(ALLOW_LANDSCAPE_ATTR, '')
    // Только в PWA/fullscreen lock вообще работал — там его и снимаем.
    // В обычной вкладке unlock просто откажет, это ожидаемо
    try { screen.orientation?.unlock?.() } catch { /* нет API или не даёт */ }

    let fired = false
    const check = () => {
      if (fired || !mq.matches) return
      fired = true
      pLog('[rotate] телефон повёрнут — стрелка остановлена')
      onRotate?.()
    }
    // Телефон уже лежит горизонтально — засчитываем сразу. Но только на
    // touch-устройстве: у десктопа окно почти всегда «альбомное», и стрелка
    // гасла бы, не успев показаться (в превью админа в том числе)
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) check()
    mq.addEventListener?.('change', check)
    // Старый Safari — без addEventListener у MediaQueryList
    mq.addListener?.(check)

    return () => {
      mq.removeEventListener?.('change', check)
      mq.removeListener?.(check)
      root.removeAttribute(ALLOW_LANDSCAPE_ATTR)
      try { screen.orientation?.lock?.('portrait').catch(() => {}) } catch { /* см. выше */ }
    }
  }, [active, onRotate])
}

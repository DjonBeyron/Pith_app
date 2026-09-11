import { useEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'
import { motionAllowed } from '../../../../shared/lib/motionPermission.js'

// Ждёт, пока телефон повернут в альбомное положение, и один раз зовёт onRotate.
//
// Два канала, любой из них засчитывает поворот:
//
// 1. Ориентация ЭКРАНА — matchMedia('(orientation: landscape)'). Без разрешений
//    на Android и iOS. Но молчит, если у человека включён системный замок
//    поворота: экран остаётся портретным, что бы он ни делал с телефоном.
//
// 2. Наклон УСТРОЙСТВА — deviceorientation, угол gamma (вокруг продольной оси).
//    Телефон стоит в руке — gamma около 0; лёг набок — уходит к ±90. На замок
//    не смотрит: видит сам поворот в руках. На iOS нужен requestPermission из
//    жеста (motionPermission.js, спрашивается на «Начать урок»); без него
//    остаётся первый канал.
//
// Пока ждём, приложение ВПУСКАЕТ альбомную ориентацию: снимаем lock и
// прячем заглушку «Поверните телефон вертикально» (OrientationGuard) — иначе
// ученик, послушно повернув телефон, увидел бы не урок, а требование
// повернуть обратно. Всё это только на время ожидания; после — как было.
export const ALLOW_LANDSCAPE_ATTR = 'data-allow-landscape'

// Порог наклона. У лежащего набок телефона |gamma| подходит к 90, у стоящего
// в руке — 0–25 (обычный наклон к себе). 55 оставляет запас в обе стороны и
// ловит поворот до того, как у углов Эйлера начинается кувырок у 90
const TILT_DEG = 55

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
    const hit = source => {
      if (fired) return
      fired = true
      pLog(`[rotate] телефон повёрнут (${source}) — стрелка остановлена`)
      onRotate?.()
    }

    // Канал 1: экран
    const check = () => { if (mq.matches) hit('экран') }
    // Телефон уже лежит горизонтально — засчитываем сразу. Но только на
    // touch-устройстве: у десктопа окно почти всегда «альбомное», и стрелка
    // гасла бы, не успев показаться (в превью админа в том числе)
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) check()
    mq.addEventListener?.('change', check)
    // Старый Safari — без addEventListener у MediaQueryList
    mq.addListener?.(check)

    // Канал 2: наклон устройства — только с разрешением (iOS) или где оно не
    // нужно. Нет разрешения — канал просто молчит, работает первый
    const onTilt = e => {
      if (e.gamma == null) return
      if (Math.abs(e.gamma) > TILT_DEG) hit(`наклон gamma=${Math.round(e.gamma)}`)
    }
    const useTilt = motionAllowed()
    if (useTilt) window.addEventListener('deviceorientation', onTilt)
    pLog(`[rotate] жду поворота: экран=да, наклон=${useTilt ? 'да' : 'нет (нет разрешения)'}`)

    return () => {
      mq.removeEventListener?.('change', check)
      mq.removeListener?.(check)
      if (useTilt) window.removeEventListener('deviceorientation', onTilt)
      root.removeAttribute(ALLOW_LANDSCAPE_ATTR)
      try { screen.orientation?.lock?.('portrait').catch(() => {}) } catch { /* см. выше */ }
    }
  }, [active, onRotate])
}

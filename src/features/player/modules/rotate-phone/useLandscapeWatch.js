import { useEffect, useRef, useSyncExternalStore } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'
import { motionAllowed, subscribeMotion } from '../../../../shared/lib/motionPermission.js'

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
//    жеста (motionPermission.js, блок в карточке запуска); без него остаётся
//    первый канал. Разрешение может прийти ПОЗЖЕ появления ноды — канал
//    подключается в тот момент, когда оно появилось (useSyncExternalStore).
//
// Пока ждём, приложение ВПУСКАЕТ альбомную ориентацию: снимаем lock и
// прячем заглушку «Поверните телефон вертикально» (OrientationGuard) — иначе
// ученик, послушно повернув телефон, увидел бы не урок, а требование
// повернуть обратно. Всё это только на время ожидания; после — как было.
export const ALLOW_LANDSCAPE_ATTR = 'data-allow-landscape'

// Впустить альбомную ориентацию: атрибут для заглушки + unlock. Возвращает
// «отпустить». Держателей может быть несколько сразу: хук ожидания отпускает
// в cleanup (пассивная фаза), а оверлей тренажёра берёт в layout-эффекте —
// то есть РАНЬШЕ, чем хук отпустил. Без счётчика cleanup хука снимал атрибут
// уже после того, как оверлей его поставил, и заглушка «Поверните
// вертикально» ложилась поверх залитого экрана. Пока держит хоть кто-то —
// атрибут стоит; отпустил последний — lock('portrait') как было
let holds = 0
// who — метка держателя для лога («ожидание», «оверлей»): по «Скачать лог»
// видно, кто взял, кто отпустил и в какой момент атрибут реально снялся
export function holdLandscape(who = '?') {
  holds += 1
  pLog(`[landscape] держит «${who}» → держателей ${holds}${holds === 1 ? ', атрибут ПОСТАВЛЕН' : ''}`)
  if (holds === 1) {
    document.documentElement.setAttribute(ALLOW_LANDSCAPE_ATTR, '')
    // Только в PWA/fullscreen lock вообще работал — там его и снимаем.
    // В обычной вкладке unlock просто откажет, это ожидаемо
    try { screen.orientation?.unlock?.() } catch { /* нет API или не даёт */ }
  }
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
    pLog(`[landscape] отпустил «${who}» → держателей ${holds}${holds === 0 ? ', атрибут СНЯТ' : ''}`)
    if (holds > 0) return
    document.documentElement.removeAttribute(ALLOW_LANDSCAPE_ATTR)
    try { screen.orientation?.lock?.('portrait').catch(() => {}) } catch { /* см. выше */ }
  }
}

// Снимок для лога: что сейчас с ориентацией и заглушкой
export function landscapeDebugState() {
  const guard = document.querySelector('.orientationGuard')
  const shown = guard ? getComputedStyle(guard).display !== 'none' : null
  return `landscape=${window.matchMedia('(orientation: landscape)').matches}`
    + ` touch=${window.matchMedia('(hover: none) and (pointer: coarse)').matches}`
    + ` attr=${document.documentElement.hasAttribute(ALLOW_LANDSCAPE_ATTR)}`
    + ` держателей=${holds} заглушка=${shown == null ? 'нет в DOM' : shown ? 'ВИДНА' : 'скрыта'}`
    + ` ${window.innerWidth}×${window.innerHeight}`
}

// Порог наклона. У лежащего набок телефона |gamma| подходит к 90, у стоящего
// в руке — 0–25 (обычный наклон к себе). 55 оставляет запас в обе стороны и
// ловит поворот до того, как у углов Эйлера начинается кувырок у 90
const TILT_DEG = 55

export function useLandscapeWatch(active, onRotate) {
  // Общий на оба канала: кто первый — тот и засчитал, второй молчит
  const firedRef = useRef(false)
  // Живое состояние разрешения: нода могла появиться раньше, чем человек
  // ответил на диалог (стоит в начале урока). Как только согласие пришло —
  // второй канал подключается сам, а не со следующего захода в урок
  const tiltAllowed = useSyncExternalStore(subscribeMotion, motionAllowed, () => false)

  useEffect(() => {
    if (!active) return
    const mq = window.matchMedia('(orientation: landscape)')
    const release = holdLandscape('ожидание поворота')

    // Оверлею тренажёра важно, КАК повернули: экран (рисовать как есть) или
    // только сам телефон при замке (рисовать сцену повёрнутой, знак — по gamma)
    const hit = source => {
      if (firedRef.current) return
      firedRef.current = true
      pLog(`[rotate] телефон повёрнут (${source}) — стрелка остановлена · ${landscapeDebugState()}`)
      onRotate?.({ source: 'screen', gamma: 0 })
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

    pLog(`[rotate] жду поворота: экран=да · ${landscapeDebugState()}`)

    return () => {
      mq.removeEventListener?.('change', check)
      mq.removeListener?.(check)
      release()
    }
  }, [active, onRotate])

  // Канал 2: наклон устройства. Отдельным эффектом — он зависит ещё и от
  // разрешения, и должен подключиться в тот момент, когда оно появится
  useEffect(() => {
    if (!active) return
    if (!tiltAllowed) { pLog('[rotate] наклон: нет разрешения на датчик — ждём только экран'); return }
    const onTilt = e => {
      if (firedRef.current || e.gamma == null) return
      if (Math.abs(e.gamma) > TILT_DEG) {
        firedRef.current = true
        pLog(`[rotate] телефон повёрнут (наклон gamma=${Math.round(e.gamma)}) — стрелка остановлена`)
        // Экран мог повернуться и сам — тогда это не замок, рисуем как есть
        const screenToo = window.matchMedia('(orientation: landscape)').matches
        onRotate?.({ source: screenToo ? 'screen' : 'tilt', gamma: e.gamma })
      }
    }
    window.addEventListener('deviceorientation', onTilt)
    pLog('[rotate] наклон: датчик подключён')
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [active, tiltAllowed, onRotate])
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLORS, hostStyle, burstParent, runBurst } from '../lib/burstParticles.js'

// Залп конфетти на верный ответ — компонент-обёртка над burstParticles.js
// (там физика, запуск и императивный fireBurst для мест, где компонент
// размонтируется раньше, чем салют догорит).
//
// colors — своя палитра под фон (окно серии тёмно-фиолетовое, и яркий
// разноцвет из урока на нём читается как чужой элемент)
// bottomInset — на сколько поднять точку рождения над нижним краем окна.
// В чате он БОЛЬШЕ НЕ НУЖЕН и передаётся нулём: «выныривание из-под
// растушёвки» даёт zIndex ниже неё (85 против 90, см. layout.css) — частица поднимается
// сквозь градиент и проявляется сама. А поднятая точка рождения стоила
// 74px на iPhone (12 + safe-area 34 + wait-slot 28), и салют начинался
// заметно выше нижнего края, будто взлетал из середины чата.
// zIndex — по умолчанию поверх всего (итоги урока, окно серии), где никакой
// подложки нет и перекрывать нечем.
// portalTo — селектор контейнера для портала. По умолчанию body: салют на
// новом уровне и в окне серии должен лежать поверх вообще всего.
// В чате нужен другой контейнер — сам .lessonPlayer. Причина в слоях: плеер
// это z-index 200, а растушёвка низа — его псевдоэлемент с 65 ВНУТРИ него.
// Портал в body между ними не встанет физически: он либо выше всего плеера,
// либо ниже (и тогда салюта не видно вовсе — так и вышло с zIndex 60).
// Изнутри плеера 60 читается как «ниже растушёвки», чего мы и добивались.
// position: fixed внутри .lessonPlayer работает как надо — трансформа на нём
// нет; а на десктопе его держит .playerPhone, и салют сам ложится в рамку.
export default function BurstConfetti({
  count = 30, size = 4, colors = COLORS,
  bottomInset = 0, zIndex = 10001, portalTo = null,
}) {
  const hostRef = useRef(null)
  // prefers-reduced-motion не смотрим — см. burstParticles.js
  const [shown, setShown] = useState(true)

  useEffect(() => {
    if (!shown) return
    const host = hostRef.current
    if (!host) return
    return runBurst(host, { count, size, colors, bottomInset }, () => setShown(false))
  }, [shown, count, size]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null

  // Портал в body: у ленты transform: scaleY(-1), а трансформированный предок
  // отменяет position: fixed — координаты считались бы от неё, а не от окна
  return createPortal(
    <div ref={hostRef} style={hostStyle(zIndex)} />,
    burstParent(portalTo),
  )
}

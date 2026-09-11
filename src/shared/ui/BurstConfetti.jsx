import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { pLog, isTraceOn } from '../lib/debug.js'

// Залп конфетти на верный ответ — на КОМПОЗИТОРЕ, без канваса.
//
// Канвасная версия лагала даже на iPhone 16 Pro с первого же раза, и дело не
// в числе частиц (их три десятка), а в самом подходе: полноэкранный канвас
// каждый кадр перерисовывается на главном потоке и целиком заново заливается
// в композитор. На 120 Гц это ~170 МБ/с текстур, да ещё поверх ленты, которую
// приходится смешивать заново под каждым кадром.
//
// Здесь частицы — обычные div'ы, а движение задано анимациями transform и
// opacity. Эти два свойства браузер считает сам, на GPU, без единого кадра
// работы главного потока: после старта JS не участвует вовсе.
//
// Парабола раскладывается в опорные точки заранее (SAMPLES штук), между ними
// браузер интерполирует. Достаточно десятка — на глаз дуга уже гладкая, а
// каждая лишняя точка ничего не стоит, потому что считается один раз.
const COLORS = ['#b6fe3b', '#ff6b6b', '#ffd93d', '#6bcfff', '#c77dff', '#ff9f43', '#ff6fd8']
const SAMPLES = 14
// Кадров «полёта» в модели — по ним считается парабола, а длительность ниже
// переводит их в миллисекунды. Модель кадровая, потому что так проще держать
// физику одинаковой на 60 и 120 Гц: она не зависит от частоты вовсе
const FRAMES = 105
const GRAVITY = 0.32

function makeParticle(W, H, size, colors) {
  // Подъём равен v²/(2g): чтобы верхняя точка легла примерно на середину
  // экрана, скорость должна расти как корень из высоты. С фиксированной
  // скоростью на большом экране залп не добивал бы и до трети
  const speed = Math.sqrt(H * GRAVITY) * (0.92 + Math.random() * 0.22)
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.22   // веер ±35° вверх
  const vx = Math.cos(angle) * speed * 0.6
  const vy = Math.sin(angle) * speed
  const life = FRAMES * (0.78 + Math.random() * 0.42)
  // Своя скорость и сторона вращения у каждой: одинаковый спин читается как
  // сетка одинаковых объектов, а не как разлетевшиеся кусочки
  const spin = (3 + Math.random() * 5) * (Math.random() > 0.5 ? 1 : -1)

  const frames = []
  for (let i = 0; i < SAMPLES; i++) {
    const p = i / (SAMPLES - 1)
    const t = p * life
    frames.push({
      offset: p,
      transform: `translate(${(vx * t).toFixed(1)}px, ${(vy * t + GRAVITY * t * t / 2).toFixed(1)}px)`
        + ` rotate(${(t * spin).toFixed(0)}deg)`,
      // Гаснет во второй половине пути: частица догорает на лету, а не
      // доживает до пола
      opacity: p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.45),
    })
  }

  return {
    left: W * (0.2 + Math.random() * 0.6),
    size: size + Math.random() * size,
    color: colors[Math.floor(Math.random() * colors.length)],
    round: Math.random() > 0.5,
    duration: life * (1000 / 60),
    frames,
  }
}

const calm = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches

// colors — своя палитра под фон (окно серии тёмно-фиолетовое, и яркий
// разноцвет из урока на нём читается как чужой элемент)
// bottomInset — на сколько поднять точку рождения над нижним краем окна.
// В чате он БОЛЬШЕ НЕ НУЖЕН и передаётся нулём: «выныривание из-под
// растушёвки» даёт zIndex ниже неё (60 против 65) — частица поднимается
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
  const [shown, setShown] = useState(!calm())

  useEffect(() => {
    if (!shown) return
    const host = hostRef.current
    if (!host) return

    const W = window.innerWidth
    const H = window.innerHeight - bottomInset
    const parts = Array.from({ length: count }, () => makeParticle(W, H, size, colors))
    let longest = null

    for (const p of parts) {
      const el = document.createElement('i')
      // will-change здесь НЕТ намеренно. Он поднимает элемент на свой слой
      // сразу при вставке — то есть все частицы разом, ДО первого кадра
      // анимации. Композитору приходится пересобирать дерево слоёв в тот
      // самый момент, когда панель ответа начинает уезжать вниз, и её
      // движение спотыкается. Анимации transform/opacity через WAAPI и так
      // получают свой слой на время проигрывания — и ровно тогда, когда он
      // нужен, а не заранее.
      el.style.cssText = `position:absolute;left:${p.left.toFixed(0)}px;top:${H + 8}px;`
        + `width:${p.size.toFixed(1)}px;height:${(p.size * 0.6).toFixed(1)}px;`
        + `background:${p.color};border-radius:${p.round ? '50%' : '1px'};`
      host.appendChild(el)
      const anim = el.animate(p.frames, { duration: p.duration, easing: 'linear', fill: 'forwards' })
      if (!longest || p.duration > longest.duration) longest = { duration: p.duration, anim }
    }

    // Замер честный: считаем кадры ПОКА идёт салют. Сам замер ничего не рисует
    // и на композитор не влияет — он только смотрит на часы
    const trace = isTraceOn()
    const t0 = performance.now()
    let prev = t0
    let frames = 0
    let worst = 0
    let raf = 0
    const measure = () => {
      // Сам замер крутит rAF — вне разбора он такой же лишний расход

      const now = performance.now()
      const dt = now - prev
      prev = now
      frames += 1
      if (dt > worst) worst = dt
      raf = requestAnimationFrame(measure)
    }
    if (trace) raf = requestAnimationFrame(measure)

    const stop = () => {
      cancelAnimationFrame(raf)
      if (!trace) { setShown(false); return }
      const total = performance.now() - t0
      const avg = frames > 1 ? total / (frames - 1) : 0
      pLog(`[салют] ${count} частиц · ${Math.round(total)}мс · кадров ${frames}`
        + ` · средний ${avg.toFixed(1)}мс (${avg ? Math.round(1000 / avg) : 0} к/с)`
        + ` · худший ${worst.toFixed(1)}мс${worst > 34 ? ' ⚠ ПРОСАДКА' : ''}`)
      setShown(false)
    }
    longest?.anim.finished.then(stop).catch(() => {})
    return () => {
      cancelAnimationFrame(raf)
      // Частицы убираются за собой. Без этого в dev их было ВДВОЕ больше, чем
      // задумано: StrictMode прогоняет эффект дважды (эффект → уборка →
      // эффект), а уборки не было — второй прогон досыпал свои 30 к уже
      // висящим. Замер на живом уроке показывал 60 частиц вместо 30, то есть
      // двойную нагрузку ровно там, где разбираются с лагами.
      host.replaceChildren()
    }
  }, [shown, count, size]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null

  // Портал в body: у ленты transform: scaleY(-1), а трансформированный предок
  // отменяет position: fixed — координаты считались бы от неё, а не от окна
  return createPortal(
    <div
      ref={hostRef}
      style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex, overflow: 'hidden',
        // Слой салюта не влияет на раскладку и отрисовку страницы под ним:
        // браузер может не пересчитывать её при каждом кадре частиц
        contain: 'strict',
      }}
    />,
    // Если названного контейнера на экране нет (плеер закрылся) — падаем на
    // body: лучше показать салют поверх всего, чем не показать вовсе
    (portalTo && document.querySelector(portalTo)) || document.body,
  )
}

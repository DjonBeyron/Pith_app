import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Салют на канвасе. Два разных движения — и это не настройка, а два явления:
//
//   'fall'  — дождь сверху. Финал урока: экран уже перекрыт итогами, конфетти
//             сыплется поверх и держится, пока смотришь.
//   'burst' — залп снизу. Верный ответ: частицы вылетают из-под нижнего края,
//             долетают примерно до середины экрана, а дальше их роняет
//             тяжесть — они падают и гаснут на лету, как настоящее конфетти.
//
// Дождём залп не заменить: у падающих частиц нет ни момента выстрела, ни
// верхней точки, и вместо «получилось!» получается ровный фон.
const COLORS = ['#b6fe3b', '#ff6b6b', '#ffd93d', '#6bcfff', '#c77dff', '#ff9f43', '#ff6fd8']

const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)]
const base = size => ({
  r: size + Math.random() * size,
  color: pick(),
  angle: Math.random() * Math.PI * 2,
  spin: (Math.random() - 0.5) * 0.22,
  shape: Math.random() > 0.5 ? 'rect' : 'circle',
})

function makeFalling(W, size) {
  return { ...base(size), x: Math.random() * W, y: -10 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 3, vy: 2.5 + Math.random() * 2.5, life: Infinity, age: 0 }
}

// Скорость подобрана под высоту экрана: подъём равен v² / (2g), и чтобы верхняя
// точка легла примерно на середину, скорость должна расти как корень из высоты.
// Иначе на большом экране залп не долетал бы и до трети.
function makeBurst(W, H, size, gravity) {
  const speed = Math.sqrt(H * gravity) * (0.92 + Math.random() * 0.22)
  // Веер вверх: ±35° от вертикали. Уже — столб, шире — брызги по бокам
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.22
  return { ...base(size),
    // Вылетают из нижней трети ширины по центру, а не из угла
    x: W * (0.2 + Math.random() * 0.6),
    y: H + 8,
    vx: Math.cos(angle) * speed * 0.6,
    vy: Math.sin(angle) * speed,
    life: 95 + Math.random() * 45,
    age: 0 }
}

// Уважаем системную настройку «меньше движения»: салют — украшение, и для
// тех, кому анимация мешает или вызывает тошноту, его просто не должно быть
const calm = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Confetti({ mode = 'fall', count = 120, refill = true, size = 5, fallRatio = 1 }) {
  const canvasRef = useRef(null)
  // Канвас снимается, как только салют отыграл. Без этого он оставался бы в
  // DOM до конца урока: сообщения из ленты не исчезают, и после двух десятков
  // верных ответов на странице висело бы два десятка полноэкранных битмапов —
  // по паре мегабайт каждый, и все они продолжали бы участвовать в композиции
  const [shown, setShown] = useState(!calm())

  useEffect(() => {
    if (!shown) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width  = window.innerWidth
    const H = canvas.height = window.innerHeight
    const burst = mode === 'burst'
    // Тяжесть у залпа сильнее: иначе частицы висят наверху и падают вечность
    const gravity = burst ? 0.32 : 0.05
    const bottom = H * fallRatio

    const spawn = () => (burst ? makeBurst(W, H, size, gravity) : makeFalling(W, size))
    let particles = Array.from({ length: count }, spawn)
    let rafId
    let done = false

    function tick() {
      ctx.clearRect(0, 0, W, H)
      let alive = 0
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += gravity
        p.angle += p.spin; p.age += 1

        // Залп гаснет по возрасту (частица догорает на лету), дождь — по тому,
        // насколько низко упал: на финале важно, чтобы низ экрана оставался
        // чистым под текстом итогов
        const alpha = burst
          ? Math.max(0, 1 - Math.max(0, p.age - p.life * 0.55) / (p.life * 0.45))
          : Math.max(0, 1 - (p.y / bottom) * 0.9)

        const gone = burst ? (p.age > p.life || p.y > H + 40) : p.y > bottom + 20
        if (!gone) alive++
        if (alpha <= 0) continue

        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.globalAlpha = alpha
        if (p.shape === 'rect') ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6)
        else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      }

      if (!done && alive <= count / 2) done = true
      if (refill && !done) particles.push(spawn())
      if (alive > 0) rafId = requestAnimationFrame(tick)
      else setShown(false)   // отыграл — снимаем канвас вместе с его битмапом
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [shown, mode, count, refill, size, fallRatio])

  if (!shown) return null

  // Портал в body обязателен. Салют вызывается из сообщения в ленте, а у ленты
  // transform: scaleY(-1) — трансформированный предок ОТМЕНЯЕТ position: fixed:
  // элемент начинает считать координаты от него, а не от окна. Канвас
  // растягивался на всю высоту переписки, битмап оставался размером с экран, и
  // частицы рисовались мимо видимой области. Тем же приёмом живут реакции.
  return createPortal(
    <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10001 }} />,
    document.body,
  )
}

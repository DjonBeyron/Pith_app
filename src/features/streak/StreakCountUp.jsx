import { useEffect, useState } from 'react'

const TOTAL_MS = 1800 // «медленно» — как барабаны одометра, а не как таймер
const STEP_MS  = 220  // на сколько старший разряд отстаёт от младшего

// Лента цифр для одного разряда: крутим только вверх, через 9 → 0, как
// настоящий барабан. 8→9 даёт [8,9], 9→0 — [9,0], 1→1 — [1] (стоит на месте).
function reel(from, to) {
  const out = [from]
  let d = from
  while (d !== to) { d = (d + 1) % 10; out.push(d) }
  return out
}

// Число серии барабанами одометра: разряды прокручиваются от вчерашнего
// значения к сегодняшнему. Младший стартует сразу, старшие — с задержкой и
// приходят к финишу одновременно с ним: так выглядит перенос разряда на
// одометре, где десятки ждут, пока единицы добегут до девятки.
//
// from не задан (или равен value) — рисуем просто число: на экране
// оборвавшейся серии крутить нечего.
// run=false — окно ещё под стартовым сплэшем: ждём, иначе весь показ
// отыграет за логотипом.
// onDone зовётся в тот момент, когда барабаны встали на новом числе — по
// нему окно запускает салют и волну: праздник ровно на переключении дня.
export default function StreakCountUp({ value = 0, from = null, className = '', run = true, onDone }) {
  const [rolled, setRolled] = useState(false)

  const calm = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches
  const animate = run && !calm && from !== null && from !== value && value > 0

  // Крутить нечего (первый показ без прошлого значения, reduced-motion,
  // оборвавшаяся серия) — «переключение» считаем состоявшимся сразу
  useEffect(() => {
    if (run && !animate) onDone?.()
  }, [run, animate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rolled) return
    const t = setTimeout(() => onDone?.(), TOTAL_MS)
    return () => clearTimeout(t)
  }, [rolled]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!animate || rolled) return
    // Кадр на то, чтобы барабаны отрисовались в исходном положении —
    // без него браузер склеит оба состояния и анимации не будет
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setRolled(true)))
    return () => cancelAnimationFrame(raf)
  }, [animate, rolled])

  if (!animate) return <div className={className}>{run || from === null ? value : from}</div>

  const to = String(value)
  const start = String(Math.max(from, 0)).padStart(to.length, '0')

  return (
    <div className={className}>
      {to.split('').map((ch, i) => {
        const cells = reel(Number(start[i]), Number(ch))
        // Индекс разряда справа: у единиц 0, у десятков 1 — по нему и отстаём
        const rank = to.length - 1 - i
        const delay = Math.min(rank * STEP_MS, TOTAL_MS * 0.6)
        return (
          <span className="sgDigit" key={i}>
            <span
              className="sgDigitReel"
              style={{
                transform: `translateY(${rolled ? -(cells.length - 1) : 0}em)`,
                transitionDuration: `${TOTAL_MS - delay}ms`,
                transitionDelay: `${delay}ms`,
              }}
            >
              {cells.map((n, k) => <span key={k}>{n}</span>)}
            </span>
          </span>
        )
      })}
    </div>
  )
}

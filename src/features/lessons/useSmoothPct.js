import { useEffect, useRef, useState } from 'react'

// Полная шкала 0→100 не быстрее чем за секунду: на лёгком уроке (файлов
// почти нет) настоящий процент прыгал 0→100 за один кадр, и бар с цифрой
// «мгновенно заполнялись» — читалось как дефект, а не как загрузка
export const FULL_MS = 1000

// Один шаг анимации: показанный процент догоняет цель со скоростью не выше
// 100 %/с. Вниз (цель упала — не должно, но вдруг) — сразу к цели, без
// «отката» на глазах. Чистая функция — её и тестируем
export function stepPct(shown, target, dtMs) {
  if (target <= shown) return target
  return Math.min(target, shown + Math.max(0, dtMs) * 100 / FULL_MS)
}

// Плавный процент для бара/цифры карточки запуска. Пишет ширину заливки
// (barRef.style.width) и текст цифры (textRef.textContent) ПРЯМО в DOM
// каждый кадр, минуя React: через setState каждый кадр ре-рендерилась вся
// карточка (предзагрузчик, дебаг-панель), кадры терялись, и бар шёл рывками.
// Первый кадр после (пере)запуска — dt=0, не «now - performance.now()»:
// timestamp rAF бывает РАНЬШЕ момента запуска эффекта, dt выходил
// отрицательным и бар на кадр откатывался назад при каждом новом target.
// active=false — карточка ещё за каркасом (display:none): не крутим, иначе
// анимация пройдёт невидимой, и при раскрытии будет сразу 100 %.
// reached — показанное дошло до 100: по нему открывается кнопка старта
export default function useSmoothPct(target, active = true) {
  const barRef   = useRef(null)
  const textRef  = useRef(null)
  const shownRef = useRef(0) // дробное, без округления — иначе скорость «залипает»
  const [reached, setReached] = useState(false)

  useEffect(() => {
    if (!active) return
    let raf, last = null
    const tick = now => {
      const next = stepPct(shownRef.current, target, last == null ? 0 : now - last)
      last = now
      shownRef.current = next
      if (barRef.current)  barRef.current.style.width = next + '%'
      if (textRef.current) textRef.current.textContent = Math.round(next) + '%'
      if (next >= 100) setReached(true)
      // Догнали цель — останавливаемся; новая цель перезапустит эффект
      else if (next !== target) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target])

  return { barRef, textRef, reached }
}

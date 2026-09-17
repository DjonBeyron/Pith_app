import { useRef, useLayoutEffect } from 'react'
import { blankKind, BLANK_DOT_COUNT } from '../../../../shared/lib/fillBlanksTemplate.js'

// Один пропуск во фразе «Составь предложение» — кнопка внутри строки текста.
// Пусто — компактные мигающие точки на нижнем краю шрифта (тот же приём, что
// у индикатора «печатает», WaitingDots.jsx/waitingBounce): 2 точки для
// буквенного пропуска («tr[..]s»), 5 для пропуска-слова («[.....]») —
// blankKind различает их по шаблону. Заполнено — просто текст без плашки
// (см. fill-blanks.css); неверно — тот же класс signalBlinkChip, что у
// мигающего слова в «Собери фразу» (см. signal-blink-chip.css), держится,
// пока пропуск не перевыберут (см. FillBlanksPanel.jsx).
//
// Ширина кнопки анимируется явным px (а не мгновенный скачок): auto-ширина
// не транзишнится в CSS напрямую, поэтому на каждую смену value фиксируем
// СТАРУЮ ширину, форсируем reflow, затем на следующем кадре отпускаем до
// НОВОЙ — тот же классический FLIP-приём для «расширить/сжать плавно».
export default function FillBlank({ template, index, value, wrong, disabled, onTap }) {
  const kind = blankKind(template, index)
  const dots = BLANK_DOT_COUNT[kind] ?? BLANK_DOT_COUNT.word

  const ref = useRef(null)
  const widthRef = useRef(null)
  const prevValueRef = useRef(value)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (prevValueRef.current === value) {
      // Значение не менялось — просто держим актуальную ширину про запас
      // для следующего сравнения (сюда же приезжает эффект после resize)
      widthRef.current = el.getBoundingClientRect().width
      return
    }
    // value сменился В ЭТОМ рендере — DOM уже показывает НОВОЕ содержимое,
    // его natural-ширина доступна через scrollWidth. Чтобы уехать туда
    // ПЛАВНО, а не мгновенно: пин старой ширины (той, что была до смены) →
    // форс reflow → на следующем кадре снять пин в пользу новой ширины —
    // именно тогда CSS-transition интерполирует между ними.
    const target = el.scrollWidth
    if (widthRef.current != null) {
      el.style.width = `${widthRef.current}px`
      // Форс reflow: без чтения layout-свойства браузер схлопнёт два
      // style.width в один кадр, и переход не проиграется
      void el.offsetHeight
    }
    const raf = requestAnimationFrame(() => { if (ref.current) ref.current.style.width = `${target}px` })
    widthRef.current = target
    prevValueRef.current = value
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <button
      ref={ref}
      type="button"
      className={`fbBlank${value != null ? ' fbBlankFilled' : ' fbBlankEmpty'}${wrong ? ' signalBlinkChip' : ''}`}
      onClick={onTap}
      disabled={disabled}
    >
      {value != null ? value : (
        <span className="fbBlankDots" aria-hidden="true">
          {Array.from({ length: dots }, (_, i) => <i key={i} />)}
        </span>
      )}
    </button>
  )
}

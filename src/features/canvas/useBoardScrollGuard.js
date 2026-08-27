import { useEffect } from 'react'

// Доска (.canvasBoard) никогда не должна быть прокручена внутри себя.
// История бага: overflow:hidden оставляет её scroll-контейнером, и браузер
// при фокусе поля внутри далеко отстоящей ноды (раскладки бывают на 27000px)
// молча проматывал её на тысячи пикселей. Ноды при этом остаются видны —
// обычный HTML рисуется за пределами своего бокса, — а оба SVG-слоя режут
// содержимое по собственному вьюпорту, который уехал за экран. Выглядит как
// «все связи пропали», при том что <path> в DOM есть и координаты верные.
// CSS-фикс (overflow:clip) закрывает причину, этот сторож — страховка на
// случай браузера без clip и любых других способов прокрутить доску.

// Сдвиг больше этого — уже не округление, а реальная беда с раскладкой
const DRIFT_PX = 1

function fixScroll(el) {
  if (!el || (!el.scrollLeft && !el.scrollTop)) return false
  console.warn('[canvas] доска была прокручена — связи бы пропали, сбрасываю:',
    el.scrollLeft, el.scrollTop)
  el.scrollLeft = 0
  el.scrollTop = 0
  return true
}

// Проверка, что SVG-слой связей стоит ровно на доске. Ловит не только скролл,
// но и схлопнутую в ноль доску — второй известный способ потерять все линии
export function checkBoardLayers(el) {
  if (!el) return null
  fixScroll(el)
  const board = el.getBoundingClientRect()
  const svg = el.querySelector('.canvasBoardSvgBack')
  if (!svg) return 'Слой связей не найден в DOM'
  const s = svg.getBoundingClientRect()
  if (board.width < DRIFT_PX || board.height < DRIFT_PX)
    return `Доска схлопнута (${Math.round(board.width)}×${Math.round(board.height)}) — линии обрезаются в ноль`
  if (Math.abs(s.left - board.left) > DRIFT_PX || Math.abs(s.top - board.top) > DRIFT_PX)
    return `Слой связей смещён относительно доски на ${Math.round(s.left - board.left)}×${Math.round(s.top - board.top)}px`
  return null
}

// watch — любое значение, меняющееся при массовой замене нод (импорт урока,
// загрузка с сервера, «очистить всё»): после них слои проверяются заново
export function useBoardScrollGuard(boardRef, watch) {
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const onScroll = () => fixScroll(el)
    // Прокрутка к фокусируемому полю происходит ДО события scroll не всегда —
    // подстраховываемся ещё и следующим кадром после фокуса
    const onFocusIn = () => { fixScroll(el); requestAnimationFrame(() => fixScroll(el)) }
    fixScroll(el)
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('focusin', onFocusIn)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('focusin', onFocusIn)
    }
  }, [boardRef])

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const id = requestAnimationFrame(() => {
      const problem = checkBoardLayers(el)
      if (problem) console.warn('[canvas]', problem)
    })
    return () => cancelAnimationFrame(id)
  }, [boardRef, watch])
}

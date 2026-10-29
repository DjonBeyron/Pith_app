// «Хвост» речи кота: усы доезжают до покоя, а не втыкаются.
// Усы качаются анимацией, которая включается классом is-talking на <g class="scn-cat"> (scene-v2-pit.css). Раньше класс снимался — и animation пропадала разом:
// ус из любого угла (до ±4°) скачком вставал в ноль за один кадр, амплитудный переход --wh-amp (0,3 с) уже ничего не двигал, потому что двигать было нечему.
// Теперь за снятием is-talking следует класс is-tail на TAIL_MS: анимация усов по-прежнему применена, а --wh-amp плавно идёт 1 → 0 (переход 0,3 с у самих усов).
// Когда амплитуда дошла до нуля, класс снимается и анимация пропадает на нулевом угле — скачка нет. Если кот заговорил снова, пока хвост ещё идёт, анимация продолжается с той же фазой
// (оба класса попадают в один и тот же CSS-селектор) и амплитуда возвращается к 1 из текущего значения. Новых одновременных анимаций нет: хвост — те же четыре, что и при речи.
// Чистый модуль без React (элемент и таймеры приходят аргументами) — проверяется тестами; React-обёртка для сцен — useTalkTail.js, кот игры зовёт startTail из wordLaneCatLook.js.
export const TAIL_CLASS = 'is-tail'
export const TAIL_MS = 360 // чуть дольше перехода --wh-amp (300 мс): анимацию снимаем, когда амплитуда уже ровно 0

const pending = new WeakMap() // элемент → { id, timers }

/** Снять хвост сразу (кот заговорил снова или размонтирован): таймер отменён, класс убран */
export function cancelTail(el) {
  const p = el && pending.get(el)
  if (!p) return
  p.timers.clearTimeout(p.id)
  pending.delete(el)
  el.classList.remove(TAIL_CLASS)
}

/** Начать хвост: is-tail на TAIL_MS (повторный вызов продлевает). Возвращает отмену. el — <g class="scn-cat"> (нужен только classList), timers — { setTimeout, clearTimeout } */
export function startTail(el, timers = globalThis) {
  if (!el) return () => {}
  cancelTail(el)
  el.classList.add(TAIL_CLASS)
  const id = timers.setTimeout(() => { pending.delete(el); el.classList.remove(TAIL_CLASS) }, TAIL_MS)
  pending.set(el, { id, timers })
  return () => cancelTail(el)
}

// Жест «потереть» — туда-сюда пальцем по фразе (открывает перевод в ленте, useTranslationReveal.js).
// Чистая логика без DOM: на вход — точки движения, на выход — прогресс 0…1 и «готово».
// Главное требование — НЕ срабатывать случайно, но и не заставлять тереть долго:
//   — штрих считается, только если палец прошёл по горизонтали не меньше STROKE px (дрожь пальца, мелкие
//     подёргивания и обычный тап не в счёт), а развороту предшествует прямой ход;
//   — нужно NEED штрихов подряд (вправо-влево-вправо или наоборот): одно движение — это свайп, не трение;
//   — вертикальный увод дальше DRIFT px — это пролистывание ленты или прокрутка: жест отменяется;
//   — пауза дольше IDLE_MS — палец «замер» (удержание), счёт начинается заново;
//   — короткий разворот (меньше STROKE) обнуляет счёт — штрихи должны быть уверенными.
// Итого около 100 px туда-сюда, примерно полсекунды — заметно меньше ширины фразы, но случайно не набирается.
export const STROKE = 30   // сколько px должен пройти один штрих
export const NEED = 3      // сколько штрихов нужно
export const TURN = 10     // насколько назад надо отъехать, чтобы это считалось разворотом
export const DRIFT = 46    // уход по вертикали, после которого жест не считается трением
export const IDLE_MS = 700 // пауза между движениями, после которой счёт начинается заново

export function createRubDetector({ stroke = STROKE, need = NEED, turn = TURN, drift = DRIFT, idle = IDLE_MS } = {}) {
  let s = null
  const fresh = (x, y, t) => ({ y0: y, anchor: x, ext: x, dir: 0, done: 0, dead: false, last: t })

  // Прогресс: засчитанные штрихи + доля текущего, от 0 до 1
  const progress = () => {
    if (!s || s.dead) return 0
    const cur = s.dir ? Math.min(1, Math.abs(s.ext - s.anchor) / stroke) : 0
    return Math.min(1, (s.done + cur) / need)
  }

  return {
    start(x, y, t = 0) { s = fresh(x, y, t) },
    // → { progress, done }
    move(x, y, t = 0) {
      if (!s || s.dead) return { progress: 0, done: false }
      if (Math.abs(y - s.y0) > drift) { s.dead = true; return { progress: 0, done: false } }
      if (t - s.last > idle) s = fresh(x, y, t)
      s.last = t
      if (!s.dir) {
        if (Math.abs(x - s.anchor) >= turn) { s.dir = Math.sign(x - s.anchor); s.ext = x }
      } else if ((x - s.ext) * s.dir > 0) {
        s.ext = x // идём дальше в ту же сторону
      } else if ((s.ext - x) * s.dir >= turn) {
        // Разворот: штрих засчитан, если был достаточно длинным; короткий — дрожь, считаем заново
        if (Math.abs(s.ext - s.anchor) >= stroke) s.done += 1
        else s.done = 0
        s.anchor = s.ext
        s.dir = -s.dir
        s.ext = x
      }
      // Последний штрих не нужно «разворачивать»: хватает дойти до нужной длины
      const last = s.done === need - 1 && s.dir && Math.abs(s.ext - s.anchor) >= stroke
      if (last) s.done = need
      return { progress: progress(), done: s.done >= need }
    },
    reset() { s = null },
  }
}

// Детерминированный генератор случайных чисел (mulberry32): порядок ленты не
// должен прыгать в течение дня — один сид (день) → одна последовательность.
// Раньше жил внутри feed/feedKnowledge.js; вынесен сюда, чтобы взвешенный
// движок (rankWeighted.js) пользовался ТОЙ ЖЕ последовательностью — legacy и
// weighted при одинаковом сиде перемешивают одинаково.
export function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Стабильное число 0..1 для пары (сид, строка-id): «личный жребий» модуля на
// день — сигнал random_mix. Один и тот же модуль в один день — одно и то же число.
export function seededUnit(seed, id) {
  const h = [...String(id ?? '')].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, seed >>> 0)
  return seeded(h)()
}

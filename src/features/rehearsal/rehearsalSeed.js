// Семя «Репетиции с Питом» (CONCEPT_REHEARSAL.md §8): одна сессия воспроизводима, разные дни разные. Семя — строка: по умолчанию «дата (YYYY-MM-DD) | фраза»; его можно задать в плане (plan.seed: из JSON фикстуры,
// из поля «Семя» блока «Шлифовка репетиции»). Все случайные выборы сценария берут числа ТОЛЬКО отсюда (Math.random не используется): у каждого акта и каждой реплики свой поток (rngFor(seed, 'warmup'), 'line:rh_done'…),
// поэтому выбор одного акта не зависит от других и от запуска «только этот этап». Генератор — mulberry32 по хэшу строки; rng — функция () => число из [0, 1). Чистые функции, без React и DOM.

const pad = n => String(n).padStart(2, '0')

/** Сегодняшняя дата по местному времени: «2026-10-30» */
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Семя по умолчанию: дата и фраза («2026-10-30|I'm | trying | to learn») */
export const seedFor = (phrase, date = todayIso()) => `${date}|${phrase}`

/** Строка → 32-битное число (хэш в духе cyrb53, сжатый до 32 бит): одна строка — одно число на любой машине */
export function hashSeed(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (const ch of String(str ?? '')) {
    const c = ch.codePointAt(0)
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h1 ^ h2) >>> 0
}

/** Генератор mulberry32: () => число из [0, 1) */
export function mulberry32(a) {
  let s = a >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Поток по семени и области выбора: одни и те же (seed, scope) — одна и та же последовательность чисел */
export const rngFor = (seed, scope = '') => mulberry32(hashSeed(`${seed}#${scope}`))

export const rngInt = (rng, n) => (n > 0 ? Math.min(n - 1, Math.floor(rng() * n)) : 0)
export const rngBool = rng => rng() < 0.5
export const rngPick = (rng, list) => list[rngInt(rng, list.length)]

/** Перемешанная копия (Фишер — Йейтс) */
export function rngShuffle(rng, list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) { const j = rngInt(rng, i + 1); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

/** Чистит семя из плана или поля ввода: строка или число, обрезается; пусто — null (значит «по дате») */
export function cleanSeed(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).trim().slice(0, 80)
  return s || null
}

let fresh = 0
/** Новое семя для кнопки «Новое» (время и счётчик — без Math.random): короткая строка, например «k2x9a7-1» */
export const newSeed = (now = Date.now()) => `${now.toString(36)}-${++fresh}`

import { EDGES } from '../boss/bossScale.js'

// Когда хвост Мии дёргается (владелец v3.3.331: «вариант 3; когда Мия выскакивает, хвост дёргается, пока она говорит вступительный диалог; в финале, если пилюля доезжает до красной зоны, дёргается
// и останавливается, когда следующая пилюля показалась на 50 % из-за экрана; то же в допросе Мии, где красной зоны нет, — примерно на том же уровне»). Чистая логика без DOM (под тестами).
// kind — вид стадии: 'ann' (церемония — вступительный диалог), 'end' (конечный диалог) или 'round' (круг: допрос Мии / финал); на других стадиях хвост лежит.
// (v3.3.332, владелец: «останавливай сразу, как в первом варианте; виляет только на стартовом и конечном диалоге и в красной зоне в обоих режимах Мии»)
export const RED_FROM = EDGES[2] // красная зона шкалы начинается с 0,8 её длины (boss/bossScale.js)
export const ENTER_VIS = 0.2 // какая доля пилюли должна показаться из-за верха экрана, чтобы хвост остановился (владелец v3.3.333: «останавливать раньше, 20 %»; было 50 %)

/** Уровень красной зоны, px от верха сцены: у финала — по настоящей шкале (.wlBossBox), в допросе шкалы нет — тот же уровень по её размерам: от верха ленты до низа с отступом 40 px */
export const redLevel = ({ boxTop, boxH }) => boxTop + RED_FROM * Math.max(1, boxH)

/**
 * Один шаг: prev = { want, seen } → новое. shown — Мия на экране; pills — [{ id, h, bottom, locked, failed }] (h — высота пилюли, bottom — нижний край, px от верха сцены); redY — уровень красной зоны.
 * Круг: хвост начинает дёргаться, когда нижний край живой пилюли перешёл красный уровень (или у пилюли без шкалы — тот же уровень), и останавливается, когда следующая пилюля вышла из-за верхнего края
 * на ENTER_VIS своей высоты (видна нижняя пятая часть). События считаются по переходам, поэтому пилюли, уже стоявшие ниже при появлении, ничего не запускают.
 */
export function wantStep(prev, { kind, shown, pills = [], redY }) {
  if (kind === 'ann' || kind === 'end') return { want: !!shown, seen: new Map() }
  if (kind !== 'round' || !shown) return { want: false, seen: new Map() }
  const seen = new Map(); let entry = false, red = false
  for (const p of pills) {
    if (p.locked || p.failed) continue
    const st = { entered: p.bottom >= ENTER_VIS * p.h, red: p.bottom >= redY }; seen.set(p.id, st)
    const was = prev.seen?.get(p.id); if (!was) continue
    if (!was.entered && st.entered) entry = true
    if (!was.red && st.red) red = true
  }
  return { want: red ? true : entry ? false : prev.want, seen }
}

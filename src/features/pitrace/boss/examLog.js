// Журнал экзамена: одна строка на слово — зона, сколько получил игрок и сколько ушло Мии, счёт после слова (владелец 2026-11-26: «кажется, что в красной зоне мне всё равно начисляется XP» —
// по этим строкам видно, что именно начислено). Чистая функция: директор (useRaceActs.miaEvent) зовёт её на каждое событие круга экзамена.
import { examOf, missWhy } from './bossMia.js'
import { wordTrophies, TROPHY_PER_WORD } from './bossTrophies.js'
import { peekBossSeen } from './bossZoneNow.js'

export const ZONE_RU = { fast: 'зелёная', mid: 'жёлтая', slow: 'красная' }
const WHY_RU = { wrong: 'сказано чужое слово', late: 'не успели', forgot: 'молчали' }

/**
 * before / after — состояние машины Мии до и после события ev ({ t, idx, zone, spoke, stage }); corner — сколько за это слово получит счётчик в углу (bossZoneNow.peekBossZone → трофеи), для сверки.
 * Строка пишется один раз на слово, когда известны и ответ, и зона: верное слово — на втором из событий win / zone (шкала шлёт зону раньше зачёта, но порядок не гарантирован), потерянное — на fail.
 * → строка `[exam] слово 3 «learn»: зона красная, игроку +3, Мии +17; счёт 73 / 47` (счёт: у игрока / у Мии) или null
 */
export function examWordLine(before, after, ev, corner = null, seen = peekBossSeen()) { // seen — где шкала зафиксировала линию слова (bossZoneNow.setBossSeen), % длины шкалы: зелёная до 45, жёлтая до 80, дальше красная
  const st = ev?.stage, off = st?.offset ?? 0, t = ev?.t
  if (!before || !after || !['win', 'zone', 'fail'].includes(t)) return null
  if (st?.bonus) return bonusWordLine(before, after, ev, st)
  const gi = t === 'zone' && ev.idx == null ? after.lw ?? 0 : (ev.idx ?? 0) + off
  const w = st?.words?.[gi - off], word = w ? (st.step?.lang === 'ru' ? w.translation ?? w.text : w.text ?? w.translation) : ''
  const x = examOf(after), head = `[exam] слово ${gi + 1}${word ? ` «${word}»` : ''}:`, tail = `счёт ${x.got} / ${x.lost}`
  if (t === 'fail') return before.dug?.[gi] || !after.dug?.[gi] ? null : `${head} не названо (${WHY_RU[missWhy(before, gi, ev)]}), игроку +0, Мии +${TROPHY_PER_WORD}; ${tail}`
  const settled = t === 'win' ? !!after.zones?.[gi] && !before.won?.[gi] : !!after.won?.[gi] && !before.zones?.[gi]
  if (!settled) return null
  const z = after.zones[gi], got = wordTrophies({ ok: true, zone: z })
  return `${head} зона ${ZONE_RU[z] ?? z}${seen?.pct != null ? ` (линия на ${seen.pct} % шкалы)` : ''}, игроку +${got}, Мии +${TROPHY_PER_WORD - got}${corner != null && corner !== got ? ` (РАСХОЖДЕНИЕ: счётчик в углу получает +${corner})` : ''}; ${tail}`
}

/** Слово бонус-круга (boss/bossBonus.js): `[exam] бонус, слово 5 из 6 «learn» ×3,3 (окно 2051 мс): зона зелёная, игроку +20; бонус-круг 5 из 6`. Мии ничего не уходит, счёт экзамена не меняется */
function bonusWordLine(before, after, ev, st) {
  const b0 = before.bonus ?? {}, b = after.bonus
  if (!b) return null
  const i = ev.idx ?? b.lw ?? 0, w = st.words?.[i], head = `[exam] бонус, слово ${i + 1} из ${b.total}${w ? ` «${w.text}»${w.k ? ` ×${String(w.k).replace('.', ',')} (окно ${w.win} мс)` : ''}` : ''}:`, tail = `бонус-круг ${Object.keys(b.won).length} из ${b.total}`
  if (ev.t === 'fail') return b0.gone?.[i] || !b.gone?.[i] ? null : `${head} не названо, игроку +0; ${tail}`
  const settled = ev.t === 'win' ? !!b.zones?.[i] && !b0.won?.[i] : !!b.won?.[i] && !b0.zones?.[i]
  return settled ? `${head} зона ${ZONE_RU[b.zones[i]] ?? b.zones[i]}, игроку +${wordTrophies({ ok: true, zone: b.zones[i] })}; ${tail}` : null
}

/** Перед выездом пилюли бонус-круга (вместо строки «голос: повтор…» обычного круга — там Пит называет слово, здесь молчит): что на пилюле, какой ответ ждём, скорость и окно ответа */
export function bonusPreLine(stage, rep) {
  const w = stage?.words?.[rep?.idx], ru = stage?.step?.lang === 'ru'
  return `[race] голос: бонус-круг, слово ${(rep?.idx ?? 0) + 1}/${stage?.words?.length ?? '?'} «${w?.text ?? ''}», на пилюле «${rep?.cap ?? ''}», ответ «${(ru ? w?.translation : w?.text) ?? ''}» (${ru ? 'по-русски' : 'по-английски'}), Пит молчит; скорость ${rep?.speed}${w?.k ? `, ×${String(w.k).replace('.', ',')} к экзамену, окно ответа ${w.win} мс` : ''}`
}

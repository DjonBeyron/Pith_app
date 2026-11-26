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
  const gi = t === 'zone' && ev.idx == null ? after.lw ?? 0 : (ev.idx ?? 0) + off
  const w = st?.words?.[gi - off], word = w ? (st.step?.lang === 'ru' ? w.translation ?? w.text : w.text ?? w.translation) : ''
  const x = examOf(after), head = `[exam] слово ${gi + 1}${word ? ` «${word}»` : ''}:`, tail = `счёт ${x.got} / ${x.lost}`
  if (t === 'fail') return before.dug?.[gi] || !after.dug?.[gi] ? null : `${head} не названо (${WHY_RU[missWhy(before, gi, ev)]}), игроку +0, Мии +${TROPHY_PER_WORD}; ${tail}`
  const settled = t === 'win' ? !!after.zones?.[gi] && !before.won?.[gi] : !!after.won?.[gi] && !before.zones?.[gi]
  if (!settled) return null
  const z = after.zones[gi], got = wordTrophies({ ok: true, zone: z })
  return `${head} зона ${ZONE_RU[z] ?? z}${seen?.pct != null ? ` (линия на ${seen.pct} % шкалы)` : ''}, игроку +${got}, Мии +${TROPHY_PER_WORD - got}${corner != null && corner !== got ? ` (РАСХОЖДЕНИЕ: счётчик в углу получает +${corner})` : ''}; ${tail}`
}

// Экзамен «Шкала памяти» в машине Мии (mia/raceMia.js зовёт эти функции для стадий акта boss): круг слов и конец экзамена по правилам «трофеи на кону» (bossTrophies.js). Чистые функции без React и DOM.
// Состояние экзамена живёт в машине Мии m: won — верно названные слова (номер в общем счёте экзамена), zones — зона шкалы каждого принятого слова (в момент, когда пилюля подтвердила ответ: событие zone
// от шкалы, тот же момент, что у треугольника), dug — слова, ушедшие без верного ответа, failed — слова, на которых сказали неверное, bye — реплика Мии, после РЕАЛЬНОГО конца которой она уходит с коробкой.
// Круг (порядок речи владельца не менялся): колкость Мии → Пит «это значит» + верное слово → Пит «Следующее слово» → слово диктора. Колкость выбирается по ПРИЧИНЕ (missWhy), а не по кругу.
// Конец: три исхода (bossTrophies.outcomeOf) — free: Мия «вот твои трофеи» → «Коробка мне ещё пригодится, пока» → уходит с коробкой → Пит; mid: Мия «потерянные трофеи я оставлю себе» → уходит → Пит;
// stay: Мия вердикт → Пит «жду тебя завтра», Мия и коробка остаются.
import { variantOf } from '../mia/miaLines.js'
import { jabAllowed } from '../racePathShare.js'
import { HELP_LINES } from './bossHelp.js'
import { examTrophies } from './bossTrophies.js'

export const OK_EVERY = 3 // колкость Мии на верный ответ: не чаще раза в три верных (как в «Допросе»)
export const PIT_AFTER_LEAVE_MS = 950 // Пит говорит, когда Мия с коробкой уже за краем экрана (miaMotion.LEAVE.JUMP = 0,95 с), а не после всей анимации ухода: тишины без действия нет
/** Колкость Мии по причине: wrong — сказали чужое слово, late — говорили, но не успели, forgot — молчали */
export const MISS_LINE = { wrong: 'boss_mia_miss_1', late: 'boss_mia_miss_2', forgot: 'boss_mia_miss_3' }
/** Реплики Мии, после конца которых она уходит с коробкой (исход free / mid) */
export const BYE_LINE = { free: 'boss_mia_bye', mid: 'boss_mia_mid' }

const line = (id, who, delay = 0) => ({ id, who, delay })
const count = o => Object.keys(o ?? {}).length

/** Почему слово gi ушло без ответа: на нём уже сказали неверное (событие miss) — wrong; иначе ev.spoke === false (слушатель не слышал речи, пока ехала пилюля) — forgot; иначе late */
export const missWhy = (m, gi, ev) => (m.failed?.[gi] ? 'wrong' : ev?.spoke === false ? 'forgot' : 'late')

/** Счёт экзамена по блокам (английские слова, потом русские): блок со смещением offset считается заново, прежние блоки остаются; total — всего слов к концу блока */
export function examBlock(m, stage) {
  const off = stage.offset ?? 0, len = stage.words?.length ?? 0, keepOld = o => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => Number(k) < off))
  if (stage.bonus) return {} // бонус-круг счёт экзамена не трогает: у него свой (m.bonus, bonusRound)
  return off ? { total: off + len, won: keepOld(m.won), failed: keepOld(m.failed), dug: keepOld(m.dug), zones: keepOld(m.zones), lw: null, keep: false, bye: null }
    : { total: len, won: {}, failed: {}, dug: {}, zones: {}, lw: null, redWins: 0, reds: 0, keep: false, bye: null, outcome: '', bonus: null }
}

/** Трофеи экзамена по состоянию машины (bossTrophies.examTrophies). final — экзамен кончился: всё, что не названо верно, потеряно; иначе слова впереди пока ничьи */
export function examOf(m, final = false) {
  const n = m?.total ?? 0
  return examTrophies(Array.from({ length: n }, (_, i) => (m.won?.[i] ? { ok: true, zone: m.zones?.[i] ?? 'fast' } : final || m.dug?.[i] ? { ok: false } : null)), n)
}

/** Событие круга экзамена (win / zone / miss / fail) → { mia, say, boost } или null (событие не для круга) */
export function examRound(m, ev) {
  if (ev.stage?.bonus) return bonusRound(m, ev)
  const { t, stage } = ev, gi = (ev.idx ?? 0) + (stage.offset ?? 0) // номер слова в общем счёте экзамена (у второго блока — со смещением)
  if (t === 'win') { // верный ответ: Мия иногда подкалывает (на второй верный подряд и на каждый третий), даже когда слово названо в красной зоне
    const streak = m.streak + 1, wins = m.wins + 1
    const say = !jabAllowed(ev.share) ? [] : streak === 2 ? [line('mia_streak2', 'mia')] : wins % OK_EVERY === 1 ? [line(variantOf('mia_ok', m.hits + 1), 'mia')] : [] // верный на ≥ JAB_MAX_SHARE пути (85 %) — колкости нет (владелец 2026-11-27)
    return { mia: { ...m, won: { ...m.won, [gi]: true }, lw: gi, streak, wins, hits: say.length && streak !== 2 ? m.hits + 1 : m.hits }, say, boost: null }
  }
  if (t === 'zone') { const zi = ev.idx != null ? gi : m.lw ?? 0; return { mia: { ...m, zones: { ...(m.zones ?? {}), [zi]: ev.zone }, redWins: m.redWins + (ev.zone === 'slow' ? 1 : 0) }, say: [], boost: null } } // зона слова в момент, когда пилюля подтвердила ответ; директор шлёт номер слова (отметка markClaimed), без номера — последнее верно названное
  if (t === 'miss' || t === 'fail') { // miss — сказано неверно, пилюля ещё едет (ученик может поправиться): Мия молчит; fail — пилюля ушла: колкость по причине → помощь Пита + верное слово → «следующее слово» (если в блоке есть ещё слово); на слово — один раз
    const dig = t === 'fail' && !m.dug?.[gi], failed = { ...m.failed, [gi]: true }, w = stage.words?.[ev.idx ?? 0], ru = stage.step?.lang === 'ru', told = ru ? w?.translation : w?.text
    const say = dig ? [line(MISS_LINE[missWhy(m, gi, ev)], 'mia'), ...(told ? [{ ...line(HELP_LINES[count(m.dug) % HELP_LINES.length], 'pit'), word: told, ...(ru ? { ru: true } : {}) }] : []), ...((ev.idx ?? 0) + 1 < (stage.words?.length ?? 0) ? [line('boss_pit_next', 'pit')] : [])] : []
    return { mia: { ...m, streak: 0, hits: dig ? m.hits + 1 : m.hits, dug: dig ? { ...m.dug, [gi]: true } : m.dug, failed, reds: count(failed) + m.redWins }, say, boost: null }
  }
  return null
}

/** Счёт бонус-круга: { total, won } или null (бонуса не было) */
export const bonusOf = m => (m?.bonus ? { total: m.bonus.total, won: count(m.bonus.won) } : null)

/** Колкость Мии в бонус-круге — короткие реплики «Допроса» (в бонусе трофеи к Мии не уходят: «…трофеи за это слово мои» экзамена не годятся): чужое слово — «Мимо», не успели / молчали — «Слово ушло,
 *  я ждать не люблю» (≈ 2 с). Перед быстрыми словами длинная не помещается в окно ответа следующей пилюли — там на любую причину «Мимо» (≈ 0,7 с): какая длина допустима после слова, считает
 *  bossBonus.bonusWords (поле слова jab: 'long' | 'short'). mia_miss_3 «Не торопись, а зря» не берётся: «слишком рано» бонус-круг не различает */
export const BONUS_MISS = { wrong: 'mia_miss_1', late: 'mia_miss_2', forgot: 'mia_miss_2' }
export const BONUS_MISS_SHORT = 'mia_miss_1'
export const BONUS_JAB_TTL_MS = 250 // колкость не начала звучать за столько после ухода пилюли (Мия ещё говорит прошлое, Пит занят) — не звучит вовсе: поздняя съела бы окно ответа следующего слова
/** Почему слово i бонус-круга ушло (как missWhy экзамена): на нём сказали чужое — wrong, слушатель речи не слышал — forgot, иначе late */
export const bonusWhy = (b, i, ev) => (b?.failed?.[i] ? 'wrong' : ev?.spoke === false ? 'forgot' : 'late')
/** Реплика Мии на ушедшее слово w бонус-круга по причине why → id */
export const bonusJab = (w, why) => (w?.jab === 'long' ? BONUS_MISS[why] : BONUS_MISS_SHORT)

/** Событие бонус-круга (boss/bossBonus.js). Счёт свой (m.bonus: won / zones / gone / failed по номеру слова круга): трофеи и исход экзамена не меняются, Мии ничего не уходит. Пит молчит всегда
 *  (ни «это значит», ни «Следующее слово»). Мия: на ушедшее слово (fail; чужое слово miss — пилюля ещё едет, можно поправиться — молча) одна короткая колкость, один раз на слово. Реплика «лёгкая»
 *  (free): следующую пилюлю не задерживает (miaSpeech: Пит «занятым» не становится, в оценку очереди не входит), а если Мия ещё говорит прошлую — не ставится вовсе (isChatter + ttl) */
function bonusRound(m, ev) {
  const b = m.bonus ?? { total: ev.stage.words?.length ?? 0, won: {}, zones: {}, gone: {}, failed: {}, lw: null }, i = ev.idx ?? (ev.t === 'zone' ? b.lw ?? 0 : 0)
  const put = (k, v, say = []) => ({ mia: { ...m, bonus: { ...b, [k]: { ...b[k], [i]: v }, ...(k === 'won' ? { lw: i } : {}) } }, say, boost: null })
  if (ev.t === 'fail') return put('gone', true, b.gone?.[i] ? [] : [{ ...line(bonusJab(ev.stage.words?.[i], bonusWhy(b, i, ev)), 'mia'), free: true, ttl: BONUS_JAB_TTL_MS }])
  return ev.t === 'win' ? put('won', true) : ev.t === 'zone' ? put('zones', ev.zone) : ev.t === 'miss' ? put('failed', true) : null
}

/** Итог экзамена по накопленному: верно названо, красных (всё, кроме верных не в красной зоне), неверных / не названных, трофеи и исход; keep — Пит остаётся в коробке (исход stay) */
export function bossEnd(m) {
  const won = count(m.won), reds = m.total ? m.total - Math.max(0, won - m.redWins) : m.reds, missed = m.total ? Math.max(0, m.total - won) : 0, ex = examOf(m, true)
  return { won, reds, missed, ...ex, keep: m.total > 0 && ex.outcome === 'stay' }
}

/** Вход на стадию-конец экзамена: реплики исхода. Уход Мии (free / mid) — НЕ здесь: он начинается событием bye, когда её последняя реплика реально доиграла (examBye) */
export function examEnd(m) {
  const e = bossEnd(m), outcome = e.keep ? 'stay' : e.outcome
  const log = `экзамен кончился: слов ${m.total}, названо верно ${e.won} (из них в красной зоне ${m.redWins}), неверно или не названо ${e.missed}; трофеи ${e.got} из ${e.max} (${e.pct} %), у Мии ${e.lost} — ${outcome === 'stay' ? 'Пит остаётся в коробке, Мия и коробка остаются' : outcome === 'mid' ? 'Пит свободен, потерянное Мия оставляет себе' : 'Пит свободен, Мия уходит с коробкой'}`
  const next = { ...m, reds: e.reds, keep: e.keep, fast: false, outcome, seq: m.seq + 1 }
  if (outcome === 'stay') return { mia: { ...next, bye: null }, say: [line('boss_mia_stay', 'mia'), line('boss_pit_keep', 'pit')], boost: 1, log } // Мия остаётся на коробке, Пит наружу не просится: коробка с Мией стоит до итога
  return { mia: { ...next, bye: BYE_LINE[outcome] }, say: outcome === 'free' ? [line('boss_mia_free', 'mia'), line('boss_mia_bye', 'mia')] : [line('boss_mia_mid', 'mia')], boost: 1, log }
}

/** Последняя реплика Мии (ev.id) реально доиграла — она уходит с коробкой, Пит говорит, когда она уже за краем. quiet — уйти молча (экзамен покинут раньше: очередь речи сброшена). Нет ожидания ухода — null */
export function examBye(m, ev = {}, quiet = false) {
  if (m.act !== 'boss' || m.phase !== 'in' || !m.bye || (ev.id && ev.id !== m.bye)) return null
  return { mia: { ...m, phase: 'out', fast: false, at: ev.now ?? 0, why: 'end', bye: null, seq: m.seq + 1 }, say: quiet ? [] : [line('boss_pit_well', 'pit', PIT_AFTER_LEAVE_MS)], boost: 1 }
}

// Церемония экзамена: прыжок Мии и начало объяснения шкалы — от РЕАЛЬНОГО конца её реплики из-за края («Сиди тихо, пушистик…»), а не через фиксированные 1,7 с и 2,8 с от её начала (числа под старый короткий файл:
// с длинной озвучкой Мия прыгала посреди реплики, с короткой — после неё была пустая пауза)
export const AFTER_HUSH_MS = 150   // Мия договорила из-за края — и прыгает на коробку
export const JUMP_TO_LOOK_MS = 750 // прыжок (0,34 с), посадка и прогиб коробки — и «Эй, вы за экраном…»
/** base — сроки по умолчанию от входа на церемонию { hushAt, jumpAbs, lookAt } (мс), hushMs — длина реплики «Сиди тихо…» по записи. → { jumpAbs, lookAt }; длины нет — как было */
export function ceremonyTimes(base, hushMs) {
  if (!(hushMs > 0)) return { jumpAbs: base.jumpAbs, lookAt: base.lookAt }
  const jumpAbs = base.hushAt + hushMs + AFTER_HUSH_MS
  return { jumpAbs, lookAt: jumpAbs + JUMP_TO_LOOK_MS }
}

// Отметки экзамена в рабочей коробке директора (raceMia.makeMiaBox) — функциями, как остальные её мутации (applyMia, leadAfter)
/** Слово принято (claim): его номер получит событие zone от шкалы */
export const markClaimed = (mb, idx) => { mb.zi = idx }
/** Пит назвал слово: с этого момента оно «в работе» */
export const markAsked = (mb, now = Date.now()) => { mb.askAt = now }
/** Слушатель слышал речь (heardAt — его отметка, Date.now), пока слово было в работе: «говорили, но не успели», а не «молчали» */
export const spokeSince = (mb, heardAt) => (heardAt ?? 0) > 0 && (heardAt ?? 0) >= (mb.askAt ?? 0)

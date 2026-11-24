// Эпизод «Мия» (прототип): чистая машина состояния без React и DOM. Мия приходит ВМЕСТО обычного дополнительного круга (разгон ×1,1): когда по итогам прохода A (sprint) или B (catch)
// слабых слов две и больше (raceExtraRound.extraTarget), директор идёт не на «а теперь давай повысим скорость» и круг 2, а на скрытую стадию-церемонию `${act}3-ann` (stage.mia === 'ann',
// raceStageKit.queueStages) — один раз за игру. Там Пит начинает репликой «Некоторые слова забылись…», на ней падает коробка (MIA.DROP_AT), Пит мечется и мяукает, Мия запрыгивает
// на крышку и говорит вступительные реплики; три ноты и круг ждут конца речи. Потом круг с Мией `${act}3` (stage.mia === 'round'): слова дополнительного круга в новом порядке,
// дорожка быстрее (step.boost.k × MIA.BOOST — ускоряет её Мия, а не обычный разгон) и колкие реплики. Три верных подряд — Мия отпрыгивает за экран, прихватив лапами коробку, Пит свободен;
// круг кончился раньше — Мия отпускает Пита сама (фаза 'out' потом остаётся: анимация ухода доигрывает без обрыва, повторного прихода за игру нет — used). Дорожка меняет цвет на время круга с Мией (fast; CSS .wl[data-mia], race-mia.css). Слова и переводы говорит Пит (его озвучка), Мия только колет.
// reduceMia(m, ev) → { mia, say, boost, log? }: say — реплики (id, who, delay от события, мс), boost — новое k для step.boost (null — без изменений).
// ev: { t: 'enter' | 'win' | 'miss' | 'fail' | 'zone', stage, now, zone? }.
import { variantOf } from './miaLines.js'
import { pauseMs } from '../../../shared/lib/scenePauses.js'
import { HELP_LINES } from '../boss/bossHelp.js'

export const MIA = { BOOST: 1.15, STREAK_LEAVE: 3, OK_EVERY: 3, DROP_AT: 1200, EXIT_MS: 250, LEAVE_JUMP_MS: 1200, PUSH_AT: 1800, PANIC_AT: 4600, ANNOUNCE_AT: 6500, REPLY_AT: 8800, ANNOUNCE2_AT: 10800, ANNOUNCE3_AT: 13000, BACK_AT: 2600, BACK2_AT: 5200 }

const PIT_IN_BOX_MS = 1350 // v3.3.280 (владелец: «Пит говорит в коробке — она должна упасть ДО его слов»): коробка падает сразу (DROP_AT), реплика Пита начинается после удара (DROP_AT + IMPACT ≈ 1,45 с), остальное сдвинуто на столько же
export const BOSS = { DROP_AT: 500, JUMP: 6.4, KEEP_REDS: 5, AFTER_PIT_MS: 450, PIT1_AT: 300 + PIT_IN_BOX_MS, JUMP_ABS: 6900 + PIT_IN_BOX_MS, HUSH_AT: 5200 + PIT_IN_BOX_MS, LOOK_AT: 8000 + PIT_IN_BOX_MS } // объяснение шкалы идёт подряд, без пауз: с LOOK_AT реплики look → think → green → yellow → red → five → Пит стоят в очереди одна за другой (очередь речи сама держит паузу GAP_MS), путь пилюли примера считается по их длительности (bossScale.demoPlan) // финал «Шкала памяти»: падение коробки, прыжок Мии (с от падения), порог красных слов, сроки реплик (мс от входа)

export const miaInit = () => ({ done: {}, phase: 'off', act: '', fast: false, jump: null, total: 0, won: {}, reds: 0, redWins: 0, failed: {}, dug: {}, keep: false, rtotal: 0, rwon: {}, solo: null, soloAt: 0, alone: false, used: {}, streak: 0, wins: 0, hits: 0, seq: 0, at: 0, why: '' })

/** Конец финала откладывается на ms (Мия договаривает последнюю колкость): отметка на стадии (её читает директор: holdMs) и таймер go в коробке (снимается при уходе из игры) */
export function holdEnd(mb, stage, ms, go) { stage.preWait = ms; clearTimeout(mb.endTimer); mb.endTimer = setTimeout(go, ms) }
export const clearEndTimer = mb => { clearTimeout(mb.endTimer); mb.endTimer = 0 }

/** Стадия эпизода: 'ann' — церемония прихода, 'round' — круг с Мией */
export const isMiaStage = st => st?.mia === 'intro' || st?.mia === 'ann' || st?.mia === 'round' || st?.mia === 'end' || st?.mia === 'hold'

const line = (id, who, delay = 0) => ({ id, who, delay })
const none = m => ({ mia: m, say: [], boost: null })
const leave = (m, now, why, say) => ({ mia: { ...m, phase: 'out', fast: false, at: now, why, seq: m.seq + 1 }, say, boost: 1 })
/** На сколько мс раньше начинается речь Мии, если реплика Пита короче запаса: Мия начинает через BOSS.AFTER_PIT_MS после неё (владелец, v3.3.283: «после фразы Пита долгое молчание, и лишь потом Мия»); 0 — как раньше */
export const bossShift = pitMs => (pitMs > 0 ? Math.min(0, pauseMs('boss.pit1At') + pitMs + BOSS.AFTER_PIT_MS - BOSS.HUSH_AT) : 0) // первая реплика Пита — настройка boss.pit1At (по умолчанию BOSS.PIT1_AT)
const bossCeremony = (first, d = 0) => [line(first ? 'boss_pit_new' : 'boss_pit_1', 'pit', pauseMs('boss.pit1At')), line('boss_mia_hush', 'mia', BOSS.HUSH_AT + d), ...['look', 'green', 'yellow', 'red', 'five'].map(k => line(`boss_mia_${k}`, 'mia', BOSS.LOOK_AT + d)), line('boss_pit_no', 'pit', BOSS.LOOK_AT + d), line('boss_mia_go', 'mia', BOSS.LOOK_AT + d)] // правка владельца 2026-11-24: exam и think склеены в look; после «Нет, только не это» Мия запускает слова
const ceremony = () => [line('mia_push', 'mia', MIA.PUSH_AT), line('pit_panic', 'pit', MIA.PANIC_AT), line('pit_reply', 'pit', MIA.REPLY_AT), line('mia_announce_2', 'mia', MIA.ANNOUNCE2_AT), line('mia_announce_3', 'mia', MIA.ANNOUNCE3_AT)] // сценарий владельца 2026-11-24: «Посиди в коробке, пушистик…» (склеены push + announce_1) → Пит → «Это не важно, я ускоряю игру…» (склеены attention + announce_2) → условие

/** Счёт финала по блокам (английские слова, потом русские): блок со смещением offset (номер его первого слова в общем счёте) считается заново, прежние блоки остаются; total — всего слов к концу блока */
const silentBlock = (m, stage) => {
  const off = stage.offset ?? 0, len = stage.words?.length ?? 0, keepOld = o => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => Number(k) < off))
  return off ? { total: off + len, won: keepOld(m.won), failed: keepOld(m.failed), dug: keepOld(m.dug), keep: false } : { total: len, won: {}, failed: {}, dug: {}, redWins: 0, reds: 0, keep: false }
}

export function reduceMia(m, ev) {
  const { t, stage, now = 0 } = ev
  // Пит в коробке без Мии (финал пройден плохо, v3.3.290): stuck — Мия выпрыгнула, Пит просит помочь; faster — одно касание без второго; free — коробка снята: отлетает без Мии (alone), Пит благодарит
  if (m.act === 'boss' && ['try', 'stuck', 'faster', 'free'].includes(t)) return none(m) // экзамен (владелец 2026-11-22): снятия коробки касанием нет никогда — исходов два: Мия убегает с коробкой или Мия и коробка остаются
  if (t === 'try') return m.solo === 'keep' ? { mia: m, say: [line('boss_pit_try', 'pit')], boost: null } : none(m) // Мия ушла, Пит: «Она ушла? Попробую выбраться», потом трясёт коробку (RaceMia: try → rave)
  if (t === 'stuck') return m.solo === 'keep' ? { mia: { ...m, solo: 'stuck' }, say: [line('boss_pit_stuck', 'pit')], boost: null } : none(m)
  if (t === 'faster') return m.solo === 'stuck' ? { mia: m, say: [line('boss_pit_faster', 'pit')], boost: null } : none(m)
  if (t === 'free') return m.solo === 'stuck' ? leave({ ...m, keep: false, solo: null, alone: true }, now, 'freed', [line('pit_back_1', 'pit', 1300)]) : none(m) // Пит про её характер: «Спасибо за помощь, вот это у неё характер» (озвучена)
  if (t === 'enter') {
    if (stage?.mia === 'ann') { // церемония: Пит начинает репликой стадии, через DROP_AT падает коробка (at — момент падения), Мия запрыгивает, вступительные реплики (три ноты ждут их конца)
      // повторный вход в ту же стадию (пауза и «Продолжить», перезапуск ступени): церемония начинается заново — реплики снова в очереди, коробка падает снова (раньше такой вход ничего не делал: оба молчали, пример не шёл)
      return { mia: { ...m, phase: 'in', act: stage.act, used: { ...m.used, [stage.act]: true }, streak: 0, wins: 0, seq: m.seq + 1, at: now + (ev.dropAt ?? stage.dropAt ?? MIA.DROP_AT), why: '', fast: false, jump: ev.jumpAt ?? stage.jumpAt ?? null, total: 0, won: {}, done: {}, reds: 0, redWins: 0, failed: {}, dug: {}, keep: false, solo: null, alone: false }, say: stage.script === 'boss' ? bossCeremony(!Object.keys(m.used ?? {}).some(k => k !== 'boss'), ev.bossShift ?? 0) : ceremony(), boost: null }
    }
    if (stage?.mia === 'round') return m.phase === 'in' && m.act === stage.act ? { mia: m.fast && (!stage.silent || m.total === (stage.offset ?? 0) + (stage.words?.length ?? 0)) ? m : { ...m, fast: true, ...(stage.silent ? silentBlock(m, stage) : { rtotal: stage.words?.length ?? 0, rwon: {}, slip: {} }) }, say: [], boost: stage.noBoost ? null : MIA.BOOST } : none(m) // круг с Мией: дорожка быстрее и меняет цвет (fast) — с этого круга, а не с церемонии
    if (stage?.mia === 'hold') return m.phase === 'in' && m.act === stage.act ? { mia: m, say: stage.say ? [line(stage.say, 'mia')] : [], boost: null } : none(m) // служебная стадия внутри эпизода (финал: переключение слуха между блоками): Мия остаётся, говорит свою реплику
    if (stage?.mia === 'end') { // конец финала (стадия boss-end перед итогом): красных меньше пяти — Мия уходит с коробкой, пять и больше — Пит остаётся внутри до следующей встречи (коробка и Мия на сцене, пока Мия и Пит говорят)
      if (m.phase !== 'in' || m.act !== stage.act) return none(m)
      if (stage.act !== 'boss') return circleEnd(m, now, ev) // круг с Мией (v3.3.297): коробка улетает, только если ВСЕ слова круга названы верно
      const { won, reds, missed, keep } = bossEnd(m) // красные — все слова, кроме верно названных не в красной зоне (молчание и ошибки тоже красные, даже если события «не успел» не дошли)
      const log = `финал кончился: слов ${m.total}, названо верно ${won} (из них в красной зоне ${m.redWins}), неверно или не названо ${missed} (нужно ${keepNeed()}), красных ${reds} — ${keep ? 'Пит остаётся в коробке' : 'Мия отпускает Пита'}`
      if (keep) return { mia: { ...m, reds, keep, fast: false, seq: m.seq + 1 }, say: [line('boss_mia_stay', 'mia'), line('boss_pit_keep', 'pit')], boost: 1, log } // владелец 2026-11-22: в экзамене Мия НЕ говорит «а я пошла» и остаётся на коробке, Пит наружу не просится (solo не ставится: try / stuck / free молчат) — коробка с Мией стоит под итогом. Снятие коробки учеником осталось у круга «Допрос у Мии» (circleEnd)
      return { ...leave({ ...m, reds, keep }, now, 'end', [line('boss_mia_free', 'mia'), line('boss_mia_bye', 'mia'), line('boss_pit_well', 'pit', 2800)]), log }
    }
    if (m.phase === 'in' && m.keep && m.act === 'boss') return none(m) // Пит остался в коробке: она стоит под итогом до конца игры (раньше убиралась на экране итога — Пит на миг мигал без коробки)
    if (m.phase === 'in') return leave(m, now, 'end', [line('mia_end', 'mia'), line('pit_end', 'pit', 2400)]) // круг кончился: Мия отпускает Пита
    return none(m)
  }
  if (stage?.mia !== 'round' || m.phase !== 'in') return none(m)
  if (stage.silent) {
    const gi = (ev.idx ?? 0) + (stage.offset ?? 0) // номер слова в общем счёте финала (у второго блока — со смещением) // финал: Мия молчит, говорит шкала. Копим: верно названные слова (win по номеру), красные ответы (zone), ошибки / «не успел» (miss / fail) — итог красных считается на эпилоге
    if (t === 'win') { // верный ответ: Мия иногда подкалывает (как в обычном круге: на второй верный подряд и на каждый третий ответ), даже когда слово названо в красной зоне
      const streak = m.streak + 1, wins = m.wins + 1
      const say = streak === 2 ? [line('mia_streak2', 'mia')] : wins % MIA.OK_EVERY === 1 ? [line(variantOf('mia_ok', m.hits + 1), 'mia')] : []
      return { mia: { ...m, won: { ...m.won, [gi]: true }, streak, wins, hits: say.length && streak !== 2 ? m.hits + 1 : m.hits }, say, boost: null }
    }
    if (t === 'zone') return { mia: { ...m, redWins: m.redWins + (ev.zone === 'slow' ? 1 : 0) }, say: [], boost: null }
    if (t === 'miss' || t === 'fail') { // miss — слово сказано неверно (пилюля ещё едет, ученик может поправиться: только красный счёт); fail — пилюля ушла: порядок речи (владелец 2026-11-22) — Мия коротко подкалывает → Пит «это значит» + верное слово (одна реплика очереди: word) → Пит «следующее слово» (если в блоке есть ещё слово) → новая пилюля и её слово; на слово — один раз
      const dig = t === 'fail' && !m.dug?.[gi], failed = { ...m.failed, [gi]: true }, w = stage.words?.[ev.idx ?? 0], ru = stage.step?.lang === 'ru', told = ru ? w?.translation : w?.text
      const say = dig ? [line(variantOf('boss_mia_miss', m.hits + 1), 'mia'), ...(told ? [{ ...line(HELP_LINES[Object.keys(m.dug ?? {}).length % HELP_LINES.length], 'pit'), word: told, ...(ru ? { ru: true } : {}) }] : []), ...((ev.idx ?? 0) + 1 < (stage.words?.length ?? 0) ? [line('boss_pit_next', 'pit')] : [])] : []
      return { mia: { ...m, streak: 0, hits: dig ? m.hits + 1 : m.hits, dug: dig ? { ...m.dug, [gi]: true } : m.dug, failed, reds: Object.keys(failed).length + m.redWins }, say, boost: null }
    }
    return none(m)
  }
  const r = ordinaryRound(m, ev)
  return t === 'win' || t === 'fail' ? { ...r, mia: { ...r.mia, done: { ...(m.done ?? {}), [ev.idx ?? 0]: true } } } : r // пилюля круга разрешилась (принята / ушла): бар сверху убывает по ним (raceBar.barOf, v3.3.284: «в допросе слова летят, а в баре не уменьшаются»)
}

/** Обычный круг с Мией (не финал): серия верных, колкости, уход при трёх подряд */
function ordinaryRound(m, ev) {
  const { t, stage } = ev
  const word = stage.words?.[ev.idx]
  const i = ev.idx ?? 0, slipped = !!m.slip?.[i] // на этой пилюле уже сказали неверное (в ловушку «поверили»)
  if (t === 'miss') return { mia: { ...m, streak: 0, slip: { ...(m.slip ?? {}), [i]: true } }, say: [], boost: null } // владелец 2026-11-22 («допрос сделай как в экзамене»): сказано неверно, а пилюля ещё едет и на неё можно ответить — Мия молчит (серия сброшена); колкость — когда пилюля ушла (fail)
  const ok = t === 'win' || (t === 'fail' && !!word?.trap && !slipped)          // ловушка: верно промолчать
  const bad = t === 'fail' && (!word?.trap || slipped)
  if (ok) {
    const streak = m.streak + 1, wins = m.wins + 1 // v3.3.297: три верных подряд больше не отпускают Мию с коробкой (владелец: коробка улетает, только когда ВСЕ слова круга сказаны верно — решает стадия-конец круга)
    const say = streak === 2 ? [line('mia_streak2', 'mia')] : wins % MIA.OK_EVERY === 1 ? [line(variantOf('mia_ok', m.hits + 1), 'mia')] : []
    return { mia: { ...m, streak, wins, rwon: { ...(m.rwon ?? {}), [ev.idx ?? 0]: true }, hits: say.length && streak !== 2 ? m.hits + 1 : m.hits }, say, boost: null }
  }
  if (bad) return { mia: { ...m, streak: 0, hits: m.hits + 1, seq: m.seq + 1 }, say: [line(variantOf('mia_miss', m.hits + 1), 'mia')], boost: null }
  return none(m)
}

/** Круг с Мией: все слова (слабые + подмешанные, ловушка — верно промолчать) названы верно? (v3.3.297) */
export const circleAll = m => (m.rtotal ?? 0) > 0 && Object.keys(m.rwon ?? {}).length >= m.rtotal
/** Остаётся ли Пит в коробке после стадии-конца st: финал — хоть одно неверное слово (bossEnd), круг с Мией — не все слова верны */
export const endKeep = (m, st) => (st?.act === 'boss' ? bossEnd(m).keep : !circleAll(m))
/** Конец круга с Мией (стадия `${act}3-end`): все слова верны — Мия уходит с коробкой («вы победили»); иначе Мия выпрыгивает одна, коробку снимает ученик (как в финале) */
function circleEnd(m, now, ev) {
  const all = circleAll(m), won = Object.keys(m.rwon ?? {}).length
  const log = `круг с Мией кончился: слов ${m.rtotal}, названо верно ${won} — ${all ? 'все верно: Мия уходит с коробкой' : 'Пит остаётся в коробке'}`
  if (all) return { ...leave(m, now, 'win', [line('mia_leave', 'mia'), line('pit_back_1', 'pit', MIA.BACK_AT), line('pit_back_2', 'pit', MIA.BACK2_AT)]), log }
  return { mia: { ...m, fast: false, solo: 'keep', soloAt: now + (ev.keepMs ?? 3500), seq: m.seq + 1 }, say: [line('boss_mia_keep', 'mia')], boost: 1, log }
}

/** Мия на экране (коробка, подсветка дорожки): пока она «в игре» или уходит */
export const miaShown = m => m.phase === 'in' || m.phase === 'out'

/** Сколько неверных (или не названных) слов финала оставляют Пита в коробке (владелец, v3.3.295: «отвечаю неверно, а Мия всё равно улетает с коробкой»): ХОТЬ ОДНО. Раньше — красных больше половины (2 из 3, 4 из 6). Верный ответ в красной зоне — верный (красная зона только режет XP) */
export const keepNeed = () => 1
/** Итог финала по накопленному: названо верно, красных слов (все, кроме верно названных не в красной зоне; молчание и ошибки красные), неверных / не названных (missed), остаётся ли Пит в коробке */
export function bossEnd(m) {
  const won = Object.keys(m.won).length, reds = m.total ? m.total - Math.max(0, won - m.redWins) : m.reds, missed = m.total ? Math.max(0, m.total - won) : 0
  return { won, reds, missed, keep: missed >= keepNeed() }
}

/** Рабочая коробка директора (useRaceActs): m — состояние машины, step — ступень, которой Мия ускорила дорожку, key — номер пачки реплик. Мутации — функциями (как raceState.putState) */
export const makeMiaBox = () => ({ m: miaInit(), step: null, key: 0, entered: '' })
/** Стадия с этой отметкой уже обработана эпизодом (true — первый раз) */
export function markMiaEntered(mb, key) { if (mb.entered === key) return false; mb.entered = key; return true }
/** Финал кончился красными словами: Пит остаётся в коробке (итог не играет обычную реплику «Финиш…», чтобы не оборвать «Тут темно и тесно…») */
export const miaStays = mb => !!mb.m.keep && mb.m.act === 'boss'
/** Применить результат reduceMia к рабочей коробке: состояние, ускорение дорожки (boost.k ступени; 1 — вернуть) и номер пачки реплик → вид для экрана */
export function applyMia(mb, r, stage) {
  mb.m = r.mia
  if (r.boost === 1) { if (mb.step?.boost) mb.step.boost.k = 1; mb.step = null }
  else if (r.boost != null && stage?.step?.boost) { stage.step.boost.k = r.boost; mb.step = stage.step }
  if (r.say.length) mb.key += 1
  if (r.say.some(c => c.id === 'boss_pit_next')) mb.next = true // прозвучит «Следующее слово»: слово следующей пилюли идёт сразу за ним (boss/bossLead.leadAfter)
  return { mia: r.mia, cues: r.say, key: mb.key }
}

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
import { jabAllowed } from '../racePathShare.js'
import { examBlock, examRound, examEnd, examBye, bossEnd } from '../boss/bossMia.js' // экзамен «Шкала памяти»: круг слов, трофеи по зонам и три исхода (boss/bossMia.js, boss/bossTrophies.js)
export { bossEnd }

export const MIA = { BOOST: 1.15, STREAK_LEAVE: 3, OK_EVERY: 3, DROP_AT: 1200, EXIT_MS: 250, LEAVE_JUMP_MS: 1200, PUSH_AT: 1800, PANIC_AT: 4600, BACK_AT: 2600, BACK2_AT: 5200 } // PUSH_AT / PANIC_AT — «не раньше» (от входа в церемонию), дальше реплики идут очередью по РЕАЛЬНОМУ концу звука (miaSpeech + пауза mia.gap). Сроки REPLY_AT / ANNOUNCE*_AT убраны: были подобраны под прежние длины реплик и прежний состав (mia_announce_1, mia_attention) и после правки сценария давали тишину перед «зря стараешься…». BACK_AT / BACK2_AT в «Допросе» больше не используются (читает только boss/raceEndHold.js)

const PIT_IN_BOX_MS = 800 // v3.3.280 (владелец: «Пит говорит в коробке — она должна упасть ДО его слов»): коробка падает сразу (DROP_AT), реплика Пита начинается после удара (DROP_AT + IMPACT ≈ 1,45 с), остальное сдвинуто на столько же
export const BOSS = { DROP_AT: 0, JUMP: 6.4, KEEP_REDS: 5, AFTER_PIT_MS: 450, PIT1_AT: 300 + PIT_IN_BOX_MS, JUMP_ABS: 6900 + PIT_IN_BOX_MS, HUSH_AT: 5200 + PIT_IN_BOX_MS, LOOK_AT: 8000 + PIT_IN_BOX_MS } // объяснение шкалы идёт подряд, без пауз: с LOOK_AT реплики look → think → green → yellow → red → five → Пит стоят в очереди одна за другой (очередь речи сама держит паузу GAP_MS), путь пилюли примера считается по их длительности (bossScale.demoPlan) // финал «Шкала памяти»: падение коробки, прыжок Мии (с от падения), порог красных слов, сроки реплик (мс от входа)

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
const bossCeremony = (first, d = 0, look = BOSS.LOOK_AT + d) => [ // look — срок объяснения шкалы: от реального конца реплики «Сиди тихо…» (boss/bossMia.ceremonyTimes), по умолчанию — прежняя метка
 line(first ? 'boss_pit_new' : 'boss_pit_1', 'pit', pauseMs('boss.pit1At')), line('boss_mia_hush', 'mia', BOSS.HUSH_AT + d), ...['look', 'green', 'yellow', 'red', 'five'].map(k => line(`boss_mia_${k}`, 'mia', look)), line('boss_pit_no', 'pit', look), line('boss_mia_go', 'mia', look)] // правка владельца 2026-11-24: exam и think склеены в look; после «Нет, только не это» Мия запускает слова
const ceremony = () => [line('mia_push', 'mia', MIA.PUSH_AT), ...[['pit_panic', 'pit'], ['pit_reply', 'pit'], ['mia_announce_2', 'mia'], ['mia_announce_3', 'mia']].map(([id, who]) => line(id, who, MIA.PANIC_AT))] // сценарий владельца 2026-11-24: «Посиди в коробке, пушистик…» (склеены push + announce_1) → Пит → «Это не важно, я ускоряю игру…» (склеены attention + announce_2) → условие

const silentBlock = examBlock // счёт экзамена по блокам (английские слова, потом русские) — boss/bossMia.js

export function reduceMia(m, ev) {
  const { t, stage, now = 0 } = ev
  // Пит в коробке без Мии (финал пройден плохо, v3.3.290): stuck — Мия выпрыгнула, Пит просит помочь; faster — одно касание без второго; free — коробка снята: отлетает без Мии (alone), Пит благодарит
  if (t === 'bye') return examBye(m, { ...ev, now }) ?? none(m) // экзамен: последняя реплика Мии реально доиграла — она уходит с коробкой, Пит говорит следом (boss/bossMia.examBye)
  if (m.act === 'boss' && ['try', 'stuck', 'nudge', 'faster', 'free'].includes(t)) return none(m) // экзамен (владелец 2026-11-22): снятия коробки касанием нет никогда — исходов два: Мия убегает с коробкой или Мия и коробка остаются
  if (t === 'try') return m.solo === 'keep' ? { mia: m.fast ? { ...m, fast: false } : m, say: [line('boss_pit_try', 'pit')], boost: null } : none(m) // событие «Мия оттолкнулась и прыгает за экран» (RaceMia): только теперь дорожки возвращают обычный цвет (владелец 2026-11-25: «цвет меняется слишком рано, нужно когда она отпрыгивает за экран в конце») // Мия ушла, Пит: «Она ушла? Попробую выбраться», потом трясёт коробку (RaceMia: try → rave)
  if (t === 'stuck') return m.solo === 'keep' ? { mia: { ...m, solo: 'stuck' }, say: [line('boss_pit_stuck', 'pit')], boost: null } : none(m)
  if (t === 'nudge') return m.solo === 'stuck' ? { mia: m, say: [line('boss_pit_stuck', 'pit')], boost: null } : none(m) // игрок бездействует: Пит повторяет просьбу (mia/miaBoxFree.nudgeStep — не чаще и не больше заданного)
  if (t === 'faster') return m.solo === 'stuck' ? { mia: m, say: [line('boss_pit_faster', 'pit')], boost: null } : none(m)
  if (t === 'free') return m.solo === 'stuck' ? leave({ ...m, keep: false, solo: null, alone: true }, now, 'freed', [line('boss_pit_free', 'pit', 1300)]) : none(m) // сценарий владельца 2026-11-24: коробка снята — Пит «Ух, спасибо вам, эти слова мы ещё встретим» (раньше здесь звучала pit_back_1, а boss_pit_free не звучала нигде); 1300 — отлёт коробки (анимация)
  if (t === 'enter') {
    if (stage?.mia === 'ann') { // церемония: Пит начинает репликой стадии, через DROP_AT падает коробка (at — момент падения), Мия запрыгивает, вступительные реплики (три ноты ждут их конца)
      // повторный вход в ту же стадию (пауза и «Продолжить», перезапуск ступени): церемония начинается заново — реплики снова в очереди, коробка падает снова (раньше такой вход ничего не делал: оба молчали, пример не шёл)
      return { mia: { ...m, phase: 'in', act: stage.act, used: { ...m.used, [stage.act]: true }, streak: 0, wins: 0, seq: m.seq + 1, at: now + (ev.dropAt ?? stage.dropAt ?? MIA.DROP_AT), why: '', fast: false, jump: ev.jumpAt ?? stage.jumpAt ?? null, total: 0, won: {}, done: {}, reds: 0, redWins: 0, failed: {}, dug: {}, keep: false, solo: null, alone: false }, say: stage.script === 'boss' ? bossCeremony(!Object.keys(m.used ?? {}).some(k => k !== 'boss'), ev.bossShift ?? 0, ev.bossLookAt) : ceremony(), boost: null }
    }
    if (stage?.mia === 'round') return m.phase === 'in' && m.act === stage.act ? { mia: m.fast && (!stage.silent || m.total === (stage.offset ?? 0) + (stage.words?.length ?? 0)) ? m : { ...m, fast: true, ...(stage.silent ? silentBlock(m, stage) : { rtotal: stage.words?.length ?? 0, rwon: {}, slip: {} }) }, say: [], boost: stage.noBoost ? null : MIA.BOOST } : none(m) // круг с Мией: дорожка быстрее и меняет цвет (fast) — с этого круга, а не с церемонии
    if (stage?.mia === 'hold') return m.phase === 'in' && m.act === stage.act ? { mia: m, say: stage.say ? [line(stage.say, 'mia')] : [], boost: null } : none(m) // служебная стадия внутри эпизода (финал: переключение слуха между блоками): Мия остаётся, говорит свою реплику
    if (stage?.mia === 'end') { // конец финала (стадия boss-end перед итогом): красных меньше пяти — Мия уходит с коробкой, пять и больше — Пит остаётся внутри до следующей встречи (коробка и Мия на сцене, пока Мия и Пит говорят)
      if (m.phase !== 'in' || m.act !== stage.act) return none(m)
      if (stage.act !== 'boss') return m.solo ? none(m) : circleEnd(m, now, ev) // повторный вход (пауза и «Продолжить»), когда Пит уже остался в коробке: конец не играем заново — ждём снятия коробки (сторож заведёт useMiaBoxFree) // круг с Мией (v3.3.297): коробка улетает, только если ВСЕ слова круга названы верно
      return examEnd(m) // экзамен: три исхода по доле собранных трофеев; уход Мии — позже, событием bye, после РЕАЛЬНОГО конца её последней реплики (boss/bossMia.js)
    }
    if (m.phase === 'in' && m.keep && m.act === 'boss') return none(m) // Пит остался в коробке: она стоит под итогом до конца игры (раньше убиралась на экране итога — Пит на миг мигал без коробки)
    if (m.phase === 'in' && m.act === 'boss' && m.bye) return examBye(m, { now }, true) ?? none(m) // экзамен покинут раньше, чем Мия договорила (очередь речи сброшена): она уходит с коробкой молча, без реплик «Допроса»
    if (m.phase === 'in') return leave(m, now, 'end', [line('mia_end', 'mia'), line('pit_end', 'pit', 2400)]) // круг кончился: Мия отпускает Пита
    return none(m)
  }
  if (stage?.mia !== 'round' || m.phase !== 'in') return none(m)
  if (stage.silent) return examRound(m, ev) ?? none(m) // экзамен: Мия молчит, говорит шкала; счёт слов, зон и колкости по причине — boss/bossMia.examRound
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
    const say = !jabAllowed(ev.share) ? [] : streak === 2 ? [line('mia_streak2', 'mia')] : wins % MIA.OK_EVERY === 1 ? [line(variantOf('mia_ok', m.hits + 1), 'mia')] : [] // верный на ≥ JAB_MAX_SHARE пути (85 %) — колкости нет, счётчики идут как раньше (владелец 2026-11-27)
    return { mia: { ...m, streak, wins, rwon: { ...(m.rwon ?? {}), [ev.idx ?? 0]: true }, hits: say.length && streak !== 2 ? m.hits + 1 : m.hits }, say, boost: null }
  }
  if (bad) return { mia: { ...m, streak: 0, hits: m.hits + 1, seq: m.seq + 1 }, say: [line(variantOf('mia_miss', m.hits + 1), 'mia')], boost: null }
  return none(m)
}

/** Круг с Мией: все слова (слабые + подмешанные, ловушка — верно промолчать) названы верно? (v3.3.297) */
export const circleAll = m => (m.rtotal ?? 0) > 0 && Object.keys(m.rwon ?? {}).length >= m.rtotal
/** Остаётся ли Пит в коробке после стадии-конца st: финал — хоть одно неверное слово (bossEnd), круг с Мией — не все слова верны */
export const endKeep = (m, st) => (st?.act === 'boss' ? bossEnd(m).keep : !circleAll(m))
/** Конец круга с Мией (стадия `${act}3-end`): все слова верны — Мия уходит с коробкой («твоя взяла»), Пит благодарит; иначе Мия выпрыгивает одна, коробку снимает ученик (как в финале) */
function circleEnd(m, now, ev) {
  const all = circleAll(m), won = Object.keys(m.rwon ?? {}).length
  const log = `круг с Мией кончился: слов ${m.rtotal}, названо верно ${won} — ${all ? 'все верно: Мия уходит с коробкой' : 'Пит остаётся в коробке'}`
  if (all) return { ...leave(m, now, 'win', [line('mia_leave', 'mia'), line('pit_back_1', 'pit')]), log } // реплики идут очередью по концу звука (без сроков «от события»); «Едем дальше, теперь я говорю по-английски…» (pit_back_2) Пит говорит уже на развороте конвейера, вместе с анимацией (mia/miaCircleEnd.js), а после прохода B её нет вовсе
  return { mia: { ...m, solo: 'keep', soloAt: now + (ev.keepMs ?? 3500), seq: m.seq + 1 }, say: [line('boss_mia_keep', 'mia')], boost: 1, log } // fast (цвет дорожек Мии) остаётся, пока Мия на экране: его снимает её прыжок за экран (событие try); скорость конвейера возвращается сразу (boost 1) — круг кончился
}

/** Мия на экране (коробка, подсветка дорожки): пока она «в игре» или уходит */
export const miaShown = m => m.phase === 'in' || m.phase === 'out'


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

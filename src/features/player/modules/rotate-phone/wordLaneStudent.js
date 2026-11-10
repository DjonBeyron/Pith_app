// Фаза ученика одной ступени: тот же конвейер, что у диктора, но повторы выкатывает сама игра, а ученик должен успеть сказать их, пока пилюли на экране. Чистая логика без DOM и
// таймеров — её шагает движок пилюль (useWordLanePills) и проверяют тесты; всё время приходит аргументом t (мс от старта ступени).
//  • Повтор (rep) — одно высказывание ступени: у него одна или несколько пилюль (по пилюле на кусок, каждая в дорожке куска). Пилюли едут вниз с постоянной скоростью SPEED; куски одного
//    повтора выкатываются друг за другом, как слова во фразе.
//  • ОДИН ЖИВОЙ ПОВТОР ЗА РАЗ. Следующий повтор выкатывается, только когда предыдущий разрешился: принят (win — после щелчка последнего куска) или «не успел» (fail — последняя пилюля ушла ниже
//    FAIL_Y, пилюли погасли), и прошла пауза REP_GAP_MS. Раньше повторы шли по таймеру (раз в 2 с), на экране было 2–3 повтора, и человек не понимал, какой «его»: распознанная цель доставалась
//    самому старому, а хвост partial мог защёлкнуть кусок следующего. Теперь распознавание (seq, misses) и хвост partial относятся только к текущему повтору.
//  • Повтор можно «взять», пока он на экране (первая пилюля уже видна, последняя ещё не ушла вниз): когда распознавание услышало его текст (цель), его незащёлкнутые пилюли быстро
//    заливаются до 100 % (LOCK_MS, куски по очереди) и, когда заливка ДОШЛА, щёлкают (snap) и дают XP (win) — одним кадром. Цель, сказанная между повторами, — late (никому не достаётся).
//  • Три состояния куска (заливка живого повтора — wordLaneStudentFill.js). «В процессе»: пока слово не распознано, пилюля ТЕКУЩЕГО куска показывает только голос — «дыхание» (breathStep: мягкая атака, ещё более мягкий спад, не выше FILL_CAP);
//    до подтверждения речи распознаванием (confirmed: распознаватель недавно что-то услышал) голос наливает лишь до PRE_CONFIRM_CAP — partial на телефоне приходит с лагом 0,2–0,5 с, а пилюля не должна молчать, пока человек говорит; шум и эхо отсекают ворота голоса, а без слов дальше этого потолка не растут. Следующий кусок не наливается до своего
//    первого слова (tail.tokens) и пока предыдущий не защёлкнулся до конца: две пилюли одного повтора от одного голоса не наливаются. «Верно по кускам» — кусок, чьи слова произнесены целиком
//    (tk ≥ cum[i + 1]), защёлкивается СРАЗУ, не дожидаясь конца повтора: событие piece-ok → data-lock, затем snap / win (нота) на этот кусок. Последний кусок защёлкивается принятием повтора
//    (claim). «Неверно» — miss: слив только ещё не защёлкнутых кусков (защёлкнутые остаются зелёными), красная вспышка — на первом из них.
//  • Не успел (fail) — гаснет весь повтор, в том числе защёлкнутые куски (повтор выкатят заново целиком, его win-ы в счёт locked не идут). Недосказанная часть отдельно не переигрывается: распознавание
//    понимает только цель целиком («i am trying»), а не «trying» после «i am». Хвост, на котором повтор принят или не успели, следующему не достаётся (spentTail) — только новый черновик.
//  • Время ступени ограничено (budget): последовательный показ растягивает ступень, если ученик не успевает, поэтому после budget новые повторы не выкатываются, а недоигранные считаются потерянными.
//  • Очередь («Гонка с Питом», step.overlap = true, «Разгон»): живых повторов может быть два. Следующий повтор выкатывается СРАЗУ, когда текущий принят (claim — без паузы REP_GAP_MS, а пока Пит договаривает реплику серии, выкат не ждёт) или стал недоступным (isDeaf: ушёл за нижний край на DEAF_OFFSCREEN_PCT %); принятый улетает вверх, недоступный доезжает вниз сам. Слушатель и заливка работают только с ПОСЛЕДНИМ выкатанным повтором (liveRep).
//  • step.preSay («Разгон»): перед выездом каждой пилюли событие 'pre' (Пит говорит перевод), выезд — когда он договорил (hold);
//  • step.holdAll / step.claimGap / step.goodAt («Разгон»): следующая пилюля выезжает не раньше, чем Пит договорит (hold действует и на следующие пилюли); после принятия слова с номером из goodAt — с паузой claimGap мс (за неё директор успевает начать реплику успеха).
//  • step.preGap («Разгон», «Слушай и лови»): выдержка перед тем, как Пит скажет перевод / слово следующей пилюли, — после принятия слова (если нет реплики успеха: после неё пауза не нужна) и после «не успел».
//  • rep.trap («Слушай и лови»): пилюля с ЧУЖИМ переводом слова не принимает — слово на ней miss (rep.believed = «поверил»), а упущенная (fail) — верное действие. rep.say — слово, которое Пит произносит перед выездом.
//  • Ступень закончена (done), когда каждый повтор принят или потерян и ничего не летит.
import { ENTER_Y, EXIT_Y, SPEED, LOCK_MS, LISTEN_Y_MIN, LISTEN_Y_MAX, easeInOut } from './wordLaneTimeline.js'
import { tokenize } from '../../../../shared/lib/speech/speechMatch.js'
import { wordCountRu } from '../../../../shared/lib/speech/speechMatchRu.js'
import { laneOf, stepTargets, textOf } from './wordLaneRecipe.js'
import { estChunkMs } from './wordLaneAudio.js'
import { spawnEarly } from './wordLaneConveyorSpeed.js'
import { lockPill, stepFill } from './wordLaneStudentFill.js'

export { PENDING_TOP, PENDING_MS, SPEECH_HOLD_MS } from './wordLaneStudentFill.js' // заливка живого повтора — отдельный модуль

export const REP_GAP_MS = 600           // пауза между повторами: от щелчка последнего куска принятого повтора (win) или от гашения «не успел» (fail) до выката следующего
export const PIECE_PAD_MS = 120         // между пилюлями кусков одного повтора, поверх длины куска
export const MAX_TRIES = 3              // сколько раз повтор выкатят, если ученик не успел
export const CLAIM_FROM_Y = -4          // слово засчитывается повтору, как только пилюля ВИДНА (её центр у верхнего края) — ждать полного открытия не нужно…
export const CLAIM_TO_Y = 96            // …а последняя ещё не ушла в нижнее
export const FAIL_Y = CLAIM_TO_Y        // центр последней пилюли ниже — не успел
export const LEAD_IN_MS = 0             // первая пилюля выезжает из-за верхнего края на глазах (появиться посреди экрана рывком нельзя)
export const LOCK_STAGGER_MS = 140      // куски принятого повтора защёлкиваются по очереди
export const MAX_HOLD_MS = 8000          // Пит не заставит ждать дольше (страховка от зависшей реплики): пилюля выезжает не позже
export const BUDGET_PAD_MS = 1000       // запас на повтор в бюджете ступени…
export const BUDGET_BASE_MS = 3000      // …и общий запас

let debugSink = null
/** Отладка («Скачать отладку», wordLaneDebug): fn(events, g, input) получает события каждого шага, где они были; null — выключено, шаг ничего не тратит и логика не меняется */
export const setStudentDebug = fn => { debugSink = fn }

export const yOfPill = (pill, t) => (pill.y0 ?? ENTER_Y) + (SPEED * (pill.speed ?? 1) * (t - pill.spawnAt)) / 1000 // speed: «Гонка с Питом» — пилюля быстрее конвейера (rep.speed); y0 — другая высота выкатки (вершина: пилюля не выезжает из-за края, а стоит почти на месте и едет очень медленно — времени ступени нет)

/** Сколько мс повтор живёт на экране от выката первой пилюли до ухода последней ниже FAIL_Y (offLast — смещение выката последней пилюли) */
export const repLifeMs = offLast => offLast + ((FAIL_Y - ENTER_Y) / SPEED) * 1000

/** Бюджет времени ступени, мс: число повторов × (жизнь самого долгого повтора + 1 с) + 3 с — столько хватает, чтобы показать каждый повтор один раз с запасом; дальше новые не выкатываются */
export const budgetOf = (count, lifeMs) => count * (lifeMs + BUDGET_PAD_MS) + BUDGET_BASE_MS

/** Повтор на экране: можно ли взять — первая пилюля открылась, последняя ещё не ушла вниз, и ни один не принятый кусок не ушёл под экран на 80 % и больше (LISTEN_Y_MAX: глухой кусок не принять, повтор дожидается «не успел») */
export function isClaimable(rep) {
  if (rep.state !== 'fly') return false
  const first = rep.pills[0]
  const last = rep.pills.at(-1)
  return first.y >= Math.max(CLAIM_FROM_Y, LISTEN_Y_MIN) && last.y <= CLAIM_TO_Y && rep.pills.every(p => p.state !== 'fly' || p.y < LISTEN_Y_MAX) // первая пилюля начинает слушать, когда сверху видно 51 % её высоты (LISTEN_Y_MIN)
}

/** Повтор недоступен: хоть одна его не принятая пилюля ушла за нижний край на DEAF_OFFSCREEN_PCT % и больше (слушать её уже нельзя, она только доезжает до «не успел») */
export const isDeaf = rep => rep.state === 'fly' && rep.pills.some(p => p.state === 'fly' && p.y >= LISTEN_Y_MAX)

/** Живой повтор, которого слушаем: последний из выкатанных (в очереди «Гонки» старый ещё может ехать вниз — недоступный) */
export const liveRep = g => [...g.reps].reverse().find(r => r.state === 'fly') ?? null

/** С какого повтора продолжать после паузы: первый ещё не разрешённый (todo / fly — он сыграется заново с начала); принятый (lock — слово уже засчитано, взлетает) и потерянный — сыграны */
export const resumeIdx = g => g.reps.find(r => r.state === 'todo' || r.state === 'fly')?.idx ?? g.reps.length

/** Доля доезда заливки пилюли после зачёта (0…1) для экрана (wordLaneFillView.step, аргумент fin); пилюля не принята — null: экран догоняет цель как обычно */
export const finOf = p => (p.state === 'lock' || p.state === 'won' ? p.fin ?? 0 : null)

/** Защёлкнутые куски повтора (у каждого свой момент lockAt): заливка доезжает до 100 % за LOCK_MS — и в том же кадре snap (full — щелчок с искрами только у последнего куска повтора) и win; повтор принят, когда won все.
 *  Щелчок НЕ раньше доезда (2026-11-10, владелец: «вспышка и разбухает, хотя полоса не до конца»): раньше snap шёл в кадре принятия, а заливка догоняла ещё 250 мс. Последний щелчок запускает паузу до следующего повтора */
function stepLocks(g, rep, t, events) {
  rep.pills.forEach((p, i) => {
    if (p.state !== 'lock') return
    if (p.y < LISTEN_Y_MIN) { p.lockAt = Math.max(p.lockAt, t); return }   // кусок принят, но пилюля ещё больше чем наполовину над экраном (видно меньше 51 %, выкатится позже): щелчок, нота и взлёт — когда она въедет, а не за кадром
    const u = (t - p.lockAt) / LOCK_MS
    const order = rep.parts.length > 1 ? i : rep.note
    p.fin = Math.min(1, Math.max(0, u))   // экран: от того, что на нём было, до 100 % ровно за LOCK_MS
    if (u > 0) p.p = p.from + (1 - p.from) * easeInOut(u)
    if (u < 1) return
    p.p = 1; p.snapped = true; p.state = 'won'; g.locked += 1
    const full = rep.pills.every(q => q.snapped)
    if (full && !g.overlap) g.nextSpawn = t + REP_GAP_MS      // повтор принят целиком — отсчёт паузы до следующего (в очереди следующий уже выкатился в момент принятия)
    events.push({ type: 'snap', pill: p, rep, order, full }, { type: 'win', pill: p, rep, order, last: full }) // заливка дошла — щелчок и награда одним кадром; last — принят последний кусок повтора: XP одна цифра на повтор
  })
}

/** step — ступень рецепта; chunks — тексты кусков; estMs(chunk) — длина куска, мс (по записи диктора или оценка); budget — лимит времени ступени, мс (по умолчанию budgetOf);
 *  from — «Продолжить» после паузы в гонке: повторы с номером меньше from уже сыграны (состояние 'skip': не выкатываются, ступень без них), номера повторов прежние */
export function createStudentGame({ step, chunks, estMs = c => estChunkMs(chunks[c]), maxTries = MAX_TRIES, leadIn = LEAD_IN_MS, budget = null, overlap = !!step.overlap, from = 0 }) {
  const n = chunks.length
  const { repTarget } = stepTargets(step, chunks)
  const reps = step.reps.map((rp, idx) => {
    const durs = rp.parts.map(c => estMs(c))
    const offs = durs.map((_, k) => durs.slice(0, k).reduce((a, d) => a + d + PIECE_PAD_MS, 0))
    const cnt = rp.parts.map(c => (step.lang === 'ru' ? wordCountRu(chunks[c]) : Math.max(1, tokenize(chunks[c]).length))) // русский перевод: английский tokenize стирал кириллицу (у «добрый день» было 1 слово)
    const cum = cnt.reduce((a, k) => [...a, a.at(-1) + k], [0])      // сколько слов цели приходится на начало каждого куска и на конец всех
    return { idx, parts: rp.parts, target: repTarget[idx], text: textOf(chunks, rp.parts), state: idx < from ? 'skip' : 'todo', tries: 0, pills: [], tk: 0, cnt, cum, durs, offs, lanes: rp.lane != null ? [rp.lane] : rp.parts.map(c => laneOf(n, c, idx)), speed: rp.speed ?? 1, y0: rp.y0 ?? null, cap: rp.cap ?? null, say: rp.say ?? null, trap: !!rp.trap, reveal: rp.reveal ?? null } // lane / speed / cap / reveal — «Гонка с Питом»: своя дорожка, скорость, подпись внутри пилюли и слово, которое проявится при промахе
  })
  const life = Math.max(0, ...reps.map(r => repLifeMs(r.offs.at(-1))))
  return { t: 0, overlap, holdAll: !!step.holdAll, preSay: !!step.preSay, claimGap: step.claimGap ?? 0, preGap: step.preGap ?? 0, gapAt: step.goodAt ?? [], maxTries, leadIn, budget: budget ?? budgetOf(reps.length - from, life), reps, pills: [], nextId: 1, nextSpawn: 0, claimed: 0, locked: 0, failed: [], seenSeq: 0, seenMisses: 0, spentTail: null, finished: false, spawned: 0, waited: 0 }
}

/**
 * Шаг игры в момент t. input: level — громкость голоса (после ворот) 0…1, seq — накопленный по порядку список услышанных целей (номера), misses — накопленный счёт чужих слов, confirmed — речь подтверждена
 * распознаванием, tail — недосказанная цель { target, tokens }, hold — Пит договаривает реплику (репетиция): следующий повтор не выкатывается, пока hold, а время ступени (budget) на ожидание не тратится; pitMs — сколько мс Пит ещё занят
 * (у «Гонки» повтор с уже сказанным переводом выезжает заранее, spawnEarly).
 * Возвращает события шага: spawn / piece-ok / claim / snap / win / fail / miss / late / done. Состояние g меняется на месте.
 */
export function stepStudent(g, t, { level = 0, seq = [], misses = 0, confirmed = true, tail = null, hold = false, pitMs = hold ? Infinity : 0, heardT = -Infinity } = {}) { // heardT — когда (по шкале t) распознаватель последний раз что-то услышал: для «аванса» заливки
  const events = []
  const dt = Math.max(0, t - g.t) / 1000
  g.t = t
  const spoken = tail && tail !== g.spentTail ? tail : null   // хвост, на котором повтор принят или не успели, следующему повтору не достаётся: тот же объект слушатель отдаёт, пока не пришёл новый черновик

  for (const rep of g.reps) {
    if (rep.state === 'todo') continue
    for (const p of rep.pills) p.y = yOfPill(p, t)
    if (rep.state === 'fly') {
      if (isClaimable(rep)) stepFill(rep, dt, { level, confirmed, spoken, t, events, heardT })
      if (rep.pills.at(-1).y > FAIL_Y) {
        rep.state = rep.tries + 1 >= g.maxTries || t >= g.budget ? 'lost' : 'todo'
        rep.tries += 1
        if (tail) g.spentTail = tail
        if (g.preGap) g.nextSpawn = Math.max(g.nextSpawn, t + g.preGap)   // «Гонка»: выдержка перед переводом следующей пилюли и после «не успел» (step.preGap)
        if (!g.overlap) g.nextSpawn = t + REP_GAP_MS      // «не успел» — пауза отсчитывается от гашения (в очереди следующий уже едет)
        g.locked -= rep.pills.filter(p => p.state === 'won').length   // защёлкнутые куски гаснут вместе с повтором и выкатятся заново — в счёт принятых не идут
        rep.pills.forEach(p => { p.state = 'failed' })
        g.failed.push(...rep.pills)                       // серые пилюли доезжают вниз сами
        events.push({ type: 'fail', rep, pills: rep.pills, tries: rep.tries, lost: rep.state === 'lost' })
        rep.pills = []
      }
    }
    if (rep.state === 'fly' || rep.state === 'lock') stepLocks(g, rep, t, events)
    if (rep.state === 'lock' && rep.pills.every(p => p.state === 'won')) rep.state = 'won'
  }
  for (const p of g.failed) p.y = yOfPill(p, t)
  const live = () => [...g.failed.filter(p => !p.gone), ...g.reps.flatMap(r => r.pills)]
  for (const p of live()) if (p.y > EXIT_Y) p.gone = true
  g.pills = live().filter(p => !p.gone)

  // Живой повтор — не больше одного (выкат ждёт разрешения предыдущего); берётся, пока виден
  const cur = liveRep(g)
  const target = cur && isClaimable(cur) ? cur : null

  if (seq.length < g.seenSeq) g.seenSeq = seq.length      // слушатель перезапущен (микрофон переоткрыт, счёт пошёл заново): иначе следующие слова проглатывались бы, пока счёт не догонит старый
  if (misses < g.seenMisses) g.seenMisses = misses
  const newHits = Math.max(0, seq.length - g.seenSeq)
  const fresh = seq.slice(g.seenSeq)
  g.seenSeq = Math.max(g.seenSeq, seq.length)
  for (const heard of fresh.slice(0, newHits)) {
    const rep = target?.state === 'fly' && target.target === heard && !target.trap ? target : null // пилюля-ловушка («Слушай и лови»: чужой перевод) слова не принимает
    if (!rep) {
      if (target?.state === 'fly') { if (target.trap) target.believed = true; events.push({ type: 'miss', rep: target, wrong: true }); target.drain = true } else events.push({ type: 'late' })
      continue
    }
    rep.state = 'lock'; rep.lockAt = t; rep.drain = false; rep.note = g.claimed % 3; g.claimed += 1
    if (tail) g.spentTail = tail                          // хвост принятого повтора следующему не достаётся
    let j = 0
    rep.pills.forEach(p => { if (p.state === 'fly') lockPill(p, t, j++ * LOCK_STAGGER_MS) }) // куски, не защёлкнутые раньше, — по очереди
    if (g.claimGap && g.gapAt.includes(g.claimed)) g.nextSpawn = Math.max(g.nextSpawn, t + g.claimGap)   // «Гонка»: на принятиях, где Пит скажет реплику успеха (step.goodAt — номера принятий), следующая пилюля выезжает не в тот же кадр, а чуть позже: реплика (fx.claim) успевает занять Пита, и выезд ждёт её конца (holdAll); остальные принятия — выезд сразу
    else if (g.preGap) g.nextSpawn = Math.max(g.nextSpawn, t + g.preGap)   // без реплики успеха — выдержка step.preGap перед переводом следующей пилюли; с репликой — только claimGap, перевод идёт сразу после неё
    events.push({ type: 'claim', rep, order: rep.note, ms: Math.round(t - rep.spawnAt), y: rep.pills[0]?.y }) // ms — время ответа: от выезда пилюли до принятия слова; y — где пилюля в этот миг (% высоты экрана): ниже отметки raceExtraRound.LATE_Y — ответ «в последний момент»
  }
  const newMisses = Math.max(0, misses - g.seenMisses)
  g.seenMisses = Math.max(g.seenMisses, misses)
  if (newMisses > 0) {
    const c = target?.state === 'fly' ? target : null
    if (c) c.drain = true
    events.push({ type: 'miss', rep: c })
  }

  // Следующий повтор — только когда нет живого и прошла пауза. Сначала повторы, которые ещё ни разу не выкатывали (меньше попыток), потом повторы неудачных: иначе не успевший один закрывал бы остальные от выката
  const busy = r => (r.state === 'fly' && !(g.overlap && isDeaf(r))) || (r.state === 'lock' && !g.overlap) // очередь: принятый (взлетает) и недоступный повторы выкат не держат
  const spawnReady = !g.finished && t >= g.nextSpawn && !g.reps.some(busy)
  const next = g.reps.filter(r => r.state === 'todo').sort((a, b) => a.tries - b.tries || a.idx - b.idx)[0]
  const early = hold && !!next?.pre && spawnEarly(pitMs, next.speed)   // «Гонка»: перевод уже говорят — пилюля выезжает ЗА время пути до 50 % до конца речи, чтобы Пит договорил ровно к её 50 % (wordLaneConveyorSpeed.spawnEarly)
  const wait = hold && !early && (g.holdAll || !(g.overlap && g.spawned > 0))  // очередь: Пит ждёт только первую пилюлю, следующие выезжают сразу; у «Разгона» (step.holdAll) ждут все — пока Пит не договорит реплику успеха
  g.waited = spawnReady && wait ? g.waited + dt * 1000 : 0
  if (spawnReady && wait && g.waited <= MAX_HOLD_MS) g.budget += dt * 1000   // Пит говорит: пилюля выедет через паузу после его реплики (busyLeft включает её), а ожидание ступень не съедает; дольше MAX_HOLD_MS не ждём — пилюля выедет в любом случае
  else if (spawnReady) {
    if (t >= g.budget) g.reps.forEach(r => { if (r.state === 'todo') r.state = 'lost' })   // время ступени вышло: недоигранное потеряно
    const rep = next?.state === 'todo' ? next : null   // время вышло — следующего уже нет
    if (rep && g.preSay && !rep.pre && !hold) { rep.pre = true; events.push({ type: 'pre', rep }) } // «Гонка» (step.preSay): перед выездом Пит говорит перевод (fx.pre → озвучка, Пит занят): пилюля выедет на следующем кадре, а если он заговорил — когда договорит (hold). Реплика успеха уже договорена: hold её держит; нет озвучки — пилюля выезжает сразу
    else if (rep) {
      const base = g.spawned === 0 ? t - g.leadIn : t
      rep.spawnAt = base
      rep.pills = rep.parts.map((chunk, i) => ({ id: g.nextId++, rep: rep.idx, chunk, lane: rep.lanes[i], piece: i, spawnAt: base + rep.offs[i], ms: rep.durs[i], speed: rep.speed, y0: rep.y0 ?? undefined, y: rep.y0 ?? ENTER_Y, p: 0, state: 'fly', gone: false, snapped: false }))
      rep.pills.forEach(p => { p.y = yOfPill(p, t) })
      rep.state = 'fly'; rep.tk = 0; rep.drain = false; rep.openAt = null
      g.spawned += 1
      g.pills = live().filter(p => !p.gone)
      events.push({ type: 'spawn', rep, pills: rep.pills })
    }
  }

  if (!g.finished && g.reps.every(r => r.state === 'won' || r.state === 'lost' || r.state === 'skip')) {
    g.finished = true
    events.push({ type: 'done', locked: g.locked })
  }
  if (debugSink && events.length) debugSink(events, g, { t, level, seq, misses, confirmed, tail })
  return events
}

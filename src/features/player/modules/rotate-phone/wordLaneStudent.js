// Фаза ученика одной ступени: тот же конвейер, что у диктора, но повторы выкатывает сама игра, а ученик должен успеть сказать их, пока пилюли на экране. Чистая логика без DOM и
// таймеров — её шагает движок пилюль (useWordLanePills) и проверяют тесты; всё время приходит аргументом t (мс от старта ступени).
//  • Повтор (rep) — одно высказывание ступени: у него одна или несколько пилюль (по пилюле на кусок, каждая в дорожке куска). Пилюли едут вниз с постоянной скоростью SPEED; куски одного
//    повтора выкатываются друг за другом, как слова во фразе.
//  • ОДИН ЖИВОЙ ПОВТОР ЗА РАЗ. Следующий повтор выкатывается, только когда предыдущий разрешился: принят (win — после щелчка последнего куска) или «не успел» (fail — последняя пилюля ушла ниже
//    FAIL_Y, пилюли погасли), и прошла пауза REP_GAP_MS. Раньше повторы шли по таймеру (раз в 2 с), на экране было 2–3 повтора, и человек не понимал, какой «его»: распознанная цель доставалась
//    самому старому, а хвост partial мог защёлкнуть кусок следующего. Теперь распознавание (seq, misses) и хвост partial относятся только к текущему повтору.
//  • Повтор можно «взять», пока он на экране (первая пилюля уже видна, последняя ещё не ушла вниз): когда распознавание услышало его текст (цель), его незащёлкнутые пилюли быстро
//    заливаются до 100 % (LOCK_MS, куски по очереди), щёлкают (snap) и дают XP (win). Цель, сказанная между повторами, — late (никому не достаётся).
//  • Три состояния куска. «В процессе»: пока слово не распознано, пилюля ТЕКУЩЕГО куска показывает только голос — «дыхание» (breathStep: мягкая атака, ещё более мягкий спад, не выше FILL_CAP);
//    до подтверждения речи распознаванием (confirmed: распознаватель недавно что-то услышал) голос наливает лишь до PRE_CONFIRM_CAP — partial на телефоне приходит с лагом 0,2–0,5 с, а пилюля не должна молчать, пока человек говорит; шум и эхо отсекают ворота голоса, а без слов дальше этого потолка не растут. Следующий кусок не наливается до своего
//    первого слова (tail.tokens) и пока предыдущий не защёлкнулся до конца: две пилюли одного повтора от одного голоса не наливаются. «Верно по кускам» — кусок, чьи слова произнесены целиком
//    (tk ≥ cum[i + 1]), защёлкивается СРАЗУ, не дожидаясь конца повтора: событие piece-ok → data-lock, затем snap / win (нота) на этот кусок. Последний кусок защёлкивается принятием повтора
//    (claim). «Неверно» — miss: слив только ещё не защёлкнутых кусков (защёлкнутые остаются зелёными), красная вспышка — на первом из них.
//  • Не успел (fail) — гаснет весь повтор, в том числе защёлкнутые куски (повтор выкатят заново целиком, его win-ы в счёт locked не идут). Недосказанная часть отдельно не переигрывается: распознавание
//    понимает только цель целиком («i am trying»), а не «trying» после «i am». Хвост, на котором повтор принят или не успели, следующему не достаётся (spentTail) — только новый черновик.
//  • Время ступени ограничено (budget): последовательный показ растягивает ступень, если ученик не успевает, поэтому после budget новые повторы не выкатываются, а недоигранные считаются потерянными.
//  • Ступень закончена (done), когда каждый повтор принят или потерян и ничего не летит.
import { ENTER_Y, EXIT_Y, SPEED, LOCK_MS, FILL_CAP, PRE_CONFIRM_CAP, breathStep, fillTo, drainStep, easeInOut } from './wordLaneTimeline.js'
import { tokenize } from '../../../../shared/lib/speech/speechMatch.js'
import { laneOf, stepTargets, textOf } from './wordLaneRecipe.js'
import { estChunkMs } from './wordLaneAudio.js'

export const REP_GAP_MS = 600           // пауза между повторами: от щелчка последнего куска принятого повтора (win) или от гашения «не успел» (fail) до выката следующего
export const PIECE_PAD_MS = 120         // между пилюлями кусков одного повтора, поверх длины куска
export const MAX_TRIES = 3              // сколько раз повтор выкатят, если ученик не успел
export const CLAIM_FROM_Y = -4          // слово засчитывается повтору, как только пилюля ВИДНА (её центр у верхнего края) — ждать полного открытия не нужно…
export const CLAIM_TO_Y = 96            // …а последняя ещё не ушла в нижнее
export const FAIL_Y = CLAIM_TO_Y        // центр последней пилюли ниже — не успел
export const LEAD_IN_MS = 0             // первая пилюля выезжает из-за верхнего края на глазах (появиться посреди экрана рывком нельзя)
export const LOCK_STAGGER_MS = 140      // куски принятого повтора защёлкиваются по очереди
export const BUDGET_PAD_MS = 1000       // запас на повтор в бюджете ступени…
export const BUDGET_BASE_MS = 3000      // …и общий запас

let debugSink = null
/** Отладка («Скачать отладку», wordLaneDebug): fn(events, g, input) получает события каждого шага, где они были; null — выключено, шаг ничего не тратит и логика не меняется */
export const setStudentDebug = fn => { debugSink = fn }

export const yOfPill = (pill, t) => ENTER_Y + (SPEED * (t - pill.spawnAt)) / 1000

/** Сколько мс повтор живёт на экране от выката первой пилюли до ухода последней ниже FAIL_Y (offLast — смещение выката последней пилюли) */
export const repLifeMs = offLast => offLast + ((FAIL_Y - ENTER_Y) / SPEED) * 1000

/** Бюджет времени ступени, мс: число повторов × (жизнь самого долгого повтора + 1 с) + 3 с — столько хватает, чтобы показать каждый повтор один раз с запасом; дальше новые не выкатываются */
export const budgetOf = (count, lifeMs) => count * (lifeMs + BUDGET_PAD_MS) + BUDGET_BASE_MS

/** Повтор на экране: можно ли взять — первая пилюля открылась, последняя ещё не ушла вниз */
export function isClaimable(rep) {
  if (rep.state !== 'fly') return false
  const first = rep.pills[0]
  const last = rep.pills.at(-1)
  return first.y >= CLAIM_FROM_Y && last.y <= CLAIM_TO_Y
}

/** Защёлкнуть пилюлю: заливка идёт к 100 % с момента at (мс), щелчок и нота — когда она дойдёт */
const lockPill = (p, at, delay = 0) => { p.state = 'lock'; p.from = p.p; p.lockAt = at + delay; p.snapped = false }

/** Защёлкнутые куски повтора (у каждого свой момент lockAt): заливка → snap (full — щелчок с искрами только у последнего куска повтора) → win; повтор принят, когда won все. Последний щелчок запускает паузу до следующего повтора */
function stepLocks(g, rep, t, events) {
  rep.pills.forEach((p, i) => {
    if (p.state !== 'lock') return
    const u = (t - p.lockAt) / LOCK_MS
    const order = rep.parts.length > 1 ? i : rep.note
    if (u >= 0 && !p.snapped) {
      p.snapped = true
      const full = rep.pills.every(q => q.snapped)
      if (full) g.nextSpawn = t + REP_GAP_MS      // повтор принят целиком — отсчёт паузы до следующего
      events.push({ type: 'snap', pill: p, rep, order, full })
    }
    if (u > 0) p.p = p.from + (1 - p.from) * easeInOut(u)
    if (u >= 1) { p.p = 1; p.state = 'won'; g.locked += 1; events.push({ type: 'win', pill: p, rep, order, last: rep.pills.every(q => q.state === 'won') }) } // last — принят последний кусок повтора: XP одна цифра на повтор
  })
}

/** step — ступень рецепта; chunks — тексты кусков; estMs(chunk) — длина куска, мс (по записи диктора или оценка); budget — лимит времени ступени, мс (по умолчанию budgetOf) */
export function createStudentGame({ step, chunks, estMs = c => estChunkMs(chunks[c]), maxTries = MAX_TRIES, leadIn = LEAD_IN_MS, budget = null }) {
  const n = chunks.length
  const { repTarget } = stepTargets(step, chunks)
  const reps = step.reps.map((rp, idx) => {
    const durs = rp.parts.map(c => estMs(c))
    const offs = durs.map((_, k) => durs.slice(0, k).reduce((a, d) => a + d + PIECE_PAD_MS, 0))
    const cnt = rp.parts.map(c => Math.max(1, tokenize(chunks[c]).length))
    const cum = cnt.reduce((a, k) => [...a, a.at(-1) + k], [0])      // сколько слов цели приходится на начало каждого куска и на конец всех
    return { idx, parts: rp.parts, target: repTarget[idx], text: textOf(chunks, rp.parts), state: 'todo', tries: 0, pills: [], tk: 0, cnt, cum, durs, offs, lanes: rp.parts.map(c => laneOf(n, c, idx)) }
  })
  const life = Math.max(0, ...reps.map(r => repLifeMs(r.offs.at(-1))))
  return { t: 0, maxTries, leadIn, budget: budget ?? budgetOf(reps.length, life), reps, pills: [], nextId: 1, nextSpawn: 0, claimed: 0, locked: 0, failed: [], seenSeq: 0, seenMisses: 0, spentTail: null, finished: false, spawned: 0 }
}

/**
 * Шаг игры в момент t. input: level — громкость голоса (после ворот) 0…1, seq — накопленный по порядку список услышанных целей (номера), misses — накопленный счёт чужих слов, confirmed — речь подтверждена
 * распознаванием, tail — недосказанная цель { target, tokens }.
 * Возвращает события шага: spawn / piece-ok / claim / snap / win / fail / miss / late / done. Состояние g меняется на месте.
 */
export function stepStudent(g, t, { level = 0, seq = [], misses = 0, confirmed = true, tail = null } = {}) {
  const events = []
  const dt = Math.max(0, t - g.t) / 1000
  g.t = t
  const spoken = tail && tail !== g.spentTail ? tail : null   // хвост, на котором повтор принят или не успели, следующему повтору не достаётся: тот же объект слушатель отдаёт, пока не пришёл новый черновик

  for (const rep of g.reps) {
    if (rep.state === 'todo') continue
    for (const p of rep.pills) p.y = yOfPill(p, t)
    if (rep.state === 'fly') {
      if (isClaimable(rep)) stepFill(rep, dt, { level, confirmed, spoken, t, events })
      if (rep.pills.at(-1).y > FAIL_Y) {
        rep.state = rep.tries + 1 >= g.maxTries || t >= g.budget ? 'lost' : 'todo'
        rep.tries += 1
        if (tail) g.spentTail = tail
        g.nextSpawn = t + REP_GAP_MS                      // «не успел» — пауза отсчитывается от гашения
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
  const cur = g.reps.find(r => r.state === 'fly')
  const target = cur && isClaimable(cur) ? cur : null

  if (seq.length < g.seenSeq) g.seenSeq = seq.length      // слушатель перезапущен (микрофон переоткрыт, счёт пошёл заново): иначе следующие слова проглатывались бы, пока счёт не догонит старый
  if (misses < g.seenMisses) g.seenMisses = misses
  const newHits = Math.max(0, seq.length - g.seenSeq)
  const fresh = seq.slice(g.seenSeq)
  g.seenSeq = Math.max(g.seenSeq, seq.length)
  for (const heard of fresh.slice(0, newHits)) {
    const rep = target?.state === 'fly' && target.target === heard ? target : null
    if (!rep) {
      if (target?.state === 'fly') { events.push({ type: 'miss', rep: target, wrong: true }); target.drain = true } else events.push({ type: 'late' })
      continue
    }
    rep.state = 'lock'; rep.lockAt = t; rep.drain = false; rep.note = g.claimed % 3; g.claimed += 1
    if (tail) g.spentTail = tail                          // хвост принятого повтора следующему не достаётся
    let j = 0
    rep.pills.forEach(p => { if (p.state === 'fly') lockPill(p, t, j++ * LOCK_STAGGER_MS) }) // куски, не защёлкнутые раньше, — по очереди
    events.push({ type: 'claim', rep, order: rep.note })
  }
  const newMisses = Math.max(0, misses - g.seenMisses)
  g.seenMisses = Math.max(g.seenMisses, misses)
  if (newMisses > 0) {
    const c = target?.state === 'fly' ? target : null
    if (c) c.drain = true
    events.push({ type: 'miss', rep: c })
  }

  // Следующий повтор — только когда нет живого и прошла пауза. Сначала повторы, которые ещё ни разу не выкатывали (меньше попыток), потом повторы неудачных: иначе не успевший один закрывал бы остальные от выката
  if (!g.finished && t >= g.nextSpawn && !g.reps.some(r => r.state === 'fly' || r.state === 'lock')) {
    if (t >= g.budget) g.reps.forEach(r => { if (r.state === 'todo') r.state = 'lost' })   // время ступени вышло: недоигранное потеряно
    const rep = g.reps.filter(r => r.state === 'todo').sort((a, b) => a.tries - b.tries || a.idx - b.idx)[0]
    if (rep) {
      const base = g.spawned === 0 ? t - g.leadIn : t
      rep.spawnAt = base
      rep.pills = rep.parts.map((chunk, i) => ({ id: g.nextId++, rep: rep.idx, chunk, lane: rep.lanes[i], piece: i, spawnAt: base + rep.offs[i], ms: rep.durs[i], y: ENTER_Y, p: 0, state: 'fly', gone: false, snapped: false }))
      rep.pills.forEach(p => { p.y = yOfPill(p, t) })
      rep.state = 'fly'; rep.tk = 0; rep.drain = false
      g.spawned += 1
      g.pills = live().filter(p => !p.gone)
      events.push({ type: 'spawn', rep, pills: rep.pills })
    }
  }

  if (!g.finished && g.reps.every(r => r.state === 'won' || r.state === 'lost')) {
    g.finished = true
    events.push({ type: 'done', locked: g.locked })
  }
  if (debugSink && events.length) debugSink(events, g, { t, level, seq, misses, confirmed, tail })
  return events
}

/**
 * Заливка и куски ЖИВОГО повтора за один кадр (его пилюли видны). Модель: слово куска ещё не распознано — пилюля показывает только голос (breathStep), распознанный кусок зеленеет (piece-ok),
 * следующий до своего первого слова не наливается. Слив (drain) после чужого слова — у ещё не защёлкнутых кусков.
 */
function stepFill(rep, dt, { level, confirmed, spoken, t, events }) {
  const open = rep.pills.filter(p => p.state === 'fly')
  if (rep.drain) {
    open.forEach(p => { p.p = drainStep(p.p, dt) })
    if (open.every(p => p.p <= 0.01)) { rep.drain = false; rep.tk = rep.cum[rep.pills.length - open.length]; open.forEach(p => { p.p = 0 }) } // слова защёлкнутых кусков остаются произнесёнными
    return
  }
  const tok = confirmed && spoken && spoken.target === rep.target ? spoken.tokens : 0   // устаревший хвост (речи давно нет) куски не защёлкивает
  rep.tk = Math.max(rep.tk, tok)                                                  // слова произнесены — не откатываются, пока повтор жив
  const active = rep.cum.findIndex((c, i) => i < rep.parts.length && rep.tk < rep.cum[i + 1])  // первый кусок, чьи слова ещё не все произнесены
  const settled = active <= 0 || rep.pills.slice(0, active).every(p => p.state === 'won')       // предыдущие куски зелёные до конца: две пилюли повтора голосом не наливаются
  const voice = settled && (active === 0 || rep.tk > rep.cum[active]) ? level : 0   // голос наливает текущий кусок; следующий — когда его первое слово услышано
  const cap = confirmed ? FILL_CAP : PRE_CONFIRM_CAP                                // речь подтверждена распознаванием — до FILL_CAP; ещё нет (шум, эхо, лаг partial) — лишь слегка
  rep.pills.forEach((p, i) => {
    if (p.state !== 'fly') return
    const done = rep.tk >= rep.cum[i + 1]
    if (done && i < rep.parts.length - 1) { lockPill(p, t); events.push({ type: 'piece-ok', rep, pill: p, piece: i }); return } // слова куска произнесены — зелёный сразу, не ждём конца повтора
    p.p = done ? fillTo(p.p, dt, FILL_CAP) : i === active ? breathStep(p.p, dt, voice, cap) : fillTo(p.p, dt, 0)  // последний кусок договорён (ждём принятия повтора) — держится на FILL_CAP; остальные ждут
  })
}

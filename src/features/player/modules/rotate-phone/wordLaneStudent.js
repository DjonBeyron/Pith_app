// Фаза ученика одной ступени: тот же конвейер, что у диктора, но повторы выкатывает сама игра по расписанию, а ученик должен успеть сказать их, пока пилюли на экране. Чистая логика без DOM и
// таймеров — её шагает движок пилюль (useWordLanePills) и проверяют тесты; всё время приходит аргументом t (мс от старта ступени).
//  • Повтор (rep) — одно высказывание ступени: у него одна или несколько пилюль (по пилюле на кусок, каждая в дорожке куска). Пилюли едут вниз с постоянной скоростью SPEED; куски одного
//    повтора выкатываются друг за другом, как слова во фразе.
//  • Повтор можно «взять», пока он на экране (первая пилюля уже открылась, последняя ещё не ушла вниз): когда распознавание услышало его текст (цель), ему достаётся САМЫЙ СТАРЫЙ
//    такой повтор — его пилюли быстро заливаются до 100 % (LOCK_MS, куски по очереди), щёлкают (snap) и дают XP (win).
//  • Заливка идёт СТРОГО ПО ОЧЕРЕДИ кусков и только пока речь подтверждена распознаванием (confirmed: распознаватель недавно что-то услышал — шум и эхо без слов не наливают): кусок заливается, когда его слова
//    произнесены (tail.tokens — сколько слов недосказанной цели уже распознано), а пока говорится текущий кусок — ещё и голосом (voiceFillStep, не выше FILL_CAP). Чужое слово — заливка сливается.
//  • Последняя пилюля повтора ушла вниз (центр ниже FAIL_Y) без слова — «не успел» (fail): пилюли гаснут, повтор выкатят снова (не больше MAX_TRIES раз, дальше он потерян).
//  • Ступень закончена (done), когда каждый повтор принят или потерян и ничего не летит.
import { ENTER_Y, EXIT_Y, SPEED, LOCK_MS, FILL_CAP, voiceFillStep, drainStep, easeInOut } from './wordLaneTimeline.js'
import { tokenize } from '../../../../shared/lib/speech/speechMatch.js'
import { laneOf, stepTargets, textOf } from './wordLaneRecipe.js'
import { estChunkMs } from './wordLaneAudio.js'

export const STUDENT_PERIOD_MS = 2000   // новый повтор выкатывается не чаще, чем раз в столько
export const REP_PAD_MS = 900           // пауза после последней пилюли повтора до следующего
export const PIECE_PAD_MS = 120         // между пилюлями кусков одного повтора, поверх длины куска
export const MAX_TRIES = 3              // сколько раз повтор выкатят, если ученик не успел
export const CLAIM_FROM_Y = -4          // слово засчитывается повтору, как только пилюля ВИДНА (её центр у верхнего края) — ждать полного открытия не нужно…
export const CLAIM_TO_Y = 96            // …а последняя ещё не ушла в нижнее
export const FAIL_Y = CLAIM_TO_Y        // центр последней пилюли ниже — не успел
export const LEAD_IN_MS = 0             // первая пилюля выезжает из-за верхнего края на глазах (появиться посреди экрана рывком нельзя)
export const LOCK_STAGGER_MS = 140      // куски принятого повтора защёлкиваются по очереди

export const yOfPill = (pill, t) => ENTER_Y + (SPEED * (t - pill.spawnAt)) / 1000

/** Повтор на экране: можно ли взять — первая пилюля открылась, последняя ещё не ушла вниз */
export function isClaimable(rep) {
  if (rep.state !== 'fly') return false
  const first = rep.pills[0]
  const last = rep.pills.at(-1)
  return first.y >= CLAIM_FROM_Y && last.y <= CLAIM_TO_Y
}

/** step — ступень рецепта; chunks — тексты кусков; estMs(chunk) — длина куска, мс (по записи диктора или оценка) */
export function createStudentGame({ step, chunks, estMs = c => estChunkMs(chunks[c]), period = STUDENT_PERIOD_MS, maxTries = MAX_TRIES, leadIn = LEAD_IN_MS }) {
  const n = chunks.length
  const { repTarget } = stepTargets(step, chunks)
  const reps = step.reps.map((rp, idx) => {
    const durs = rp.parts.map(c => estMs(c))
    const offs = durs.map((_, k) => durs.slice(0, k).reduce((a, d) => a + d + PIECE_PAD_MS, 0))
    const cnt = rp.parts.map(c => Math.max(1, tokenize(chunks[c]).length))
    const cum = cnt.reduce((a, k) => [...a, a.at(-1) + k], [0])      // сколько слов цели приходится на начало каждого куска и на конец всех
    return { idx, parts: rp.parts, target: repTarget[idx], text: textOf(chunks, rp.parts), state: 'todo', tries: 0, pills: [], pv: rp.parts.map(() => 0), tk: 0, cnt, cum, durs, offs, gap: Math.max(period, offs.at(-1) + durs.at(-1) + REP_PAD_MS), lanes: rp.parts.map(c => laneOf(n, c, idx)) }
  })
  return { t: 0, period, maxTries, leadIn, reps, pills: [], nextId: 1, nextSpawn: 0, claimed: 0, locked: 0, failed: [], seenSeq: 0, seenMisses: 0, finished: false, spawned: 0 }
}

/**
 * Шаг игры в момент t. input: level — громкость голоса (после ворот) 0…1, seq — накопленный по порядку список услышанных целей (номера), misses — накопленный счёт чужих слов, confirmed — речь подтверждена
 * распознаванием, tail — недосказанная цель { target, tokens }.
 * Возвращает события шага: spawn / claim / snap / win / fail / miss / late / done. Состояние g меняется на месте.
 */
export function stepStudent(g, t, { level = 0, seq = [], misses = 0, confirmed = true, tail = null } = {}) {
  const events = []
  const dt = Math.max(0, t - g.t) / 1000
  g.t = t

  for (const rep of g.reps) {
    if (rep.state === 'todo') continue
    for (const p of rep.pills) p.y = yOfPill(p, t)
    if (rep.state === 'fly') {
      const visible = rep.pills[0].y >= CLAIM_FROM_Y && rep.pills.at(-1).y <= CLAIM_TO_Y
      if (visible && rep.cur) {
        // слив и наливание — только у самого старого повтора на экране (отмечен в rep.cur ниже)
        if (rep.drain) {
          rep.pills.forEach(p => { p.p = drainStep(p.p, dt) })
          if (rep.pills.every(p => p.p <= 0.01)) { rep.drain = false; rep.tk = 0; rep.pv.fill(0); rep.pills.forEach(p => { p.p = 0 }) }
        } else {
          const tok = tail && tail.target === rep.target ? tail.tokens : 0
          rep.tk = Math.max(rep.tk, tok)                                                 // слова произнесены — не откатываются, пока повтор жив
          const active = rep.cum.findIndex((c, i) => i < rep.parts.length && rep.tk < rep.cum[i + 1])  // первый кусок, чьи слова ещё не все произнесены
          if (confirmed && active >= 0) rep.pv[active] = voiceFillStep(rep.pv[active], dt, level, rep.durs[active]) // голос наливает текущий кусок (не выше FILL_CAP)
          rep.pills.forEach((p, i) => {
            const done = rep.tk >= rep.cum[i + 1]
            const part = FILL_CAP * Math.min(1, Math.max(0, (rep.tk - rep.cum[i]) / rep.cnt[i]))
            p.p = done ? FILL_CAP : i === active ? Math.max(part, rep.pv[i]) : 0         // строго по очереди: следующий кусок ждёт, пока договорён предыдущий
          })
        }
      }
      if (rep.pills.at(-1).y > FAIL_Y) {
        rep.state = rep.tries + 1 >= g.maxTries ? 'lost' : 'todo'
        rep.tries += 1
        rep.pills.forEach(p => { p.state = 'failed' })
        g.failed.push(...rep.pills)                       // серые пилюли доезжают вниз сами
        events.push({ type: 'fail', rep, pills: rep.pills, tries: rep.tries, lost: rep.state === 'lost' })
        rep.pills = []
      }
    } else if (rep.state === 'lock') {
      rep.pills.forEach((p, i) => {
        const u = (t - rep.lockAt - i * LOCK_STAGGER_MS) / LOCK_MS
        if (u >= 0 && !p.snapped) { p.snapped = true; events.push({ type: 'snap', pill: p, rep, order: rep.parts.length > 1 ? i : rep.note }) }
        if (u > 0) p.p = p.from + (1 - p.from) * easeInOut(u)
        if (u >= 1 && p.state !== 'won') { p.p = 1; p.state = 'won'; g.locked += 1; events.push({ type: 'win', pill: p, rep, order: rep.parts.length > 1 ? i : rep.note, last: rep.pills.every(q => q.state === 'won') }) } // last — принят последний кусок повтора: XP одна цифра на повтор
      })
      if (rep.pills.every(p => p.state === 'won')) rep.state = 'won'
    }
  }
  for (const p of g.failed) p.y = yOfPill(p, t)
  const live = () => [...g.failed.filter(p => !p.gone), ...g.reps.flatMap(r => r.pills)]
  for (const p of live()) if (p.y > EXIT_Y) p.gone = true
  g.pills = live().filter(p => !p.gone)

  // Кто сейчас «берётся», по возрасту: считаем ОДИН раз за шаг (раньше фильтр и сортировка шли заново на каждый вызов — до четырёх раз за кадр); список сбрасывается, только когда повтор принят (меняется его state)
  let claimList = null
  const claimable = () => (claimList ??= g.reps.filter(isClaimable).sort((a, b) => a.spawnAt - b.spawnAt))
  const oldest = claimable()[0]
  g.reps.forEach(r => { r.cur = r === oldest })

  const newHits = Math.max(0, seq.length - g.seenSeq)
  const fresh = seq.slice(g.seenSeq)
  g.seenSeq = Math.max(g.seenSeq, seq.length)
  for (const target of fresh.slice(0, newHits)) {
    const rep = claimable().find(r => r.target === target)
    if (!rep) { const first = claimable()[0]; events.push(first ? { type: 'miss', rep: first, wrong: true } : { type: 'late' }); if (first) first.drain = true; continue }
    rep.state = 'lock'; rep.lockAt = t; rep.drain = false; rep.note = g.claimed % 3; g.claimed += 1
    claimList = null // принятый повтор больше не «берётся»
    rep.pills.forEach(p => { p.state = 'lock'; p.from = p.p; p.snapped = false })
    events.push({ type: 'claim', rep, order: rep.note })
  }
  const newMisses = Math.max(0, misses - g.seenMisses)
  g.seenMisses = Math.max(g.seenMisses, misses)
  if (newMisses > 0) {
    const c = claimable()[0]
    if (c) c.drain = true
    events.push({ type: 'miss', rep: c ?? null })
  }

  if (!g.finished && t >= g.nextSpawn) {
    // Сначала повторы, которые ещё ни разу не выкатывали (меньше попыток), потом повторы неудачных: иначе не успевший один закрывал бы остальные от выката
    const rep = g.reps.filter(r => r.state === 'todo').sort((a, b) => a.tries - b.tries || a.idx - b.idx)[0]
    if (rep) {
      const base = g.spawned === 0 ? t - g.leadIn : t
      rep.spawnAt = base
      rep.pills = rep.parts.map((chunk, i) => ({ id: g.nextId++, rep: rep.idx, chunk, lane: rep.lanes[i], piece: i, spawnAt: base + rep.offs[i], ms: rep.durs[i], y: ENTER_Y, p: 0, state: 'fly', gone: false, snapped: false }))
      rep.pills.forEach(p => { p.y = yOfPill(p, t) })
      rep.state = 'fly'; rep.pv.fill(0); rep.tk = 0; rep.drain = false; rep.cur = false
      g.spawned += 1
      g.pills = live().filter(p => !p.gone)
      g.nextSpawn = t + rep.gap
      events.push({ type: 'spawn', rep, pills: rep.pills })
    }
  }

  if (!g.finished && g.reps.every(r => r.state === 'won' || r.state === 'lost')) {
    g.finished = true
    events.push({ type: 'done', locked: g.locked })
  }
  return events
}

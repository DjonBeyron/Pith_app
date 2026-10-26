// Фаза ученика: тот же конвейер, что у диктора, но пилюли выкатывает сама игра по расписанию (каждые STUDENT_PERIOD_MS), а слово должен успеть сказать ученик. Чистая логика без DOM и
// таймеров — её шагает движок пилюль (useWordLanePills) и проверяют тесты; всё время приходит аргументом t (мс от старта фазы).
//  • Пилюля едет вниз с постоянной скоростью SPEED. Пока она на экране (центр в пределах [CLAIM_FROM_Y, CLAIM_TO_Y]), её можно «взять»: слово, принятое распознаванием, достаётся САМОЙ СТАРОЙ
//    такой пилюле — она плавно заливается до 100 % (LOCK_MS), щёлкает (win) и катится дальше.
//  • Пока ученик говорит, пилюля наливается его голосом (voiceFillStep, не выше FILL_CAP): видно, что тебя слышат; чужое слово сливает заливку (miss).
//  • Пилюля ушла вниз (центр ниже FAIL_Y) без принятого слова — «не успел» (fail): она гаснет, а пилюлю этой дорожки выкатят снова (не больше MAX_TRIES раз, дальше дорожка считается потерянной).
//  • Игра закончена (done), когда у каждой дорожки пилюля принята или потеряна и ничего не летит.
import { SLOT_COUNT, ENTER_Y, EXIT_Y, SPEED, LOCK_MS, VOICE_THRESHOLD, voiceFillStep, drainStep, easeInOut } from './wordLaneTimeline.js'

export const STUDENT_PERIOD_MS = 2000   // новая пилюля выкатывается каждые 2 с (пока есть дорожки без принятой пилюли)
export const MAX_TRIES = 3              // сколько раз пилюлю дорожки выкатят, если ученик не успел
export const CLAIM_FROM_Y = 8           // слово засчитывается пилюле, пока её центр в этих пределах (она на экране)
export const CLAIM_TO_Y = 96
export const FAIL_Y = CLAIM_TO_Y        // центр ниже — не успел
export const LEAD_IN_MS = 0             // сколько пути первая пилюля уже пролетела к старту фазы: 0 — она выезжает из-за верхнего края на глазах (появиться посреди экрана рывком нельзя)

export const yOfPill = (pill, t) => ENTER_Y + (SPEED * (t - pill.spawnAt)) / 1000
export const isClaimable = pill => pill.state === 'fly' && pill.y >= CLAIM_FROM_Y && pill.y <= CLAIM_TO_Y

export function createStudentGame({ fillMs = [1000, 1000, 1000], period = STUDENT_PERIOD_MS, maxTries = MAX_TRIES, leadIn = LEAD_IN_MS } = {}) {
  return {
    t: 0, period, maxTries, leadIn, fillMs,
    nextSpawn: 0, nextId: 1, pills: [], locked: 0, finished: false,
    slot: Array(SLOT_COUNT).fill('todo'),  // todo — ждёт выката | fly — пилюля в пути | won — принята | lost — исчерпала попытки
    tries: Array(SLOT_COUNT).fill(0),
    seenHits: 0, seenMisses: 0,
  }
}

/**
 * Шаг игры в момент t. input: level — громкость голоса 0…1, hits / misses — накопленные счётчики распознавания.
 * Возвращает события этого шага: spawn / claim / win / fail / miss / late (слово принято, а пилюли нет) / done. Состояние g меняется на месте.
 */
export function stepStudent(g, t, { level = 0, hits = 0, misses = 0 } = {}) {
  const events = []
  const dt = Math.max(0, t - g.t) / 1000
  g.t = t

  for (const p of g.pills) {
    p.y = yOfPill(p, t)
    if (p.state === 'fly') {
      if (p.y >= CLAIM_FROM_Y && p.y <= CLAIM_TO_Y) {
        if (p.drain) { p.p = drainStep(p.p, dt); p.onset = null; if (p.p <= 0.01) { p.p = 0; p.drain = false } }
        else {
          p.p = voiceFillStep(p.p, dt, level, p.ms)
          if (p.onset == null && level > VOICE_THRESHOLD) p.onset = t // первый звук ученика на этой пилюле: метка темпа стартует
        }
      }
      if (p.y > FAIL_Y) {
        p.state = 'failed'
        g.tries[p.slot] += 1
        g.slot[p.slot] = g.tries[p.slot] >= g.maxTries ? 'lost' : 'todo'
        events.push({ type: 'fail', pill: p })
      }
    } else if (p.state === 'lock') {
      const u = (t - p.lockAt) / LOCK_MS
      p.p = p.from + (1 - p.from) * easeInOut(u)
      if (u >= 1) { p.p = 1; p.state = 'won'; g.locked += 1; events.push({ type: 'win', pill: p, order: g.locked - 1 }) }
    } else if (p.state === 'failed') {
      p.p = drainStep(p.p, dt * 0.6)
    }
    if (p.y > EXIT_Y) p.gone = true
  }

  const oldestClaimable = () => g.pills.filter(isClaimable).sort((a, b) => a.spawnAt - b.spawnAt)[0] ?? null
  const newHits = Math.max(0, hits - g.seenHits)
  g.seenHits = Math.max(g.seenHits, hits)
  for (let i = 0; i < newHits; i++) {
    const p = oldestClaimable()
    if (!p) { events.push({ type: 'late' }); continue }
    p.state = 'lock'; p.lockAt = t; p.from = p.p; p.drain = false
    g.slot[p.slot] = 'won'
    events.push({ type: 'claim', pill: p })
  }
  const newMisses = Math.max(0, misses - g.seenMisses)
  g.seenMisses = Math.max(g.seenMisses, misses)
  if (newMisses > 0) {
    const p = oldestClaimable()
    if (p) { p.drain = true; p.onset = null }
    events.push({ type: 'miss', pill: p })
  }

  if (!g.finished && t >= g.nextSpawn) {
    const busy = new Set(g.pills.filter(p => !p.gone).map(p => p.slot)) // в дорожке ещё катится прежняя пилюля — новую туда не выкатываем (налезла бы)
    // Сначала дорожки, которые ещё ни разу не выкатывали (меньше попыток), потом повторы: иначе не успевший одну дорожку закрывал бы остальные от выката
    const slot = g.slot.map((s, i) => i).filter(i => g.slot[i] === 'todo' && !busy.has(i)).sort((a, b) => g.tries[a] - g.tries[b] || a - b)[0] ?? -1
    if (slot >= 0) {
      const spawnAt = g.nextId === 1 ? t - g.leadIn : t // самая первая пилюля уже в пути
      const p = { id: g.nextId++, slot, spawnAt, ms: g.fillMs[slot], y: ENTER_Y, p: 0, state: 'fly', onset: null, drain: false, from: 0, lockAt: 0, gone: false }
      p.y = yOfPill(p, t)
      g.pills.push(p)
      g.slot[slot] = 'fly'
      g.nextSpawn = t + g.period
      events.push({ type: 'spawn', pill: p })
    }
  }

  if (!g.finished && g.slot.every(s => s === 'won' || s === 'lost') && !g.pills.some(p => p.state === 'fly' || p.state === 'lock')) {
    g.finished = true
    events.push({ type: 'done', locked: g.locked })
  }
  return events
}

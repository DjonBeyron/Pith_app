// Сценарий «Встряхни память» ИЗ КОДА ИГРЫ, без прохождения (CONCEPT_TIMELINE.md, «Проверка сценария»): этот файл — единственное место, где проверка спрашивает игру.
// Игру он не меняет и не запускает: вызывает её ЧИСТЫЕ функции на учебном плане (тот же план, что у эталона стадий raceStagesBaseline.test.js):
//  • стадии — pitrace/raceStages.buildRaceStages (режим STAGES_ROUND «Пинг-понг + фразы + финал», голосом и пальцами): реплики плашек и порядок этапов;
//  • эпизоды Мии и экзамен — машина pitrace/mia/raceMia.reduceMia: ей подаются события «вошли в церемонию», «слово верно», «слово ушло», «круг кончился»,
//    а она отвечает ТЕМИ ЖЕ репликами и сроками, что в игре. Поэтому новая реплика или новый исход экзамена появляются здесь сами.
//    Экзамен: колкость Мии зависит от причины (чужое слово / не успели / молчали — boss/bossMia.missWhy), исход — от доли трофеев (зоны шкалы), уход Мии — событием bye после её последней реплики.
// → простые списки { id, who, delay, word } (cue) — в блоки их складывает scenarioBuild.js.
import { buildRaceStages } from '../../pitrace/raceStages.js'
import { withPhrases } from '../../pitrace/racePhraseData.js'
import { PHRASE_FIXTURE } from '../../pitrace/racePhraseFixture.js'
import { STAGES_ROUND } from '../../pitrace/raceOnly.js'
import { reduceMia, miaInit } from '../../pitrace/mia/raceMia.js'
import { bonusRoute } from '../../pitrace/boss/bossBonus.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'
import { isCutStage } from '../timelineStageNames.js'

export const JAB_WORDS = 12 // слов в учебном круге, на котором собираются колкости: третий вариант «верно» звучит только на седьмом верном ответе
export const SIM_WORDS = 6 // сколько слов в учебном круге Мии и в каждом блоке экзамена: хватает, чтобы прозвучали все варианты колкостей и все исходы

const plan = () => withPhrases(normalizePlan({ ...fixturePlan('three'), source: 'node', game: 'race', round: STAGES_ROUND }), { phrases: PHRASE_FIXTURE, round: STAGES_ROUND })

/** Стадии игры на учебном плане: tap — режим «Пальцами» (иначе «Голосом», русская модель есть). Стадии вырезанного круга «Пойми · Тапни фразу» убраны (пока игра их ещё строит) */
export function gameStages(tap = false) {
  return buildRaceStages({ plan: plan(), tap, ru: true }).stages.filter(s => !isCutStage(s.sid))
}

const wide = (st, n = SIM_WORDS) => ({ ...st, words: Array.from({ length: n }, (_, i) => ({ ...(st.words?.[i % Math.max(1, st.words?.length ?? 1)] ?? { text: 'word', translation: 'слово' }), trap: false })) }) // ловушек в учебном круге нет: «слово ушло» — всегда ошибка
const pick = (stages, act, kind, n = 0) => stages.filter(s => s.act === act && s.mia === kind)[n] ?? null
const step = (m, ev, out) => { const r = reduceMia(m, ev); if (out) out.push(...r.say); return r.mia }

/** Церемония прихода Мии: реплика стадии (её говорит Пит) + реплики машины со сроками. seen — Мию в этой игре уже видели (экзамен: другая первая реплика Пита); o — экзамен: { shift, lookAt } как считает игра (useMiaEnter) */
export function ceremonyCues(stages, act, seen = false, o = {}) {
  const ann = pick(stages, act, 'ann')
  if (!ann) return { stage: null, cues: [], m: miaInit() }
  const say = [], m = step({ ...miaInit(), used: seen ? { sprint: true } : {} }, { t: 'enter', stage: ann, now: 0, ...(o.shift ? { bossShift: o.shift } : {}), ...(o.lookAt != null ? { bossLookAt: o.lookAt } : {}) }, say)
  return { stage: ann, cues: [...(ann.line ? [{ id: ann.line, who: 'pit', delay: 0, lead: true }] : []), ...say], m }
}

/** Причины «слово ушло» — какими событиями они приходят в машину: чужое слово (сначала miss), говорили и не успели, молчали (spoke: false) */
export const FAIL_WHY = { wrong: 'названо чужое слово', late: 'говорили, но не успели', forgot: 'молчали' }
const failEvents = (why, stage, idx) => [...(why === 'wrong' ? [{ t: 'miss', stage, idx, now: 0 }] : []), { t: 'fail', stage, idx, now: 0, ...(why === 'forgot' ? { spoke: false } : {}) }]

/** Круг с Мией: что звучит на верный ответ и на ушедшее слово (по причинам). → { win: [[cue…] по словам], fail: { wrong, late, forgot: [[cue…] по словам] }, hold } — hold: реплика между блоками экзамена */
export function roundCues(stages, act) {
  const start = ceremonyCues(stages, act, act === 'boss').m
  const first = stages.filter(s => s.act === act && s.mia === 'round').map(st => wide(st, JAB_WORDS))[0]
  if (!first) return { win: [], fail: {}, hold: [] }
  const run = evs => { let m = step(start, { t: 'enter', stage: first, now: 0 }); return first.words.map((_, idx) => { const say = []; for (const ev of evs(idx)) m = step(m, ev, say); return say }) }
  const hold = [], sw = pick(stages, act, 'hold')
  if (sw) step(step(start, { t: 'enter', stage: first, now: 0 }), { t: 'enter', stage: sw, now: 0 }, hold)
  return { win: run(idx => [{ t: 'win', stage: first, idx, now: 0 }]), fail: Object.fromEntries(Object.keys(FAIL_WHY).map(why => [why, run(idx => failEvents(why, first, idx))])), hold }
}

/** Все исходы конца круга: missed слов из total не названо (с конца), zone — в какой зоне шкалы названы верные (экзамен: от неё зависят трофеи).
 *  После реплик исхода машине подаётся событие bye (последняя реплика Мии доиграла) — как делает игра. → [{ missed, total, zone, cues, m, stage, outcome }] */
export function endCues(stages, act) {
  const start = ceremonyCues(stages, act, act === 'boss').m, end = pick(stages, act, 'end')
  const rounds = stages.filter(s => s.act === act && s.mia === 'round' && !s.bonus).map(st => wide(st)), sw = pick(stages, act, 'hold') // бонус-круг экзамена — отдельная ветка (bonusCues)
  if (!end || !rounds.length) return []
  const total = rounds.length * SIM_WORDS
  const play = (missed, zone) => {
    let m = start, n = 0
    rounds.forEach((st, k) => {
      const stage = { ...st, offset: st.offset ? k * SIM_WORDS : 0 }
      if (k && sw) m = step(m, { t: 'enter', stage: sw, now: 0 })
      m = step(m, { t: 'enter', stage, now: 0 })
      stage.words.forEach((_, idx) => {
        const bad = n++ >= total - missed
        m = step(m, { t: bad ? 'fail' : 'win', stage, idx, now: 0 })
        if (!bad) m = step(m, { t: 'zone', stage, idx, zone, now: 0 })
      })
    })
    const cues = []
    m = step(m, { t: 'enter', stage: end, now: 0 }, cues)
    const outcome = m.outcome || ''
    if (m.bye) m = step(m, { t: 'bye', id: m.bye, now: 0 }, cues)
    return { missed, total, zone, cues, m, stage: end, outcome }
  }
  return ['fast', 'mid', 'slow'].flatMap(zone => Array.from({ length: total + 1 }, (_, k) => play(k, zone)))
}

/** Бонус-круг экзамена (boss/bossBonus.js): все слова названы верно, нет красных и собрано не меньше BONUS_MIN_PCT % трофеев → директор идёт на стадию-реплику Мии, потом все слова заново с ускорением. Играется той же функцией маршрута, что в игре
 *  (bonusRoute: она же вписывает слова в стадию круга), и той же машиной. → { on, stage, cues (реплика Мии), round: реплики в самом круге (только колкости на ушедшее слово), jabs: { wrong, late, forgot: [id колкости по словам круга] }, k: множители слов, win: окна ответа, мс, miss — идёт ли бонус при одном жёлтом слове (должен идти: 91 %) } */
export function bonusCues(stages, act = 'boss') {
  const list = stages, blocks = list.filter(s => s.act === act && s.mia === 'round' && !s.bonus), i = list.findIndex(s => s.act === act && s.mia === 'hold' && s.bonus)
  if (i < 0 || !blocks.length) return { on: false, stage: null, cues: [], round: [], jabs: {}, k: [], win: [], miss: false }
  const play = lastZone => { let m = ceremonyCues(stages, act, true).m, off = 0; for (const st of blocks) { const stage = { ...st, offset: off }; m = step(m, { t: 'enter', stage, now: 0 }); stage.words.forEach((_, idx) => { m = step(m, { t: 'win', stage, idx, now: 0 }); m = step(m, { t: 'zone', stage, idx, zone: off + idx === lastZone.at ? lastZone.zone : 'fast', now: 0 }) }); off += stage.words.length } return m }
  const total = blocks.reduce((a, st) => a + st.words.length, 0), miss = bonusRoute(list, i, play({ at: total - 1, zone: 'mid' }), 'check').idx === i
  let m = play({ at: -1 }); const m0 = m
  const on = bonusRoute(list, i, m, 'check').idx === i, cues = [], round = [], st = list[i + 1]
  if (!on) return { on, stage: list[i], cues, round, jabs: {}, k: [], win: [], miss }
  m = step(m, { t: 'enter', stage: list[i], now: 0 }, cues); m = step(m, { t: 'enter', stage: st, now: 0 }, round)
  st.words.forEach((_, idx) => { for (const t of idx % 2 ? ['miss', 'fail'] : ['zone', 'win']) m = step(m, { t, stage: st, idx, zone: 'mid', now: 0 }, round) })
  const jabs = Object.fromEntries(Object.keys(FAIL_WHY).map(why => { let b = step(step(m0, { t: 'enter', stage: list[i], now: 0 }), { t: 'enter', stage: st, now: 0 }); return [why, st.words.map((_, idx) => { const say = []; for (const ev of failEvents(why, st, idx)) b = step(b, ev, say); return say[0]?.id ?? null })] }))
  return { on, stage: list[i], cues, round, jabs, k: st.words.map(w => w.k), win: st.words.map(w => w.win), miss }
}

/** Что говорит Пит, оставшись в коробке без Мии (круг кончился с ошибками): события коробки по порядку → [{ t, cues }] */
export function boxCues(endState) {
  let m = endState
  return ['try', 'stuck', 'faster', 'free'].map(t => { const cues = []; m = step(m, { t, now: 0 }, cues); return { t, cues } }).filter(x => x.cues.length)
}

/** Страховочный выход: круг с Мией оборван без стадии-концовки (в обычной игре не случается) */
export function fallbackCues(stages, act) {
  const start = ceremonyCues(stages, act).m, cues = []
  step(start, { t: 'enter', stage: { act }, now: 0 }, cues)
  return cues
}

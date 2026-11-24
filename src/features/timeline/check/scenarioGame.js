// Сценарий «Встряхни память» ИЗ КОДА ИГРЫ, без прохождения (CONCEPT_TIMELINE.md, «Проверка сценария»): этот файл — единственное место, где проверка спрашивает игру.
// Игру он не меняет и не запускает: вызывает её ЧИСТЫЕ функции на учебном плане (тот же план, что у эталона стадий raceStagesBaseline.test.js):
//  • стадии — pitrace/raceStages.buildRaceStages (режим STAGES_ROUND «Пинг-понг + фразы + финал», голосом и пальцами): реплики плашек и порядок этапов;
//  • эпизоды Мии и экзамен — машина pitrace/mia/raceMia.reduceMia: ей подаются события «вошли в церемонию», «слово верно», «слово ушло», «круг кончился»,
//    а она отвечает ТЕМИ ЖЕ репликами и сроками, что в игре. Поэтому новая реплика или новый исход экзамена появляются здесь сами.
// → простые списки { id, who, delay, word } (cue) — в блоки их складывает scenarioBuild.js.
import { buildRaceStages } from '../../pitrace/raceStages.js'
import { withPhrases } from '../../pitrace/racePhraseData.js'
import { PHRASE_FIXTURE } from '../../pitrace/racePhraseFixture.js'
import { STAGES_ROUND } from '../../pitrace/raceOnly.js'
import { reduceMia, miaInit } from '../../pitrace/mia/raceMia.js'
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

/** Церемония прихода Мии: реплика стадии (её говорит Пит) + реплики машины со сроками. seen — Мию в этой игре уже видели (экзамен: другая первая реплика Пита) */
export function ceremonyCues(stages, act, seen = false, shift = 0) { // shift — экзамен: на сколько раньше начинает Мия (raceMia.bossShift от длины реплики Пита)
  const ann = pick(stages, act, 'ann')
  if (!ann) return { stage: null, cues: [], m: miaInit() }
  const say = [], m = step({ ...miaInit(), used: seen ? { sprint: true } : {} }, { t: 'enter', stage: ann, now: 0, ...(shift ? { bossShift: shift } : {}) }, say)
  return { stage: ann, cues: [...(ann.line ? [{ id: ann.line, who: 'pit', delay: 0, lead: true }] : []), ...say], m }
}

/** Круг с Мией: что звучит на верный ответ и на ушедшее слово. → { win: [[cue…] по словам], fail: [[cue…] по словам], rounds, hold } — rounds: стадии круга (в экзамене два блока), hold — реплика между блоками */
export function roundCues(stages, act) {
  const start = ceremonyCues(stages, act, act === 'boss').m
  const rounds = stages.filter(s => s.act === act && s.mia === 'round').map(st => wide(st, JAB_WORDS)), first = rounds[0]
  if (!first) return { win: [], fail: [], rounds: [], hold: [] }
  const run = t => { let m = step(start, { t: 'enter', stage: first, now: 0 }); return first.words.map((_, idx) => { const say = []; m = step(m, { t, stage: first, idx, now: 0 }, say); return say }) }
  const hold = [], sw = pick(stages, act, 'hold')
  if (sw) step(step(start, { t: 'enter', stage: first, now: 0 }), { t: 'enter', stage: sw, now: 0 }, hold)
  return { win: run('win'), fail: run('fail'), rounds, hold }
}

/** Все исходы конца круга: missed слов из total названо неверно (с конца), slow — верные названы в красной зоне. → [{ missed, total, slow, cues, m }] */
export function endCues(stages, act) {
  const start = ceremonyCues(stages, act, act === 'boss').m, end = pick(stages, act, 'end')
  const rounds = stages.filter(s => s.act === act && s.mia === 'round').map(st => wide(st)), sw = pick(stages, act, 'hold')
  if (!end || !rounds.length) return []
  const total = rounds.length * SIM_WORDS
  const play = (missed, slow) => {
    let m = start, n = 0
    rounds.forEach((st, k) => {
      const stage = { ...st, offset: st.offset ? k * SIM_WORDS : 0 }
      if (k && sw) m = step(m, { t: 'enter', stage: sw, now: 0 })
      m = step(m, { t: 'enter', stage, now: 0 })
      stage.words.forEach((_, idx) => {
        const bad = n++ >= total - missed
        m = step(m, { t: bad ? 'fail' : 'win', stage, idx, now: 0 })
        if (!bad && slow) m = step(m, { t: 'zone', stage, idx, zone: 'slow', now: 0 })
      })
    })
    const cues = []
    m = step(m, { t: 'enter', stage: end, now: 0 }, cues)
    return { missed, total, slow, cues, m, stage: end }
  }
  return [...Array.from({ length: total + 1 }, (_, k) => play(k, false)), play(0, true)]
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

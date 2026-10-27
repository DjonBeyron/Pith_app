// Сценарий игры: рецепт (раунды и ступени) → плоский список «стадий», которые сценарий (useWordLaneFlow) проходит по порядку. Чистые функции — проверяются тестами.
//  announce — плашка раунда («Раунд 2 · Выбери дорожку»), только у фраз из нескольких кусков;
//  dictor   — ступень, диктор проговаривает повторы (план planDictor: когда звучит каждый повтор, какие пилюли в каких дорожках);
//  turn     — плашка «Теперь твоя очередь» (слушатель Vosk уже стартует под ней);
//  student  — ученик повторяет те же повторы (конвейер wordLaneStudent);
//  order    — раунд «Порядок»: подсказки диктора, ученик тапает дорожки.
// У каждой стадии свой номер idx и ссылка на раунд/ступень; подписи дорожек и подсветка считаются из стадии (labelsFor).
import { buildRecipe, orderLanes } from './wordLaneRecipe.js'
import { planDictor } from './wordLaneDictor.js'
import { estChunkMs } from './wordLaneAudio.js'

export const ANNOUNCE_MS = 1700   // плашка раунда
export const TURN_STAGE_MS = 1500 // плашка «Теперь твоя очередь»

/**
 * @param {object} p chunks — куски фразы; clips — клипы озвучки (wordLaneAudio) или null; audio — { wave, duration } или null; rate — скорость голоса урока
 * @returns {{ recipe, stages, chunkMs: number[], chunkCurves: Array<Function|null>, lanes: number[] }}
 */
export function buildStages({ chunks, clips = null, audio = null, rate = 1 }) {
  const recipe = buildRecipe(chunks)
  const n = chunks.length
  const chunkMs = chunks.map(c => estChunkMs(c))
  const chunkCurves = chunks.map(() => null)
  const stages = []
  const push = s => stages.push({ ...s, idx: stages.length })
  for (const round of recipe.rounds) {
    if (n > 1) push({ type: 'announce', round, ms: ANNOUNCE_MS })
    if (round.kind === 'order') { push({ type: 'order', round, prompts: round.prompts }); continue }
    for (const step of round.steps) {
      if (step.kind === 'dictor-student') {
        const plan = planDictor({ step, chunks, clips, audio, rate })
        if (step.parts.length === 1) {
          // длина куска и кривая громкости — из плана одиночного куска: по ним ученик и «вслепую» ждёт слова нужной длины, а подсказка рисует тень
          const piece = plan.reps[0].pieces[0]
          chunkMs[step.parts[0]] = piece.ms
          chunkCurves[step.parts[0]] = piece.curve
        }
        push({ type: 'dictor', step, plan })
        push({ type: 'turn', step, ms: TURN_STAGE_MS })
      }
      push({ type: 'student', step })
    }
  }
  return { recipe, stages, chunkMs, chunkCurves, lanes: orderLanes(n) }
}

/** Какая ступень слушается на стадии: слушатель Vosk стартует заранее — под плашкой «твоя очередь» или раунда, чтобы тяжёлый запуск не мешал ходу пилюль */
export function listenStepOf(stages, idx) {
  const s = stages[idx]
  if (!s) return null
  if (s.type === 'turn' || s.type === 'student') return s.step
  if (s.type === 'announce' && stages[idx + 1]?.type === 'student') return stages[idx + 1].step
  return null
}

/** Подписи дорожек на стадии: { text, on }[3] — текст куска над дорожкой и подсвечена ли она (участвует в ступени). Пустой текст — подписи нет (вслепую) */
export function labelsFor(stage, chunks, lanes, hint = []) {
  const n = chunks.length
  const out = Array.from({ length: 3 }, () => ({ text: '', on: false }))
  if (!stage || n < 2) return out
  if (stage.type === 'order') { lanes.forEach((chunk, lane) => { out[lane] = { text: chunks[chunk], on: true } }); return out }
  const step = stage.step
  if (!step) return out
  chunks.forEach((c, lane) => { if (step.labels.includes(lane) || hint.includes(lane)) out[lane] = { text: c, on: step.active.includes(lane) || hint.includes(lane) } })
  return out
}


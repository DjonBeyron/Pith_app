// Сценарий игры: рецепт (раунды и ступени) → плоский список «стадий», которые сценарий (useWordLaneFlow) проходит по порядку. Чистые функции — проверяются тестами.
//  announce — плашка раунда («Раунд 2 · Выбери дорожку»), у фраз из нескольких кусков (у одного слова — только перед «Различи»);
//  dictor   — ступень, диктор проговаривает повторы (план planDictor: когда звучит каждый повтор, какие пилюли в каких дорожках);
//  turn     — плашка «Теперь твоя очередь» (слушатель Vosk уже стартует под ней);
//  student  — ученик повторяет те же повторы (конвейер wordLaneStudent);
//  order    — раунд «Порядок»: подсказки диктора, ученик тапает дорожки;
//  discern  — раунд «Различи» (для куска с запутывателями): диктор говорит кусок, в дорожках он и похожие слова — ученик тапает дорожку с верным словом (пилюли выкатываются по очереди, слова написаны на пилюлях).
// «Репетиция с Питом» (cfg.plan): стадии строит rehearsalStages.js в том же формате (+ типы warmup, read, take, mirror, summary — rehearsalKinds.js).
// У каждой стадии свой номер idx и ссылка на раунд/ступень; подписи дорожек и подсветка считаются из стадии (labelsFor).
import { buildRecipe, orderLanes } from './wordLaneRecipe.js'
import { planDictor } from './wordLaneDictor.js'
import { estChunkMs } from './wordLaneAudio.js'
import { buildRehearsalStages, labelsForRehearsal } from '../../../rehearsal/rehearsalStages.js'
import { isStudentStage } from '../../../rehearsal/rehearsalKinds.js'

export const ANNOUNCE_MS = 1700   // плашка раунда
export const TURN_STAGE_MS = 1500 // плашка «Теперь твоя очередь»

/**
 * @param {object} p chunks — куски фразы; clips — клипы записи автора (wordLaneAudio) или null; audio — { wave, duration } или null; rate — скорость голоса урока; lib(chunk) — озвучка куска в библиотеке слов ({ ms } или null)
 * @returns {{ recipe, stages, chunkMs: number[], chunkCurves: Array<Function|null>, lanes: number[] }}
 */
export function buildStages({ chunks, clips = null, audio = null, rate = 1, lib = () => null, confusers = null, plan = null }) {
  if (plan) return buildRehearsalStages({ plan, rate, lib })
  const recipe = buildRecipe(chunks, confusers)
  const n = chunks.length
  const chunkMs = chunks.map(c => estChunkMs(c))
  const chunkCurves = chunks.map(() => null)
  const stages = []
  // Кто озвучивает: у фразы из нескольких кусков запись автора — только ФИНАЛ (вся фраза), остальное — куски по отдельности из библиотеки; у одного слова — библиотека, а нет её — запись автора
  const clipMode = parts => (n > 1 ? parts.length === n : !lib(0))
  const push = s => stages.push({ ...s, idx: stages.length })
  for (const round of recipe.rounds) {
    if (n > 1 || round.kind === 'discern') push({ type: 'announce', round, ms: ANNOUNCE_MS })
    if (round.kind === 'order' || round.kind === 'discern') { push({ type: round.kind, round, prompts: round.prompts }); continue }
    for (const step of round.steps) {
      if (step.kind === 'dictor-student') {
        const plan = planDictor({ step, chunks, clips, audio, rate, clipMode, lib })
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
  return { recipe, stages, chunkMs, chunkCurves, lanes: orderLanes(n), clipMode }
}

/** Какая ступень слушается на стадии: слушатель Vosk стартует заранее — под плашкой «твоя очередь» или раунда, чтобы тяжёлый запуск не мешал ходу пилюль */
export function listenStepOf(stages, idx) {
  const s = stages[idx]
  if (!s) return null
  if (s.type === 'turn' || isStudentStage(s)) return s.step
  if (s.type === 'announce' && isStudentStage(stages[idx + 1])) return stages[idx + 1].step
  return null
}

/** Подписи дорожек на стадии: { text, on }[3] — текст куска над дорожкой и подсвечена ли она (участвует в ступени). Пустой текст — подписи нет (вслепую) */
export function labelsFor(stage, chunks, lanes, hint = [], hl = -1) {
  if (stage?.act) return labelsForRehearsal(stage, chunks, hint, hl) // репетиция: перевод вместо куска, пусто «без текста», подсветка читки
  const n = chunks.length
  const out = Array.from({ length: 3 }, () => ({ text: '', on: false }))
  if (stage?.type === 'discern') return out // «Различи»: слова написаны на самих пилюлях, над дорожками пусто (верное слово не выдаём)
  if (!stage || n < 2) return out
  if (stage.type === 'order') { lanes.forEach((chunk, lane) => { out[lane] = { text: chunks[chunk], on: true } }); return out }
  const step = stage.step
  if (!step) return out
  chunks.forEach((c, lane) => { if (step.labels.includes(lane) || hint.includes(lane)) out[lane] = { text: c, on: step.active.includes(lane) || hint.includes(lane) } })
  return out
}


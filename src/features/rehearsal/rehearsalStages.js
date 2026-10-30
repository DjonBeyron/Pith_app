// «Репетиция с Питом»: акты рецепта (rehearsalRecipe.js) → плоский список стадий в ТОМ ЖЕ формате, что у wordLaneStages.js (директор useWordLaneFlow проходит их по порядку), плюс новые типы стадий (rehearsalKinds.js).
// Стадии — те же announce / dictor / turn / student / discern, и новые warmup, read, take, mirror, summary. Что есть у каждой, сверх формата игры:
//  act   — какому акту принадлежит (warmup, word, read, build, blind, discern, take, mirror, summary); sid — ключ журнала (rehearsalJournal);
//  line  — id реплики Пита на старте стадии (announce: директор держит плашку, пока Пит говорит); tag — ярлык-плашка над дорожками («Чётко — для последнего ряда», §6 п. 4); cond — «идти ли»: { retry: sid } / { few: true };
//  step  — у ученика сверх обычного: record (take: идёт запись дубля, useRehearsalTake), chunks (тексты дорожек, если цель — слово, а не кусок), chunkMs, extra (слова словаря Vosk, кроме целей — двойники и слова фразы), maxWords;
//  warmup: word { text, translation, lane }, caption (перевод над дорожкой); read и ученик читки: metro — [{ chunk, at, ms }] подсветка кусков по времени от старта стадии;
//  blind (ученик): hintWord / hintLane / hintTr / hintKinds — подсказки, если застрял на 3 секунды (какая первая — rehearsalHints.js); discern: sayText — слово, которое произносит диктор (вместо куска фразы).
import { orderLanes, textOf, normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { planDictor } from '../player/modules/rotate-phone/wordLaneDictor.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { makeLib } from '../player/modules/rotate-phone/wordLaneLib.js'
import { TRAVEL_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { PIECE_PAD_MS } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { planTexts, wordsOfChunk } from './rehearsalPlan.js'
import { buildActs } from './rehearsalRecipe.js'
import { rngFor } from './rehearsalSeed.js'
import { hintAt } from './rehearsalHints.js'

export const RH_ANNOUNCE_MS = 1700  // плашка акта
export const RH_TURN_MS = 1500      // «Теперь твоя очередь»
export const RH_TAG_MS = 1200       // плашка перед «чётко» / «обычно»
export const RH_TAKE_MS = 2400      // «Дубль. Три, два, один…»
export const MAX_VOCAB = 8          // слов словаря Vosk сверх цели

const rep = parts => ({ parts })
const blank = () => Array.from({ length: 3 }, () => ({ text: '', on: false }))

/** → { recipe, stages, chunkMs, chunkCurves, lanes, clipMode } — как buildStages (wordLaneStages.js) */
export function buildRehearsalStages({ plan, rate = 1, lib = () => null }) {
  const { chunks } = plan
  const n = chunks.length
  const r = rate > 0 ? rate : 1
  const all = chunks.map((_, i) => i)
  const texts = planTexts(plan)
  const textLib = makeLib(texts)
  const msOf = text => { const i = texts.findIndex(t => normText(t) === normText(text)); return (textLib(i)?.ms ?? estChunkMs(text)) / r } // озвучка слова/куска в библиотеке слов, нет её — оценка
  const chunkMs = chunks.map((c, i) => (lib(i)?.ms ?? estChunkMs(c)) / r)
  const { acts } = buildActs(plan, { hasVoice: chunks.some((_, i) => lib(i)) })
  const stages = []
  const push = s => { stages.push({ ...s, idx: stages.length }); return s }

  const announce = (act, o = {}) => push({ type: 'announce', act: act.id, sid: `${o.sid ?? act.id}-ann`, round: { kind: act.id, title: o.title ?? act.title }, ms: o.ms ?? RH_ANNOUNCE_MS, line: o.line === undefined ? act.line : o.line, tag: o.tag, cond: o.cond })
  const stepOf = (id, parts, o = {}) => ({ id, kind: 'student', parts, text: textOf(chunks, parts), labels: all, active: parts, reps: [rep(parts)], ...o })
  const dictorOf = step => planDictor({ step, chunks, clips: null, audio: null, rate, clipMode: () => false, lib })
  const vocabFor = w => { // словарь Vosk: двойники слова, потом слова фразы, потом двойники других слов
    const seen = new Set([normText(w.text)])
    return [...w.confusers, ...chunks.flatMap(wordsOfChunk), ...plan.words.flatMap(x => x.confusers)].filter(t => { const k = normText(t); if (!k || seen.has(k)) return false; seen.add(k); return true }).slice(0, MAX_VOCAB)
  }
  /** Ступень «слово»: цель — слово, а не кусок; дорожка слова, пилюля в ней; над дорожкой перевод (caption) */
  const wordStage = (act, w, sid, reps, o = {}) => {
    const texts3 = ['', '', ''], ms3 = [0, 0, 0]
    texts3[w.lane] = w.text; ms3[w.lane] = msOf(w.text)
    const step = { id: sid, kind: 'student', parts: [w.lane], text: w.text, labels: [], active: [w.lane], reps: Array.from({ length: reps }, () => rep([w.lane])), chunks: texts3, chunkMs: ms3, extra: vocabFor(w), maxWords: 2 }
    return push({ type: 'warmup', act, sid, step, word: w, caption: w.translation || plan.translation, ...o })
  }
  const metroOf = (parts, durs) => parts.map((chunk, k) => ({ chunk, at: Math.round(TRAVEL_MS + durs.slice(0, k).reduce((a, d) => a + d + PIECE_PAD_MS, 0)), ms: Math.round(durs[k]) }))

  for (const act of acts) {
    if (act.id === 'warmup' || act.id === 'word') {
      announce(act)
      act.words.forEach(w => wordStage(act.id, w, `${act.id}-${w.idx ?? 0}`, act.reps ?? 1)) // sid — по номеру слова в плане (w.idx), а не по порядку сессии: по нему журнал и итог находят ступень
    } else if (act.id === 'read') {
      announce(act)
      const dstep = stepOf('read-d', act.parts)
      const dplan = dictorOf(dstep)
      const sstep = stepOf('read-s', act.parts)
      push({ type: 'read', act: 'read', sid: 'read-d', step: dstep, plan: dplan, metro: act.highlight ? dplan.reps[0].pieces.map(p => ({ chunk: p.chunk, at: Math.round(p.at), ms: Math.round(p.ms) })) : [] })
      push({ type: 'turn', act: 'read', sid: 'read-t', step: sstep, ms: RH_TURN_MS })
      push({ type: 'student', act: 'read', sid: 'read-s', step: sstep, metro: act.highlight ? metroOf(act.parts, act.parts.map(i => chunkMs[i])) : [] })
    } else if (act.id === 'build') {
      announce(act)
      const group = (st, suffix, cond) => {
        const step = stepOf(`${st.id}${suffix}`, st.parts)
        push({ type: 'dictor', act: 'build', sid: `${step.id}-d`, step, plan: dictorOf(step), cond })
        push({ type: 'turn', act: 'build', sid: `${step.id}-t`, step, ms: RH_TURN_MS, cond })
        push({ type: 'student', act: 'build', sid: step.id, step, cond })
      }
      for (const st of act.steps) { group(st, ''); if (st.retry) group(st, 'r', { retry: st.id }) } // промах — ступень ещё раз, один раз: вторая группа идёт, только если у первой ученика был промах
      const fstep = stepOf(act.final.id, act.final.parts)
      push({ type: 'dictor', act: 'build', sid: `${fstep.id}-d`, step: fstep, plan: dictorOf(fstep) })
      for (const pass of act.final.passes) { // последняя ступень: человек ×2 — «чётко», потом «обычно» (ярлык над дорожками, не на пилюле)
        announce(act, { sid: pass.id, title: '', ms: RH_TAG_MS, line: pass.line, tag: pass.tag })
        push({ type: 'student', act: 'build', sid: pass.id, step: stepOf(pass.id, act.final.parts), tag: pass.tag })
      }
    } else if (act.id === 'blind') {
      announce(act)
      if (act.word) wordStage('blind', act.word, 'blind-0', 1, { hintWord: act.word.text, hintLane: act.word.lane }) // одно слово: слово по переводу
      else for (const pass of act.passes) push({ type: 'student', act: 'blind', sid: pass.id, step: stepOf(pass.id, act.parts, { labels: [] }), cond: pass.cond, hintWord: act.hintWord, hintLane: act.hintLane, hintTr: act.hintTr, hintKinds: pass.hintKinds }) // hintKinds: порядок подсказок при «застрял» (rehearsalHints.js)
    } else if (act.id === 'discern') {
      act.words.forEach((w, i) => {
        announce(act, { sid: `discern-${i}`, title: 'Различи', line: i === 0 ? act.line : null, cond: act.cond })
        push({ type: 'discern', act: 'discern', sid: `discern-${i}`, round: { kind: 'discern', title: 'Различи' }, prompts: w.prompts, sayText: w.text, cond: act.cond })
        wordStage('discern', { ...w, lane: n === 1 ? 1 : w.lane >= 0 ? w.lane : 1, translation: '' }, `discern-say-${i}`, 1, { cond: act.cond, noLabel: true, hintWord: w.text }) // потом слово надо сказать (словарь — тройка)
      })
    } else if (act.id === 'intro') announce(act, { line: null }) // «Шлифовка → Заставка»: плашка, потом финал игры
    else if (act.id === 'take') {
      announce(act, { title: 'Дубль. Три, два, один…', ms: RH_TAKE_MS })
      push({ type: 'take', act: 'take', sid: 'take', step: stepOf('take', act.parts, { labels: [], record: true }) }) // record: слушатель без затвора тишины (паузы между кусками должны остаться паузами) и сразу начинает следующий заход
    } else push({ type: act.id, act: act.id, sid: act.id, line: act.line }) // mirror: реплика Пита «Слушаем, сначала я, потом ты»; summary: без реплики (её говорит директор актов)
  }
  return { recipe: { chunks, rounds: [], acts, plan }, stages, chunkMs, chunkCurves: chunks.map(() => null), lanes: orderLanes(n, rngFor(plan.seed, 'lanes')), clipMode: () => false }
}

/** Подписи дорожек на стадии репетиции: { text, on }[3]. hint — дорожки, где показать подпись (после «не успел», «застрял», слабое слово), hl — какой кусок подсвечен сейчас (читка), −1 — никакой */
export function labelsForRehearsal(stage, chunks, hint = [], hl = -1) {
  const out = blank()
  if (!stage || ['discern', 'mirror', 'summary'].includes(stage.type)) return out
  if (stage.type === 'warmup') {
    const lane = stage.word.lane
    const h = hintAt(hint, lane)
    const shown = h !== undefined ? h.text ?? stage.word.text : stage.noLabel ? '' : stage.caption // перевод; «не успел» — подсказка словом
    if (shown) out[lane] = { text: shown, on: true }
    return out
  }
  const step = stage.step
  if (!step) return out
  chunks.forEach((c, lane) => {
    const h = hintAt(hint, lane)
    if (step.labels.includes(lane)) out[lane] = { text: c, on: stage.metro?.length ? hl === lane : step.active.includes(lane) } // читка: подсвечен кусок, который звучит; сборка: куски ступени
    else if (h != null) out[lane] = { text: h.text ?? c, on: true } // подсказка: подпись куска или (перевод куска при «застрял») свой текст
  })
  return out
}

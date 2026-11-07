// Этап 2 «Фразы» игры «Встряхни память» → стадии (CONCEPT_PHRASES.md, «Лента и круги»). Акт phrases идёт после «Пинг-понга» и перед итогом (в полной гонке — до «Вершины»).
// Стадии: плашка этапа (Пит: race_phrases / race_phrases_tap) → плашка круга 1 «Пойми · Тапни фразу» (phrases1-ann, race_phrases_pick, цвет ленты, значок пальца) → круг 1 (sid phrases1)
// → плашка круга 2 (phrases2-ann, акцентный цвет: голосом «Скажи · Скажи сам» race_phrases_say со значком микрофона, пальцами «Узнай · Тапни смысл» race_phrases_hear со значком пальца) → круг 2 (sid phrases2).
// Без озвучки реплики — только плашка с подписью. Ступень круга — одна на весь круг, движок пилюль ведёт её своей сценой (step.phrases → racePhraseScene.js: широкие пилюли на одной ленте по центру):
//  • круг 1 (mode 'pick'): ТОЛЬКО ТАП в любом режиме (voice: false — слушатель фраз не создаётся); Пит говорит смысл, три кандидата с полным текстом едут ОДНА ЗА ДРУГОЙ (PHRASE_GAP_MS, PHRASE_SPEED);
//  • круг 2 голосом (mode 'say'): одна фраза на ход, пунктирная рамка акцентного цвета, слова спрятаны до первых букв (racePhraseMask.js) и проявляются по мере речи; скорость SAY_SPEED;
//  • круг 2 пальцами (mode 'hear'): Пит говорит фразу по-английски, по ленте три смысла по-русски на пилюлях с акцентной подложкой.
// Слух слов (wordLaneListen) на этих ступенях не нужен: tapOnly — у слушателя слов нет модели и микрофона; фразы слушает свой слушатель сцены (racePhraseListener.js), только в круге «Скажи».
// quiet — промах без полос, «не успел» без реплики директора игры (её говорит директор гонки, racePhraseVoice.js). Порядок круга 2 директор правит перед входом (fill: слабые фразы круга 1 — последними).
import { stepOf } from './raceStageKit.js'
import { round1Turns, round2SayTurns, round2HearTurns, reorderWeak } from './racePhraseTurns.js'
import { demoPhrase } from './racePhraseDemo.js'

// Скорости постоянные, без ускорений (2026-11-07, владелец: «нужно примерно как в первом этапе, но идут фразы, а не слова, и времени на ответ нужно больше»). Конвейер — SPEED 26 % высоты в секунду,
// зона чтения ≈ 22…72 % высоты (50 %): время в ней = 50 / (26 · speed) с. Было 0,55 / 0,4 → 3,5 / 4,8 с (и у «Скажи» ускорение ×2 после 3 с тишины).
export const PHRASE_SPEED = 0.43 // круг 1 и «Узнай»: 50 / (26 · 0,43) ≈ 4,5 с в зоне чтения — прочитать три фразы и выбрать
export const SAY_SPEED = 0.27    // круг 2 голосом: ≈ 7,1 с в зоне чтения (до «не успел» у края — 92 % пути, ≈ 13 с) — сказать фразу из 4–7 слов по словам
export const PHRASE_GAP_MS = 4000 // круг 1 / «Узнай»: кандидат через столько после прошлого — шаг 26 · 0,43 · 4 ≈ 45 % высоты: целиком на экране не больше двух пилюль, не наезжают
export const LANE = 1             // широкая лента — средняя дорожка (три дорожки съехались к центру)

/** Плашки кругов: название, подзадача, реплика Пита и вид (tone — цвет рамки, icon — значок в подзадаче) */
export const ROUND_PLATES = {
  pick: { title: 'Пойми', task: 'Тапни фразу', line: 'race_phrases_pick', look: { tone: 'lane', icon: 'tap' } },
  say: { title: 'Скажи', task: 'Скажи сам', line: 'race_phrases_say', look: { tone: 'accent', icon: 'mic' } },
  hear: { title: 'Узнай', task: 'Тапни смысл', line: 'race_phrases_hear', look: { tone: 'accent', icon: 'tap' } },
}

/** Ступень круга: одна на все ходы; reps — по ходу (для счёта, дорожек конвейера и скорости пунктира), phrases — что ведёт сцена */
export function phraseStep(id, turns, { round, mode, voice, speed, gap = PHRASE_GAP_MS }) {
  const texts = turns.map(t => t.target.text)
  return stepOf(id, {
    parts: turns.map((_, i) => i), text: texts.join(' '), chunks: texts, chunkMs: texts.map(() => 1000), active: [LANE],
    reps: turns.map((t, i) => ({ parts: [i], lane: LANE, speed, cap: t.cands[0]?.cap })), maxWords: 4, maxTries: 1, quiet: true, tapOnly: true,
    phrases: { round, mode, voice: !!voice, speed, gap, turns },
  })
}

/** Стадии акта phrases (act.phrases — фразы плана, racePhraseData.phrasesOf) */
export function phraseStages(kit, act) {
  const { push, announce, plan, tap } = kit
  const voice = !tap
  announce(act)
  const r1 = round1Turns(act.phrases, plan.seed)
  announce(act, { sid: 'phrases1', ...ROUND_PLATES.pick })
  push({ type: 'student', act: act.id, sid: 'phrases1', round: 1, turns: r1, step: phraseStep('phrases1', r1, { round: 1, mode: 'pick', voice: false, speed: PHRASE_SPEED }) }) // круг 1 — только тап
  const mode = voice ? 'say' : 'hear'
  const base = voice ? round2SayTurns(act.phrases) : round2HearTurns(act.phrases, plan.seed)
  if (!base.length) return
  announce(act, { sid: 'phrases2', ...ROUND_PLATES[mode] })
  if (voice) kit.stages.at(-1).demo = demoPhrase(act.phrases, base) // демо «можно по словам» на плашке «Скажи» (racePhraseDemo.js, useRacePhraseDemo.js)
  const make = turns => ({ turns, step: phraseStep('phrases2', turns, { round: 2, mode, voice, speed: voice ? SAY_SPEED : PHRASE_SPEED }) })
  push({ type: 'student', act: act.id, sid: 'phrases2', round: 2, base, ...make(base), fill: weak => Object.assign(kit.stages.find(x => x.sid === 'phrases2'), make(reorderWeak(base, weak))) })
}

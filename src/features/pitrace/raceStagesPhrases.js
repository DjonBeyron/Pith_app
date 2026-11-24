// Этап 2 «Фразы» («Конвейер ситуаций») игры «Встряхни память» → стадии (CONCEPT_PHRASES.md, «Лента и круги»). Акт phrases идёт после «Конвейера слов» и перед экзаменом / итогом; ТОЛЬКО в режиме «Голосом».
// Решение владельца 2026-11-24: тап-круги ВЫРЕЗАНЫ — и круг 1 «Пойми · Тапни фразу», и «Узнай · Тапни смысл» (режим «Пальцами»): в режиме «Пальцами» этапа фраз нет совсем (raceRecipe.js акт не кладёт).
// Этап — один круг «Скажи»: плашка этапа (phrases-ann) → круг (sid phrases2, round 2 — прежние имена: по ним считают итог, паузы и таймлайн).
// Плашка этапа «Конвейер ситуаций» выходит на слова Пита (plateWithLine) и несёт реплику КРУГА: с демо — race_phrases_show (после неё сразу демо на живой пилюле, «теперь твоя очередь…» race_phrases_say Пит
// говорит после демо, ноты отсчёта — тоже после демо: count false), без демо — race_phrases_say; без озвучки реплики — только плашка с подписью.
// Ступень круга — одна на весь круг, движок пилюль ведёт её своей сценой (step.phrases → racePhraseScene.js: широкая пилюля на одной ленте по центру): каждая фраза — два хода (проход 1 — пунктир, слова под
// маской-кирпичиками, racePhraseMask.js; проход 2 — сплошная двойная рамка, весь текст, без остановок); скорость SAY_SPEED; первым ходом — демо на живой пилюле (step.phrases.demo — racePhraseDemo.demoPhrase).
// Слух слов (wordLaneListen) на этой ступени не нужен: tapOnly — у слушателя слов нет модели и микрофона; фразы слушает свой слушатель сцены (racePhraseListener.js).
// quiet — промах без полос, «не успел» без реплики директора игры (её говорит директор гонки, racePhraseVoice.js).
import { stepOf } from './raceStageKit.js'
import { SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js' // 26 % высоты в секунду — базовая скорость конвейера
import { round2SayTurns } from './racePhraseTurns.js'
import { demoPhrase } from './racePhraseDemo.js'
import { voicedPhraseTest } from './racePhraseWordVoice.js'

// Скорости постоянные, без ускорений (2026-11-07, владелец: «нужно примерно как в первом этапе, но идут фразы, а не слова»). Конвейер — SPEED 26 % высоты в секунду,
// зона чтения ≈ 22…72 % высоты (50 %): время в ней = 50 / (26 · speed) с. История: 0,55 / 0,4 → v3.3.155 0,43 / 0,27 («времени на ответ нужно больше») → 2026-11-08 снова быстрее (владелец: «скорость слишком мала»).
export const SAY_SPEED = 0.36    // «Скажи»: ≈ 5,3 с в зоне чтения, до «не успел» у края (92 % пути) ≈ 10 с; пилюля выезжает во время реплики Пита — времени хватает
/** Шаг между пилюлями — в ДОЛЯХ ВЫСОТЫ (2026-11-08, владелец: «расстояние ещё меньше»; v3.3.159 было ≈ 27 %, до того 45 %): пилюля 11 % + воздух ≈ 9 %. Миллисекунды — из скорости, чтобы шаг не разъезжался */
export const PHRASE_GAP_PCT = 20
export const gapMs = (speed, pct = PHRASE_GAP_PCT) => Math.round((pct / (SPEED * speed)) * 1000)
export const PHRASE_EXIT_MS = 300 // круг фраз кончился (fx.finished) — до следующей стадии столько (не EXIT_PAUSE_MS 1,3 с: Пит уже договорил итог хода, пилюли доезжают сами)
export const PHRASE_LINE_TAIL_MS = 230 // плашка «Конвейер ситуаций» кончается через столько после РЕАЛЬНОГО конца реплики Пита (stage.lineTail): дальше сразу демо / три ноты, без тишины
export const PHRASE_ENTER_MS = 500 // последняя ступень перед фразами кончилась — столько до плашки «Фразы» (не 1,3 с: перестройка дорожек в ленту и реплика Пита «теперь фразы» идут сразу, он не ждёт; владелец 2026-11-17)
export const LANE = 1             // широкая лента — средняя дорожка (три дорожки съехались к центру)

/** Круг этапа («Скажи»): название, подзадача, реплика Пита и вид (tone — цвет рамки, icon — значок в подзадаче) */
export const ROUND_PLATES = {
  say: { title: 'Скажи', task: 'Скажи сам', line: 'race_phrases_say', look: { tone: 'accent', icon: 'mic' } },
}

/** Ступень круга: одна на все ходы; reps — по ходу (для счёта, дорожек конвейера и скорости пунктира), phrases — что ведёт сцена */
export function phraseStep(id, turns, { round, mode, voice, speed, gap = gapMs(speed), demo = null }) {
  const texts = turns.map(t => t.target.text)
  return stepOf(id, {
    parts: turns.map((_, i) => i), text: texts.join(' '), chunks: texts, chunkMs: texts.map(() => 1000), active: [LANE],
    reps: turns.map((t, i) => ({ parts: [i], lane: LANE, speed, cap: t.cands[0]?.cap })), maxWords: 4, maxTries: 1, quiet: true, tapOnly: true,
    phrases: { round, mode, voice: !!voice, speed, gap, turns, ...(demo ? { demo, countAfter: true } : {}) }, // countAfter: отсчёт — после демо (racePhraseScene.startCount), а не на плашке круга
  })
}

/** Стадии акта phrases (act.phrases — фразы плана, racePhraseData.phrasesOf): плашка этапа с репликой круга → круг «Скажи». В режиме «Пальцами» (kit.tap) и без своих фраз стадий нет: плашки без круга не бывает */
export function phraseStages(kit, act) {
  const { push, announce } = kit
  const turns = kit.tap ? [] : round2SayTurns(act.phrases)
  if (!turns.length) return
  const demo = demoPhrase(act.phrases, turns, voicedPhraseTest()) // демо на живой пилюле первым ходом «Скажи» (racePhraseDemoTurn.js; ворота — useRacePhraseDemo.js): только с озвучкой каждого слова
  announce(act, { line: demo ? 'race_phrases_show' : ROUND_PLATES.say.line })
  Object.assign(kit.stages.at(-1), { plateWithLine: true, lineTail: PHRASE_LINE_TAIL_MS, ...(demo ? { count: false } : {}) }) // count false: ноты отсчёта играют после демо (сцена, step.phrases.countAfter) — countBeforeRounds такую плашку пропускает
  push({ type: 'student', act: act.id, sid: 'phrases2', round: 2, turns, step: phraseStep('phrases2', turns, { round: 2, mode: 'say', voice: true, speed: SAY_SPEED, demo }) })
}

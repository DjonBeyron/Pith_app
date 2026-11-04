// Раунд 1 «Разгон» → стадии. Одна ступень ученика на весь круг: N повторов по одному слову, у каждого своя дорожка (rep.lane), скорость (rep.speed: ×1, ×1,05, ×1,1 …) и подпись внутри пилюли (rep.cap — перевод). Цель — английское слово;
// пилюля живёт, пока едет по экрану (правило 90/50 движка), maxTries 1: упущенную пилюлю не повторяют. Словарь Vosk — слова круга и двойники.
// Флаги ступени (движок читает их сам, у других раундов их нет): overlap — очередь, следующая пилюля выезжает сразу, как текущая принята или недоступна (wordLaneStudent.js); quiet — промах без полос и без английского слова: на неверное слово
// микро-анимация на самой пилюле, упущенная просто уезжает; edge — пилюля у краёв экрана чуть меньше (scale 0,85, wordLaneMotion.js); holdAll — следующая пилюля ждёт, пока Пит договорит реплику успеха; preSay — перед выездом каждой пилюли Пит говорит её перевод голосом (raceTrans.js, useRaceActs.pre), пилюля выезжает по окончании (реплика успеха договаривается раньше: перевод после неё); claimGap — после принятия слова
// на принятиях с мини-репликой успеха (goodAt, raceGood.js) следующая пилюля выезжает через эту паузу (мс): реплика начинается на принятии и успевает занять Пита.
// Второй круг (raceSprint2.js): стадии sprint2-ann (Пит говорит race_sprint_round2, плашки нет) и sprint2 стоят в списке всегда; директор идёт на них, только если в первом круге были ошибки, и перед этим вписывает слова в sprint2 (stage.fill).
// Реакции движка win / miss / fail / claim директор пишет в состояние (raceState.js).
import { stepOf } from './raceStageKit.js'
import { vocabOf } from './raceWords.js'
import { goodPlan } from './raceGood.js'

export const CLAIM_GAP_MS = 60   // пауза после принятия слова до выезда следующей пилюли
export const ROUND2_ANN_MS = 400 // «плашки» второго круга нет: стадия держится, пока Пит говорит

function sprintStep(kit, id, words, good) {
  const targets = words.map(w => w.text)
  return stepOf(id, {
    parts: words.map((_, i) => i), text: targets.join(' '), chunks: targets, chunkMs: targets.map(t => kit.msOf(t)),
    reps: words.map((w, i) => ({ parts: [i], lane: w.lane, speed: w.speed, cap: w.translation })),
    extra: vocabOf(targets, words.flatMap(w => [...w.confusers, ...kit.doubles(w.text)])), maxWords: 2, maxTries: 1, overlap: true,
    quiet: true, edge: true, holdAll: true, preSay: true, claimGap: CLAIM_GAP_MS, goodAt: good.map(g => g.at),
  })
}

export function sprintStages(kit, act) {
  const { push, announce, plan } = kit
  const round = (sid, list, first) => { const good = goodPlan(plan.seed, sid, list.length, { first }); return { type: 'student', act: 'sprint', sid, step: sprintStep(kit, sid, list, good), words: list, good } }
  announce(act)
  push(round('sprint', act.words, true))
  announce(act, { sid: 'sprint2', title: '', task: '', line: 'race_sprint_round2', ms: ROUND2_ANN_MS })
  push({ ...round('sprint2', act.words, false), fill: list => Object.assign(kit.stages.find(x => x.sid === 'sprint2'), round('sprint2', list, false)) }) // слова второго круга директор вписывает перед ним (raceSprint2.sprintTarget)
}

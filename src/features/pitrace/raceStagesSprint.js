// Раунд 1 «Разгон» → стадии. Одна ступень ученика на весь раунд: N повторов по одному слову, у каждого своя дорожка (rep.lane), скорость (rep.speed: ×1, ×1,05, ×1,1 …), подпись внутри пилюли (rep.cap — перевод) и слово,
// которое проявится на упущенной пилюле (rep.reveal). Цель — английское слово; пилюля живёт, пока едет по экрану (правило 90/50 движка), maxTries 1: упущенную пилюлю не повторяют. Словарь Vosk — слова раунда и двойники.
// overlap: очередь — следующая пилюля выезжает сразу, как текущая принята (win) или стала недоступной (ушла за нижний край на 50 %), не дожидаясь её ухода; одновременно живут до двух (wordLaneStudent.js). Реакции движка (win / miss / fail с номером повтора) директор пишет в серию и «к повтору» (raceState.js).
import { stepOf } from './raceStageKit.js'
import { vocabOf } from './raceWords.js'

export function sprintStages(kit, act) {
  const { push, announce, msOf } = kit
  const words = act.words
  const targets = words.map(w => w.text)
  announce(act)
  const step = stepOf('sprint', {
    parts: words.map((_, i) => i), text: targets.join(' '), chunks: targets, chunkMs: targets.map(t => msOf(t)),
    reps: words.map((w, i) => ({ parts: [i], lane: w.lane, speed: w.speed, cap: w.translation, reveal: w.text })),
    extra: vocabOf(targets, words.flatMap(w => [...w.confusers, ...kit.doubles(w.text)])), maxWords: 2, maxTries: 1, overlap: true,
  })
  push({ type: 'student', act: 'sprint', sid: 'sprint', step, words })
}

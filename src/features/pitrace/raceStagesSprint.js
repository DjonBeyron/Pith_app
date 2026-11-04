// Раунд 1 «Разгон» → стадии. Одна ступень ученика на весь круг (общая сборка — raceStageKit.queueStep): N повторов по одному слову, у каждого своя дорожка (rep.lane), скорость (rep.speed: ×1, ×1,05, ×1,1 …) и подпись внутри пилюли
// (rep.cap — перевод). Цель — английское слово; пилюля живёт, пока едет по экрану (правило 90/50 движка), maxTries 1: упущенную не повторяют. Словарь Vosk — слова круга и двойники. Перед выездом каждой пилюли Пит говорит её русский перевод
// (preSay, raceTrans.js), перед этим — выдержка PRE_SAY_GAP_MS после зачёта и «не успел». Флаги ступени и второй круг (стадии sprint2-ann / sprint2, слова вписывает директор — raceSprint2.js) описаны в raceStageKit.js.
// Реакции движка win / miss / fail / claim директор пишет в состояние (raceState.js).
import { queueStages } from './raceStageKit.js'

export const sprintStages = (kit, act) => queueStages(kit, act, w => ({ cap: w.translation }))

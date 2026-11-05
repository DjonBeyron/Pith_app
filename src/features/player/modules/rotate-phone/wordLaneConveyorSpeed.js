// Скорость конвейера в «Гонке с Питом» (CONCEPT_RACE.md, «Разгон»): пилюли быстрее конвейера в rep.speed раз, и пунктир дорожек должен ехать быстрее пропорционально, причём набирать скорость ЗАРАНЕЕ — до выезда
// первой пилюли круга (иначе второй круг начинался бы со скачка). Чистая функция: по списку стадий и номеру текущей говорит, какой множитель скорости у ближайшей стадии с пилюлями; сам плавный набор — модель
// wordLaneConveyor.js (SPEED_RAMP_MS), привод — laneConveyorDrive.setSpeedHint.
import { ENTER_Y, SPEED } from './wordLaneTimeline.js'

const HORIZON = 3 // плашки и реплика второго круга стоят перед стадией пилюль: заглядываем вперёд не дальше стольких стадий

/** → множитель скорости первой пилюли ближайшей стадии-очереди (текущей или следующей в том же акте) или null: пилюль со скоростью нет (обычная игра, другой акт) */
export function conveyorSpeedHint(stages, idx) {
  const cur = stages?.[idx]
  if (!cur?.race || !cur.act) return null
  for (let j = idx; j < Math.min(stages.length, idx + HORIZON + 1); j++) {
    const st = stages[j]
    if (!st || st.act !== cur.act) return null
    const reps = st.step?.reps
    if (st.type === 'student' && reps?.length) return reps[0].speed > 0 ? reps[0].speed : null
  }
  return null
}

// Тайминг следующей пилюли «Разгона» (CONCEPT_RACE.md, «Тайминг пилюли»): Пит заканчивает говорить перевод СТРОГО в тот миг, когда пилюля следующего слова выехала из-за верхнего края на 50 %. Поэтому выезд начинается
// ЗАРАНЕЕ: пилюля стартует за halfTravelMs до конца речи (stepStudent, input.pitMs); речь короче этого времени — пилюля стартует сразу, Пит договаривает по ходу (норма).
export const HALF_Y = 0       // центр пилюли на верхнем краю экрана: выехала ровно наполовину (высота PILL_H, центр ENTER_Y = −14 → 0 за ≈ 0,54 с при скорости ×1)
export const PIT_TAIL_MS = 80 // useCatLines.holdBusy держит Пита «занятым» ещё 80 мс после конца слова — в расчёте конца речи их вычитаем

/** Сколько мс пилюля со скоростью speed (множитель к конвейеру) едет от выкатки за верхним краем (ENTER_Y) до 50 % видимости (центр на верхнем крае) — время считается из скорости пилюли */
export const halfTravelMs = (speed = 1) => ((HALF_Y - ENTER_Y) / (SPEED * (speed > 0 ? speed : 1))) * 1000

/** Пилюле пора выезжать, чтобы Пит договорил ровно к её 50 %: до конца речи (pitMs минус хвост занятости) осталось не больше времени пути пилюли */
export const spawnEarly = (pitMs, speed) => pitMs - PIT_TAIL_MS <= halfTravelMs(speed)

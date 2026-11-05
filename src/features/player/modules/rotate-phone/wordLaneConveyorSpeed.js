// Скорость конвейера в «Гонке с Питом» (CONCEPT_RACE.md, «Разгон»): пилюли быстрее конвейера в rep.speed раз, и пунктир дорожек должен ехать быстрее пропорционально, причём набирать скорость ЗАРАНЕЕ — до выезда
// первой пилюли круга (иначе второй круг начинался бы со скачка). Чистая функция: по списку стадий и номеру текущей говорит, какой множитель скорости у ближайшей стадии с пилюлями; сам плавный набор — модель
// wordLaneConveyor.js (SPEED_RAMP_MS), привод — laneConveyorDrive.setSpeedHint.
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

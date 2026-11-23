// Паузы-настройки в стадиях гонки (shared/lib/scenePauses.js, CONCEPT_TIMELINE.md «Шаг 2»). Два места:
//  • applyStagePauses — последний проход сборки стадий (raceStages.buildRaceStages): вписывает в стадии действующие значения настроек и помечает, какая настройка дала какое поле
//    (stage.knobs: { поле стадии или роль: ключ реестра }) — эту пометку трасса сцены пишет на входе в стадию (stage-in, поле pauses). Без переопределений значения те же, что ставят
//    сами сборщики (MIA_INTRO_MS, PLATE_HOLD_MS, PHRASE_LINE_TAIL_MS): список стадий не меняется (raceStagesBaseline.test.js). Минимум плашки (race.announce) и выдержку перед
//    переводом (preSay.gap) ставит raceStageKit.js прямо при сборке — круги пересобираются по ходу игры (stage.fill).
//  • raceExit — пауза выхода из стадии для директора (useRaceActs.exitMs): конец круга (stage.exit), между кругами фраз (phrase.exit); выход перед Мией (MIA.EXIT_MS)
//    и вход во «Фразы» сразу после круга слов (PHRASE_ENTER_MS — в нынешнем списке стадий не встречается: за кругом слов всегда стоят стадии Мии) — как были. Ожидание пишется в трассу событием knob.
import { pauseMs } from '../../shared/lib/scenePauses.js'
import { knobMs } from '../../shared/lib/scenePauseTrace.js'

const MIA_INTRO = /(3-intro|boss-intro)-ann$/ // заставка перед «Допросом у Мии» и перед экзаменом

export function applyStagePauses(stages) {
  for (const st of stages ?? []) {
    if (st.type !== 'announce') continue
    const knobs = { ...st.knobs }
    if (MIA_INTRO.test(st.sid ?? '')) { st.ms = pauseMs('mia.intro'); knobs.ms = 'mia.intro' }
    if (st.charge && st.pause != null) { st.pause = pauseMs('plate.hold'); knobs.pause = 'plate.hold' } // плашка этапа с зарядкой бара: старт игры и разворот конвейера
    if (st.lineTail != null) { st.lineTail = pauseMs('phrase.lineTail'); knobs.lineTail = 'phrase.lineTail' }
    if (st.sid === 'boss-ann') knobs.pit1 = 'boss.pit1At' // церемония экзамена: срок первой реплики Пита (mia/raceMia.js)
    if (st.line || st.count) knobs.lead = 'line.at'       // реплика и отсчёт стадии — через line.at после её начала (useRehearsalActs.timingOf)
    if (Object.keys(knobs).length) st.knobs = knobs
  }
  return stages
}

/** Пауза выхода из стадии st, мс. base — что решил директор гонки (useRaceActs.exitMs): число для выхода перед Мией, undefined — обычный конец круга */
export function raceExit(st, base) {
  const info = { sid: st?.sid, from: 'stage-out', until: 'next-stage' }
  if (st?.act === 'phrases') return knobMs('phrase.exit', info)
  return base ?? knobMs('stage.exit', info)
}

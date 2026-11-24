import { endKeep, MIA } from '../mia/raceMia.js'
import { miaGap } from '../mia/miaSpeech.js'

// Сколько держится стадия-конец круга с Мией (директор гонки, useRaceActs.holdMs): Мия договаривает последнюю колкость (st.preWait, useMiaEnter) → потом реплики Мии и Пита и хвост, не дольше st.ms.
// «Допрос» пройден плохо (Пит в коробке): стадию отпускает не таймер, а снятие коробки учеником (useMiaBoxFree.afterCount опрашивает), поэтому здесь — только ожидание Мии + опрос.
// ЭКЗАМЕН (act boss): расчёта по длинам реплик больше нет — стадия держится минимум st.ms, а к итогу её отпускает РЕАЛЬНЫЙ конец речи и ухода Мии (boss/examEndWait.js: useExamEnd).
export function endHoldMs(st, mb, mspeech) {
  const pre = st.preWait ?? 0, GAP_MS = miaGap() // пауза очереди речи — настройка mia.gap
  if (st.act === 'boss') return st.ms // экзамен: было «pre + длины реплик исхода + паузы + 800 мс, но не больше 18 с» (длинная озвучка обрезалась, расчётная пауза оставляла тишину)
  if (endKeep(mb.m, st)) return pre + 600
  return Math.min(st.ms, pre + Math.max(2500, mspeech.msOf('mia_leave') + GAP_MS + Math.max(MIA.BACK2_AT, MIA.BACK_AT) + mspeech.msOf('pit_back_2', 'pit') + 800)) // круг с Мией, все слова верны: «вы победили» + две реплики Пита
}

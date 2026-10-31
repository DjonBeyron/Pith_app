import { QUIET_RISE_MS, countdownPlan } from './rehearsalCountdown.js'

// Конец «последнего сигнала перед пилюлями» на плашке стадии репетиции (мс от начала плашки) — от него конвейер зажигается за CONVEYOR_LEAD_MS (wordLaneConveyorStart.js).
// Сигнал — то, что слышно прямо перед тем, как выедут пилюли: у стадии с отсчётом «после» (разминка) — последняя из трёх нот (реплика Пита раньше), иначе озвученная реплика Пита (дубль: отсчёт ДО реплики,
// «поехали» — последнее). Неозвученная реплика — Пит молчит, сигнала нет (null): конвейер берёт конец плашки. timing — раскладка директора (rehearsalCountdown.stageTiming): { countAt, lineAt }.
/** → мс от начала плашки или null. voiced — реплика озвучена, lineMs — её длина, order — 'before' / 'after' / null (stage.count) */
export function plateCueMs({ order = null, timing, lineMs = 0, voiced = false }) {
  if (order === 'after' && timing.countAt != null) {
    const last = countdownPlan().at(-1)
    return timing.countAt + last.at + last.ms
  }
  if (voiced && timing.lineAt != null) return timing.lineAt + QUIET_RISE_MS + lineMs
  return null
}

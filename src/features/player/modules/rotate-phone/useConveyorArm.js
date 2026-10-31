import { useState, useEffect } from 'react'
import { igniteAtMs, armedLanes } from './wordLaneConveyorStart.js'

// Какие дорожки взведены (строка '101' → WordLanePills → useLaneConveyor). Стадия с пилюлями — её дорожки; на плашке (announce / turn) перед ней таймер зажигания: через igniteAtMs после начала плашки
// взводятся дорожки следующей стадии (за CONVEYOR_LEAD_MS до конца реплики Пита / отсчёта / плашки — wordLaneConveyorStart.js). Время плашки и конец сигнала даёт директор: f.rh.holdMs / f.rh.cueMs
// (обычная нода: holdMs = stage.ms, сигнала нет). Смена или пауза стадии таймер снимает; перерисовка одна на плашку (в момент зажигания), дальше строка не меняется.
export function useConveyorArm(f) {
  const { stage, idx, at, stageObj, stages, rh } = f
  const key = `${idx}:${at}`
  const plate = stage === 'run' && (stageObj?.type === 'announce' || stageObj?.type === 'turn')
  const [ignitedKey, setIgnitedKey] = useState(null)
  useEffect(() => {
    if (!plate) return undefined
    const t = setTimeout(() => setIgnitedKey(key), igniteAtMs({ holdMs: rh.holdMs(stageObj), cueMs: rh.cueMs(stageObj) }))
    return () => clearTimeout(t)
    // rh и stageObj меняются на каждый рендер, а раскладка плашки считается один раз — в момент её старта
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate, key])
  return armedLanes({ stageObj, nextStage: stages[idx + 1] ?? null, ignited: ignitedKey === key })
}

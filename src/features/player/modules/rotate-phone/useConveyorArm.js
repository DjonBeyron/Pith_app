import { useState, useEffect } from 'react'
import { igniteAtMs, armedLanes, actArmedLanes, isActStart } from './wordLaneConveyorStart.js'

// Какие дорожки взведены (строка → WordLanePills → useLaneConveyor). Две схемы (wordLaneConveyorStart.js):
//  • обычная нода: стадия с пилюлями — её дорожки ('1': ехать, пока на дорожке есть пилюли); на плашке (announce / turn) перед ней таймер зажигания: через igniteAtMs после начала плашки
//    взводятся дорожки следующей стадии (за CONVEYOR_LEAD_MS до конца реплики Пита / отсчёта / плашки);
//  • репетиция (rh.on, v3.3.87): акт идёт — дорожки акта ('2': ехать непрерывно) на всех его стадиях, плашках и паузах, Пит говорит или молчит. Таймер зажигания нужен только на первой плашке акта: до него команды нет
//    (дорожки прошлого акта тормозят), после — дорожки всего акта.
// Время плашки и конец сигнала даёт директор: f.rh.holdMs / f.rh.cueMs (обычная нода: holdMs = stage.ms, сигнала нет). Смена или пауза стадии таймер снимает; перерисовка одна на плашку (в момент зажигания).
export function useConveyorArm(f) {
  const { stage, idx, at, stageObj, stages, rh } = f
  const key = `${idx}:${at}`
  const plate = stage === 'run' && (stageObj?.type === 'announce' || stageObj?.type === 'turn')
  const needTimer = plate && (!rh.on || isActStart(stages, idx)) // внутри акта дорожки уже едут — зажигать нечего
  const [ignitedKey, setIgnitedKey] = useState(null)
  useEffect(() => {
    if (!needTimer) return undefined
    const t = setTimeout(() => setIgnitedKey(key), igniteAtMs({ holdMs: rh.holdMs(stageObj), cueMs: rh.cueMs(stageObj) }))
    return () => clearTimeout(t)
    // rh и stageObj меняются на каждый рендер, а раскладка плашки считается один раз — в момент её старта
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needTimer, key])
  const ignited = ignitedKey === key
  if (rh.on) return stage === 'run' ? actArmedLanes({ stages, idx, ignited }) : armedLanes({ stageObj: null })
  return armedLanes({ stageObj, nextStage: stages[idx + 1] ?? null, ignited })
}

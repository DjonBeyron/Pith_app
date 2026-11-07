import { useState, useEffect } from 'react'
import { igniteAtMs, armedLanes, actArmedLanes, raceHoldLanes } from './wordLaneConveyorStart.js'

// Какие дорожки взведены (строка → WordLanePills → useLaneConveyor). Две схемы (wordLaneConveyorStart.js):
//  • обычная нода: стадия с пилюлями — её дорожки ('1': ехать, пока на дорожке есть пилюли); на плашке (announce / turn) перед ней таймер зажигания: через igniteAtMs после начала плашки
//    взводятся дорожки следующей стадии (за CONVEYOR_LEAD_MS до конца реплики Пита / отсчёта / плашки);
//  • репетиция (rh.on, v3.3.101): едут дорожка текущей стадии ('2') и та, где пилюли будут следующими: на плашке (таймер зажигания — на каждой плашке акта) и в паузе после ступени (f.leaving: движок сказал «закончено»,
//    следующая стадия через 1,3 с) она зажигается заранее; прежняя тормозит, когда её пилюли ушли. Непрерывно едет только дорожка, где пилюли идут подряд (wordLaneConveyorStart.actArmedLanes).
// «Встряхни память» (v3.3.129): с первого запуска конвейера до итога к команде дописывается 's' — между этапами дорожки не встают, а едут медленно (wordLaneConveyorStart.raceHoldLanes).
// Время плашки и конец сигнала даёт директор: f.rh.holdMs / f.rh.cueMs (обычная нода: holdMs = stage.ms, сигнала нет). Смена или пауза стадии таймер снимает; перерисовка одна на плашку (в момент зажигания).
export function useConveyorArm(f) {
  const { stage, idx, at, stageObj, stages, rh, leaving } = f
  const key = `${idx}:${at}`
  const plate = stage === 'run' && (stageObj?.type === 'announce' || stageObj?.type === 'turn')
  const needTimer = plate
  const [ignitedKey, setIgnitedKey] = useState(null)
  useEffect(() => {
    if (!needTimer) return undefined
    const t = setTimeout(() => setIgnitedKey(key), igniteAtMs({ holdMs: rh.holdMs(stageObj), cueMs: rh.cueMs(stageObj) }))
    return () => clearTimeout(t)
    // rh и stageObj меняются на каждый рендер, а раскладка плашки считается один раз — в момент её старта
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needTimer, key])
  const ignited = ignitedKey === key
  if (rh.on) return raceHoldLanes({ lanes: stage === 'run' ? actArmedLanes({ stages, idx, ignited, leaving: leaving === idx, nextIdx: rh.nextIdx }) : armedLanes({ stageObj: null }), stages, idx, stage })
  return armedLanes({ stageObj, nextStage: stages[idx + 1] ?? null, ignited })
}

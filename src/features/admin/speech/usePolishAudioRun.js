import { useState, useEffect, useRef, useCallback } from 'react'
import { APP_VERSION } from '../../../shared/lib/version.js'
import { getLastWordLaneDump } from '../../player/modules/rotate-phone/wordLaneLastDump.js'
import { readSelectedPreset, writeSelectedPreset, applySelected, currentPresetId } from '../../rehearsal/polish/audioPresets.js'
import { beginRun, runPresetId, markPlaying, finishStep, abortStep } from '../../rehearsal/polish/audioRun.js'
import { makeRunRecord, addRun, listRuns, clearRuns, runsFile } from '../../rehearsal/polish/audioRunLog.js'

// «Режим звука» и «Прогон по режимам» в «Шлифовке репетиции»: выбранный пресет (A…H, audioPresets.js), состояние прогона (audioRun.js) и копилка журналов (audioRunLog.js).
//  • beforeLaunch(act) — в том же тапе, до start() игры: применяет выбранный пресет (три настройки + строка «[audio-mode]» в журнал плеера) и запоминает запуск.
//  • Выход из игры (status.phase 'game' → другая) — запись запуска в копилку (журнал игры из getLastWordLaneDump) и, если идёт прогон, переход к следующему режиму: он выбирается, но игра сама не стартует (нужен жест).
//  • Игра не открылась (микрофон не дали) — шаг прогона остаётся прежним. status — { phase, busy, problem } от RotatePhoneModule (onStatus).
export default function usePolishAudioRun({ status, store = globalThis.localStorage }) {
  const [selected, setSelected] = useState(() => readSelectedPreset(store))
  const [run, setRunState] = useState(null)               // { act, step, state } или null
  const [count, setCount] = useState(() => listRuns(store).length)
  const runRef = useRef(null)
  const launchRef = useRef(null)                           // запуск, который сейчас идёт: { act, presetId, step, startedAt }
  const prevPhase = useRef('wait')
  const setRun = useCallback(r => { runRef.current = r; setRunState(r) }, [])

  const select = useCallback(id => { writeSelectedPreset(id, store); setSelected(readSelectedPreset(store)) }, [store])

  const beforeLaunch = useCallback(act => {
    const r = runRef.current
    const inRun = !!r && r.act === act && r.state === 'ready'
    if (inRun) writeSelectedPreset(runPresetId(r), store) // в прогоне режим шага главнее выбора в списке
    const { id } = applySelected({ store })
    launchRef.current = { act, presetId: id, step: inRun ? r.step + 1 : null, startedAt: Date.now() }
    if (inRun) { setRun(markPlaying(r)); setSelected(id) }
    return id
  }, [store, setRun])

  /** Начать прогон: режим A выбирается сразу; сам запуск игры — в том же тапе (блок зовёт beforeLaunch и start) */
  const startRun = useCallback(act => { setRun(beginRun(act)); select(runPresetId(beginRun(act))) }, [setRun, select])
  const stopRun = useCallback(() => setRun(null), [setRun])

  useEffect(() => {
    const was = prevPhase.current
    prevPhase.current = status.phase
    const l = launchRef.current
    if (!l) return
    if (was === 'game' && status.phase !== 'game') {
      launchRef.current = null
      const rec = makeRunRecord({ act: l.act, presetId: l.presetId, step: l.step, startedAt: l.startedAt, endedAt: Date.now(), dump: getLastWordLaneDump(), version: APP_VERSION, store })
      setCount(addRun(rec, store).count)
      const next = finishStep(runRef.current)
      setRun(next)
      if (next && next.state === 'ready') select(runPresetId(next))
    } else if (status.phase === 'wait' && !status.busy && status.problem && was !== 'game') {
      launchRef.current = null
      setRun(abortStep(runRef.current))
    }
  }, [status, store, setRun, select])

  return {
    selected, select, run, count, startRun, stopRun, beforeLaunch,
    now: currentPresetId(store),                           // какому пресету соответствуют настройки сейчас (custom — меняли вручную)
    runsFile: () => runsFile(listRuns(store), { version: APP_VERSION }),
    clear: () => { clearRuns(store); setCount(0) },
  }
}

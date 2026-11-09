import { useState, useMemo, useCallback } from 'react'
import { usePlayerDebugUi } from '../../shared/lib/usePlayerDebugUi.js'
import { debugEnabled } from '../player/modules/rotate-phone/wordLaneDebug.js'
import { pLog } from '../../shared/lib/debug.js'
import { buildRaceStages } from './raceStages.js'
import { ROUND_PLATES } from './raceStagesPhrases.js'
import { startEntries, readStartStage, writeStartStage, withStart } from './raceStartStage.js'

// «Начать с этапа» на плашке «Голосом / Пальцами» (RaceAskPlate.jsx) — только при отладке: тумблер «Отладочный интерфейс» (usePlayerDebugUi) или pithy_wl_debug_v1 = '1' (wordLaneDebug.debugEnabled); иначе start — null и плашка ничего не рисует.
// Пункты — из стадий полной гонки этого плана (raceStartStage.startEntries; круг 2 фраз — «Скажи / Узнай»), выбор помнит localStorage pithy_race_start_stage_v1. arm() — в обработчике кнопки режима: этап выбран — строка журнала
// «[start] старт с этапа «…» (отладка, admin)» и cfg игры с plan.startAt / debugStart (raceStartStage.withStart); с начала — null.

/** Пункты «Начать с» для плана гонки: [{ sid, label }] (без «с начала») */
export function startOptions(plan) {
  if (plan?.game !== 'race') return []
  const { stages, recipe } = buildRaceStages({ plan: { ...plan, startAt: undefined }, tap: false, ru: true }) // голосом и с русской моделью — самый полный список (пальцами те же плашки, кроме переключения слуха)
  return startEntries(stages, recipe.acts, { 'phrases2-ann': ROUND_PLATES.hear.title })
}

/** Конфиг игры со стартом с этапа entry (или тот же cfg) */
export const cfgWithStart = (cfg, entry) => (entry && cfg?.plan ? { ...cfg, plan: withStart(cfg.plan, entry) } : cfg)

export default function useRaceStartStage(plan, store = globalThis.localStorage) {
  const toggle = usePlayerDebugUi()
  const on = plan?.game === 'race' && debugEnabled({ toggle, store })
  const [sid, setSid] = useState(() => readStartStage(store))
  const options = useMemo(() => (on ? startOptions(plan) : null), [on, plan])
  const entry = options?.find(o => o.sid === sid) ?? null // запомненного этапа у этого плана нет — с начала
  const onChange = useCallback(v => { writeStartStage(v, store); setSid(v) }, [store])
  const arm = useCallback(() => {
    if (entry) pLog(`[start] старт с этапа «${entry.label}» (отладка, admin)`)
    return entry
  }, [entry])
  return { start: options ? { options, value: entry?.sid ?? '', onChange } : null, arm }
}

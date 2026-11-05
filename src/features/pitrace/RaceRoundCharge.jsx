import { useState } from 'react'
import { getVoiceRate } from '../player/lessonVolume.js'
import { roundPlan } from './raceRound.js'
import ChargeRun from './RaceChargeRun.jsx'

// Зарядка бара посреди игры (CONCEPT_RACE.md, «Бар живёт весь разгон»; план — raceRound.js): перед вторым кругом слова круга снова летят в бар, пока Пит говорит race_sprint_round2 (плашки нет), а на объявлении этапа 2 слова этапа 2
// заряжают бар и он морфится в плашку этапа (как в начале игры). Показ — RaceChargeRun.jsx. Монтируется на время стадии-объявления (ключ — стадия и её отметка времени, перезапуск стадии начинает показ заново); нет зарядки у стадии — ничего.
function Run({ plan, stages, i, lines }) {
  const [view] = useState(() => roundPlan({ plan, stages, i, lines, rate: getVoiceRate() }))
  return view ? <ChargeRun view={view} plate={view.kind === 'stage'} /> : null
}

export default function RaceRoundCharge({ plan, stages, i, at, lines = null }) {
  return <Run key={`${stages?.[i]?.sid}:${at}`} plan={plan} stages={stages} i={i} lines={lines} />
}

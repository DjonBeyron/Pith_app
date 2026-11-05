import { useEffect, useState } from 'react'
import { getVoiceRate } from '../player/lessonVolume.js'
import { buildRaceActs } from './raceRecipe.js'
import { openingPlan } from './raceOpening.js'
import { chargePlan } from './raceCharge.js'
import { openingWords } from './raceBar.js'
import ChargeRun from './RaceChargeRun.jsx'

// Заставка-«зарядка» памятью (CONCEPT_RACE.md, «Заставка»; план — raceCharge.js, расписание открытия — raceOpening.js, стили — race-charge.css). Пока Пит говорит race_start и реплику первого этапа, дорожек не видно (data-charge на корне игры,
// его ставит WordLaneGame), а снизу вверх летят пилюли со словами памяти (цвет — ступень слова, лёгкая синусоида по x) и микро-частицы; сверху бар: каждая долетевшая пилюля добавляет свой сегмент своего цвета. Пилюля прилетает ЦЕНТРОМ в центр бара
// и заходит ПОД бар: слой пилюль ниже бара и обрезан по его линии, пилюля уходит под него и гаснет.
// БАР: тонкая подложка постоянной высоты с border-radius 999px — высота не анимируется, скругления круглые всегда. «Толщину» набирает слой-ореол за баром (тот же радиус): transform: scaleY от центра, ступенька за пилюлю (haloKeys).
// ИМПАКТ касания (только transform / opacity): вспышка сегмента цветом слова (CSS, opacity 0,9 → 0 за 300 мс), кольцо-рябь от точки касания (один узел на бар, scale 0,6 → 1,6, 350 мс) и лёгкий толчок всего бара translateY(2px) и обратно;
// на каждое касание — тихий «тык» (raceChargeTap.js; звук играет и на слабом устройстве, и при reduced-motion).
// БАР → ПЛАШКА: когда последнее слово долетело (openingPlan.morphAt, за ~600 мс до конца речи Пита), бар САМ превращается в плашку этапа «Разгон + задание» (RaceChargePlate: clip-path от прямоугольника бара до плашки,
// проявляются название и задание, узор плашки); плашка держится ~1,2 с после речи, затем заставка уходит (plateEnd). Отдельной плашки у первого этапа нет. Полёт — Web Animations (transform / opacity), на слабом устройстве (lite)
// частиц и шлейфа нет (шлейф — «размытие движения» без filter: один хвост-градиент, растяжение; raceCharge.js, data-trail), при reduced-motion пилюли не летят — бар заполняется ступеньками. Снаружи компонент монтирует и размонтирует RaceActs: on — заставка идёт; после on = false заставка доживает FADE_MS.
// v3.3.115: слова заставки — слова ПЕРВОГО круга (по сегменту на слово), бар потом не исчезает, а расходуется по пилюле (RaceBar.jsx, raceBar.js). Показ одной заставки и её полёт — RaceChargeRun.jsx; здесь расписание начала игры и фаза «идёт / уходит».
const FADE_MS = 700

function Opening({ plan, lines, leaving }) {
  const [view] = useState(() => {
    const o = openingPlan(plan, lines, getVoiceRate()), a = buildRaceActs(plan).acts
    return { o, round: { title: a[0]?.title ?? '', task: a[0]?.task ?? '' }, ...chargePlan(plan, o.morphAt, openingWords(a)) } // слова летят до morphAt: к этому моменту бар заполнен
  })
  return <ChargeRun view={view} leaving={leaving} plate />
}

export default function RaceCharge({ plan, lines = null, on }) {
  const [st, setSt] = useState({ on, seq: on ? 1 : 0, gone: 0 }) // seq — номер показа заставки (перезапуск игры — новый показ); gone — показ, который уже растворился
  if (on !== st.on) setSt({ ...st, on, seq: on ? st.seq + 1 : st.seq })
  useEffect(() => {
    if (on || !st.seq) return undefined
    const id = setTimeout(() => setSt(s => ({ ...s, gone: s.seq })), FADE_MS)
    return () => clearTimeout(id)
  }, [on, st.seq])
  if (!st.seq || (!on && st.gone === st.seq)) return null
  return <Opening key={st.seq} plan={plan} lines={lines} leaving={!on} />
}

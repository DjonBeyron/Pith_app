import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { examOf } from './bossMia.js'
import { lootState, lootKey, lootScore, lootTalk, lootReset } from './bossLootFlow.js'

// Экзамен «Шкала памяти», правила «трофеи на кону» (bossTrophies.js). Счётчиков два, оба слева сверху (владелец 2026-11-25): сверху — счётчик игрока (обычный .wlXp, WordLaneXp: в него идут трофеи
// верно названного слова), под ним — этот, счётчик Мии, жёлтый («Мия N» — сколько трофеев она забрала).
// Трофеи Мии начисляются В СТИЛЕ ИГРОКА (владелец 2026-11-26): над головой Мии появляется жёлтая пилюля «+N XP», уменьшается и летит к её счётчику; счётчик «распухает» теми же кадрами, что счётчик
// игрока, и число меняется, когда пилюля долетела (кадры — bossLoot.js, ход — bossLootFlow.js). Момент: слово потеряно (ошибка / молчание) — с РЕАЛЬНЫМ началом колкости Мии про трофеи (talk —
// реплика, которую она говорит сейчас, useExamSpeech.miaTalk); верный ответ в жёлтой / красной зоне (часть трофеев уходит Мии, реплики про это нет) — сразу. Слабое устройство — так же, как взлёт
// пилюли у игрока (одна анимация на композиторе); «меньше движения» или головы Мии нет на экране — без пилюли: число меняется и счётчик «распухает». В покое у слоя нет ни одной анимации, таймера
// и наблюдателя. m — состояние машины Мии (счёт экзамена — bossMia.examOf), on — экзамен идёт.
const noMotion = () => { try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches } catch { return true } }

export default function RaceBossLoot({ m, on, talk = null }) {
  const host = useRef(null), chip = useRef(null), num = useRef(null), fly = useRef(null), st = useRef(null)
  const [still] = useState(noMotion)
  const show = on && m?.act === 'boss' && m.phase === 'in' && m.total > 0 // Мия ушла с коробкой (phase out) — её счётчик гаснет вместе с ней
  const lost = examOf(m).lost, dug = Object.keys(m?.dug ?? {}).length, missKey = lootKey(talk)
  useLayoutEffect(() => { // число пишет React (lost); пока трофеи ждут колкости или летят, ход до отрисовки возвращает на счётчик прежнее число
    const s = (st.current ??= lootState())
    s.still = still; s.els = { root: host.current, chip: chip.current, num: num.current, fly: fly.current }
    lootScore(s, { show, lost, dug, missKey })
  }, [lost, show, dug]) // eslint-disable-line react-hooks/exhaustive-deps -- начало реплики ведёт эффект ниже
  useEffect(() => { if (st.current) lootTalk(st.current, missKey) }, [missKey])
  useEffect(() => () => { if (st.current) lootReset(st.current) }, [])
  return (
    <div ref={host} className="wlLoot" data-on={show || undefined} aria-hidden="true" data-testid="race-boss-loot">
      <div ref={chip} className="wlLootChip" data-who="mia">Мия <b ref={num} data-testid="race-loot-mia">{lost}</b></div>
      {show && <i ref={fly} className="wlLootFly" data-testid="race-loot-fly" />}
    </div>
  )
}

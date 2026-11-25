import { useEffect, useRef, useState } from 'react'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'
import { examOf } from './bossMia.js'
import { lootFlight, LOOT_FLY_MS, LOOT_BUMP_MS } from './bossLoot.js'

// Экзамен «Шкала памяти», правила «трофеи на кону» (bossTrophies.js). Счётчиков два, оба слева сверху (владелец 2026-11-25): сверху — счётчик игрока (обычный .wlXp прежнего вида и цвета,
// WordLaneXp: в него идут трофеи верно названного слова), под ним — этот, счётчик Мии, жёлтый («Мия N» — сколько трофеев она забрала). Прежний счётчик «Твои N · у Мии M» внизу на коробке убран.
// Слово названо неверно или не названо — потерянные трофеи ВИДНО переходят к Мии: «+N» выплывает от счётчика игрока к числу Мии, число вздрагивает (всё вместе ≤ 700 мс, bossLoot.LOOT_TOTAL_MS).
// Слабое устройство (deviceTier, lite-режим) и «меньше движения»: без плывущего «+N» — число меняется и вздрагивает. Анимации разовые (Web Animations, конечные): в покое у слоя нет ни одной
// анимации, таймера и наблюдателя. m — состояние машины Мии (счёт экзамена — bossMia.examOf), on — экзамен идёт.
const still = () => { try { return isWeakDevice() || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches } catch { return true } }

export default function RaceBossLoot({ m, on }) {
  const host = useRef(null), miaEl = useRef(null), fly = useRef(null), seen = useRef(null)
  const [lite] = useState(still)
  const show = on && m?.act === 'boss' && m.phase === 'in' && m.total > 0 // Мия ушла с коробкой (phase out) — её счётчик гаснет вместе с ней
  const lost = examOf(m).lost
  useEffect(() => {
    const was = seen.current; seen.current = show ? lost : null
    if (!show || was == null || lost <= was) return // первый показ и сброс счёта (новый блок считает дальше, новая игра — с нуля) — без анимации
    const root = host.current, target = miaEl.current, el = fly.current
    if (!root || !target?.animate) return
    target.animate([{ scale: 1 }, { scale: 1.3, offset: 0.4 }, { scale: 1 }], { duration: LOOT_BUMP_MS, delay: lite ? 0 : LOOT_FLY_MS, easing: 'ease-out' }) // число Мии вздрагивает, когда «+N» доплыло
    if (lite || !el) return
    const r = root.getBoundingClientRect(), t = target.getBoundingClientRect(), x = root.parentElement?.querySelector('.wlXp--on')?.getBoundingClientRect()
    const { from, to } = lootFlight({ xp: x ? { right: x.right - r.left, cy: x.top - r.top + x.height / 2 } : null, tx: t.left - r.left + t.width / 2, ty: t.top - r.top + t.height / 2 })
    el.textContent = `+${lost - was}`
    el.animate([{ transform: `translate(${from[0]}px, ${from[1]}px) scale(1.15)`, opacity: 0 }, { transform: `translate(${from[0]}px, ${from[1]}px) scale(1.15)`, opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.85 }, { transform: `translate(${to[0]}px, ${to[1]}px) scale(0.7)`, opacity: 0 }],
      { duration: LOOT_FLY_MS, easing: 'cubic-bezier(0.4, 0, 0.7, 1)' })
  }, [lost, show, lite])
  return (
    <div ref={host} className="wlLoot" data-on={show || undefined} aria-hidden="true" data-testid="race-boss-loot">
      <div className="wlLootChip" data-who="mia">Мия <b ref={miaEl} data-testid="race-loot-mia">{lost}</b></div>
      {show && !lite && <i ref={fly} className="wlLootFly" />}
    </div>
  )
}

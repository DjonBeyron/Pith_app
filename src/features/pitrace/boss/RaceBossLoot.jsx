import { useEffect, useRef, useState } from 'react'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'
import { examOf } from './bossMia.js'
import { lootFlight, LOOT_FLY_MS, LOOT_STEP_MS, LOOT_BUMP_MS } from './bossLoot.js'

// Экзамен «Шкала памяти», правила «трофеи на кону» (bossTrophies.js): компактный счётчик «Твои N · у Мии M» внизу слева, на коробке, где сидит Мия (шкалу справа, пилюлю по центру и
// треугольники не закрывает: пилюля у низа экрана и так уезжает за коробку). Потерянные трофеи слова ВИДНО улетают к Мии: от шкалы (с высоты линии слова) к её числу летит «+N» и две точки,
// число «у Мии» вздрагивает. Слабое устройство (deviceTier, lite-режим) и «меньше движения»: без летящих частиц — только число вздрагивает и рядом на миг «+N».
// Анимации разовые (Web Animations, конечные): в покое у счётчика нет ни одной анимации, таймера и наблюдателя. m — состояние машины Мии (счёт экзамена — bossMia.examOf), on — экзамен идёт.
const still = () => { try { return isWeakDevice() || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches } catch { return true } }

export default function RaceBossLoot({ m, on }) {
  const host = useRef(null), miaEl = useRef(null), fly = useRef([]), seen = useRef(null)
  const [lite] = useState(still)
  const ex = examOf(m), show = on && m?.act === 'boss' && m.phase === 'in' && m.total > 0 // Мия ушла с коробкой (phase out) — счётчик гаснет вместе с ней
  const lost = ex.lost
  useEffect(() => {
    const was = seen.current; seen.current = show ? lost : null
    if (!show || was == null || lost <= was) return // первый показ и сброс счёта (новый блок считает дальше, новая игра — с нуля) — без полёта
    const root = host.current, target = miaEl.current
    if (!root || !target?.animate) return
    target.animate([{ scale: 1 }, { scale: 1.22, offset: 0.4 }, { scale: 1 }], { duration: LOOT_BUMP_MS, delay: lite ? 0 : LOOT_FLY_MS, easing: 'ease-out' }) // число «у Мии» вздрагивает, когда трофеи долетели
    const r = root.getBoundingClientRect(), t = target.getBoundingClientRect(), line = root.parentElement?.querySelector('.wlBossLine:not([data-demo])')?.getBoundingClientRect()
    const path = lootFlight({ w: r.width, h: r.height, lineY: line ? line.top - r.top : null, tx: t.left - r.left + t.width / 2, ty: t.top - r.top + t.height / 2 })
    fly.current.slice(0, lite ? 1 : 3).forEach((el, i) => {
      if (!el) return
      if (i === 0) el.textContent = `+${lost - was}`
      const from = lite ? [path.tx + 34, path.ty - 4] : path.from, to = lite ? [path.tx + 34, path.ty - 22] : [path.tx, path.ty]
      el.animate([{ transform: `translate(${from[0]}px, ${from[1]}px) scale(1)`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.88 }, { transform: `translate(${to[0]}px, ${to[1]}px) scale(${lite ? 1 : 0.6})`, opacity: 0 }],
        { duration: lite ? LOOT_BUMP_MS * 2 : LOOT_FLY_MS, delay: i * LOOT_STEP_MS, easing: 'cubic-bezier(0.4, 0, 0.7, 1)' })
    })
  }, [lost, show, lite])
  return (
    <div ref={host} className="wlLoot" data-on={show || undefined} aria-hidden="true" data-testid="race-boss-loot">
      <div className="wlLootChip">
        <span data-who="me">Твои <b data-testid="race-loot-me">{ex.got}</b></span>
        <span data-who="mia">у Мии <b ref={miaEl} data-testid="race-loot-mia">{ex.lost}</b></span>
      </div>
      {show && [0, 1, 2].slice(0, lite ? 1 : 3).map(i => <i key={i} ref={e => { fly.current[i] = e }} className="wlLootFly" data-dot={i > 0 || undefined} />)}
    </div>
  )
}

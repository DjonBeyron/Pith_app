import { useEffect, useRef } from 'react'
import { startScaleDrive } from './bossScaleDrive.js'
import { ZONES, EDGES, TICKS, spanOf, demoSync } from './bossScale.js'

// Шкала финала «Шкала памяти» поверх сцены игры (.wlStage; владелец 2026-11-15): справа вертикальная линейка с рисками цвета зоны и тусклым полупрозрачным фоном зон (зелёная 45 %, жёлтая 35 %, красная 20 % длины), без цифр.
// Линейка идёт от верха ленты (под кнопками паузы и админа) до низа с отступом под скругление экрана. Через все дорожки идёт тонкая горизонтальная линия — от «ствола» линейки поверх рисок, к левому краю утончается от края
// пилюли: она появляется в миг, когда нижний край пилюли касается верха линейки (плавно проявляясь на зелёной зоне), дальше идёт за этим краем и мгновенно меняет цвет в зоне другого цвета; у нижней отметки быстро растворяется
// и для этой пилюли больше не появляется. Ответ принят — пилюля улетает вверх, а линия уходит слева направо с той же скоростью (CSS wlBossLineOut), зона слова уходит в onZone('fast' | 'mid' | 'slow'). У каждого слова свой фиолетовый
// треугольник-маркер (острием вправо, остриё на «стволе» линейки, глубоко в ней): он идёт за линией своего слова вниз и замирает на месте ответа; живых не больше двух — когда выходит третье слово, самый старый плавно гаснет. Пилюля, которую толкает линия, красится в цвет зоны
// (data-bz, переход плавный). На церемонии Мия объясняет шкалу: flash — зона мигает на её слова о зонах; demo = { key, plan } — пример-пилюля со словом идёт по линейке по плану (bossScale.demoPlan: путь по длительности реплик, без пауз
// у Мии, скорость меняется плавно), цвет плавно по зонам, линия идёт за ней; конвейер идёт как в круге финала. Рисует по кадрам (rAF). live = false — ничего не рисует.
export default function RaceBossScale({ live, show = true, flash = null, demo = null, paused = false, onZone = null }) {
  const host = useRef(null), box = useRef(null), line = useRef(null), pillEl = useRef(null), dLine = useRef(null), marks = useRef([]), clock = useRef({ paused, onZone, demo })
  useEffect(() => { clock.current.paused = paused; clock.current.onZone = onZone }, [paused, onZone])
  const demoKey = demo?.key ?? null
  useEffect(() => { clock.current.demo = demo ? { plan: demo.plan, t: 0 } : null }, [demoKey]) // eslint-disable-line react-hooks/exhaustive-deps -- пример стартует с новой отметкой
  const markN = demo?.mark?.n ?? null
  useEffect(() => { const d = clock.current.demo; if (d && demo?.mark) d.t = demoSync(d.plan, demo.mark.k, d.t) }, [markN]) // eslint-disable-line react-hooks/exhaustive-deps -- следующая реплика объяснения РЕАЛЬНО началась: часы примера сверяются с началом её звука (озвучка другой длины пример не рассинхронит)
  useEffect(() => {
    if (!live) return undefined
    const stage = host.current?.parentElement, field = stage?.querySelector('.wlField')
    if (!stage || !field) return undefined
    return startScaleDrive({ stage, field, box, line, pillEl, dLine, marks, clock }) // кадры шкалы — bossScaleDrive.js
  }, [live])

  const fl = flash ? { top: EDGES[ZONES.findIndex(z => z.id === flash.zone)] * 100, h: spanOf(flash.zone) * 100 } : null
  return (
    <div ref={host} className="wlBoss" data-live={live || undefined} data-show={(live && show) || undefined} aria-hidden="true" data-testid="race-boss-scale">
      {live && (
        <div ref={box} className="wlBossBox">
          {ZONES.map((z, i) => <i key={`${z.id}${flash?.zone === z.id ? flash.key : ''}`} className="wlBossZone" data-zone={z.id} data-flash={flash?.zone === z.id || undefined} style={{ top: `${EDGES[i] * 100}%`, height: `${spanOf(z.id) * 100}%`, '--flash-ms': `${flash?.ms ?? 2000}ms` }} />)}
          {TICKS.map(t => <b key={t.p} className="wlBossTick" data-zone={t.zone} data-major={t.major || undefined} data-border={t.border || undefined} style={{ top: `${t.p * 100}%` }} />)}
          {fl && <i key={flash.key} className="wlBossFlash" data-zone={flash.zone} style={{ top: `${fl.top}%`, height: `${fl.h}%`, '--flash-ms': `${flash.ms}ms` }} data-testid="race-boss-flash" />}
          {demo && (
            <>
              <i key={`p${demo.key}`} ref={pillEl} className="wlBossDemo" data-testid="race-boss-demo" />
              <i key={`l${demo.key}`} ref={dLine} className="wlBossLine" data-demo="" style={{ opacity: 0 }} />
            </>
          )}
          {[0, 1, 2].map(k => <i key={k} ref={e => { marks.current[k] = e }} className="wlBossMark" style={{ opacity: 0 }} data-testid="race-boss-mark" />)}
          <div ref={line} className="wlBossLine" data-zone="fast" style={{ opacity: 0 }} />
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { jumpOf, heroFrames, laneOf, xOf } from './raceClimbCam.js'
import { capText, outWord, capLeft, capVars } from './raceCapsule.js'

// Герой «Вершины» — горизонтальная капсула (стиль пилюли, нейтральный светлый цвет), в которой растёт фраза: на земле она пустая и узкая, взял ступень — новое слово влетает и капсула удлиняется (raceCapsule.js: не шире 86 % экрана,
// шрифт мельчает по длине), соскочил — последнее слово вылетает обратно на остров, капсула укорачивается; на вершине капсула — вся фраза (золотая, см. race-climb.css). Герой всегда в одной точке экрана по вертикали (мир с островами
// съезжает под ним, см. RaceClimb.jsx). Вся анимация прыжка — Web Animations API (raceClimbCam.heroFrames): внешний элемент переносит героя на дорожку нового острова (left, капсула прижата к краям экрана), внутренний рисует дугу,
// сальто 360° (вытянутая форма крутится целиком) и приседание (transform). Прыжок запускается, когда меняется seq состояния лестницы (взял ступень, соскользнул, дрожь); при монтировании ничего не играет (показывается текущее
// состояние), на 'time' (время вышло) тоже. Влёт и вылет слова — CSS-анимации (race-climb.css). lite — слабое устройство или reduced-motion: перенос с затуханием, без дуги, сальто и влёта слова — просто смена текста.
export default function RaceHero({ words = [], rung, from, seq, last, lite, delay = 0 }) {
  const move = useRef(null)
  const arc = useRef(null)
  const seen = useRef(seq) // прыжок, который был до монтирования, не повторяется
  const text = capText(words, rung)
  const len = text.length
  useEffect(() => {
    if (seen.current === seq) return undefined
    seen.current = seq
    const outer = move.current, inner = arc.current
    if (!outer?.animate || !inner?.animate || last === 'time') return undefined
    const f = heroFrames({ ...jumpOf(from, rung), fromLeft: capLeft(xOf(from)), toLeft: capLeft(xOf(rung)) }, lite)
    const a = outer.animate(f.move, { ...f.options.move, delay }), b = inner.animate(f.arc, { ...f.options.arc, delay }) // delay — ловушка сначала осыпается, потом герой съезжает
    return () => { a.cancel(); b.cancel() }
  }, [seq, from, rung, last, lite, delay])
  const flying = !lite && seq > 0 && last === 'hit' && rung > 0 // новое слово влетает; в lite и без прыжка — просто текст
  const head = flying ? words.slice(0, rung - 1).join(' ') : text
  const out = !lite && seq > 0 && last === 'slip' ? outWord(words, from, rung) : ''
  return (
    <div ref={move} className="raceHero" data-lane={laneOf(rung)} style={{ left: capLeft(xOf(rung)), ...capVars(len) }} data-testid="race-climber">
      <div ref={arc} className="raceHeroIn">
        <div className="raceCap" data-empty={!text || undefined} data-testid="race-cap">
          <span className="raceCapText">
            {head}{flying && head ? ' ' : ''}{flying && <span key={seq} className="raceCapIn" data-testid="race-cap-in">{words[rung - 1]}</span>}
            {out && <span key={seq} className="raceCapOut" data-testid="race-cap-out">{out}</span>}
          </span>
        </div>
      </div>
    </div>
  )
}

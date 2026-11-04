import { useState } from 'react'
import { plateLite } from '../player/modules/rotate-phone/wordLanePlateExit.js'
import RaceHero from './RaceHero.jsx'
import RaceClimbBar from './RaceClimbBar.jsx'
import { laneOf, xOf, worldShift, GAP_DVH, HERO_BOTTOM_DVH } from './raceClimbCam.js'

// Подъём раунда «Вершина» (CONCEPT_RACE.md, стили — styles/player/modules/race-climb.css): рисуется поверх .wlStage, пилюли движка в этом раунде скрыты CSS (.wl[data-act='climb']), слушание и зачёт берёт движок, а острова
// только показывают состояние гонки (race.climb, raceLadder.js) — состояние ведёт директор useRaceActs. Геометрия — raceClimbCam.js.
//  • N островков-пилюль зигзагом по дорожкам: ступень k на дорожке (k − 1) mod 3, цвет островка — цвет дорожки, на нём номер; подпись слова СКРЫТА и загорается зелёной на островке, когда ступень взята (lit);
//  • камера за героем: герой (RaceHero) всегда в одной точке экрана, «мир» (.raceWorld) съезжает вниз на rung · GAP под ним (transform, 600 мс ease-out); расстояние между островками ≈ 45 % высоты экрана;
//  • сверху общий таймер подъёма (RaceClimbBar): 12 с + 5 с за ступень; время вышло (timeUp) — подъём застывает на текущем островке, надпись «Время вышло»;
//  • 3-й промах ступени — её подпись мигает один раз (blink, blinkK); на вершине (top) все острова и фраза горят золотом, золотая плашка (rehearsal-gold.css).
// words — слова фразы по порядку (climbWords); phrase — вся фраза; final — стадия вершины (climb-top): плашка и горящая фраза; timeUp — стадия climb-time (время вышло).
export default function RaceClimb({ climb, words, phrase, final = false, timeUp = false }) {
  const [lite] = useState(plateLite) // слабое устройство или reduced-motion: без дуги и сальто, плашка без блеска
  const n = words.length
  const c = climb ?? { rung: 0, from: 0, attempts: 0, lit: [], last: null, seq: 0, blink: 0, blinkK: 0, top: false, t0: null, wins: 0, timedOut: false }
  const top = final || c.top
  const ks = Array.from({ length: n + 1 }, (_, k) => k) // 0 — земля (старт), 1…n — острова
  return (
    <div className="raceClimb" data-testid="race-climb" data-top={top || undefined} data-time-up={timeUp || c.timedOut || undefined} data-last={c.last ?? undefined} style={{ '--n': n, '--rung': c.rung, '--hb': HERO_BOTTOM_DVH, '--gap': GAP_DVH }}>
      <RaceClimbBar climb={climb} />
      <div className="raceWorld" style={{ '--cam': worldShift(c.rung) }} data-testid="race-world">
        {ks.map(k => {
          const lit = k > 0 && (top || !!c.lit[k - 1])
          return (
            <div key={k} className="raceIsland" style={{ '--k': k, left: `${(xOf(k) * 100).toFixed(2)}%` }} data-lane={laneOf(k)} data-ground={k === 0 || undefined} data-lit={lit || undefined} data-here={k === c.rung ? '1' : undefined} data-target={!top && k === c.rung + 1 ? '1' : undefined} data-testid={`race-step-${k}`}>
              {k === n && <span className="raceSummit" data-testid="race-summit">вершина</span>}
              <span className="raceIslandNo">{k > 0 ? k : ''}</span>
              <span className="raceIslandWord" data-testid={`race-word-${k}`}>{k === 0 ? 'старт' : lit ? words[k - 1] : ''}</span>
              {k > 0 && c.blink > 0 && c.blinkK === k && !lit && <span key={c.blink} className="raceIslandWord raceIslandWord--blink" data-testid="race-blink">{words[k - 1]}</span>}
            </div>
          )
        })}
      </div>
      <RaceHero rung={c.rung} from={c.from ?? 0} seq={c.seq} last={c.last} lite={lite} />
      {(timeUp || c.timedOut) && <p className="raceTimeUp" data-testid="race-time-up">Время вышло</p>}
      {final && <p className={`rhNote wlTurn rhNote--gold raceTopPlate${lite ? ' wlTurn--lite' : ''}`} data-testid="race-top-plate">{phrase}</p>}
    </div>
  )
}

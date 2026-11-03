import { useState } from 'react'
import { plateLite } from '../player/modules/rotate-phone/wordLanePlateExit.js'

// Лестница раунда «Вершина» (CONCEPT_RACE.md, стили — styles/player/modules/race-climb.css): рисуется поверх .wlStage, пилюли движка в этом раунде скрыты CSS (.wl[data-act='climb']), слушание и зачёт берёт движок, а лестница
// только показывает состояние гонки (race.climb, raceLadder.js) — состояние ведёт директор useRaceActs.
//  • N ступеней снизу вверх по центру; на каждой видна только цифра, подпись слова СКРЫТА и проявляется (зелёная), когда ступень взята (lit); сверху плашка «вершина»;
//  • альпинист — пилюля цвета дорожки (data-lane): стоит на ступени rung, прыгает вверх с ударом (вспышка ступени), на промахе соскальзывает вниз и дрожит (data-last); «камера» — вся лестница сдвигается вниз на ступень (--cam = rung − 1), чтобы альпинист оставался во втором ряду снизу, в нижней трети экрана;
//  • полоска времени на ступени-цели: молчание ≈ 4 с (то же «не успел» движка), перезапускается с каждым заходом (key — номер захода);
//  • 3-й промах ступени — её подпись мигает один раз (blink, blinkK); на вершине (top) вся лестница и фраза горят, золотая плашка «Вершина» (стиль rehearsal-gold.css).
// words — слова фразы по порядку (climbWords); phrase — вся фраза; final — стадия вершины (climb-top): плашка и горящая фраза.
export default function RaceClimb({ climb, words, phrase, final = false }) {
  const [lite] = useState(plateLite) // слабое устройство или reduced-motion: плашка без блеска
  const n = words.length
  const c = climb ?? { rung: 0, attempts: 0, lit: [], last: null, seq: 0, blink: 0, blinkK: 0, top: false }
  const top = final || c.top
  const target = c.rung + 1
  return (
    <div className="raceClimb" data-testid="race-climb" data-top={top || undefined} data-last={c.last ?? undefined} style={{ '--n': n, '--rung': c.rung, '--cam': Math.max(0, c.rung - 1) }}>
      <div className="raceBox">
        <div className="raceSummit" data-testid="race-summit">вершина</div>
        {words.map((w, i) => {
          const k = i + 1
          const lit = top || !!c.lit[i]
          return (
            <div key={k} className="raceStep" style={{ '--i': k }} data-lit={lit || undefined} data-target={!top && k === target ? '1' : undefined} data-here={k === c.rung ? '1' : undefined} data-testid={`race-step-${k}`}>
              <span className="raceStepNo">{k}</span>
              <span className="raceStepWord" data-testid={`race-word-${k}`}>{lit ? w : ''}</span>
              {c.blink > 0 && c.blinkK === k && !lit && <span key={c.blink} className="raceStepWord raceStepWord--blink" data-testid="race-blink">{w}</span>}
              {!top && k === target && !c.last && <i key={c.attempts} className="raceBar" data-testid="race-bar" />}
            </div>
          )
        })}
        <div className="raceClimber" data-lane={c.rung % 3} style={{ '--at': c.rung }} data-testid="race-climber">
          <span key={c.seq} className="raceClimberIn" />
        </div>
      </div>
      {final && <p className={`rhNote wlTurn rhNote--gold raceTopPlate${lite ? ' wlTurn--lite' : ''}`} data-testid="race-top-plate">{phrase}</p>}
    </div>
  )
}

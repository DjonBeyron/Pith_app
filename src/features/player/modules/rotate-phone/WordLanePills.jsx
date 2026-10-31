import { memo, useRef, useState } from 'react'
import { PILL_W, PILL_H, LANE_X, LANE_EDGES, SLOT_COUNT } from './wordLaneTimeline.js'
import { POOL } from './wordLanePool.js'
import { useWordLanePills } from './useWordLanePills.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { isPillSafe } from './wordLanePillSafe.js'
import { RUN_NONE } from './wordLaneRunLanes.js'

// Дорожки и пилюли игры. Три колонки разделены линиями; пилюли — вертикальные пустые капсулы (без надписей) из пула POOL штук: движок (useWordLanePills) выдаёт их кускам и повторам
// ступени, ставит дорожку (data-lane: x и цвет — ступени «Моей памяти»: зелёная с одной обводкой, синяя с двумя, фиолетовая с тремя), запускает полёт и пишет заливку.
// Сверху и снизу экран затемнён (wlFade, над пилюлями): пилюли выезжают из тьмы и уходят во тьму. Под подписями три «огонька» — прогресс повторов ступени.
// Подсказка ученику (видна только пока слышен голос): «тень» слова диктора внутри пилюли — полоски, ширина которых повторяет громкость слова снизу вверх, и метка темпа --pace.
// Линии уровня на пилюле нет (v3.3.84: горизонтальные линии внутри пилюли убраны по замечанию владельца): заливка — ровный тон с мягким краем.
// Контур — настоящий border пилюли (не inset-тень: на iOS она мигала; обводка одна, внешних колец в покое нет), заливка — строго внутри него (.wlPillClip с отступом); у взятой из пула пилюли data-held (слои искр стоят всегда),
// у наливающейся data-live — тогда идут искры (<span class="wlPillSparks"><i><b/><b/></i></span> на самой пилюле, вне клипа заливки: вылетают выше контура и гаснут; <i> едет за уровнем заливки, ему пул пишет --fill / --pill-h).
// run — строка '101' (wordLaneRunLanes.js): на каких дорожках сейчас едут пилюли; такой колонке .wlLanes i ставится data-run — по ней бегут штрихи конвейера (word-lane-lane-run.css).
// Мемоизирован (memo): пилюли (12 штук × 9 узлов) перерисовываются, только когда сменилась сцена / «слух» / видимость, а не на каждый шаг оверлея (подпись кота, подсказка, награда). Все пропсы стабильны
// по ссылке: сцена, слух и колбэки — useMemo / useCallback в useWordLaneFlow. Сами пилюли живут вне React: движок (useWordLanePills) пишет им стили и анимации прямо в DOM.
function WordLanePills({ scene, levels, fx, live, sceneApi, visible, onLane, run = RUN_NONE }) {
  const rootRef = useRef(null)
  const [lite] = useState(isWeakDevice) // слабое устройство (wl--lite): без частиц в заливке (word-lane-pill.css)
  const [safe] = useState(isPillSafe) // «безопасный» режим слоёв для iOS (wl--safe, localStorage pithy_wl_pill_safe_v1 = 1): без will-change и слоёв частиц, контур дважды (word-lane-pill-safe.css)
  useWordLanePills(rootRef, { scene, levels, fx, live, sceneApi })
  return (
    <div ref={rootRef} className={`wlField${lite ? ' wl--lite' : ''}${safe ? ' wl--safe' : ''}`} data-testid="wl-field">
      <div className={`wlLanes${visible ? ' wlLanes--in' : ''}`} aria-hidden="true" data-testid="wl-lanes">
        {[0, 1, 2].map(k => <i key={k} data-run={run[k] === '1' ? '1' : undefined} />)}
        {LANE_EDGES.map(x => <b key={x} className="wlLaneEdge" style={{ left: `${x}%` }} />)}
      </div>
      {Array.from({ length: POOL }, (_, i) => (
        <div key={i} data-pill className="wlPill" data-lane={i % SLOT_COUNT} style={{ left: `${LANE_X[i % SLOT_COUNT]}%`, width: `${PILL_W}%`, height: `${PILL_H}%` }} data-testid={`wl-pill-${i}`}>
          <span className="wlPillClip">
            <span className="wlGhost" />
            <span className="wlPillFill" />
            <span className="wlPace" />
          </span>
          <span className="wlPillSparks"><i><b /><b /></i></span>
        </div>
      ))}
      <div className={`wlFade wlFade--top${visible ? ' wlFade--in' : ''}`} aria-hidden="true" data-testid="wl-fade-top" />
      <div className={`wlFade wlFade--bottom${visible ? ' wlFade--in' : ''}`} aria-hidden="true" data-testid="wl-fade-bottom" />
      <div className={`wlDots${visible ? ' wlDots--in' : ''}`} aria-hidden="true">
        {Array.from({ length: SLOT_COUNT }, (_, k) => <span key={k} data-dot className={`wlDot wlDot--${k + 1}`} />)}
      </div>
      {onLane && (
        <div className="wlTap" data-testid="wl-tap">
          {Array.from({ length: SLOT_COUNT }, (_, lane) => (
            <button key={lane} type="button" className="wlTapLane" onPointerDown={e => { e.preventDefault(); onLane(lane) }} aria-label={`Дорожка ${lane + 1}`} data-testid={`wl-tap-${lane}`} />
          ))}
        </div>
      )}
    </div>
  )
}

export default memo(WordLanePills)

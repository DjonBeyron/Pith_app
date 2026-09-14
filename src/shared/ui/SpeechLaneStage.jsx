import { frameLayout, activeWord, activeTranslation, LANES } from '../lib/speechLaneTiming.js'

// Сцена голосового тренажёра «Переверни телефон» — то, что ученик видит на
// весь экран после поворота: три дорожки через два пунктира, слова летят
// сверху вниз, в центре круг (зелёный — говорит диктор, красный — ученик),
// поверх круга — перевод с отдельной дорожки перевода (activeTranslation):
// появляется и уходит анимацией scale/opacity/rotate с дрожанием
// (speech-lane-stage.css, ключ по вылету — новый клип = новый элемент = новая
// анимация). Один и тот же рендер в превью редактора таймлайна (канвас) и в
// плеере — математика в speechLaneTiming.js.
//
// t — время композиции; lit — Map окон «горит» (litWindows); heard — Set
// ключей вылетов ученика, на которых уже услышан голос (плеер); level —
// громкость 0..1 для круга (диктор — по волне, ученик — по микрофону).
export default function SpeechLaneStage({ layers, t, lit, heard, level = 0, className = '' }) {
  const words  = frameLayout(layers, t)
  const active = activeWord(layers, t)
  const tr     = activeTranslation(layers, t)
  const role   = active?.role ?? 'coach'

  return (
    <div className={`slStage slStage--${role} ${className}`}>
      {Array.from({ length: LANES - 1 }, (_, i) => (
        <div key={i} className="slStageDivider" style={{ left: `${((i + 1) / LANES) * 100}%` }} />
      ))}
      <div className="slStageRing" style={{ '--sl-level': level }}>
        <span className="slStageRingOuter" />
        <span className="slStageRingMid" />
        <span className="slStageRingCore" />
      </div>
      {tr && (
        <div key={tr.key} className={`slStageTranslation${tr.out ? ' slStageTranslation--out' : ''}`}>
          {tr.text}
        </div>
      )}
      {words.map(w => {
        const win = lit?.get(w.key)
        const isLit = w.role === 'user'
          ? heard?.has(w.key)
          : !!win && t >= win.start && t < win.end
        return (
          <div key={w.key}
            className={`slWord slWord--${w.role}${isLit ? ' slWord--lit' : ''}`}
            style={{ left: `${((w.lane + 0.5) / LANES) * 100}%`, top: `${w.progress * 100}%` }}>
            {w.text}
          </div>
        )
      })}
    </div>
  )
}

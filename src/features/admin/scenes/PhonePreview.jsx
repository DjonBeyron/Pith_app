import { useState, useRef, useEffect } from 'react'
import SceneRenderer from '../../scene/v2/SceneRenderer.jsx'
import { unlockSceneAudio } from '../../scene/v2/sceneAudioUnlock.js'
import BudgetBar from './BudgetBar.jsx'
import LintPanel from './LintPanel.jsx'
import ScTip from './ScTip.jsx'

// Центр сборщика: «телефонная рамка» 9:16 с живым SceneRenderer, Старт/Пауза/Заново,
// тумблеры «Облачки» и «lite», режим «Живой / Статичный кадр» (номер реплики), индикатор
// бюджета узлов и замечания линтера (клик — подсветка поля через onHighlight).
// Сцена с ошибками валидации всё равно рисуется (нормализованная), чтобы было видно, что чинить.
export default function PhonePreview({ scene, lint, budget, onHighlight }) {
  const [mode, setMode] = useState('live')
  const [frame, setFrame] = useState(0)
  const [bubbles, setBubbles] = useState(true)
  const [lite, setLite] = useState(false)
  const [sound, setSound] = useState(true)
  const [status, setStatus] = useState('idle') // статус режиссёра для подписи кнопки
  const apiRef = useRef(null)
  const total = scene.timeline.length
  const safeFrame = Math.min(frame, Math.max(0, total - 1))

  // Статус режиссёра приходит через apiRef без перерендера — опрашиваем редко, только для подписи кнопки
  useEffect(() => {
    if (mode !== 'live') return undefined
    const id = setInterval(() => setStatus(apiRef.current?.status ?? 'idle'), 400)
    return () => clearInterval(id)
  }, [mode])

  const call = name => { unlockSceneAudio(); apiRef.current?.[name]?.() }

  return (
    <div className="scbPreview">
      <div className="scbPhoneWrap">
        <div className="scbPhone">
          <SceneRenderer
            key={mode} scene={scene} mode={mode} frameIndex={mode === 'static' ? safeFrame : null}
            showBubbles={bubbles} lite={lite} sound={sound} apiRef={apiRef} active
          />
        </div>
      </div>
      <div className="scbCtl">
        {mode === 'live' ? (
          <div className="scbCtlRow">
            <button type="button" className="fsBtn fsBtnPrimary" onClick={() => call(status === 'playing' ? 'pause' : 'play')}>
              {status === 'playing' ? 'Пауза' : status === 'paused' ? 'Продолжить' : 'Старт'}
            </button>
            <button type="button" className="fsBtn" onClick={() => call('restart')}>Заново</button>
            <label className="scCheck"><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} /> звук</label>
          </div>
        ) : (
          <div className="scbCtlRow">
            <label className="scbField scbFieldInline">
              <span className="scbFieldLabel">Реплика</span>
              <select className="fsNote" value={safeFrame} onChange={e => setFrame(Number(e.target.value))} aria-label="Номер реплики для статичного кадра">
                {scene.timeline.map((l, i) => <option key={i} value={i}>{i + 1}. {l.who.toUpperCase()}: {String(l.text).slice(0, 28)}{l.text.length > 28 ? '…' : ''}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="scbCtlRow">
          <span className="scbCtlGroup">
            <div className="scSegBtns" role="radiogroup" aria-label="Режим кадра">
              {[['live', 'Живой'], ['static', 'Статичный кадр']].map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => setMode(id)}>{label}</button>
              ))}
            </div>
            <ScTip help="frame_mode" />
          </span>
          <span className="scbCtlGroup">
            <label className="scCheck"><input type="checkbox" checked={bubbles} onChange={e => setBubbles(e.target.checked)} /> облачки</label>
            <ScTip help="bubbles" />
          </span>
          <span className="scbCtlGroup">
            <label className="scCheck"><input type="checkbox" checked={lite} onChange={e => setLite(e.target.checked)} /> lite</label>
            <ScTip help="lite" />
          </span>
        </div>
      </div>
      <BudgetBar budget={budget} />
      <LintPanel lint={lint} onPick={onHighlight} />
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { VolumeX, RotateCcw } from 'lucide-react'
import IconBtn from './ui/IconBtn.jsx'
import SceneRenderer from '../../scene/v2/SceneRenderer.jsx'
import { unlockSceneAudio } from '../../scene/v2/sceneAudioUnlock.js'
import Panel from './ui/Panel.jsx'
import BudgetBar from './BudgetBar.jsx'
import LintPanel from './LintPanel.jsx'
import ScTip from './ScTip.jsx'
import { modesSummary } from './modes/sceneModes.js'
import { soundStatusText } from '../../scene/v2/sceneAudioFail.js'
import SoundCheck from './voice/SoundCheck.jsx'
import FeedFramePanel from './feedFrame/FeedFramePanel.jsx'
import TrialWords from './TrialWords.jsx'
import { usePreviewScene } from './usePreviewScene.js'

// Центр сборщика — три панели (ui/Panel): «Предпросмотр» (телефонная рамка 9:16 с живым
// SceneRenderer, Старт/Пауза/Заново, звук (снята галка — индикатор «звук выключен», клик включает;
// в игре — статус «звук: файл / браузерный голос / таймер / без звука» + причина отказа файла и
// «Проверить звук»), «Живой / Статичный кадр», сводка режима показа/озвучки
// (сами переключатели — в тулбаре, пропы display/voice из usePreviewModes), lite; на весь
// экран — рамка по высоте экрана, 9:16 по центру), «Бюджет узлов» (BudgetBar) и «Замечания
// линтера» (LintPanel; клик — подсветка поля через onHighlight с раскрытием панелей).
// Сцена с ошибками валидации всё равно рисуется (нормализованная), чтобы было видно, что чинить.
// SceneRenderer не пересоздаётся при ресайзе колонок/панелей — размер рамки задаёт только CSS.
// modes — usePreviewModes (переопределения display/voice предпросмотра; null — как в сцене)
export default function PhonePreview({ scene: draftScene, lint, budget, onHighlight, modes = null, actions = null }) {
  const { shown: scene, trial } = usePreviewScene(draftScene) // шаблон (vars) — со словами-запасными или пробными (usePreviewScene.js)
  const [view, setView] = useState('phone') // 'phone' — сцена в рамке 9:16 | 'feed' — слайд ленты (feedFrame/)
  const [mode, setMode] = useState('live')
  const [frame, setFrame] = useState(0)
  const [lite, setLite] = useState(false)
  const ov = modes?.props ?? {}
  const [sound, setSound] = useState(true)
  const [status, setStatus] = useState('idle') // статус режиссёра для подписи кнопки
  const [sndSt, setSndSt] = useState({ mode: null, fail: null }) // чем звучит реплика и почему файл не завёлся (sceneAudioFail.js)
  const apiRef = useRef(null)
  const total = scene.timeline.length
  const empty = total === 0 // реплик нет (черновик на полпути): живой режиссёр играть нечего — всегда статичный кадр
  const safeFrame = Math.min(frame, Math.max(0, total - 1))
  const errors = lint.filter(x => x.level === 'error').length
  const warns = lint.length - errors

  // Статус режиссёра приходит через apiRef без перерендера — опрашиваем редко, только для подписи кнопки
  useEffect(() => {
    if (mode !== 'live') return undefined
    const id = setInterval(() => {
      const api = apiRef.current
      setStatus(api?.status ?? 'idle')
      setSndSt(s => (s.mode === (api?.mode ?? null) && s.fail === (api?.fail ?? null) ? s : { mode: api?.mode ?? null, fail: api?.fail ?? null }))
    }, 400)
    return () => clearInterval(id)
  }, [mode])

  const call = name => { unlockSceneAudio(); apiRef.current?.[name]?.() }

  return (
    <div className="scbPreview">
      <Panel id="preview" title="Предпросмотр" className="scbPreviewPanel">
        {actions && (
          <div className="scSegBtns" role="radiogroup" aria-label="Вид предпросмотра">
            {[['phone', 'Телефон (сцена)'], ['feed', 'Как в ленте']].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={view === id} className={view === id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => setView(id)}>{label}</button>
            ))}
            <ScTip help="feed_frame" />
          </div>
        )}
        {actions && view === 'feed' ? <FeedFramePanel scene={scene} actions={actions} /> : (
          <>
            <div className="scbPhoneWrap">
              <div className="scbPhone">
                <SceneRenderer
                  key={empty ? 'empty' : mode} scene={scene} mode={empty ? 'static' : mode} frameIndex={empty || mode === 'static' ? safeFrame : null}
                  display={ov.display} voice={ov.voice} lite={lite} sound={sound} apiRef={apiRef} active
                />
              </div>
            </div>
            <div className="scbCtl">
              {empty ? (
                <p className="scbSub" role="status">Реплик нет — показан статичный кадр. Добавьте реплики в блоке «Реплики».</p>
              ) : mode === 'live' ? (
                <div className="scbCtlRow">
                  <button type="button" className="fsBtn fsBtnPrimary" onClick={() => call(status === 'playing' ? 'pause' : 'play')}>
                    {status === 'playing' ? 'Пауза' : status === 'paused' ? 'Продолжить' : 'Старт'}
                  </button>
                  <IconBtn Icon={RotateCcw} label="Заново" title="Проиграть сцену заново" onClick={() => call('restart')} />
                  <label className="scCheck"><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} /> звук</label>
                  {!sound && (
                    <button type="button" className="scbSoundOff" onClick={() => setSound(true)} title="Включить звук предпросмотра">
                      <VolumeX size={14} aria-hidden="true" /> звук выключен — включите галку «звук»
                    </button>
                  )}
                  {status !== 'idle' && (
                    <span className={`scbSoundStatus${sndSt.fail ? ' scbSoundStatus-fail' : ''}`} role="status" data-sound-mode={sound ? (sndSt.mode ?? '') : 'off'}>
                      {soundStatusText(sndSt.mode, sndSt.fail, sound)}
                      <ScTip help="sound_status" />
                      {sndSt.fail && <SoundCheck url={sndSt.fail.url} />}
                    </span>
                  )}
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
              <TrialWords scene={draftScene} trial={trial} />
              <div className="scbCtlRow">
                <span className="scbCtlGroup">
                  <div className="scSegBtns" role="radiogroup" aria-label="Режим кадра">
                    {[['live', 'Живой'], ['static', 'Статичный кадр']].map(([id, label]) => (
                      <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => setMode(id)}>{label}</button>
                    ))}
                  </div>
                  <ScTip help="frame_mode" />
                </span>
                <span className="scbCtlGroup scbPreviewModes" title="Режим показа и озвучка предпросмотра — переключаются в верхней панели">
                  <span className="scbSub">{modesSummary(scene, modes?.override)}{modes?.overridden?.any ? ' · предпросмотр' : ''}</span>
                  <ScTip help="display_mode" />
                </span>
                <span className="scbCtlGroup">
                  <label className="scCheck"><input type="checkbox" checked={lite} onChange={e => setLite(e.target.checked)} /> lite</label>
                  <ScTip help="lite" />
                </span>
              </div>
            </div>
          </>
        )}
      </Panel>
      <Panel id="budget" title={<>Бюджет узлов <span className="scbCount">{budget.total} / {budget.limit}</span></>} label="Бюджет узлов" tip="budget" fieldId="f-budget" fullscreenable={false}>
        <BudgetBar budget={budget} />
      </Panel>
      <Panel
        id="lint" label="Замечания линтера" tip="lint"
        title={<>Замечания линтера <span className="scbCount"><b className={errors ? 'scBad' : 'scOk'}>{errors} ошибок</b> · {warns} предупреждений</span></>}
      >
        <LintPanel lint={lint} onPick={onHighlight} />
      </Panel>
    </div>
  )
}

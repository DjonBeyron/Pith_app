import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SceneRenderer from '../SceneRenderer.jsx'
import { unlockSceneAudio } from '../sceneAudioUnlock.js'
import StandCounters from './StandCounters.jsx'
import { readStandParams } from './standScene.js'
import { useStandLine } from './useStandLine.js'
import { useStandMetrics } from './useStandMetrics.js'
import './stand.css'

// Стенд сравнения «живой Пит v2» — страница ?scene=cmp (app/App.jsx), без данных и входа. Два одинаковых Пита рядом, ОДНА реплика и ОДИН
// звук (общий <audio> сцен): слева старая анимация (animV2=false: рот из трёх форм по гласным), справа новая (animV2=true: рот из девяти форм
// по буквам и огибающей громкости, зрачки, усы). «Проиграть» запускает обе сразу. Переключатель «lite» — слабое устройство (в новой остаётся
// только рот). Под сценами — замеры (useStandMetrics.js): узлы, анимации в тишине и при речи, кадры rAF за 2 с. Свой звук — параметры адреса
// (standScene.js). Звук по умолчанию — настоящая речь из демо маскотов с приблизительными таймингами слов, не ElevenLabs.

export default function SceneCompareStand() {
  const params = useMemo(() => readStandParams(window.location.search), [])
  const line = useStandLine(params)
  const [lite, setLite] = useState(params.lite)
  const [sound, setSound] = useState(true)
  const apiOld = useRef(null)
  const apiNew = useRef(null)
  const rootOld = useRef(null)
  const rootNew = useRef(null)
  const roots = useMemo(() => ({ old: rootOld, neu: rootNew }), [])
  const statusRef = useRef({ old: 'idle', neu: 'idle' })
  const { snap, resetPeaks } = useStandMetrics(roots, statusRef)

  // Сплэш из index.html снимает лента по первому кадру видео; здесь ленты нет — снимаем сами
  useEffect(() => { window.__pithyReady?.('scene-cmp') }, [])

  const onOld = useCallback(s => { statusRef.current.old = s.status }, [])
  const onNew = useCallback(s => { statusRef.current.neu = s.status }, [])

  // Жест пользователя открывает звук сцен; обе сцены стартуют в одном тике — один <audio> играет один файл для обеих
  const play = () => {
    unlockSceneAudio()
    resetPeaks()
    apiOld.current?.restart()
    apiNew.current?.restart()
  }

  const scene = line.scene
  return (
    <main className="cmp" data-testid="cmp-stand" data-ready={line.phase === 'ready' ? '1' : '0'}>
      <header className="cmpHead">
        <h1>Живой Пит v2: сравнение</h1>
        <div className="cmpCtl">
          <button type="button" className="cmpBtn" onClick={play} disabled={!scene} data-testid="cmp-play">Проиграть</button>
          <label><input type="checkbox" checked={lite} onChange={e => setLite(e.target.checked)} data-testid="cmp-lite" /> lite (слабое устройство)</label>
          <label><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} /> звук</label>
        </div>
        <p className="cmpNote">
          {line.phase === 'loading' ? 'Загружаю звук и считаю огибающую…' : params.custom
            ? `Свой звук: ${params.audio}${params.words ? '' : ' (тайминги слов синтетические)'}`
            : 'Звук — настоящая речь из демо маскотов (Kokoro TTS); тайминги слов приблизительные, это не ElevenLabs.'}
          {line.phase === 'ready' && <> Огибающая: {line.env ? `${line.env} окон` : 'нет — рот новой версии только по буквам'}.</>}
          {line.note && <span className="cmpWarn"> {line.note}</span>}
        </p>
      </header>

      {scene && (
        <div className="cmpGrid" data-only={params.only ?? undefined}>
          {params.only !== 'new' && <section className="cmpCol" data-testid="cmp-old">
            <h2>старая</h2>
            <div className="cmpScene" ref={rootOld}>
              <SceneRenderer scene={scene} animV2={false} lite={lite} sound={sound} showProgress={false} apiRef={apiOld} onState={onOld} />
            </div>
            <StandCounters id="old" side={snap?.sides.old} />
          </section>}
          {params.only !== 'old' && <section className="cmpCol" data-testid="cmp-new">
            <h2>новая</h2>
            <div className="cmpScene" ref={rootNew}>
              <SceneRenderer scene={scene} animV2 lite={lite} sound={sound} showProgress={false} apiRef={apiNew} onState={onNew} />
            </div>
            <StandCounters id="neu" side={snap?.sides.neu} />
          </section>}
        </div>
      )}

      <footer className="cmpFoot" data-testid="cmp-frames">
        Кадры за 2 с: средний <b>{snap?.frame.avg ?? '…'}</b> мс, максимальный <b>{snap?.frame.max ?? '…'}</b> мс ({snap?.frame.fps ?? '…'} fps). Анимаций на странице: <b>{snap?.docAnims ?? '…'}</b>.
        Кадры общие для обеих сцен. Для нагрузки как на Galaxy A50 — DevTools → Performance → CPU 4× замедление.
      </footer>
    </main>
  )
}

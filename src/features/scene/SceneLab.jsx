import { useEffect, useState } from 'react'
import SceneView from './SceneView.jsx'
import { demoWorkScene } from './demoWorkScene.js'
import { parseScene } from './sceneSchema.js'
import { onVoicesChanged, voiceStatus } from './sceneSpeech.js'
import './scene.css'
import './scene-cat.css'
import './scene-lab.css'

// Страница стенда «SVG-сцена»: сцена + редактируемый JSON сценария.
// Открывается по адресу ?scene=1 (см. app/App.jsx). Без БД, без R2.
const VOICE_LABEL = {
  none: 'speechSynthesis недоступен — озвучка таймером',
  loading: 'список голосов загружается…',
  'no-ru': 'русского голоса нет — озвучка таймером',
  ru: 'русский голос найден',
}

function demoText() { return JSON.stringify(demoWorkScene, null, 2) }

export default function SceneLab() {
  const [text, setText] = useState(demoText)
  const [applied, setApplied] = useState(() => parseScene(demoText()))
  const [sceneKey, setSceneKey] = useState(0)
  const [error, setError] = useState(null)
  const [voices, setVoices] = useState(voiceStatus)

  // Сплэш из index.html снимает лента по первому кадру видео; здесь ленты нет — снимаем сами
  useEffect(() => { window.__pithyReady?.('scene-lab') }, [])

  useEffect(() => {
    const update = () => setVoices(voiceStatus())
    const off = onVoicesChanged(update)
    const t = setTimeout(update, 600) // Safari отдаёт голоса без события — перепроверим
    return () => { off(); clearTimeout(t) }
  }, [])

  const apply = () => {
    const res = parseScene(text)
    if (res.error) { setError(res.error); return }
    setError(null)
    setApplied(res)
    setSceneKey(k => k + 1)
  }

  const reset = () => {
    const t = demoText()
    setText(t)
    setError(null)
    setApplied(parseScene(t))
    setSceneKey(k => k + 1)
  }

  const goBack = () => {
    const url = new URL(location.href)
    url.searchParams.delete('scene')
    location.href = url.pathname + (url.search || '') + url.hash
  }

  return (
    <div className="sceneLab">
      <header className="sceneLab__head">
        <button type="button" className="sceneLab__back" onClick={goBack}>← В приложение</button>
        <h1 className="sceneLab__title">🎬 Стенд SVG-сцены</h1>
      </header>

      <div className="sceneLab__body">
        <section className="sceneLab__stage">
          <SceneView key={sceneKey} scene={applied.scene} />
          <div className="sceneLab__voice">Голос: {VOICE_LABEL[voices] ?? voices}</div>
        </section>

        <section className="sceneLab__editor">
          <label className="sceneLab__label" htmlFor="sceneJson">JSON сценария (version 1)</label>
          <textarea
            id="sceneJson"
            className="sceneLab__textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            spellCheck={false}
          />
          {error && <div className="sceneLab__error" role="alert">{error}</div>}
          <div className="sceneLab__actions">
            <button type="button" className="sceneLab__btn sceneLab__btn--primary" onClick={apply}>Применить</button>
            <button type="button" className="sceneLab__btn" onClick={reset}>Сбросить к демо</button>
          </div>
          <p className="sceneLab__note">
            Поля реплики: <code>who</code>, <code>text</code>, <code>pose</code> (idle/talk/lean),
            {' '}<code>emotion</code> (neutral/happy/tired/surprised). Голос кота: <code>voice.pitch</code> 0…2,
            {' '}<code>voice.rate</code> 0.1…10. Фон: <code>office</code> / <code>kitchen</code>.
          </p>
        </section>
      </div>
    </div>
  )
}

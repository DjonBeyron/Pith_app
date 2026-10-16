import { VAR_LIMITS, sceneVarNames } from '../../scene/v2/sceneVars.js'
import ScTip from './ScTip.jsx'

// «Пробные слова» под предпросмотром: для каждого слова пользователя — слово и перевод, чтобы увидеть, как выглядит
// реплика с другим словом. Только предпросмотр (usePreviewScene): в сцену не сохраняется; пустое поле — запасное слово.
// Нет слов — ничего не рисуется.
export default function TrialWords({ scene, trial }) {
  const names = sceneVarNames(scene)
  if (!names.length) return null
  return (
    <div className="scbTrial">
      <span className="scbCtlGroup">
        <label className="scCheck"><input type="checkbox" checked={trial.on} onChange={e => trial.setOn(e.target.checked)} /> пробные слова</label>
        <ScTip help="vars_trial" />
      </span>
      {trial.on && names.map(name => (
        <div key={name} className="scbTrialRow">
          <b className="scbTrialName">{name}</b>
          <input
            className="fsNote" value={trial.values[name]?.text ?? ''} maxLength={VAR_LIMITS.maxWord} onChange={e => trial.setWord(name, 'text', e.target.value)}
            placeholder={scene.vars[name].fallback?.text || 'слово'} aria-label={`Пробное слово для ${name}`}
          />
          <input
            className="fsNote" value={trial.values[name]?.translation ?? ''} maxLength={VAR_LIMITS.maxWord} onChange={e => trial.setWord(name, 'translation', e.target.value)}
            placeholder={scene.vars[name].fallback?.translation || 'перевод'} aria-label={`Перевод пробного слова для ${name}`}
          />
        </div>
      ))}
      {trial.on && <p className="scbSub">Только предпросмотр, в сцену не сохраняется. После смены слов нажмите «Заново».</p>}
    </div>
  )
}

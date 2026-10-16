import Panel from './ui/Panel.jsx'
import VarRow from './VarRow.jsx'
import { VAR_LIMITS, sceneVarNames } from '../../scene/v2/sceneVars.js'

// Блок «Слова-переменные» (ключ панели vars): шаблон сцены под слова пользователя. До 3 переменных —
// имя, какие слова (шатающиеся / на повтор / знакомые), запасное слово и его перевод. В репликах переменная
// пишется {имя} (текст) и {имя:ru} (перевод) — кнопка «Вставить переменную» у полей реплики (InsertVarSelect).
// Ошибки линтера подсвечивают панель (lintPanelMap, ключ vars). Правки — draftActions (шаг отмены на каждое).
export default function VarsPanel({ scene, actions, voice = null }) {
  const names = sceneVarNames(scene)
  const full = names.length >= VAR_LIMITS.maxVars
  return (
    <Panel
      id="vars" title={<>Слова-переменные <span className="scbCount">{names.length} / {VAR_LIMITS.maxVars}</span></>} label="Слова-переменные" tip="vars" fieldId="f-vars"
      extra={<button type="button" className="fsBtn fsBtnSmall" onClick={actions.addVar} disabled={full || !!voice?.busy} title={full ? `Не больше ${VAR_LIMITS.maxVars} переменных` : 'Добавить переменную'}>Добавить</button>}
    >
      {names.length === 0 ? (
        <p className="scbSub">Переменных нет — сцена обычная. Добавьте, чтобы в реплики подставлялись слова пользователя (пока везде показывается запасное слово).</p>
      ) : (
        <ul className="scbVarList">
          {names.map((name, i) => (
            <VarRow key={i} index={i} name={name} def={scene.vars[name]} actions={actions} taken={names} lock={!!voice?.busy} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

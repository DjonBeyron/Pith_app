import Panel from './ui/Panel.jsx'
import VarRow from './VarRow.jsx'
import { VAR_LIMITS, sceneVarNames } from '../../scene/v2/sceneVars.js'
import { VARS_BLOCK_NAME, VARS_BLOCK_SUB } from './varsHowTexts.js'

// Блок «Слова пользователя» (ключ панели vars, формат vars не менялся): шаблон сцены под слова из памяти пользователя.
// До 3 слов — ключ, какие слова брать (новые / пора повторить / знакомые и выше), запасное слово и его перевод.
// В репликах слово пишется {ключ} (текст) и {ключ:ru} (перевод) — кнопка «Вставить слово» у полей реплики (InsertVarSelect).
// Ошибки линтера подсвечивают панель (lintPanelMap, ключ vars). Правки — draftActions (шаг отмены на каждое).
export default function VarsPanel({ scene, actions, voice = null }) {
  const names = sceneVarNames(scene)
  const full = names.length >= VAR_LIMITS.maxVars
  return (
    <Panel
      id="vars" title={<>{VARS_BLOCK_NAME} <span className="scbCount">{names.length} / {VAR_LIMITS.maxVars}</span></>} label={VARS_BLOCK_NAME} tip="vars" fieldId="f-vars"
      extra={<button type="button" className="fsBtn fsBtnSmall" onClick={actions.addVar} disabled={full || !!voice?.busy} title={full ? `Не больше ${VAR_LIMITS.maxVars} слов` : 'Добавить слово'}>Добавить слово</button>}
    >
      <p className="scbSub scbVarsSub">Слова {VARS_BLOCK_SUB} (по типу отбора). Пока память не подключена, везде показывается запасное слово.</p>
      {names.length === 0 ? (
        <p className="scbSub">Слов пользователя нет — сцена обычная. Добавьте слово, чтобы в реплику подставлялось слово из памяти пользователя.</p>
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

import { nodeStartPatch, nodeStartDelayPatch, nodeStartState } from './scenePickerModel.js'
import { SCENE_START_DELAY_MAX } from '../scene/v2/sceneNode.js'

// Запуск сцены в ленте (NodeScenePicker): сегмент «Вручную | Автоматически»
// (typeData.scene.start) и задержка после появления сообщения в мс
// (typeData.scene.startDelayMs, 0…5000) — контракт sceneNode.js. Автозапуск ждёт
// конца анимации появления сообщения и только потом отсчитывает задержку
// (player/modules/scene/sceneStartPlan.js).
const START_OPTS = [['manual', 'Вручную'], ['auto', 'Автоматически']]
const HELP = 'Вручную — сцена стоит с кнопкой ▶, пока ученик сам не запустит. Автоматически — сама '
  + 'стартует со звуком после того, как сообщение въехало в чат, плюс эта задержка. Звук при автозапуске '
  + 'возможен, если в уроке уже был жест ученика; иначе сцена идёт с облачками без звука и чипом «Включить звук».'

export default function NodeSceneStart({ tData, onChange }) {
  const st = nodeStartState(tData)
  return (
    <div className="nodeSceneStart" aria-label="Запуск сцены">
      <div className="nodeSceneModeRow">
        <span className="nodeSceneModeLabel">Запуск</span>
        <div className="nodeSceneSeg" role="radiogroup" aria-label="Запуск">
          {START_OPTS.map(([v, text]) => (
            <button
              key={v} type="button" role="radio" aria-checked={st.start === v}
              className={st.start === v ? 'nodeSceneSegBtn nodeSceneSegBtnOn' : 'nodeSceneSegBtn'}
              onClick={() => onChange(nodeStartPatch(v))}
            >{text}</button>
          ))}
        </div>
        <span className="nodeStatLinkHelp" data-tip={HELP}>?</span>
      </div>
      {st.start === 'auto' && (
        <div className="nodeSceneModeRow">
          <label className="nodeSceneModeLabel" htmlFor="nodeSceneStartDelay">Задержка после появления, мс</label>
          <input
            id="nodeSceneStartDelay" className="nodeSceneNum" type="number" min={0} max={SCENE_START_DELAY_MAX} step={50}
            value={st.startDelayMs} onChange={e => onChange(nodeStartDelayPatch(e.target.value))}
          />
          <input
            className="nodeSceneRange" type="range" min={0} max={SCENE_START_DELAY_MAX} step={50} aria-label="Задержка, мс"
            value={st.startDelayMs} onChange={e => onChange(nodeStartDelayPatch(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}

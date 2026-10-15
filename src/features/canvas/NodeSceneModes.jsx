import { nodeDisplayPatch, nodeVoicePatch, nodeModeState } from './scenePickerModel.js'
import { sceneModes, DISPLAY_SHORT } from '../admin/scenes/modes/sceneModes.js'

// Переопределения режимов на уровне ноды урока (NodeScenePicker): режим показа текста
// (typeData.scene.display) и озвучка оригинала/перевода (typeData.scene.voice) ПОВЕРХ options сцены
// (контракт sceneNode.js / sceneOptions.js). «Как в сцене» = поле не задано — в подписи видно, что
// тогда получится. Заменяет старый чекбокс «Облачки» (showBubbles пишется рядом для старого плеера).
const DISPLAY_OPTS = [[null, 'Как в сцене'], ['none', 'Без текста'], ['text', 'Текст'], ['both', 'Текст + перевод']]
const VOICE_OPTS = [[null, 'Как в сцене'], [true, 'Вкл'], [false, 'Выкл']]

function Seg({ label, options, value, onPick, sceneHint }) {
  return (
    <div className="nodeSceneModeRow">
      <span className="nodeSceneModeLabel">{label}</span>
      <div className="nodeSceneSeg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={String(v)} type="button" role="radio" aria-checked={value === v}
            className={value === v ? 'nodeSceneSegBtn nodeSceneSegBtnOn' : 'nodeSceneSegBtn'}
            onClick={() => onPick(v)} title={v === null ? `Как записано в сцене: ${sceneHint}` : undefined}
          >{text}{v === null ? ` · ${sceneHint}` : ''}</button>
        ))}
      </div>
    </div>
  )
}

export default function NodeSceneModes({ tData, scene, onChange }) {
  const st = nodeModeState(tData)
  const base = sceneModes(scene)
  const onOff = v => (v ? 'вкл' : 'выкл')
  return (
    <div className="nodeSceneModes" aria-label="Режимы показа и озвучки ноды">
      <Seg label="Показ текста" options={DISPLAY_OPTS} value={st.display} onPick={v => onChange(nodeDisplayPatch(v))} sceneHint={DISPLAY_SHORT[base.display].toLowerCase()} />
      <Seg label="Озвучка оригинала" options={VOICE_OPTS} value={st.original} onPick={v => onChange(nodeVoicePatch(tData, 'original', v))} sceneHint={onOff(base.voice.original)} />
      <Seg label="Озвучка перевода" options={VOICE_OPTS} value={st.translation} onPick={v => onChange(nodeVoicePatch(tData, 'translation', v))} sceneHint={onOff(base.voice.translation)} />
      <p className="nodeSceneHint">Переопределения действуют только в этом уроке; сама сцена и её библиотечная запись не меняются.</p>
    </div>
  )
}

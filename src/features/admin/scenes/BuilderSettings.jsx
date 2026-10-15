import { LOCATIONS, BACKGROUNDS } from '../../scene/v2/sprites/backgrounds.js'
import Panel from './ui/Panel.jsx'
import SlotsGrid from './SlotsGrid.jsx'
import CharacterForm from './CharacterForm.jsx'
import TimelineEditor from './TimelineEditor.jsx'
import SceneTaskSection from './SceneTaskSection.jsx'
import PlaybackOptions from './modes/PlaybackOptions.jsx'

// Левая колонка сборщика — сворачиваемые панели (ui/Panel): «Локация», «Ячейки предметов»
// (SlotsGrid), «Персонажи» (CharacterForm A и B — вложенные панели), «Реплики» (TimelineEditor),
// «Задание после сцены» (SceneTaskSection), «Параметры воспроизведения» (modes/PlaybackOptions:
// режим показа, озвучка оригинала/перевода, голос перевода, автозапуск/повтор). Ключи панелей
// (location, slots, characters, timeline, task, options) — те же, что в lintPanelMap.js;
// id вида f-… нужны подсветке замечаний линтера (lintFieldMap.js).
// voice — API озвучки ElevenLabs (useSceneVoice) для персонажей и реплик
export default function BuilderSettings({ scene, actions, savedId = null, setStatus, voice = null, onFeedTest = null }) {
  return (
    <div className="scbSettings">
      <Panel id="location" title="Локация" fieldId="f-location">
        <div className="scSegBtns" role="radiogroup" aria-label="Локация">
          {LOCATIONS.map(loc => (
            <button key={loc} type="button" role="radio" aria-checked={scene.location === loc} className={scene.location === loc ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.setLocation(loc)}>
              {BACKGROUNDS[loc].title}
            </button>
          ))}
        </div>
        <p className="scbSub">При смене локации общие слоты (окно, картина, пол, стол) переносятся, свои — очищаются.</p>
      </Panel>

      <Panel
        id="slots" title="Ячейки предметов" tip="slot" fieldId="f-slots"
        extra={(
          <div className="scbHBtns">
            <button type="button" className="fsBtn fsBtnSmall" onClick={actions.fillDefaultSlots}>Набор по умолчанию</button>
            <button type="button" className="fsBtn fsBtnSmall" onClick={actions.clearSlots}>Очистить</button>
          </div>
        )}
      >
        <SlotsGrid scene={scene} onPick={actions.setSlot} />
      </Panel>

      <Panel id="characters" title="Персонажи" fieldId="f-characters">
        <div className="scbChars">
          <CharacterForm who="a" character={scene.characters.a} actions={actions} voice={voice} scene={scene} />
          <CharacterForm who="b" character={scene.characters.b} actions={actions} voice={voice} scene={scene} />
        </div>
      </Panel>

      <Panel id="timeline" title={<>Реплики <span className="scbCount">{scene.timeline.length} / 12</span></>} label="Реплики" fieldId="f-timeline">
        <TimelineEditor scene={scene} actions={actions} voice={voice} />
      </Panel>

      <SceneTaskSection scene={scene} actions={actions} savedId={savedId} setStatus={setStatus} onFeedTest={onFeedTest} />

      <Panel id="options" title="Параметры воспроизведения" fieldId="f-options">
        <PlaybackOptions scene={scene} actions={actions} voice={voice} />
      </Panel>
    </div>
  )
}

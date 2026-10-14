import { LOCATIONS, BACKGROUNDS } from '../../scene/v2/sprites/backgrounds.js'
import SlotsGrid from './SlotsGrid.jsx'
import CharacterForm from './CharacterForm.jsx'
import TimelineEditor from './TimelineEditor.jsx'
import ScTip from './ScTip.jsx'

// Левая область сборщика: локация, ячейки предметов (SlotsGrid), персонажи A и B
// (CharacterForm), реплики (TimelineEditor), options. id вида f-… нужны подсветке
// замечаний линтера (lintFieldMap.js).
export default function BuilderSettings({ scene, actions }) {
  return (
    <div className="scbSettings">
      <section className="scbBlock" id="f-location" aria-labelledby="scb-loc-h">
        <h2 id="scb-loc-h" className="scbH">Локация</h2>
        <div className="scSegBtns" role="radiogroup" aria-label="Локация">
          {LOCATIONS.map(loc => (
            <button key={loc} type="button" role="radio" aria-checked={scene.location === loc} className={scene.location === loc ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.setLocation(loc)}>
              {BACKGROUNDS[loc].title}
            </button>
          ))}
        </div>
        <p className="scbSub">При смене локации общие слоты (окно, картина, пол, стол) переносятся, свои — очищаются.</p>
      </section>

      <section className="scbBlock" id="f-slots" aria-labelledby="scb-slots-h">
        <div className="scbHRow">
          <h2 id="scb-slots-h" className="scbH">Ячейки предметов <ScTip help="slot" /></h2>
          <div className="scbHBtns">
            <button type="button" className="fsBtn fsBtnSmall" onClick={actions.fillDefaultSlots}>Набор по умолчанию</button>
            <button type="button" className="fsBtn fsBtnSmall" onClick={actions.clearSlots}>Очистить</button>
          </div>
        </div>
        <SlotsGrid scene={scene} onPick={actions.setSlot} />
      </section>

      <section className="scbBlock" id="f-characters" aria-labelledby="scb-chars-h">
        <h2 id="scb-chars-h" className="scbH">Персонажи</h2>
        <div className="scbChars">
          <CharacterForm who="a" character={scene.characters.a} actions={actions} />
          <CharacterForm who="b" character={scene.characters.b} actions={actions} />
        </div>
      </section>

      <section className="scbBlock" id="f-timeline" aria-labelledby="scb-tl-h">
        <h2 id="scb-tl-h" className="scbH">Реплики <span className="scbCount">{scene.timeline.length} / 12</span></h2>
        <TimelineEditor scene={scene} actions={actions} />
      </section>

      <section className="scbBlock" id="f-options" aria-labelledby="scb-opt-h">
        <h2 id="scb-opt-h" className="scbH">Параметры воспроизведения</h2>
        <div className="scbOptions">
          {[['bubbles', 'облачки'], ['autoplay', 'автозапуск'], ['loop', 'повтор по кругу']].map(([k, label]) => (
            <label key={k} className="scCheck" id={`f-options-${k}`}>
              <input type="checkbox" checked={!!scene.options[k]} onChange={e => actions.setOption(k, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}

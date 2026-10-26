import { facesOf, FACE_NOTES } from '../../scene/v2/sprites/mascot/mascots.js'
import { MOUTH_LABEL } from './sceneLabels.js'

// Переключатели карточки маскота в галерее: лицо (состояние мимики), форма рта и два выключателя — реакция зрачков и дополнительная мимика.
// value — { face, mouth, pupilReaction, extraFace }; onChange получает новый объект.
export default function MascotControls({ skin, value, onChange }) {
  const set = patch => onChange({ ...value, ...patch })
  return (
    <div className="scCatCtl">
      <div className="scSeg">
        <span className="scLabel">Лицо</span>
        <div className="scSegBtns" role="radiogroup" aria-label="Лицо маскота">
          {facesOf(skin).map(f => (
            <button key={f} type="button" role="radio" aria-checked={value.face === f} title={FACE_NOTES[skin][f]} className={value.face === f ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => set({ face: f })}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="scSeg">
        <span className="scLabel">Рот</span>
        <div className="scSegBtns" role="radiogroup" aria-label="Форма рта">
          {Object.entries(MOUTH_LABEL).map(([id, text]) => (
            <button key={id} type="button" role="radio" aria-checked={value.mouth === id} className={value.mouth === id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => set({ mouth: id })}>
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="scCheckRow">
        <label className="scCheck"><input type="checkbox" checked={value.pupilReaction} onChange={e => set({ pupilReaction: e.target.checked })} /> Реакция зрачков</label>
        <label className="scCheck"><input type="checkbox" checked={value.extraFace} onChange={e => set({ extraFace: e.target.checked })} /> Дополнительная мимика</label>
      </div>
    </div>
  )
}

import { facesOf, FACE_NOTES, BASE_FACE } from '../../scene/v2/sprites/mascot/mascots.js'

// Лицо маскота в реплике: «Лицо говорящего» (face) и «Лицо слушающего» (react) — каждое показывается, только если у этого
// персонажа маскот (skin) и включена дополнительная мимика. Пусто — обычное лицо. id — f-timeline-<i>-face / -react.
function FaceSelect({ id, label, character, value, onChange }) {
  const faces = facesOf(character.skin)
  return (
    <label className="scbField">
      <span className="scbFieldLabel">{label}</span>
      <select id={id} className="fsNote" value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">обычное лицо</option>
        {faces.filter(f => f !== BASE_FACE).map(f => <option key={f} value={f}>{FACE_NOTES[character.skin][f]} ({f})</option>)}
      </select>
    </label>
  )
}

export default function LineFaceFields({ prefix, index, line, characters, actions }) {
  const speaker = characters?.[line.who]
  const listener = characters?.[line.who === 'a' ? 'b' : 'a']
  const on = c => c?.skin && c.extraFace !== false
  if (!on(speaker) && !on(listener)) return null
  return (
    <div className="scbLineSel">
      {on(speaker) && <FaceSelect id={`${prefix}-face`} label={`Лицо: ${speaker.name}`} character={speaker} value={line.face} onChange={v => actions.updateLine(index, { face: v })} />}
      {on(listener) && <FaceSelect id={`${prefix}-react`} label={`Реакция: ${listener.name}`} character={listener} value={line.react} onChange={v => actions.updateLine(index, { react: v })} />}
    </div>
  )
}

import { SKINS, SKIN_TITLES } from '../../scene/v2/sprites/mascot/mascots.js'

// Образ персонажа в форме персонажа: обычный кот (палитра, полоски) или маскот — Кит / Мия (готовый рисунок).
// У маскота два переключателя, оба по умолчанию включены: «Реакция зрачков» (зрачок меняется вместе с лицом, сердечки пульсируют)
// и «Дополнительная мимика» (лица из реплик face / react; выключена — маскот всегда с обычным лицом). id полей — f-characters-<who>-skin и т. д.
const PLAIN = 'plain'

export default function MascotFields({ who, character, actions }) {
  const p = `f-characters-${who}`
  const cur = character.skin ?? PLAIN
  const pick = id => { if (id !== cur) actions.setSkin(who, id === PLAIN ? null : id) }
  const options = [[PLAIN, 'Обычный кот'], ...SKINS.map(s => [s, SKIN_TITLES[s].split(' (')[0]])]
  return (
    <>
      <div className="scbField">
        <span className="scbFieldLabel">Образ</span>
        <div className="scSegBtns" role="radiogroup" aria-label={`Образ персонажа ${who.toUpperCase()}`} id={`${p}-skin`}>
          {options.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={cur === id} className={cur === id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => pick(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {character.skin && (
        <div className="scCheckRow" id={`${p}-mascot`}>
          <label className="scCheck" title="Зрачок меняется вместе с лицом (расширяется, сужается), сердечки в зрачках пульсируют">
            <input type="checkbox" checked={character.pupilReaction !== false} onChange={e => actions.updateCharacter(who, { pupilReaction: e.target.checked })} /> Реакция зрачков
          </label>
          <label className="scCheck" title="Лица из реплик (face — говорящий, react — слушающий): брови, румянец, сердечки. Выключено — всегда обычное лицо">
            <input type="checkbox" checked={character.extraFace !== false} onChange={e => actions.updateCharacter(who, { extraFace: e.target.checked })} /> Дополнительная мимика
          </label>
        </div>
      )}
    </>
  )
}

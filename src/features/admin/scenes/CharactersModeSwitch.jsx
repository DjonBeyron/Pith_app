import { useState } from 'react'
import { isSolo } from '../../scene/v2/scenePit.js'
import { linesOfB } from './builderModel.js'
import ScTip from './ScTip.jsx'

// Переключатель «Два кота / Один кот (Пит)» в шапке панели «Персонажи» (BuilderSettings).
// На одного кота: если у B есть реплики — подтверждение в строке (как «Удалить все реплики»):
// реплики B перейдут Питу, B исчезнет (builderModel.setSolo). Обратно — сразу: B появляется по умолчанию.
// disabled — пока идёт озвучка (индексы плана озвучки привязаны к репликам и персонажам).
export default function CharactersModeSwitch({ scene, actions, disabled = false }) {
  const [ask, setAsk] = useState(false)
  const solo = isSolo(scene)
  const nB = solo ? 0 : linesOfB(scene)

  const toSolo = () => {
    if (nB > 0 && !ask) { setAsk(true); return }
    setAsk(false)
    actions.setSolo(true)
  }

  if (ask) {
    return (
      <span className="scbAsk" role="alert">
        Реплик у B: {nB} — они перейдут Питу, персонаж B будет убран.
        <button type="button" className="fsBtn fsBtnSmall" onClick={toSolo}>Да, один кот</button>
        <button type="button" className="fsBtn fsBtnSmall" onClick={() => setAsk(false)}>Отмена</button>
      </span>
    )
  }
  return (
    <div className="scSegBtns" role="radiogroup" aria-label="Сколько котов в сцене" id="f-characters-mode">
      <button type="button" role="radio" aria-checked={!solo} className={!solo ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} disabled={disabled} onClick={() => { if (solo) actions.setSolo(false) }}>
        Два кота
      </button>
      <button type="button" role="radio" aria-checked={solo} className={solo ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} disabled={disabled} onClick={() => { if (!solo) toSolo() }}>
        Один кот (Пит)
      </button>
      <ScTip help="solo" />
    </div>
  )
}

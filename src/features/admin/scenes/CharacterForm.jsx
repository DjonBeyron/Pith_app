import { useMemo } from 'react'
import { catSprite } from '../../scene/v2/sprites/spriteRegistry.js'
import { LIMITS } from '../../scene/v2/sceneConstants.js'
import SpritePreview from './SpritePreview.jsx'
import PaletteEditor from './PaletteEditor.jsx'
import { GENDER_LABEL } from './sceneLabels.js'
import ScTip from './ScTip.jsx'
import VoicePicker from './voice/VoicePicker.jsx'

// Форма персонажа A/B в сборщике: имя, пол, палитра (PaletteEditor), полоски, запасной
// голос устройства (pitch/rate) и голос ElevenLabs (VoicePicker: пресет/свой voiceId,
// настройки, «Прослушать»). id полей — f-characters-<who>-… для подсветки линтера.
export default function CharacterForm({ who, character, actions, voice = null }) {
  const p = `f-characters-${who}`
  const sprite = catSprite(character.gender)
  const props = useMemo(() => ({ palette: character.palette, stripes: character.stripes !== false }), [character.palette, character.stripes])
  const fb = character.voice ?? {} // pitch/rate запасного синтеза устройства

  return (
    <div className="scbChar" id={p}>
      <div className="scbCharHead">
        <SpritePreview sprite={sprite} props={props} size={64} />
        <div className="scbCharMain">
          <span className="scbCharWho">{who === 'a' ? 'A — слева' : 'B — справа'}</span>
          <label className="scbField">
            <span className="scbFieldLabel">Имя</span>
            <input id={`${p}-name`} className="fsNote" value={character.name} maxLength={LIMITS.maxNameLen} onChange={e => actions.updateCharacter(who, { name: e.target.value })} />
          </label>
          <div className="scSegBtns" role="radiogroup" aria-label={`Пол персонажа ${who.toUpperCase()}`} id={`${p}-gender`}>
            {Object.entries(GENDER_LABEL).map(([g, label]) => (
              <button key={g} type="button" role="radio" aria-checked={character.gender === g} className={character.gender === g ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.updateCharacter(who, { gender: g })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <PaletteEditor
        palette={character.palette} idPrefix={`${p}-palette`}
        onPreset={id => actions.applyPreset(who, id)} onColor={(k, v) => actions.setPaletteColor(who, k, v)}
      />
      <div className="scCheckRow" id={`${p}-stripes`}>
        <label className="scCheck">
          <input type="checkbox" checked={character.stripes !== false} onChange={e => actions.updateCharacter(who, { stripes: e.target.checked })} /> Полоски
        </label>
        <ScTip help="stripes" />
      </div>
      <div className="scbVoice" id={`${p}-voice`}>
        <span className="scbCtlGroup"><span className="scLabel">Запасной голос устройства</span> <ScTip help="voice" /></span>
        <label className="scbRange">
          <span>высота {Number(fb.pitch ?? 1).toFixed(2)}</span>
          <input id={`${p}-voice-pitch`} type="range" min="0" max="2" step="0.05" value={fb.pitch ?? 1} onChange={e => actions.setVoice(who, { pitch: Number(e.target.value) })} aria-label="Высота голоса (pitch)" />
        </label>
        <label className="scbRange">
          <span>темп {Number(fb.rate ?? 1).toFixed(2)}</span>
          <input id={`${p}-voice-rate`} type="range" min="0.5" max="2" step="0.05" value={fb.rate ?? 1} onChange={e => actions.setVoice(who, { rate: Number(e.target.value) })} aria-label="Темп речи (rate)" />
        </label>
        <VoicePicker who={who} character={character} actions={actions} voice={voice} />
      </div>
    </div>
  )
}

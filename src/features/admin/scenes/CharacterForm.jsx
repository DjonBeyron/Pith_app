import { useMemo } from 'react'
import { catSprite } from '../../scene/v2/sprites/spriteRegistry.js'
import { LIMITS } from '../../scene/v2/sceneConstants.js'
import SpritePreview from './SpritePreview.jsx'
import PaletteEditor from './PaletteEditor.jsx'
import Panel from './ui/Panel.jsx'
import { speakerColor, contrastInk } from './ui/colorContrast.js'
import { GENDER_LABEL } from './sceneLabels.js'
import ScTip from './ScTip.jsx'
import VoicePicker from './voice/VoicePicker.jsx'
import TranslationVoicePicker from './voice/TranslationVoicePicker.jsx'

// Форма персонажа A/B в сборщике — вложенная панель (ключ characters.<who>, заголовок
// «A · Имя» с кружком цвета шерсти; solo — единственный кот одиночной сцены, «по центру»):
// превью, имя, пол, палитра (PaletteEditor), полоски;
// внутри — панель «Голос» (characters.<who>.voice): запасной голос устройства (pitch/rate),
// голос ElevenLabs (VoicePicker) и голос перевода (TranslationVoicePicker, voice.translationVoiceId;
// пусто — общий голос сцены). Раскладка полей — сетка auto-fit с отступами по плотности
// панели (--gap/--pad из admin-scenes-character.css): в узкой колонке один столбец,
// в широкой — несколько. id полей — f-characters-<who>-… для подсветки линтера.
export default function CharacterForm({ who, character, actions, voice = null, scene = null, solo = false }) {
  const p = `f-characters-${who}`
  const sprite = catSprite(character.gender)
  const props = useMemo(() => ({ palette: character.palette, stripes: character.stripes !== false }), [character.palette, character.stripes])
  const fb = character.voice ?? {} // pitch/rate запасного синтеза устройства
  const color = speakerColor(character, who)
  const name = character.name?.trim() || 'без имени'
  const title = (
    <>
      <i className="scbSpkDot" style={{ '--spk': color, '--spk-ink': contrastInk(color) }} aria-hidden="true">{who.toUpperCase()}</i>
      {name} <span className="scbCount">{solo ? 'по центру' : who === 'a' ? 'слева' : 'справа'}</span>
    </>
  )

  return (
    <Panel id={`characters.${who}`} title={title} label={`Персонаж ${who.toUpperCase()} — ${name}`} fieldId={p} nested as="h3" className="scbChar">
      <div className="scbCharHead">
        <SpritePreview sprite={sprite} props={props} size={64} />
        <div className="scbCharFields">
          <label className="scbField">
            <span className="scbFieldLabel">Имя</span>
            <input id={`${p}-name`} className="fsNote" value={character.name} maxLength={LIMITS.maxNameLen} onChange={e => actions.updateCharacter(who, { name: e.target.value })} />
          </label>
          <div className="scbField">
            <span className="scbFieldLabel">Пол</span>
            <div className="scSegBtns" role="radiogroup" aria-label={`Пол персонажа ${who.toUpperCase()}`} id={`${p}-gender`}>
              {Object.entries(GENDER_LABEL).map(([g, label]) => (
                <button key={g} type="button" role="radio" aria-checked={character.gender === g} className={character.gender === g ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.updateCharacter(who, { gender: g })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="scbCharRow">
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
      </div>
      <Panel id={`characters.${who}.voice`} title="Голос" fieldId={`${p}-voice`} nested as="h4" fullscreenable={false} className="scbVoice">
        <span className="scbCtlGroup"><span className="scLabel">Запасной голос устройства</span> <ScTip help="voice" /></span>
        <div className="scbRanges">
          <label className="scbRange">
            <span>высота {Number(fb.pitch ?? 1).toFixed(2)}</span>
            <input id={`${p}-voice-pitch`} type="range" min="0" max="2" step="0.05" value={fb.pitch ?? 1} onChange={e => actions.setVoice(who, { pitch: Number(e.target.value) })} aria-label="Высота голоса (pitch)" />
          </label>
          <label className="scbRange">
            <span>темп {Number(fb.rate ?? 1).toFixed(2)}</span>
            <input id={`${p}-voice-rate`} type="range" min="0.5" max="2" step="0.05" value={fb.rate ?? 1} onChange={e => actions.setVoice(who, { rate: Number(e.target.value) })} aria-label="Темп речи (rate)" />
          </label>
        </div>
        <VoicePicker who={who} character={character} actions={actions} voice={voice} />
        <TranslationVoicePicker
          who={who} value={character.voice?.translationVoiceId ?? ''} onChange={v => actions.setVoice(who, { translationVoiceId: v })}
          scene={scene} character={character} voice={voice} idPrefix={`${p}-voice-translationVoiceId`}
        />
      </Panel>
    </Panel>
  )
}

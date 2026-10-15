import { RotateCcw } from 'lucide-react'
import { sceneModes, DISPLAY_OPTIONS, VOICE_KEYS, VOICE_LABEL } from './sceneModes.js'
import TranslationVoicePicker from '../voice/TranslationVoicePicker.jsx'
import ScTip from '../ScTip.jsx'
import IconBtn from '../ui/IconBtn.jsx'
import { feedFrameSummary } from '../feedFrame/feedFrameModel.js'

// Содержимое панели «Параметры воспроизведения» (BuilderSettings): режим показа текста (сегмент
// «Без текста | С текстом | Текст + перевод» → options.display, вместо старого чекбокса «облачки»;
// старые сцены читаются как раньше — displayOfOptions), тумблеры озвучки оригинала/перевода
// (options.voice), общий голос перевода сцены (options.translationVoiceId), автозапуск и повтор.
// Это ЗАПИСЬ в сцену; предпросмотровые переопределения — в тулбаре (ToolbarModes). id полей —
// f-options-display / f-options-voice-original / f-options-voice-translation / f-options-translationVoiceId
// (подсветка замечаний линтера, lintFieldMap).
export default function PlaybackOptions({ scene, actions, voice = null }) {
  const m = sceneModes(scene)
  const written = { display: !!scene.options?.display, voice: !!scene.options?.voice }
  return (
    <div className="scbPlayback">
      <div className="scbField" id="f-options-display">
        <span className="scbFieldLabel">Режим показа текста <ScTip help="display_mode" /></span>
        <div className="scSegBtns" role="radiogroup" aria-label="Режим показа текста">
          {DISPLAY_OPTIONS.map(o => (
            <button key={o.id} type="button" role="radio" aria-checked={m.display === o.id} className={m.display === o.id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.setDisplay(o.id)}>{o.label}</button>
          ))}
        </div>
        <p className="scbSub">
          {!written.display && 'Режим из старого поля «облачки» — станет явным (options.display) при первом нажатии. '}
          В верхней панели те же переключатели меняют только предпросмотр; «Сделать по умолчанию» записывает их сюда <ScTip help="make_default" />
        </p>
      </div>
      <div className="scbField" id="f-options-voice">
        <span className="scbFieldLabel">Озвучка <ScTip help="voice_flags" /></span>
        <div className="scbOptions">
          {VOICE_KEYS.map(k => (
            <label key={k} className="scCheck" id={`f-options-voice-${k}`}>
              <input type="checkbox" checked={m.voice[k]} onChange={e => actions.setVoiceFlag(k, e.target.checked)} /> {VOICE_LABEL[k]}
            </label>
          ))}
        </div>
        <p className="scbSub">Оригинал без озвучки — рот двигается, звука нет. Перевод звучит после оригинала голосом диктора (файл перевода или синтез устройства).</p>
      </div>
      <TranslationVoicePicker
        who={null} value={scene.options?.translationVoiceId ?? ''} onChange={actions.setTranslationVoiceId}
        scene={scene} voice={voice} idPrefix="f-options-translationVoiceId"
      />
      <div className="scbOptions">
        {[['autoplay', 'автозапуск'], ['loop', 'повтор по кругу']].map(([k, label]) => (
          <label key={k} className="scCheck" id={`f-options-${k}`}>
            <input type="checkbox" checked={!!scene.options[k]} onChange={e => actions.setOption(k, e.target.checked)} /> {label}
          </label>
        ))}
      </div>
      <div className="scbField" id="f-options-feedFrame">
        <span className="scbFieldLabel">Кадр в ленте <ScTip help="feed_frame" /></span>
        <p className="scbSub">
          {feedFrameSummary(scene.options?.feedFrame)}. Положение и масштаб меняются в предпросмотре «Как в ленте» (центральная колонка).
          {scene.options?.feedFrame && <> <IconBtn Icon={RotateCcw} label="Сбросить кадр в ленте" onClick={() => actions.setFeedFrame(null)} /></>}
        </p>
      </div>
    </div>
  )
}

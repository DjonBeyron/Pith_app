import { EXAMPLES } from '../../../shared/lib/speech/speechSupport.js'
import SpeechOutput from './SpeechOutput.jsx'
import SpeechCaptureBlock from './SpeechCaptureBlock.jsx'

const LANGS = ['en-US', 'en-GB']

// Блок 2 пробы «Голос»: эталонная фраза, язык, кнопки «Сказать»/«Стоп»/«Ещё раз»; вывод — в SpeechOutput.
export default function SpeechTestBlock({ caps, reference, setReference, lang, setLang, probe, cap }) {
  const { view, start, stop, busy } = probe
  return (
    <section className="aspBlock">
      <h3 className="aspH">Проверка</h3>
      <label className="aspLabel">Эталонная фраза
        <input className="aspInput" value={reference} onChange={e => setReference(e.target.value)}
          disabled={busy} spellCheck={false} autoCapitalize="off" />
      </label>
      <div className="aspChips">
        {EXAMPLES.map(ex => (
          <button key={ex} className={`aspChip${ex === reference ? ' aspChipOn' : ''}`} disabled={busy}
            onClick={() => setReference(ex)}>{ex}</button>
        ))}
      </div>
      <div className="aspRow">
        <span className="aspLabelInline">Язык</span>
        {LANGS.map(l => (
          <button key={l} className={`aspChip${l === lang ? ' aspChipOn' : ''}`} disabled={busy}
            onClick={() => setLang(l)}>{l}</button>
        ))}
      </div>
      <SpeechCaptureBlock mode={cap.mode} setMode={cap.setMode} state={cap.state} busy={busy} />
      <div className="aspRow">
        <button className="aspSay" onClick={start} disabled={!caps.recognition || busy || !reference.trim()}>Сказать</button>
        <button className="aspStop" onClick={stop} disabled={!busy}>Стоп</button>
        {view.status === 'listening' && <span className="aspRec"><i className="aspDot" />идёт запись…</span>}
      </div>
      {!caps.recognition && <p className="aeError">На этом устройстве распознавания речи в браузере нет — проверять нечего.</p>}
      <SpeechOutput view={view} busy={busy} onAgain={start} />
    </section>
  )
}

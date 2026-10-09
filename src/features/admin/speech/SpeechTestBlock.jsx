import { EXAMPLES } from '../../../shared/lib/speech/speechSupport.js'
import SpeechOutput from './SpeechOutput.jsx'
import SpeechCaptureBlock from './SpeechCaptureBlock.jsx'
import AntiPredictBlock from './AntiPredictBlock.jsx'
import AntiPredictTable from './AntiPredictTable.jsx'
import { TEST_LANGS as LANGS } from './antiPredictModes.js'

// Блок 2 пробы «Голос»: эталонная фраза, язык, кнопки «Сказать»/«Стоп»/«Ещё раз»; вывод — в SpeechOutput.
export default function SpeechTestBlock({ caps, reference, setReference, lang, setLang, probe, cap, ap }) {
  const { view, start, stop, busy } = probe
  const cooling = !!view.cooling && !busy // прошлый экземпляр ещё закрывается / пауза после end: «Сказать» заблокировано
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
      <AntiPredictBlock ap={ap} reference={reference} busy={busy || cooling} recognition={caps.recognition} onOneWord={word => start({ reference: word })} />
      <div className="aspRow">
        <button className="aspSay" onClick={start} disabled={!caps.recognition || busy || cooling || !reference.trim()}>{cooling ? 'Подготовка микрофона…' : 'Сказать'}</button>
        <button className="aspStop" onClick={stop} disabled={!busy}>Стоп</button>
        {view.status === 'listening' && <span className="aspRec"><i className="aspDot" />идёт запись…</span>}
      </div>
      {!caps.recognition && <p className="aeError">На этом устройстве распознавания речи в браузере нет — проверять нечего.</p>}
      <SpeechOutput view={view} busy={busy || cooling} onAgain={start} />
      <AntiPredictTable view={view} said={ap.said} caps={caps} />
    </section>
  )
}

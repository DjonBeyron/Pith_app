import { errorHelp, EXAMPLES } from './speechSupport.js'
import SpeechResult from './SpeechResult.jsx'

const LANGS = ['en-US', 'en-GB']

const fmtConf = c => (typeof c === 'number' ? `${Math.round(c * 100)}%` : 'нет данных')

// Блок 2 пробы «Голос»: эталонная фраза, язык, «Сказать»/«Стоп», живой текст, итог, альтернативы, ошибка, сравнение.
export default function SpeechTestBlock({ caps, reference, setReference, lang, setLang, probe }) {
  const { view, start, stop, listening } = probe
  const err = view.error
  return (
    <section className="aspBlock">
      <h3 className="aspH">Проверка</h3>
      <label className="aspLabel">Эталонная фраза
        <input className="aspInput" value={reference} onChange={e => setReference(e.target.value)}
          disabled={listening} spellCheck={false} autoCapitalize="off" />
      </label>
      <div className="aspChips">
        {EXAMPLES.map(ex => (
          <button key={ex} className={`aspChip${ex === reference ? ' aspChipOn' : ''}`} disabled={listening}
            onClick={() => setReference(ex)}>{ex}</button>
        ))}
      </div>
      <div className="aspRow">
        <span className="aspLabelInline">Язык</span>
        {LANGS.map(l => (
          <button key={l} className={`aspChip${l === lang ? ' aspChipOn' : ''}`} disabled={listening}
            onClick={() => setLang(l)}>{l}</button>
        ))}
      </div>
      <div className="aspRow">
        <button className="aspSay" onClick={start} disabled={!caps.recognition || listening || !reference.trim()}>Сказать</button>
        <button className="aspStop" onClick={stop} disabled={!listening}>Стоп</button>
        {listening && <span className="aspRec"><i className="aspDot" />идёт запись…</span>}
      </div>
      {!caps.recognition && <p className="aeError">На этом устройстве распознавания речи в браузере нет — проверять нечего.</p>}

      {view.interim && <div className="aspLive" aria-label="Промежуточный текст">{view.interim}</div>}
      {view.final && (
        <div className="aspFinal">
          <div className="aspFinalText">«{view.final.text}»</div>
          <div className="aspHint">
            Уверенность: {fmtConf(view.final.confidence)}
            {view.usedInterim && ' · итога от браузера не было, взят последний промежуточный текст'}
          </div>
        </div>
      )}
      {view.alternatives.length > 1 && (
        <ol className="aspAlts" aria-label="Альтернативы">
          {view.alternatives.map((a, i) => <li key={i}>{a.text} <span className="aspHint">({fmtConf(a.confidence)})</span></li>)}
        </ol>
      )}
      {err && (
        <div className="aspErr"><b>{err}</b> — {errorHelp(err)}</div>
      )}
      {view.status === 'done' && !view.final && !err && (
        <p className="aeHint">Остановлено, текста не получено.</p>
      )}
      {view.final && <SpeechResult reference={reference} alternatives={view.alternatives} />}
    </section>
  )
}

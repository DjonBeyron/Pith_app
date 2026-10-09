import { errorHelp } from '../../../shared/lib/speech/speechSupport.js'
import SpeechResult from './SpeechResult.jsx'

const fmtConf = c => (typeof c === 'number' ? `${Math.round(c * 100)}%` : 'нет данных')

// Вывод блока «Проверка»: заголовок попытки, «Эталон»/«Услышали» двумя строками, статус, ошибка, альтернативы, сравнение.
// Всё берётся из view (эталон и язык зафиксированы на момент тапа), а не из текущих полей ввода.
export default function SpeechOutput({ view, busy, onAgain }) {
  const err = view.error
  if (!view.runNo) return null
  const time = view.at ? new Date(view.at).toLocaleTimeString('ru-RU') : ''
  return (
    <div className="aspOut">
      <div className="aspRunHead">
        Попытка №{view.runNo} · {time} · {view.lang}
        {view.attempt > 1 && ` · запись ${view.attempt} из ${view.maxAttempts}`}
      </div>
      <div className="aspPair"><span className="aspPairKey">Эталон</span><span className="aspPairVal">«{view.reference}»</span></div>
      {view.notice && <div className="aspNotice">{view.notice}</div>}
      {view.interim && <div className="aspLive" aria-label="Промежуточный текст">{view.interim}</div>}
      {view.final && (
        <div className="aspFinal">
          <div className="aspPair"><span className="aspPairKey">Услышали</span><span className="aspFinalText">«{view.final.text}»</span></div>
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
      {err && <div className="aspErr"><b>{err}</b> — {errorHelp(err)}</div>}
      {view.hint && <div className="aspNotice">{view.hint}</div>}
      {view.needTap && <div className="aspRow"><button className="aspSay" onClick={onAgain} disabled={busy}>Ещё раз</button></div>}
      {view.status === 'done' && !view.final && !err && <p className="aeHint">Остановлено, текста не получено.</p>}
      {view.final && <SpeechResult reference={view.reference} alternatives={view.alternatives} />}
    </div>
  )
}

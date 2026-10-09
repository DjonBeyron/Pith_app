import { MODE_LABEL, PERM_LABEL } from '../../../shared/lib/speech/speechSupport.js'

// Блок 1 пробы «Голос»: что умеет это устройство. Только чтение возможностей, микрофон не включается.
export default function SpeechCapsBlock({ caps, perm }) {
  const rows = [
    ['Распознавание речи', caps.recognition ? `есть (${caps.ctorName})` : 'НЕТ — window.SpeechRecognition недоступен', caps.recognition],
    ['Режим запуска', MODE_LABEL[caps.mode], true],
    ['Разрешение микрофона', perm == null ? '…' : PERM_LABEL[perm], perm === 'granted' ? true : perm === 'denied' ? false : null],
    ['getUserMedia', caps.getUserMedia ? 'есть' : 'нет', caps.getUserMedia],
    ['Безопасный контекст (https)', caps.secure ? 'да' : 'нет', caps.secure],
    ['Платформа', caps.uaShort, true],
  ]
  return (
    <section className="aspBlock">
      <h3 className="aspH">Что умеет это устройство</h3>
      <div className="aspCaps">
        {rows.map(([k, v, ok]) => (
          <div key={k} className="aspCapRow">
            <span className="aspCapKey">{k}</span>
            <span className={`aspCapVal${ok === true ? ' aspOk' : ok === false ? ' aspBad' : ''}`}>{v}</span>
          </div>
        ))}
      </div>
      <details className="aspUa">
        <summary>Полный userAgent</summary>
        <code>{caps.ua}</code>
      </details>
    </section>
  )
}

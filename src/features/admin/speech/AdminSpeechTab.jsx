import { useState, useEffect, useCallback } from 'react'
import { getCapabilities, queryMicPermission, EXAMPLES } from './speechSupport.js'
import { readLog } from './speechLog.js'
import { useSpeechProbe } from './useSpeechProbe.js'
import SpeechCapsBlock from './SpeechCapsBlock.jsx'
import SpeechTestBlock from './SpeechTestBlock.jsx'
import SpeechLogBlock from './SpeechLogBlock.jsx'
import SpeechMemo from './SpeechMemo.jsx'
import '../../../styles/admin-speech.css'

// «Сеанс» = с открытия страницы приложения (а не вкладки админки)
const SESSION_START = Math.round(performance.timeOrigin || Date.now())

// Админ → «Голос»: пробная страница Web Speech API на реальных телефонах (перед модулем «Сказать фразу»).
// Ничего не пишем в БД и не шлём на сервер, звук не сохраняем; микрофон — только по тапу «Сказать».
export default function AdminSpeechTab() {
  const [caps] = useState(getCapabilities)
  const [perm, setPerm] = useState(null)
  const [reference, setReference] = useState(EXAMPLES[0])
  const [lang, setLang] = useState('en-US')
  const [log, setLog] = useState(readLog)
  const probe = useSpeechProbe({ reference, lang, onLogged: setLog })
  const { reset } = probe

  // Смена эталона/языка — прошлый итог, альтернативы и сравнение очищаем целиком
  const changeReference = useCallback(v => { reset(); setReference(v) }, [reset])
  const changeLang = useCallback(v => { reset(); setLang(v) }, [reset])

  useEffect(() => {
    let alive = true
    queryMicPermission().then(p => { if (alive) setPerm(p) })
    return () => { alive = false }
  }, [log]) // после каждой попытки состояние разрешения читаем заново

  return (
    <div className="aeWrap">
      <div className="aeHead"><span className="aeTitle">Голос (проба распознавания речи)</span></div>
      <p className="aeHint">Тест Web Speech API перед модулем «Сказать фразу». Ничего не отправляется на наш сервер и не сохраняется, кроме журнала в этом браузере.</p>
      <SpeechCapsBlock caps={caps} perm={perm} />
      <SpeechTestBlock caps={caps} reference={reference} setReference={changeReference} lang={lang} setLang={changeLang} probe={probe} />
      <SpeechLogBlock log={log} setLog={setLog} caps={caps} perm={perm} since={SESSION_START} />
      <SpeechMemo />
    </div>
  )
}

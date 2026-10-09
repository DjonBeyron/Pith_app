import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getCapabilities, queryMicPermission, EXAMPLES } from '../../../shared/lib/speech/speechSupport.js'
import { readLog } from './speechLog.js'
import { useSpeechProbe } from './useSpeechProbe.js'
import { useSpeechCapture } from './useSpeechCapture.js'
import { useAntiPredict } from './useAntiPredict.js'
import { useContextSeries } from './useContextSeries.js'
import { useRestartSeries } from './useRestartSeries.js'
import { useTabSilence } from './useTabSilence.js'
import { phraseFor } from './controlSeries.js'
import SpeechCapsBlock from './SpeechCapsBlock.jsx'
import SimpleTestsBlock from './SimpleTestsBlock.jsx'
import SpeechTestBlock from './SpeechTestBlock.jsx'
import SpeechLogBlock from './SpeechLogBlock.jsx'
import SpeechSayBlock from './SpeechSayBlock.jsx'
import SpeechMemo from './SpeechMemo.jsx'
import SpeechCaptureMemo from './SpeechCaptureMemo.jsx'
import '../../../styles/admin-speech.css'

// «Сеанс» = с открытия страницы приложения (а не вкладки админки)
const SESSION_START = Math.round(performance.timeOrigin || Date.now())

// Админ → «Голос»: пробная страница Web Speech API на реальных телефонах (перед модулем «Сказать фразу»).
// Ничего не пишем в БД и не шлём на сервер, звук не сохраняем; микрофон — только по тапу «Сказать». Пока вкладка видна, звуки приложения и «разблокировки» молчат (useTabSilence).
export default function AdminSpeechTab() {
  const rootRef = useRef(null)
  useTabSilence(rootRef)
  const [caps] = useState(getCapabilities)
  const [perm, setPerm] = useState(null)
  const [reference, setReference] = useState(EXAMPLES[0])
  const [lang, setLang] = useState('en-US')
  const [log, setLog] = useState(readLog)
  const cap = useSpeechCapture()
  const series = useContextSeries()
  const restart = useRestartSeries()
  const { activeFor, record: recordSeries, setStep } = series
  const { record: recordRestart } = restart
  // Старт серии из 6 нажатий снимает выбранный шаг теста 1, чтобы нажатия теста 2 не попадали в карточки теста 1 (эталон у них общий)
  const restartApi = useMemo(() => ({ ...restart, start: lang => { setStep(null); restart.start(lang) } }), [restart, setStep])
  const activeSeries = useMemo(() => activeFor(reference), [activeFor, reference])
  const ap = useAntiPredict({ reference, lang, series: activeSeries })
  const onLogged = useCallback(entries => { setLog(entries); recordSeries(entries[0]); recordRestart(entries[0]) }, [recordSeries, recordRestart]) // стабильный: контроллер создаётся один раз
  const probe = useSpeechProbe({ reference, lang, onLogged, capture: cap.manager, getCapture: cap.getMode, getExtra: ap.getExtra })
  const { reset } = probe
  const { setSaid } = ap

  // Смена эталона/языка — прошлый итог, альтернативы и сравнение очищаем целиком
  const changeReference = useCallback(v => { reset(); setReference(v) }, [reset])
  const changeLang = useCallback(v => { reset(); setLang(v) }, [reset])
  // Шаг серии: эталон шага + «что я сказал» = ошибочная фраза шага (чтобы правила сразу оценили «поймало/пропустило»)
  // В режиме «контроль» говорим эталон (правильно), «что я сказал» = эталон; mode можно передать явно (переключатель режима в тот же тап)
  const pickStep = useCallback((i, mode = series.state.mode) => {
    changeReference(series.state.cfg.refs[i])
    setSaid(phraseFor(series.state.cfg, i, mode) ?? '')
    setStep(i)
  }, [series.state.cfg, series.state.mode, changeReference, setSaid, setStep])

  useEffect(() => {
    let alive = true
    queryMicPermission().then(p => { if (alive) setPerm(p) })
    return () => { alive = false }
  }, [log]) // после каждой попытки состояние разрешения читаем заново

  return (
    <div className="aeWrap" ref={rootRef}>
      <div className="aeHead"><span className="aeTitle">Голос (проба распознавания речи)</span></div>
      <p className="aeHint">Тест Web Speech API перед модулем «Сказать фразу». Ничего не отправляется на наш сервер и не сохраняется, кроме журнала в этом браузере.</p>
      <SpeechCapsBlock caps={caps} perm={perm} />
      <SpeechSayBlock />
      <SimpleTestsBlock caps={caps} reference={reference} lang={lang} setLang={changeLang} probe={probe} series={series} onPickStep={pickStep} restart={restartApi} dwell={ap.settings.dwell} onDwell={v => ap.update({ dwell: v })} />
      <SpeechTestBlock caps={caps} reference={reference} setReference={changeReference} lang={lang} setLang={changeLang} probe={probe} cap={cap} ap={ap} />
      <SpeechLogBlock log={log} setLog={setLog} caps={caps} perm={perm} since={SESSION_START} series={series.state} />
      <SpeechCaptureMemo />
      <SpeechMemo />
    </div>
  )
}

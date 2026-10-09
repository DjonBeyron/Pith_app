import { useState, useEffect, useRef, useMemo } from 'react'
import { VOSK_INFO } from './antiPredictInfo.js'
import { buildVoskGrammar } from './antiPredictModes.js'
import { classifyPhrase } from './antiPredictRules.js'
import { VOSK_MODEL_URL, readModelUrl, writeModelUrl, loadEngine, startListening } from './voskEngine.js'

const STAGE = { lib: 'Загружаем библиотеку (≈6 МБ)…', model: 'Скачиваем и распаковываем модель (≈40 МБ)…' }
const KIND = { ref: 'форма эталона — верно', wrong: 'ошибочная форма — ПОЙМАНА', other: 'не из списка ([unk]) — не распознано', empty: 'пусто' }
const fmtMb = n => (n ? `${(n / 1048576).toFixed(1)} МБ` : 'неизвестно')

// Эксперимент 10: Vosk с закрытым словарём из эталона и ошибочных форм. Ничего не грузится, пока не нажата кнопка «Загрузить».
export default function VoskLab({ reference, wrong }) {
  const [url, setUrl] = useState(readModelUrl)
  const [phase, setPhase] = useState('idle') // idle | loading | ready | listening
  const [stage, setStage] = useState('')
  const [load, setLoad] = useState(null) // { libMs, modelMs, size }
  const [partial, setPartial] = useState('')
  const [res, setRes] = useState(null)   // { text, stats, grammar, reference, wrong }
  const [error, setError] = useState('')
  const model = useRef(null)
  const sess = useRef(null)
  const ctl = useRef({}) // ctl.cancel() — отмена загрузки модели
  const grammar = useMemo(() => buildVoskGrammar(reference, wrong), [reference, wrong])

  useEffect(() => () => { sess.current?.cancel(); model.current?.terminate?.() }, [])

  async function loadIt() {
    setError(''); setPhase('loading'); writeModelUrl(url)
    try {
      const r = await loadEngine(url, s => setStage(STAGE[s]), ctl.current)
      model.current = r.model
      setLoad({ libMs: r.libMs, modelMs: r.modelMs, size: r.size })
      setPhase('ready')
    } catch (e) { setError(e?.message || String(e)); setPhase('idle') }
  }

  async function say() { // вызывается в тапе: getUserMedia требует жест
    setError(''); setPartial(''); setRes(null)
    const snap = { grammar, reference, wrong }
    try {
      setPhase('listening')
      sess.current = await startListening(model.current, grammar, {
        onPartial: setPartial,
        onResult: (text, stats) => { setRes({ text, stats, ...snap }); setPartial(''); setPhase('ready') },
        onError: msg => { setError(msg); setPhase('ready') },
      })
    } catch (e) { setError(e?.name === 'NotAllowedError' ? 'Микрофон не разрешён' : (e?.message || String(e))); setPhase('ready') }
  }

  function unload() {
    sess.current?.cancel(); model.current?.terminate?.(); model.current = null
    setPhase('idle'); setLoad(null); setPartial(''); setRes(null)
  }

  const kind = res ? classifyPhrase(res.text, res.reference, res.wrong) : null
  return (
    <div className="apCard">
      <div className="apCardHead"><b>{VOSK_INFO.n}. {VOSK_INFO.title}</b><span className="aspExp"> эксперимент</span></div>
      <p className="aspHint">{VOSK_INFO.text}</p>
      <label className="aspLabel">Адрес модели (tar.gz)
        <input className="aspInput" value={url} onChange={e => setUrl(e.target.value)} disabled={phase !== 'idle'} spellCheck={false} autoCapitalize="off" />
      </label>
      {url !== VOSK_MODEL_URL && <button className="aeRefresh" disabled={phase !== 'idle'} onClick={() => setUrl(VOSK_MODEL_URL)}>Вернуть адрес по умолчанию</button>}
      <div className="aspHint">Закрытый словарь: <code>{grammar}</code></div>
      <div className="aspRow">
        {phase === 'idle' && <button className="aspSay apSmall" onClick={loadIt}>Загрузить движок Vosk (≈40 МБ)</button>}
        {phase === 'loading' && <><span className="aspHint">{stage}</span><button className="aeRefresh" onClick={() => ctl.current.cancel?.()}>Отменить</button></>}
        {phase === 'ready' && <button className="aspSay apSmall" onClick={say}>Сказать (Vosk)</button>}
        {phase === 'listening' && <button className="aspStop" onClick={() => sess.current?.stop()}>Стоп</button>}
        {phase === 'listening' && <span className="aspRec"><i className="aspDot" />слушаю…</span>}
        {(phase === 'ready' || phase === 'listening') && <button className="aeRefresh" onClick={unload}>Выгрузить модель</button>}
      </div>
      {load && (
        <div className="aspHint">
          Замер загрузки: размер архива модели {fmtMb(load.size)} · библиотека {load.libMs} мс · модель {load.modelMs} мс
          · ядер {navigator.hardwareConcurrency ?? '?'}{navigator.deviceMemory ? ` · память ≥${navigator.deviceMemory} ГБ` : ''}
        </div>
      )}
      {partial && <div className="aspLive" aria-label="Промежуточный текст Vosk">{partial}</div>}
      {res && (
        <div className="aspFinal">
          <div className="aspPair"><span className="aspPairKey">Vosk</span><span className="aspFinalText">«{res.text || '—'}»</span></div>
          <div className={`aspVerdict ${kind === 'ref' || kind === 'wrong' ? 'aspVerdictOk' : 'aspVerdictNo'}`}>{KIND[kind]}</div>
          <div className="aspHint">
            Задержка: первый промежуточный {res.stats.firstPartialMs ?? '—'} мс · итог {res.stats.resultMs ?? '—'} мс от «Сказать»
            {res.stats.afterStopMs != null && ` · ${res.stats.afterStopMs} мс после «Стоп»`}
            {res.stats.loadPct != null && ` · главный поток занят ${res.stats.loadPct}% времени записи (сам распознаватель — в воркере, его нагрузка не видна)`}
          </div>
        </div>
      )}
      {error && <div className="aspErr"><b>{error}</b></div>}
    </div>
  )
}

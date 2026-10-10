import { useState, useEffect, useRef, useMemo } from 'react'
import { VOSK_INFO } from './antiPredictInfo.js'
import { buildVoskGrammar } from './antiPredictModes.js'
import { classifyPhrase } from './antiPredictRules.js'
import { loadEngine, unloadEngine, startListening, heapMb } from '../../../shared/lib/vosk/voskEngine.js'
import { readModelUrl } from '../../../shared/lib/vosk/voskConfig.js'
import { getModel, fmtMb } from '../../../shared/lib/vosk/voskDownload.js'
import { errorText } from '../../../shared/lib/vosk/voskErrors.js'
import VoskModelAddress from './VoskModelAddress.jsx'
import VoskModelBlock from './VoskModelBlock.jsx'
import VoskVocabTest from './VoskVocabTest.jsx'
import { setVoskModel, setVoskBusy, useVoskEngine } from './voskSession.js'
import '../../../styles/admin-vosk.css'

const STAGE = { lib: 'Загружаем библиотеку (≈6 МБ)…', model: 'Распаковываем модель и загружаем в память…' }
const KIND = { ref: 'форма эталона — верно', wrong: 'ошибочная форма — ПОЙМАНА', other: 'не из списка ([unk]) — не распознано', empty: 'пусто' }

// Эксперимент 10: Vosk с закрытым словарём из эталона и ошибочных форм. Ничего не качается и не грузится, пока не нажата кнопка.
// Порядок: адрес модели → «Скачать модель» (в кеш устройства) → «Загрузить движок в память» → проверка → «Выгрузить движок».
export default function VoskLab({ reference, wrong }) {
  const [url, setUrl] = useState(readModelUrl)
  const [phase, setPhase] = useState('idle') // idle | loading | ready | listening | testing
  const [stage, setStage] = useState('')
  const [cache, setCache] = useState(null)   // { size } — модель лежит в кеше устройства
  const [load, setLoad] = useState(null)     // { libMs, modelMs, size, heap, from }
  const [dl, setDl] = useState(null)         // результат скачивания в этой сессии { ms, ... } (+ Blob, если не влезло в кеш)
  const [partial, setPartial] = useState('')
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const model = useRef(null)
  const sess = useRef(null)
  const ctl = useRef({}) // ctl.cancel() — отмена загрузки в память
  const grammar = useMemo(() => buildVoskGrammar(reference, wrong), [reference, wrong])

  const shared = useVoskEngine()
  const other = shared.busy && phase === 'ready' // «Тест 3» сейчас пишет — один микрофон на всех
  useEffect(() => () => { sess.current?.cancel(); unloadEngine(model.current); setVoskModel(null) }, [])
  useEffect(() => { if (phase === 'listening' || phase === 'testing') setVoskBusy(true); else if (phase === 'ready') setVoskBusy(false) }, [phase])

  async function loadIt() {
    setError(''); setPhase('loading')
    try {
      const m = dl?.blob ? dl : await getModel(url) // модель берём из кеша; из сети — никогда (качает только кнопка «Скачать»)
      const r = await loadEngine(m.blob, s => setStage(STAGE[s]), ctl.current)
      model.current = r.model
      setVoskModel(r.model, { model: (url.split('/').pop() || 'модель'), modelMs: r.modelMs })
      setLoad({ libMs: r.libMs, modelMs: r.modelMs, size: r.size, heap: r.heap, from: dl?.from === 'network' ? 'network' : 'cache' })
      setPhase('ready')
    } catch (e) { setError(errorText(e)); setPhase('idle') }
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

  function unload() { // «Выгрузить движок»: воркер, модель в памяти и её копия в IndexedDB освобождаются
    sess.current?.cancel(); unloadEngine(model.current); model.current = null; setVoskModel(null)
    setPhase('idle'); setLoad(null); setPartial(''); setRes(null)
  }
  const onFetched = r => { setError(''); setDl(!r || r.from !== 'network' ? null : r.saveError ? r : { from: 'network', ms: r.ms, size: r.size }) } // Blob держим в памяти, только если в кеш не влезло

  const kind = res ? classifyPhrase(res.text, res.reference, res.wrong) : null
  const meta = { url, size: load?.size ?? cache?.size ?? null, from: load?.from, downloadMs: dl?.ms ?? null, libMs: load?.libMs, modelMs: load?.modelMs, heap: load?.heap }
  const loaded = phase === 'ready' || phase === 'listening' || phase === 'testing'
  return (
    <div className="apCard">
      <div className="apCardHead"><b>{VOSK_INFO.n}. {VOSK_INFO.title}</b><span className="aspExp"> эксперимент</span></div>
      <p className="aspHint">{VOSK_INFO.text}</p>
      <VoskModelAddress url={url} setUrl={setUrl} locked={phase !== 'idle'} />
      <VoskModelBlock url={url} locked={loaded || phase === 'loading'} onCache={setCache} onFetched={onFetched} />
      <div className="aspHint">Закрытый словарь: <code>{grammar}</code></div>
      <div className="aspRow">
        {phase === 'idle' && <button className="aspSay apSmall" disabled={!cache && !dl?.blob} onClick={loadIt}>Загрузить движок в память</button>}
        {phase === 'loading' && <><span className="aspHint">{stage}</span><button className="aeRefresh" onClick={() => ctl.current.cancel?.()}>Отменить</button></>}
        {phase === 'ready' && <button className="aspSay apSmall" disabled={other} onClick={say}>Сказать (Vosk)</button>}
        {phase === 'listening' && <button className="aspStop" onClick={() => sess.current?.stop()}>Стоп</button>}
        {phase === 'listening' && <span className="aspRec"><i className="aspDot" />слушаю…</span>}
        {loaded && <button className="aeRefresh" disabled={phase === 'testing' || other} onClick={unload}>Выгрузить движок</button>}
      </div>
      {phase === 'idle' && !cache && !dl?.blob && <div className="aspHint">Сначала скачайте модель на устройство.</div>}
      {load && (
        <div className="aspHint">
          Замер: модель в память <b>{load.modelMs} мс</b> (это распаковка и загрузка, без скачивания) · библиотека {load.libMs} мс · архив {fmtMb(load.size)}
          {dl?.ms != null && load.from === 'network' && ` · скачивание ${(dl.ms / 1000).toFixed(1)} с`}
          · ядер {navigator.hardwareConcurrency ?? '?'}{navigator.deviceMemory ? ` · память ≥${navigator.deviceMemory} ГБ` : ''}
          {heapMb() != null && ` · память страницы ≈${heapMb()} МБ (модель живёт в воркере и сюда не входит)`}
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
      <VoskVocabTest model={() => model.current} ready={phase === 'ready' && !other} lock={b => setPhase(b ? 'testing' : 'ready')} meta={meta} />
    </div>
  )
}

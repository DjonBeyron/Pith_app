import { useState, useRef, useEffect } from 'react'
import { getModel, fmtMb, fmtSpeed } from './voskDownload.js'
import { peekCached, deleteModel, storageInfo, requestPersist, cacheAvailable } from './voskStorage.js'
import { cellularWarning, errorText, MODEL_MB } from './voskErrors.js'

const isStandalone = () => globalThis.matchMedia?.('(display-mode: standalone)')?.matches || globalThis.navigator?.standalone === true

// Модель на устройстве: статус, «Скачать модель (≈40 МБ)» по явному нажатию (без авто-скачивания), прогресс/скорость/отмена,
// «Удалить», «Закрепить хранилище», занято/квота. Скачанное лежит в Cache Storage; в память движка его грузит VoskLab.
// onCache(info|null) — есть ли модель в кеше; onFetched(результат) — только что скачали (нужен Blob, если в кеш не влезло).
export default function VoskModelBlock({ url, locked, onCache, onFetched }) {
  const [cached, setCached] = useState(null)   // { size } | null
  const [prog, setProg] = useState(null)        // { loaded, total, pct, speed, attempt } пока идёт скачивание
  const [ask, setAsk] = useState('')            // предупреждение о мобильной сети — ждём подтверждения
  const [msg, setMsg] = useState('')            // результат последнего скачивания
  const [error, setError] = useState('')
  const [store, setStore] = useState(null)      // { usage, quota, persisted }
  const [persistMsg, setPersistMsg] = useState('')
  const ctl = useRef(null)

  const [tick, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1) // перечитать статус кеша и квоту (после скачивания / удаления / закрепления)
  useEffect(() => { // только читаем: что лежит в кеше и сколько занято. Сеть не трогаем
    let on = true
    peekCached(url).then(c => { if (on) { setCached(c); onCache?.(c) } })
    storageInfo().then(st => { if (on) setStore(st) })
    return () => { on = false }
  }, [url, onCache, tick])
  useEffect(() => () => ctl.current?.abort(), [])

  async function start() {
    setAsk(''); setError(''); setMsg('')
    ctl.current = new AbortController()
    setProg({ loaded: 0, total: null, pct: null, speed: 0, attempt: 1 })
    try {
      const r = await getModel(url, {
        allowNetwork: true, signal: ctl.current.signal,
        onProgress: p => setProg(old => ({ ...old, ...p })),
        onAttempt: (n, e) => { setProg(old => ({ ...old, attempt: n, loaded: 0, pct: null })); setMsg(`${errorText(e)}. Попытка ${n} из 3…`) },
      })
      const secs = r.ms != null ? ` за ${(r.ms / 1000).toFixed(1)} с` : ''
      setMsg(r.from === 'cache' ? 'Модель уже была в кеше.' : `Скачано ${fmtMb(r.size)}${secs}${r.attempts > 1 ? `, попыток: ${r.attempts}` : ''}.${r.kind === 'zip' ? ' Это ZIP: если движок не прочитает архив — перепакуйте в tar.gz.' : ''}`)
      if (r.saveError) setError(`Скачано, но не сохранено на устройстве: ${errorText(r.saveError)}. Модель доступна только до закрытия страницы.`)
      onFetched?.(r)
    } catch (e) { setError(errorText(e)); setMsg('') }
    setProg(null)
    refresh()
  }
  function press() { // явное подтверждение: на мобильной сети/экономии трафика спрашиваем ещё раз
    const w = cellularWarning(globalThis.navigator?.connection)
    if (w) setAsk(w); else start()
  }
  async function remove() {
    await deleteModel()
    setMsg('Модель удалена с устройства.'); setError(''); onFetched?.(null)
    refresh()
  }
  async function persist() {
    const r = await requestPersist()
    setPersistMsg(!r.supported ? 'Браузер не поддерживает закрепление хранилища.' : r.granted ? 'Хранилище закреплено: браузер не будет стирать модель сам.' : 'Браузер не закрепил хранилище (бывает до установки приложения на экран «Домой»). Модель всё равно хранится, но система может её стереть при нехватке места.')
    refresh()
  }

  const status = prog ? `скачивается ${prog.pct != null ? `${prog.pct}%` : fmtMb(prog.loaded)}` : cached ? `скачана (${fmtMb(cached.size)})` : 'нет'
  return (
    <div className="vkBox">
      <div className="vkStatus">Модель: <b>{status}</b></div>
      {!cacheAvailable() && <div className="aspErr"><b>Кеш браузера недоступен (нужен https): модель не сохранится на устройстве.</b></div>}
      {prog && (
        <>
          <div className="vkBar" role="progressbar" aria-valuenow={prog.pct ?? 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${prog.pct ?? 100}%`, opacity: prog.pct == null ? 0.4 : 1 }} /></div>
          <div className="aspHint">
            {fmtMb(prog.loaded)}{prog.total ? ` из ${fmtMb(prog.total)}` : ' (полный размер неизвестен: на хосте нет ExposeHeaders Content-Length)'}
            {' · '}{fmtSpeed(prog.speed)}{prog.speed && prog.total ? ` · осталось ≈${Math.ceil((prog.total - prog.loaded) / prog.speed)} с` : ''}
            {prog.attempt > 1 ? ` · попытка ${prog.attempt} из 3` : ''}
          </div>
          <div className="aspRow"><button className="aeRefresh" onClick={() => ctl.current?.abort()}>Отменить</button></div>
        </>
      )}
      {!prog && !cached && !ask && <button className="aspSay apSmall" onClick={press}>Скачать модель (≈{MODEL_MB} МБ)</button>}
      {!prog && !cached && !ask && <div className="aspHint">Одно скачивание, дальше модель хранится на устройстве. Лучше по Wi-Fi. Само ничего не качается.</div>}
      {ask && (
        <div className="vkAsk">
          <div>{ask}</div>
          <div className="aspRow"><button className="aspSay apSmall" onClick={start}>Всё равно скачать</button><button className="aeRefresh" onClick={() => setAsk('')}>Отмена</button></div>
        </div>
      )}
      {msg && <div className="aspHint">{msg}</div>}
      {error && <div className="aspErr"><b>{error}</b>{!/отменено/.test(error) && !prog && !cached && <> <button className="aeRefresh" onClick={press}>Повторить</button></>}</div>}
      <div className="aspRow">
        {cached && !prog && <button className="aeRefresh" disabled={locked} onClick={remove}>Удалить модель с устройства</button>}
        <button className="aeRefresh" onClick={persist}>Закрепить хранилище</button>
      </div>
      {cached && locked && <div className="aspHint">Чтобы удалить модель, сначала «Выгрузить движок».</div>}
      {store?.usage != null && (
        <div className="aspHint">Хранилище сайта: занято {fmtMb(store.usage)} из {fmtMb(store.quota)}{store.persisted != null ? ` · закреплено: ${store.persisted ? 'да' : 'нет'}` : ''}</div>
      )}
      {persistMsg && <div className="aspHint">{persistMsg}</div>}
      <div className="aspHint">
        {isStandalone() ? 'Приложение открыто с экрана «Домой»: на iPhone для таких приложений действует более мягкое вытеснение, чем у вкладки Safari (7-дневная очистка к ним не применяется).'
          : 'iPhone: во вкладке Safari данные сайта без заходов могут стереться (правило 7 дней). Из приложения на экране «Домой» это не касается, но при нехватке места система всё равно может вытеснить кеш.'}
      </div>
    </div>
  )
}

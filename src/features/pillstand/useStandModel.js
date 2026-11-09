import { useState, useEffect, useReducer } from 'react'
import { voskRuntime } from '../../shared/lib/vosk/voskRuntime.js'
import { voskRuntimeRu } from '../../shared/lib/vosk/voskRuntimes.js'
import { createSwitcher } from '../pitrace/raceSwitch.js'
import { useVoskReady } from '../../shared/lib/vosk/useVoskReady.js'

// Модель Vosk стенда пилюль (CONCEPT_PILLSTAND.md): английская держится всё время стенда (useVoskReady, как карточка игры: нет в кэше — notice «Нужно скачать», VoskReadyNotice), русская — только проверка кэша; «RU» — то же переключение слуха, что в игре (raceSwitch.js: английская выгружается, русская грузится,
// пока идёт — expect, слушатели ждут), «EN» — обратно; на выходе из стенда английская возвращается. Каждый шаг (этапы прогрева обеих моделей, переключение) — в трассу ('model').
// → { ready (модель нужного языка в памяти), switching, failed, stage, notice (useVoskReady языка — для VoskReadyNotice), warm() — «Загрузить модель» вручную }.
const runtimeFor = lang => (lang === 'ru' ? voskRuntimeRu : voskRuntime)

export default function useStandModel(lang, trace) {
  const [sw] = useState(() => createSwitcher({ en: voskRuntime, ru: voskRuntimeRu, log: m => trace.push('model', { text: m }) }))
  const [, bump] = useReducer(x => x + 1, 0)
  const [done, setDone] = useState({ lang: 'en', ok: true }) // итог последнего переключения (ставится только по его завершении)
  const vosk = useVoskReady({ why: 'stand' })
  const voskRu = useVoskReady({ lang: 'ru', hold: false })
  const ruCached = voskRu.status === 'ready' // русская докачалась после неудачного переключения — переключаемся заново
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const watch = name => { let prev = ''; return rt => () => { const st = rt.snapshot().stage; if (st !== prev) { prev = st; trace.push('model', { lang: name, stage: st, loaded: !!rt.getModel() }) } bump() } }
    const offs = [voskRuntime.subscribe(watch('en')(voskRuntime)), voskRuntimeRu.subscribe(watch('ru')(voskRuntimeRu))]
    return () => { offs.forEach(f => f()); if (sw.state() !== 'en') sw.toEn('выход из стенда') }
  }, [sw, trace])
  useEffect(() => {
    let live = true
    trace.push('lang', { lang })
    const go = lang === 'ru' ? sw.toRu() : sw.toEn('стенд: EN').then(() => ({ ok: true }))
    go.then(r => { if (!live) return; trace.push('model', { lang, switched: !!r?.ok, text: r?.text ?? '' }); setDone({ lang, ok: !!r?.ok, text: r?.text ?? '' }) })
    return () => { live = false }
  }, [lang, sw, trace, ruCached, retry])
  const rt = runtimeFor(lang)
  const snap = rt.snapshot()
  const switching = done.lang !== lang
  const ready = !switching && done.ok && !!rt.getModel() && sw.state() === lang
  return { ready, switching, failed: !switching && !done.ok ? done.text || 'не включилась' : '', stage: snap.stage, loading: snap.loading, notice: lang === 'ru' ? voskRu : vosk, warm: () => { trace.push('model', { lang, warm: 'вручную' }); if (lang === 'ru') setRetry(x => x + 1); else rt.warmNow('manual') } }
}

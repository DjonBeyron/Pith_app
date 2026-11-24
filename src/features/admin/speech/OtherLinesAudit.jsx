import { useEffect, useMemo, useState } from 'react'
import { getCatLines } from '../../../shared/api/catLinesApi.js'
import { auditVoice, auditSummary, otherCatalog } from './voiceAudit.js'

// Раздел «Старое» вкладки «Голос»: аудит озвучки реплик ДРУГИХ игр (v3.3.356, владелец: «всё, что не «Встряхни память», перенеси в олд»). Блок «Озвучка Пита» теперь считает только гонку и Мию;
// реплики первой игры («Повтори за диктором»: round_*, well_done …) и «Мини-игры 2.0» (rh2_*) озвучиваются в своих блоках ниже (тест репетиции, «Шлифовка репетиции»), здесь — только показ, чего не хватает.
const WHERE = id => (id.startsWith('rh2_') ? 'Шлифовка репетиции → «Мини-игра 2.0»' : id.startsWith('rh_') ? 'Шлифовка репетиции' : 'тест репетиции («Озвучить»)')

export default function OtherLinesAudit() {
  const [raw, setRaw] = useState(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    Promise.resolve(getCatLines({ fresh: true })).then(r => { if (live) { setRaw(r ?? null); setReady(true) } }).catch(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [])
  const a = useMemo(() => auditVoice(raw, otherCatalog()), [raw])
  const note = auditSummary(a)
  return (
    <section className="aspBlock rhpBlock" data-testid="other-lines-audit">
      <h3 className="aspH">Реплики других игр (не «Встряхни память»)</h3>
      {!ready ? <span className="rhpHint">проверяю озвучку…</span>
        : !note ? <span className="rhpHint">Все реплики других игр озвучены</span>
        : (
          <>
            <span className="aspErr" role="status"> {note}</span>
            <ul data-testid="other-lines-list">{a.missing.map(e => <li key={e.id}><code>{e.id}</code> — {e.reason}. Озвучить: {WHERE(e.id)}</li>)}</ul>
          </>
        )}
    </section>
  )
}

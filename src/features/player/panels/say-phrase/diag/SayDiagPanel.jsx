import { useMemo, useState, useEffect, useRef } from 'react'
import { buildDiagRows, diagReport, GROUP_TITLE } from '../../../../../shared/lib/speech/sayDiagRows.js'
import { warmJournal, WORKING } from '../../../../../shared/lib/speech/sayDiagWarm.js'
import { warmNowFromDiag } from '../../../../../shared/lib/speech/sayDiagContext.js'
import { MARK } from '../../../../../shared/lib/speech/sayDiagExplain.js'
import { forceBackground } from '../../../../../shared/lib/vosk/voskBackground.js'
import { copyText } from '../../../../admin/speech/copyText.js'

// Содержимое окна диагностики: строки «метка · название — пояснение (подсказка)» по группам, внизу «Скопировать отчёт» (с журналом этапов прогрева), «Прогреть сейчас» (voskRuntime.warmNow: запуск / перезапуск
// прогрева вручную, результат — в группе «Прогрев Vosk») и «Загрузить модель сейчас» (фоновая загрузка вне очереди: voskBackground.forceBackground).
// Окно лежит поверх (абсолютно, см. say-phrase-diag.css), раскладку модуля не двигает.
export default function SayDiagPanel({ ctx }) {
  const rows = useMemo(() => (ctx ? buildDiagRows(ctx) : []), [ctx])
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  if (!ctx) return <p className="sayDiagWait">Собираю данные…</p>

  const inCache = !!ctx.cache || ctx.bg.state === 'cached'
  const downloading = ctx.bg.state === 'downloading'
  async function copy() {
    const ok = await copyText(diagReport(rows, { now: ctx.now, ua: ctx.env.ua, journal: warmJournal(ctx.info) }))
    setCopied(ok)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }
  return (
    <>
      {Object.keys(GROUP_TITLE).map(g => (
        <section key={g} className="sayDiagGroup">
          <h4 className="sayDiagTitle">{GROUP_TITLE[g]}</h4>
          {rows.filter(r => r.group === g).map(r => (
            <div key={r.id} className={`sayDiagRow sayDiagRow--${r.level}`} data-testid={`say-diag-${r.id}`}>
              <span className="sayDiagMark" aria-hidden="true">{MARK[r.level]}</span>
              <span className="sayDiagText"><b>{r.label}</b> — {r.text}{r.hint ? <i className="sayDiagHint"> {r.hint}</i> : null}</span>
            </div>
          ))}
        </section>
      ))}
      <div className="sayDiagActions">
        <button type="button" className="sayDiagAct" onClick={copy}>{copied ? 'Скопировано' : 'Скопировать отчёт'}</button>
        <button type="button" className="sayDiagAct" disabled={ctx.snap.loaded} onClick={() => { warmNowFromDiag() }}>
          {ctx.snap.loaded ? 'Модель в памяти' : WORKING.includes(ctx.snap.stage) ? 'Перезапустить прогрев' : 'Прогреть сейчас'}
        </button>
        <button type="button" className="sayDiagAct" disabled={inCache || downloading || !ctx.env.online} onClick={() => { forceBackground() }}>
          {inCache ? 'Модель уже в кэше' : downloading ? 'Качается…' : 'Загрузить модель сейчас'}
        </button>
      </div>
    </>
  )
}

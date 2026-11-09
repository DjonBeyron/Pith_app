import { useState } from 'react'
import PillStandEar from './PillStandEar.jsx'
import VoskReadyNotice from '../../shared/ui/VoskReadyNotice.jsx'
import { summaryText, resultLine } from './pillStandSummary.js'
import { saveTrace, copyText } from './standExport.js'
import { SAVE_HOW } from '../player/modules/rotate-phone/wordLaneDebugExport.js'

// Под пилюлей стенда: «Старт» (микрофон — только из тапа, iOS), цель и пометка зачёта («зачёт ✓ ratio, чисто / нечисто, мс от конца голоса»), панель «что слышит Vosk» и выгрузка (сводка в буфер, трасса файлом).
const MIC_TEXT = { asking: 'Разрешите микрофон…', denied: 'Микрофон не разрешён — разрешите его для сайта и нажмите «Старт» ещё раз', unavailable: 'Микрофон недоступен' }

export default function PillStandLive({ s, r }) {
  const [note, setNote] = useState('')
  const { target, mic } = s
  const copy = async () => { const text = summaryText({ ...s.meta(), audio: r.rec?.audio?.type ?? '' }, s.trace.events()); const ok = await copyText(text); setNote(ok ? `Сводка скопирована: ${text.split('\n').length} строк` : 'Не получилось скопировать — используйте «⬇ Трасса»'); s.trace.push('export', { what: 'сводка', ok, lines: text.split('\n').length }) }
  const save = async () => { const got = await saveTrace({ meta: s.meta(), events: s.trace.events(), frames: r.rec?.frames ?? [], audio: r.rec?.audio ?? null }); setNote(`${SAVE_HOW[got.how] ?? got.how}: ${got.name}${got.audio ? ` + ${got.audio}` : ''}`); s.trace.push('export', { what: 'трасса', how: got.how, size: got.size }) }
  return (
    <>
      <div className="psStatus" data-testid="ps-status">
        {mic !== 'on'
          ? <><button type="button" className="psStart" onClick={s.start} disabled={mic === 'asking'} data-testid="ps-start">{mic === 'asking' ? '…' : 'Старт'}</button><span className="psHint">{MIC_TEXT[mic] ?? 'Микрофон включится по нажатию'}</span></>
          : <>
            {s.model.notice?.status !== 'ready' && <VoskReadyNotice vosk={s.model.notice} />}
            <span className="psTarget" data-testid="ps-target" data-say={target.say}>#{target.n + 1} говорить {`«${target.say}»`}</span>
            <span className="psResult" data-ok={s.result ? (s.result.ok ? '1' : '0') : undefined} data-testid="ps-result">{s.result ? resultLine({ ...s.result, endMs: s.view.result?.endMs }) : s.model.ready ? 'слушаю…' : 'жду модель…'}</span>
          </>}
      </div>
      <PillStandEar view={s.view} rmsRef={r.rmsRef} onCopy={copy} onSave={save} note={note} />
    </>
  )
}

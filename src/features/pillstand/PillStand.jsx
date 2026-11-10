import { useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import WordLanePillEls from '../player/modules/rotate-phone/WordLanePillEls.jsx'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { isPillSafe } from '../player/modules/rotate-phone/wordLanePillSafe.js'
import usePillStand from './usePillStand.js'
import usePillStandRecord from './usePillStandRecord.js'
import PillStandBar from './PillStandBar.jsx'
import PillStandLive from './PillStandLive.jsx'
import PillStandPlayer from './PillStandPlayer.jsx'
import PillStandSend from './PillStandSend.jsx'
import useStandSend from './useStandSend.js'
import '../../styles/pillstand/pill-stand.css'
import '../../styles/pillstand/pill-stand-ear.css'
import '../../styles/pillstand/pill-stand-player.css'
import '../../styles/pillstand/pill-stand-send.css'
import '../../styles/pillstand/pill-stand-colors.css'

// «Стенд пилюль» (отладка, CONCEPT_PILLSTAND.md): полноэкранный портал как у игры (.wl), но без Пита, реплик, конвейера и узора — только НАСТОЯЩАЯ пилюля (пул, сцены и слушатели игры) и Vosk.
// Поле пилюли (.wlField: те же классы lite / safe, что у WordLanePills) — пилюля стоит на месте; во время просмотра записи поле скрыто, а над плеером — поле .psReplay с пилюлей из снимков.
// A–B плеера держится здесь (для своей записи: новая запись — без A–B), чтобы окно «📤 Отправить» (useStandSend, лист снизу поверх всего) видело его и с живого экрана.
// Открывает его кнопка «🧪 Стенд пилюль» на плашке «Голосом / Пальцами» (RaceAskPlate.jsx) — только при включённой отладке.
export default function PillStand({ onClose }) {
  const fieldRef = useRef(null), replayRef = useRef(null)
  const [viewing, setViewing] = useState(false)
  const [lite] = useState(isWeakDevice)
  const [safe] = useState(isPillSafe)
  const s = usePillStand(fieldRef, { paused: viewing })
  const r = usePillStandRecord({ trace: s.trace, probe: s.probe, ear: s.ear, viewing })
  const cls = `wlField psField${lite ? ' wl--lite' : ''}${safe ? ' wl--safe' : ''}`
  const pillRef = useMemo(() => ({ get current() { return replayRef.current?.querySelector('[data-pill]') ?? null } }), [])
  const view = on => { s.trace.push('view', { on }); setViewing(on) }
  const [ab, setAb] = useState({ rec: null, range: null })
  const range = ab.rec === r.rec ? ab.range : null
  const loop = useMemo(() => ({ range, setRange: v => setAb({ rec: r.rec, range: v }) }), [range, r.rec])
  const send = useStandSend({ trace: s.trace, meta: s.meta, rec: r.rec, ab: range })
  return createPortal(
    <div className="wl psStand" data-race="" data-phase="student" data-mode={s.target.mode} data-testid="pill-stand">
      <div className="wlStage">
        <div ref={fieldRef} className={cls} data-hide={viewing ? '1' : undefined} data-testid="ps-field"><WordLanePillEls count={3} testid="ps-pill" /></div>
        {viewing && <div ref={replayRef} className={`${cls} psReplay`} data-testid="ps-replay"><WordLanePillEls count={1} testid="ps-replay-pill" /></div>}
      </div>
      <PillStandBar s={s} r={r} viewing={viewing} onClose={onClose} onView={() => view(true)} />
      <div className="psBottom">
        {viewing && r.rec
          ? <PillStandPlayer rec={r.rec} meta={s.meta()} pillRef={pillRef} onClose={() => view(false)} onSend={send.open} range={loop} />
          : <PillStandLive s={s} r={r} onSend={() => send.open({ from: 'live' })} />}
      </div>
      {send.ctx && <PillStandSend ctx={send.ctx} form={send.form} onForm={send.setForm} recent={send.recent} ab={range} hasAudio={!!r.rec?.audio?.blob} marks={send.marks} onMark={send.addMark} onUnmark={send.unmark}
        onSend={send.send} onCopy={send.copy} onSendAudio={send.sendAudio} later={send.later} note={send.note} busy={send.busy} onClose={send.close} />}
    </div>,
    document.body,
  )
}

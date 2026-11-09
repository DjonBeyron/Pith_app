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
import '../../styles/pillstand/pill-stand.css'
import '../../styles/pillstand/pill-stand-ear.css'
import '../../styles/pillstand/pill-stand-player.css'

// «Стенд пилюль» (отладка, CONCEPT_PILLSTAND.md): полноэкранный портал как у игры (.wl), но без Пита, реплик, конвейера и узора — только НАСТОЯЩАЯ пилюля (пул, сцены и слушатели игры) и Vosk.
// Поле пилюли (.wlField: те же классы lite / safe, что у WordLanePills) — пилюля стоит на месте; во время просмотра записи поле скрыто, а над плеером — поле .psReplay с пилюлей из снимков.
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
  return createPortal(
    <div className="wl psStand" data-race="" data-phase="student" data-mode={s.target.mode} data-testid="pill-stand">
      <div className="wlStage">
        <div ref={fieldRef} className={cls} data-hide={viewing ? '1' : undefined} data-testid="ps-field"><WordLanePillEls count={3} testid="ps-pill" /></div>
        {viewing && <div ref={replayRef} className={`${cls} psReplay`} data-testid="ps-replay"><WordLanePillEls count={1} testid="ps-replay-pill" /></div>}
      </div>
      <PillStandBar s={s} r={r} viewing={viewing} onClose={onClose} onView={() => view(true)} />
      <div className="psBottom">
        {viewing && r.rec
          ? <PillStandPlayer rec={r.rec} meta={s.meta()} pillRef={pillRef} onClose={() => view(false)} />
          : <PillStandLive s={s} r={r} />}
      </div>
    </div>,
    document.body,
  )
}

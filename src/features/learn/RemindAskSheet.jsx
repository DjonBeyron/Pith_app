import { useEffect, useState } from 'react'
import { setRemindTime } from '../../shared/api/remindApi.js'
import { getPushState } from '../../shared/lib/push.js'
import { isIOS, isStandalone } from '../../shared/lib/pwaInstall.js'
import { track } from '../../shared/lib/analytics/track.js'
import { REMIND_TIME_SET } from '../../shared/lib/analytics/eventNames.js'
import { PRESETS, fmtTime, deviceClock, parseTime, presetOf, pushBranch } from './remindAsk.js'
import RemindDone from './RemindDone.jsx'

// Шторка «Когда тебе удобно учиться?» (PLAN_NEW_USER.md → C2, решения 11–13): три пресета,
// «Своё время» (любые часы и минуты + сверка с часами телефона), «Не нужно, загляну сам».
// Выбор сохраняется сразу (setRemindTime), дальше — RemindDone: подтверждение и ветка уведомлений.
// current — прежний выбор { hh, mm, enabled } (из настроек); onClose — шторка закрыта
const PERM = { on: 'granted', off: 'default', denied: 'denied', unsupported: 'unsupported' }
const pad = n => String(n).padStart(2, '0')
const is = (cur, h, m) => !!cur?.enabled && cur.hh === h && cur.mm === m

async function detectBranch(guest) {
  const state = await getPushState().catch(() => 'unsupported')
  return pushBranch({ isIos: isIOS(), standalone: isStandalone(), permission: PERM[state] ?? 'unsupported', guest })
}

export default function RemindAskSheet({ current = null, onClose }) {
  const preset = !!current?.enabled && PRESETS.some(([h, m]) => is(current, h, m))
  const [custom, setCustom] = useState(!!current?.enabled && !preset) // прежнее своё время — сразу раскрыто
  const [time, setTime] = useState(current?.enabled ? `${pad(current.hh)}:${pad(current.mm)}` : '20:00')
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const [res, setRes] = useState(null)

  useEffect(() => {
    if (!custom) return undefined
    const t = setInterval(() => setNow(new Date()), 20000)
    return () => clearInterval(t)
  }, [custom])

  async function save(sel, isCustom) {
    if (busy) return
    setBusy(true)
    setErr(false)
    const r = await setRemindTime(sel.enabled ? sel : { enabled: false })
    if (!r?.ok) { setBusy(false); setErr(true); return }
    const push = await detectBranch(!!r.guest)
    track(REMIND_TIME_SET, { preset: presetOf(sel, isCustom), push })
    setRes({ sel, push, needsTz: !!r.needs_tz, guest: !!r.guest })
    setBusy(false)
  }

  const parsed = parseTime(time)
  return (
    <div className="lrSheetBack" onClick={onClose}>
      <div className="lrSheet raSheet" role="dialog" aria-label="Когда удобно учиться" onClick={e => e.stopPropagation()}>
        {res ? <RemindDone res={res} onClose={onClose} /> : (
          <>
            <p className="lrSheetWord">Когда тебе удобно учиться?</p>
            <p className="lrSheetPhrase">Пит напомнит, когда пора повторить забытое</p>
            <div className="raPresets">
              {PRESETS.map(([hh, mm]) => (
                <button key={hh} className={is(current, hh, mm) ? 'raOpt raOptOn' : 'raOpt'} disabled={busy}
                  onClick={() => save({ hh, mm, enabled: true }, false)}>{fmtTime({ hh, mm })}</button>
              ))}
            </div>
            <button className={custom ? 'raOpt raOptWide raOptOn' : 'raOpt raOptWide'} aria-expanded={custom}
              onClick={() => setCustom(c => !c)}>Своё время</button>
            {custom && (
              <div className="raCustom">
                <input className="raTime" type="time" value={time} aria-label="Своё время" onChange={e => setTime(e.target.value)} />
                <p className="raClock">{deviceClock(now)}</p>
                <button className="lrBtn lrBtnMain" disabled={busy || !parsed}
                  onClick={() => save({ ...parsed, enabled: true }, true)}>Сохранить</button>
              </div>
            )}
            {err && <p className="raErr" role="alert">Не получилось сохранить. Попробуй ещё раз</p>}
            <button className="lrBtn lrBtnGhost" disabled={busy} onClick={() => save({ enabled: false }, false)}>Не нужно, загляну сам</button>
          </>
        )}
      </div>
    </div>
  )
}

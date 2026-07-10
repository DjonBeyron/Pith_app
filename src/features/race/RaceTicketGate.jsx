import { useState, useEffect } from 'react'
import { getCachedProfile, refreshProfile } from '../../shared/api/profileCache.js'
import { fetchMyRaceSpend, startRace } from '../../shared/api/ticketApi.js'

// Попап-«шлагбаум» супергонки: тап по баннеру → окно с правилами входа.
// Кнопка «Открыть доступ» списывает 1 золотой билет ПРЯМО ЗДЕСЬ (RPC
// start_race) и открывает страницу гонки; дальше вся гонка без доплат.
// Вход свободный (билет не тратится): админ · гонка завершена (итоги) ·
// уже финишировал · доступ к этой гонке уже оплачен раньше.
export default function RaceTicketGate({ race, phase, myEntry, onEnter, onClose }) {
  const profile = getCachedProfile()
  const tickets = Math.max(0, profile?.tickets ?? 0)
  const [spent, setSpent] = useState(false)
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')
  useEffect(() => {
    if (profile) fetchMyRaceSpend(race.id).then(setSpent)
  }, [race.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const finished = !!myEntry?.finished_at
  const free = !!profile?.is_admin || finished || phase === 'ended' || spent
  const allowed = free || tickets > 0

  // Открытие доступа: свободный вход — сразу; иначе списываем билет на сервере
  async function open() {
    if (free) { onEnter(); return }
    setBusy(true)
    const res = await startRace(race.id)
    setBusy(false)
    if (res?.ok) { refreshProfile(); onEnter(); return }
    setErr(res?.reason === 'no_ticket' ? 'Билетов не хватило'
      : res?.reason === 'closed' ? 'Гонка уже завершена'
        : 'Не получилось открыть доступ — попробуй ещё раз')
  }

  const status = !profile ? 'Войди в аккаунт, чтобы участвовать в гонке'
    : profile.is_admin ? 'Тебе как админу вход свободный'
    : finished ? 'Ты уже финишировал — вход на страницу результата свободный'
    : phase === 'ended' ? 'Гонка завершена — итоги открыты для всех'
    : spent ? 'Доступ к этой гонке уже оплачен — входи'
    : tickets > 0 ? `У тебя ${tickets} 🎟 — билет спишется сейчас, при открытии доступа`
    : 'У тебя нет билетов — вход закрыт'

  return (
    <div className="racePopupOverlay" onClick={onClose}>
      <div className="racePopupCard" onClick={e => e.stopPropagation()}>
        <div className="racePopupEmoji">🎟</div>
        <h3 className="racePopupTitle">Вход — 1 золотой билет</h3>
        <p className="racePopupText">
          Участие в супергонке{race?.title ? <> «<b>{race.title}</b>»</> : null} стоит
          один золотой билет. Он спишется при открытии доступа — дальше вся
          гонка без доплат.
        </p>
        <p className={`racePopupText rtGateStatus${allowed ? '' : ' rtGateStatusOff'}`}>{status}</p>
        <p className="racePopupText rtGateHow">
          <b>Как заработать:</b> пройди Финал любого модуля, раскрыв не больше
          3 переводов. Билет одноразовый, а с одного модуля его можно получить
          только один раз — береги для гонки.
        </p>
        {err && <p className="racePopupText rtGateStatusOff">{err}</p>}
        {allowed && (
          <button className="racePopupBtn" onClick={open} disabled={busy}>
            {busy ? '...' : free ? 'Войти →' : 'Открыть доступ'}
          </button>
        )}
        <button className="racePopupClose" onClick={onClose}>{allowed ? 'Позже' : 'Понятно'}</button>
      </div>
    </div>
  )
}

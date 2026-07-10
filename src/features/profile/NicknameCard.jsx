import { useState, useEffect } from 'react'
import { saveNickname } from '../../shared/api/ratingApi.js'
import { getProfile } from '../../shared/api/profileApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'

// Карточка «Ник» в настройках профиля: под этим именем пользователь виден
// в рейтинге и итогах супергонки. 2–20 символов, валидирует сервер.
export default function NicknameCard() {
  const [nick, setNick] = useState('')
  const [msg,  setMsg]  = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getProfile().then(p => { if (p?.nickname) setNick(p.nickname) })
  }, [])

  async function handleSave() {
    if (busy) return
    setBusy(true)
    setMsg('')
    const { nick: saved, error } = await saveNickname(nick)
    setBusy(false)
    if (error) { setMsg(error); return }
    setNick(saved)
    setMsg('✓ Сохранено')
    refreshProfile() // имя в шапке профиля обновится без перезахода
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="pvCard">
      <div className="pvCardTop">
        <span>Ник в рейтинге</span>
        {msg && <b>{msg}</b>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          className="authInput"
          style={{ flex: 1, margin: 0 }}
          value={nick}
          maxLength={20}
          placeholder="Твой ник (2–20 символов)"
          onChange={e => setNick(e.target.value)}
          disabled={busy}
        />
        <button
          className="authBtnPrimary"
          style={{ width: 'auto', padding: '0 16px', margin: 0 }}
          onClick={handleSave}
          disabled={busy || nick.trim().length < 2}
        >
          {busy ? '...' : 'ОК'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#78828c', marginTop: 8 }}>
        Первая смена бесплатно, вторая — через 7 дней, дальше — раз в месяц
      </div>
    </div>
  )
}

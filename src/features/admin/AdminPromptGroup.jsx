import { useState, useEffect } from 'react'
import { loadPromptShare, savePromptShare } from '../../shared/api/promptGroupApi.js'
import { MAX_SHARE } from '../../shared/lib/prompts/promptGroup.js'

// Админ → Аналитика: выключатель контрольной группы без вопросов Пита (PLAN_NEW_USER.md, решение 23).
// Доля 0–50% новых устройств, которым «умные» вопросы не показываются; 0 = группы нет. Хранится в app_settings.prompt_control.
// Группа устройства «прилипает» при первом запуске — смена доли действует на новых людей, уже распределённых не двигает.
export default function AdminPromptGroup() {
  const [value, setValue] = useState('')   // строка из поля
  const [saved, setSaved] = useState(null) // последняя известная доля на сервере
  const [msg, setMsg] = useState(null)     // { text, err }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPromptShare().then(s => {
      if (cancelled) return
      if (s == null) { setMsg({ text: 'Не удалось прочитать текущую долю', err: true }); return }
      setSaved(s)
      setValue(String(s))
    })
    return () => { cancelled = true }
  }, [])

  const num = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(num) && num >= 0 && num <= MAX_SHARE

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const s = await savePromptShare(num)
      setSaved(s)
      setValue(String(s))
      setMsg({ text: s === 0 ? 'Сохранено: контрольной группы нет' : `Сохранено: ${s}% новых без вопросов Пита` })
    } catch (e) {
      setMsg({ text: `Не удалось сохранить: ${e?.message ?? 'ошибка'}`, err: true })
    }
    setBusy(false)
  }

  return (
    <section className="anBlock">
      <div className="anShareRow">
        <span className="anShareLabel">Контрольная группа без вопросов Пита: {saved ?? '…'} %</span>
        <input
          className="anShareInput" type="number" inputMode="numeric" min="0" max={MAX_SHARE} step="1"
          value={value} onChange={e => setValue(e.target.value)} aria-label="Доля контрольной группы, %"
        />
        <button className="aeRefresh" disabled={!valid || busy} onClick={save}>Сохранить</button>
        <span className={msg?.err ? 'anShareMsg anShareMsgErr' : 'anShareMsg'}>
          {msg?.text ?? `0–${MAX_SHARE} %, 0 — группы нет. Действует на новых людей, уже распределённые остаются как были.`}
        </span>
      </div>
    </section>
  )
}

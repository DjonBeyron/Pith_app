import { useState, useEffect } from 'react'
import { APP_VERSION } from '../../../shared/lib/version.js'
import { refreshShellStatus, shellCommand } from '../../../shared/lib/shellClient.js'
import { shellRows, shellState } from './shellStatusView.js'
import VersionStamp from '../VersionStamp.jsx'

// Админ → «Старт»: «Быстрый старт (кеш оболочки)». Service worker отдаёт страницу приложения из своего кеша мгновенно (убирает окно
// «моргания» iOS между нативной картинкой и первым кадром). Здесь — статус и аварийные кнопки на случай, если что-то залипло.
// Аварийный выход без приложения: открыть адрес с ?nosw=1 (воркер отдаст страницу с сети, очистит кеш и выключит его на 24 ч).
export default function StartShellBlock() {
  const [status, setStatus] = useState(null)
  const [net, setNet] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // Версия в сети (version.json мимо кеша); null — нет сети
  const fetchNet = () => fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    .then(res => (res.ok ? res.json().then(j => j.v || null) : null)).catch(() => null)
  useEffect(() => {
    let off = false
    refreshShellStatus().then(s => { if (!off) setStatus(s) })
    fetchNet().then(v => { if (!off) setNet(v) })
    return () => { off = true }
  }, [])
  async function reload() {
    setStatus(await refreshShellStatus()); setNet(await fetchNet()); setNote('Обновлено')
  }

  async function run(label, type, extra, timeout) {
    setBusy(true); setNote(`${label}…`)
    const r = await shellCommand(type, extra, timeout)
    setBusy(false)
    if (!r) { setNote('Воркер не ответил (его нет или он спит) — нажми «Обновить»'); return null }
    if (r.type === 'error') { setNote(`Ошибка: ${r.error}`); return r }
    setStatus(r); setNote(`${label}: готово`)
    return r
  }
  const on = shellState(status).on
  const disabled = !!status && status.configured && !status.enabled
  const toggle = () => (disabled || !status?.own
    ? run('Включаю (качаю файлы сборки, ~несколько МБ)', 'shell-enable', {}, 60000)
    : run('Выключаю на 24 ч', 'shell-disable', { hours: 24 }))
  async function clearAndReload() {
    if (!window.confirm('Очистить кеш оболочки и перезагрузить приложение с сети?')) return
    const r = await run('Очищаю', 'purge-shell', { rebuild: true }, 3000)
    if (r) window.location.reload()
  }

  return (
    <section className="astVar astShell">
      <div className="aeTitle">Быстрый старт (кеш оболочки)</div>
      <VersionStamp className="astVersion" />
      <p className="aeHint">
        Приложение отдаётся из кеша на устройстве за единицы миллисекунд, а не ждёт сеть ~1 с. Новая версия подхватывается через плашку
        «Доступна новая версия» (не сразу после деплоя). Если что-то залипло — «Выключить» или адрес с <b>?nosw=1</b>.
      </p>
      <div className="astShellRows">
        {shellRows(status, net, APP_VERSION).map(([k, v]) => (
          <div key={k} className="astShellRow"><span className="astVarTitle">{k}</span><span className="astVarText">{v}</span></div>
        ))}
      </div>
      <div className="astBtns">
        <button className="aeRefresh" onClick={toggle} disabled={busy || !status || !status.configured}>{on ? 'Выключить на 24 ч' : 'Включить'}</button>
        <button className="aeRefresh" onClick={clearAndReload} disabled={busy || !status}>Очистить кеш и перезагрузить</button>
        <button className="aeRefresh" onClick={reload} disabled={busy}>Обновить</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
    </section>
  )
}

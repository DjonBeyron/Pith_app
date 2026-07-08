import { useState, useEffect } from 'react'
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, TRIGGERS } from '../../shared/api/pushTemplatesApi.js'
import { sendPush } from '../../shared/api/pushApi.js'

// Админ: список шаблонов пушей — редактирование текста, триггер, вкл/выкл,
// отправка по шаблону (себе/всем), удаление, добавление.
export default function AdminPushTemplates() {
  const [rows, setRows] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    listTemplates().then(setRows).catch(e => { setRows([]); setMsg('Ошибка: ' + e.message) })
  }, [])

  function patchRow(id, patch) {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  // Изменения пишем на сервер сразу (поля мелкие, конфликтов нет)
  async function save(id, patch) {
    patchRow(id, patch)
    try { await updateTemplate(id, patch) } catch (e) { setMsg('Не сохранилось: ' + e.message) }
  }

  async function add() {
    try {
      const t = await createTemplate()
      setRows(rs => [...rs, t])
      setOpenId(t.id)
    } catch (e) { setMsg('Ошибка: ' + e.message) }
  }

  async function remove(t) {
    if (!window.confirm(`Удалить шаблон «${t.name}»?`)) return
    setRows(rs => rs.filter(r => r.id !== t.id))
    try { await deleteTemplate(t.id) } catch (e) { setMsg('Не удалилось: ' + e.message) }
  }

  async function send(t, onlyMine) {
    if (!onlyMine && !window.confirm(`Отправить «${t.name}» ВСЕМ подписчикам?`)) return
    setMsg('Отправка...')
    try {
      const r = await sendPush({ title: t.title, body: t.body, url: t.url, onlyMine })
      setMsg(`«${t.name}»: подписок ${r.total}, отправлено ${r.sent}, ошибок ${r.failed}`)
    } catch (e) { setMsg('Ошибка отправки: ' + e.message) }
  }

  if (rows === null) return <div className="anHint">Загрузка шаблонов...</div>

  return (
    <div className="aptWrap">
      <h3 className="anTitle">Шаблоны</h3>
      {rows.map(t => (
        <div key={t.id} className="aptRow">
          <div className="aptHead">
            <button className="aptName" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
              {t.name || 'Без имени'}
              <span className="aptTrig">{TRIGGERS.find(x => x.value === t.trigger_kind)?.label ?? t.trigger_kind}</span>
            </button>
            <label className="anCheck aptOn">
              <input type="checkbox" checked={t.enabled} onChange={e => save(t.id, { enabled: e.target.checked })} />
              вкл
            </label>
            <button className="amDel" onClick={() => remove(t)} title="Удалить шаблон">✕</button>
          </div>
          {openId === t.id && (
            <div className="aptEdit">
              <label className="anField">Имя (только для списка)
                <input value={t.name} onChange={e => patchRow(t.id, { name: e.target.value })} onBlur={e => save(t.id, { name: e.target.value })} maxLength={60} />
              </label>
              <label className="anField">Заголовок пуша
                <input value={t.title} onChange={e => patchRow(t.id, { title: e.target.value })} onBlur={e => save(t.id, { title: e.target.value })} maxLength={80} />
              </label>
              <label className="anField">Текст
                <textarea rows={3} value={t.body} onChange={e => patchRow(t.id, { body: e.target.value })} onBlur={e => save(t.id, { body: e.target.value })} maxLength={300} />
              </label>
              <label className="anField">Триггер
                <select value={t.trigger_kind} onChange={e => save(t.id, { trigger_kind: e.target.value })}>
                  {TRIGGERS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </label>
              <div className="aptBtns">
                <button onClick={() => send(t, true)}>Отправить себе</button>
                <button className="primaryBtn" onClick={() => send(t, false)}>Отправить всем</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button className="aptAdd" onClick={add}>+ Новый шаблон</button>
      {msg && <div className="anResult">{msg}</div>}
    </div>
  )
}

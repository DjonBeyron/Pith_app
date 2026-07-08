import { useState, useEffect } from 'react'
import { loadCurricula, saveCurriculum, deleteCurriculumFromServer, updateCurriculumPublished } from '../../shared/lib/curriculaApi.js'
import { supabase } from '../../shared/api/supabase.js'
import { findEnabledTemplate } from '../../shared/api/pushTemplatesApi.js'
import { sendPush } from '../../shared/api/pushApi.js'
import CurriculumView from '../lessons/CurriculumView.jsx'
import { dbg } from '../../shared/lib/debug.js'

// Админ-вкладка «Модули» (ui v2, по макету admin.html): список модулей с
// чипами «видео есть/нет» и «опубликован/черновик» (чип публикации — тумблер),
// «+ Новый модуль», тап по строке — схема модуля, ✕ — удаление.
export default function AdminModulesTab({ onOpenCanvas }) {
  const [rows, setRows] = useState(null) // null = загрузка
  const [openModule, setOpenModule] = useState(null)
  const [busy, setBusy] = useState(false)

  function refresh() {
    loadCurricula().then(setRows).catch(() => setRows([]))
  }
  useEffect(refresh, [])

  async function handleCreate() {
    setBusy(true)
    try {
      const id = crypto.randomUUID()
      await saveCurriculum(id, 'Новый модуль', [])
      setOpenModule({ id, title: 'Новый модуль' })
      refresh()
    } finally { setBusy(false) }
  }

  async function handleTogglePublished(m) {
    // Оптимистично: чип переключается сразу, сервер — в фоне
    setRows(rs => rs.map(r => r.id === m.id ? { ...r, published: !m.published } : r))
    try { await updateCurriculumPublished(m.id, !m.published) } catch { refresh(); return }
    // Триггер «публикация модуля»: если есть включённый шаблон — предлагаем
    // разослать пуш всем подписчикам (с подтверждением, чтобы случайный тык
    // по тумблеру не спамил)
    if (!m.published) {
      const t = await findEnabledTemplate('new_module')
      if (t && window.confirm(`Модуль опубликован. Разослать пуш «${t.title}» всем подписчикам?`)) {
        try {
          const r = await sendPush({ title: t.title, body: t.body, url: t.url, onlyMine: false })
          dbg('[push] new_module:', JSON.stringify(r))
        } catch (e) { dbg('[push] new_module failed:', e.message) }
      }
    }
  }

  async function handleDelete(m) {
    if (!window.confirm(`Удалить модуль «${m.title}» со всеми уроками?`)) return
    setBusy(true)
    try {
      const ids = m.lesson_ids ?? []
      if (ids.length) {
        const { error } = await supabase.from('lessons').delete().in('id', ids)
        if (error) dbg('[ADMIN] delete lessons:', error.message)
      }
      await deleteCurriculumFromServer(m.id)
      localStorage.removeItem(`curr_lessons_${m.id}`)
      refresh()
    } finally { setBusy(false) }
  }

  if (openModule) {
    return (
      <div className="feedModuleScreen">
        <CurriculumView
          curriculumId={openModule.id}
          curriculumTitle={openModule.title}
          onBack={() => { setOpenModule(null); refresh() }}
          onOpenCanvas={onOpenCanvas}
        />
      </div>
    )
  }

  return (
    <div className="amScreen">
      <button className="amCreateBtn" onClick={handleCreate} disabled={busy}>+ Новый модуль</button>

      {rows === null ? (
        <div className="amEmpty">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="amEmpty">Модулей пока нет</div>
      ) : rows.map(m => (
        <div key={m.id} className="amRow">
          <button className="amRowMain" onClick={() => setOpenModule({ id: m.id, title: m.title })}>
            <span className="amRowTitle">{m.title}</span>
            <span className="amRowSub">{(m.lesson_ids ?? []).length} уроков · открыть схему</span>
            <span className="amChips">
              <span className={m.video_url ? 'amChip amChipOk' : 'amChip amChipWarn'}>
                {m.video_url ? 'видео есть' : 'нет видео'}
              </span>
            </span>
          </button>
          <button
            className={m.published ? 'amChip amChipOk amChipBtn' : 'amChip amChipDim amChipBtn'}
            onClick={() => handleTogglePublished(m)}
            title="Переключить публикацию">
            {m.published ? 'опубликован' : 'черновик'}
          </button>
          <button className="amDel" onClick={() => handleDelete(m)} disabled={busy} title="Удалить модуль">✕</button>
        </div>
      ))}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { loadCurricula, saveCurriculum, deleteCurriculumFromServer, updateCurriculumStatus, renameCurriculum } from '../../shared/lib/curriculaApi.js'
import { supabase } from '../../shared/api/supabase.js'
import { findEnabledTemplate } from '../../shared/api/pushTemplatesApi.js'
import { sendPush } from '../../shared/api/pushApi.js'
import CurriculumView from '../lessons/CurriculumView.jsx'
import { dbg } from '../../shared/lib/debug.js'

// Админ-вкладка «Модули» (ui v2, по макету admin.html): список модулей с
// чипами «видео есть/нет» и статусом публикации (чип-циклер: черновик →
// превью → опубликован → черновик, см. handleCycleStatus), «+ Новый модуль»,
// тап по строке — схема модуля, ✕ — удаление.
export default function AdminModulesTab({ onOpenCanvas }) {
  const [rows, setRows] = useState(null) // null = загрузка
  const [openModule, setOpenModule] = useState(null)
  const [busy, setBusy] = useState(false)
  const [renameId, setRenameId]     = useState(null) // id переименовываемого модуля
  const [renameDraft, setRenameDraft] = useState('')

  function refresh() {
    loadCurricula().then(setRows).catch(() => setRows([]))
  }
  useEffect(refresh, [])

  // isPro=true — про-модуль: без Старта/Финала, скрыт от пользователей,
  // используется как супер-урок гонки (XP — после итогов гонки)
  async function handleCreate(isPro = false) {
    setBusy(true)
    try {
      const id = crypto.randomUUID()
      const title = isPro ? 'Про-модуль' : 'Новый модуль'
      await saveCurriculum(id, title, [], isPro)
      setOpenModule({ id, title, isPro })
      refresh()
    } finally { setBusy(false) }
  }

  // Черновик → превью (виден в ленте, без кнопки «Изучить фразу») →
  // опубликован (полностью живой) → снова черновик
  function nextStatus(m) {
    if (!m.published) return { published: true, previewOnly: true }
    if (m.preview_only) return { published: true, previewOnly: false }
    return { published: false, previewOnly: false }
  }

  async function handleCycleStatus(m) {
    const wasLive = m.published && !m.preview_only
    const next = nextStatus(m)
    // Оптимистично: чип переключается сразу, сервер — в фоне
    setRows(rs => rs.map(r => r.id === m.id ? { ...r, published: next.published, preview_only: next.previewOnly } : r))
    try { await updateCurriculumStatus(m.id, next) } catch { refresh(); return }
    // Триггер «публикация модуля» — именно переход В «опубликован» (а не в
    // превью): если есть включённый шаблон, предлагаем разослать пуш всем
    // подписчикам (с подтверждением, чтобы случайный тык не спамил)
    const nowLive = next.published && !next.previewOnly
    if (nowLive && !wasLive) {
      const t = await findEnabledTemplate('new_module')
      if (t && window.confirm(`Модуль опубликован. Разослать пуш «${t.title}» всем подписчикам?`)) {
        try {
          const r = await sendPush({ title: t.title, body: t.body, url: t.url, onlyMine: false })
          dbg('[push] new_module:', JSON.stringify(r))
        } catch (e) { dbg('[push] new_module failed:', e.message) }
      }
    }
  }

  function startRename(m) { setRenameId(m.id); setRenameDraft(m.title) }
  async function commitRename() {
    const v = renameDraft.trim()
    const id = renameId
    setRenameId(null)
    const m = rows?.find(r => r.id === id)
    if (!v || !m || v === m.title) return
    setRows(rs => rs.map(r => r.id === id ? { ...r, title: v } : r)) // оптимистично
    try { await renameCurriculum(id, v) } catch { refresh() }
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
          isPro={!!openModule.isPro}
          onBack={() => { setOpenModule(null); refresh() }}
          onOpenCanvas={onOpenCanvas}
        />
      </div>
    )
  }

  return (
    <div className="amScreen">
      <button className="amCreateBtn" onClick={() => handleCreate(false)} disabled={busy}>+ Новый модуль</button>
      <button className="amCreateBtn amCreatePro" onClick={() => handleCreate(true)} disabled={busy}>
        + Про-модуль (супер-урок гонки)
      </button>

      {rows === null ? (
        <div className="amEmpty">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="amEmpty">Модулей пока нет</div>
      ) : rows.map(m => (
        <div key={m.id} className="amRow">
          {renameId === m.id ? (
            <input
              className="amRowMain amRenameInput" autoFocus value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameId(null) }}
            />
          ) : (
            <button className="amRowMain" onClick={() => setOpenModule({ id: m.id, title: m.title, isPro: !!m.is_pro })}>
              <span className="amRowTitle">{m.title}</span>
              <span className="amRowSub">
                {(m.lesson_ids ?? []).length} уроков · {m.is_pro ? 'супер-урок гонки' : 'открыть схему'}
              </span>
              <span className="amChips">
                {m.is_pro
                  ? <span className="amChip amChipPro">PRO</span>
                  : <span className={m.video_url ? 'amChip amChipOk' : 'amChip amChipWarn'}>
                      {m.video_url ? 'видео есть' : 'нет видео'}
                    </span>}
              </span>
            </button>
          )}
          <button className="amChip amChipDim amChipBtn" onClick={() => startRename(m)} title="Переименовать">✎</button>
          {/* Про-модуль не публикуется в ленту — переключателя статуса у него нет */}
          {!m.is_pro && (
            <button
              className={
                !m.published ? 'amChip amChipDim amChipBtn'
                  : m.preview_only ? 'amChip amChipWarn amChipBtn'
                    : 'amChip amChipOk amChipBtn'
              }
              onClick={() => handleCycleStatus(m)}
              title="Переключить статус: черновик → превью → опубликован">
              {!m.published ? 'черновик' : m.preview_only ? 'превью' : 'опубликован'}
            </button>
          )}
          <button className="amDel" onClick={() => handleDelete(m)} disabled={busy} title="Удалить модуль">✕</button>
        </div>
      ))}
    </div>
  )
}

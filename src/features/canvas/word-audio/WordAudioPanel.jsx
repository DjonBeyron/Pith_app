import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useWordAudioLibrary } from './useWordAudioLibrary.js'
import WordAudioRow from './WordAudioRow.jsx'

const TABS = [
  { id: 'lesson', label: 'Этот урок' },
  { id: 'all',    label: 'Все уроки' },
  { id: 'lib',    label: 'База' },
]

// Меню 🔊 «Озвучка слов» (кнопка в шапке канваса, WordAudioButton.jsx).
// Библиотека живёт отдельно от уроков (PROJECT.md, «Озвучка слов»): здесь
// видно, каких слов из уроков в базе нет, и они озвучиваются одной кнопкой
// (ElevenLabs, по очереди) или файлом по одному. Вкладки: слова открытого
// урока, слова всех уроков (с указанием, где встречается), вся база с поиском.
export default function WordAudioPanel({ lessonId, onClose }) {
  const L = useWordAudioLibrary(lessonId)
  const [tab,   setTab]   = useState('lesson')
  const [query, setQuery] = useState('')
  const fileRef   = useRef(null)
  const uploadFor = useRef(null)   // { key, text } — для какого слова выбирают файл
  const playerRef = useRef(null)

  // Список строк вкладки: [{ key, text, lessons? }], неозвученные первыми
  const items = useMemo(() => {
    let arr
    if (tab === 'lesson') arr = [...L.thisLesson].map(([key, text]) => ({ key, text }))
    else if (tab === 'all') arr = [...L.allLessons].map(([key, v]) => ({ key, text: v.text, lessons: v.lessons }))
    else arr = [...(L.lib ?? new Map()).values()].map(r => ({ key: r.key, text: r.text }))
    const q = query.trim().toLowerCase()
    if (q) arr = arr.filter(it => it.key.includes(q) || it.text.toLowerCase().includes(q))
    const has = it => !!L.lib?.get(it.key)
    return arr.sort((a, b) => (has(a) - has(b)) || a.key.localeCompare(b.key))
  }, [tab, query, L.thisLesson, L.allLessons, L.lib])

  const missing = items.filter(it => !L.lib?.get(it.key))

  function play(url) {
    playerRef.current?.pause()
    const a = new Audio(url)
    playerRef.current = a
    a.play().catch(() => {})
  }
  function pickUpload(item) {
    uploadFor.current = item
    fileRef.current?.click()
  }
  function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f && uploadFor.current) L.uploadOne(uploadFor.current.key, uploadFor.current.text, f)
  }

  const quotaLeft = L.quota ? Math.max(0, L.quota.limit - L.quota.used) : null

  return createPortal(
    <div className="bgpOverlay" onMouseDown={onClose}>
      <div className="bgpModal warModal" onMouseDown={e => e.stopPropagation()}>
        <div className="bgpHeader">
          <span className="bgpTitle">🔊 Озвучка слов</span>
          <span className="lioMeta">
            {L.lib ? `в базе: ${L.lib.size}` : 'база…'}
            {quotaLeft != null && ` · ElevenLabs: ${quotaLeft.toLocaleString('ru-RU')} символов`}
          </span>
          <button className="lioClose" onClick={onClose}>×</button>
        </div>

        <div className="warTabs">
          {TABS.map(t => (
            <button key={t.id} className={`warTab${tab === t.id ? ' warTabOn' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
          <input className="warSearch" placeholder="поиск" value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div className="bgpSummary">
          <span className="bgpSummaryItem">слов: {items.length}</span>
          <span className={`bgpSummaryItem${missing.length ? ' bgpSummarySkip' : ''}`}>не озвучено: {missing.length}</span>
          {tab === 'all' && !L.scanReady && <span className="lioMeta">сканирую уроки…</span>}
          {tab === 'all' && L.scanReady && !L.busy && (
            <button className="warLink" onClick={L.refreshScan}>обновить</button>
          )}
          {L.busy ? (
            <>
              <span className="lioMeta">озвучиваю «{L.busy.key}» · {L.busy.done}/{L.busy.total}</span>
              <button className="lioBtn" onClick={L.cancel}>Остановить</button>
            </>
          ) : missing.length > 0 && (
            <button className="lioBtn lioBtnPrimary" onClick={() => L.generateMany(missing)}>
              Озвучить недостающие ({missing.length})
            </button>
          )}
        </div>

        {L.busy && (
          <div className="bgpProgressBar">
            <div className="bgpProgressFill" style={{ width: `${(L.busy.done / L.busy.total) * 100}%` }} />
          </div>
        )}

        {items.length === 0 ? (
          <div className="lioHint">
            {tab === 'lib' ? 'База пуста — озвучь слова из вкладок «Этот урок» или «Все уроки»' : 'В уроке нет слов для озвучки (только чистая латиница в модулях с выбором)'}
          </div>
        ) : (
          <ul className="warList">
            {items.map(it => (
              <WordAudioRow key={it.key} item={it} row={L.lib?.get(it.key) ?? null}
                lessons={tab === 'all' ? it.lessons : null}
                error={L.errors[it.key] ?? null}
                generating={L.busy?.key === it.key}
                disabled={!!L.busy}
                onPlay={play} onGenerate={item => L.generateMany([item])}
                onUpload={pickUpload} onDelete={L.remove} />
            ))}
          </ul>
        )}

        <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={onFile} />
      </div>
    </div>,
    document.body,
  )
}

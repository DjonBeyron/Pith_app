import { useEffect, useState } from 'react'
import { loadCurriculumTitleData, saveCurriculumTitleData } from '../../shared/lib/curriculaApi.js'
import { buildWordRows, remapWordRows } from '../../shared/lib/titleWords.js'

// Колонок перевода нет — значит миграция ещё не применена в Supabase; сырое
// сообщение Postgres админу ни о чём не говорит, подсказываем по-человечески
function friendlyError(e) {
  const msg = e?.message ?? String(e)
  return /title_translation|word_translations/.test(msg)
    ? 'В базе нет колонок перевода — примени миграцию supabase/migrations/20260725140000_module_translations.sql'
    : msg
}

// Редактор названия модуля (админ): вместо голого переименования — название,
// полный перевод фразы и перевод каждого слова. Слова разбиваются
// автоматически (splitTitleTokens: знаки препинания игнорируются), поле
// перевода появляется под каждым словом само и переезжает вместе с правкой
// названия (remapWordRows). Открывается из списка модулей и со схемы модуля.
export default function ModuleTitleEditor({ moduleId, initialTitle = '', onClose, onSaved }) {
  const [title,   setTitle]   = useState(initialTitle)
  const [full,    setFull]    = useState('')
  const [rows,    setRows]    = useState(() => buildWordRows(initialTitle, []))
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    let alive = true
    loadCurriculumTitleData(moduleId)
      .then(d => {
        if (!alive) return
        const t = d.title ?? ''
        setTitle(t)
        setFull(d.title_translation ?? '')
        setRows(buildWordRows(t, d.word_translations ?? []))
        setLoading(false)
      })
      .catch(e => { if (alive) { setErr(friendlyError(e)); setLoading(false) } })
    return () => { alive = false }
  }, [moduleId])

  function changeTitle(v) {
    setTitle(v)
    setRows(prev => remapWordRows(v, prev))
  }

  function changeRow(i, t) {
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, t } : r)))
  }

  async function handleSave() {
    const t = title.trim()
    if (!t || saving) return
    setSaving(true)
    setErr('')
    try {
      await saveCurriculumTitleData(moduleId, {
        title: t, titleTranslation: full, wordTranslations: rows,
      })
      onSaved?.(t)
      onClose()
    } catch (e) {
      setErr(friendlyError(e))
      setSaving(false)
    }
  }

  const filled = rows.filter(r => r.t.trim() !== '').length

  return (
    <div className="mteBackdrop" onClick={onClose}>
      <div className="mteCard" onClick={e => e.stopPropagation()}>
        <div className="mteHead">
          <span>Название и перевод</span>
          <button className="mteClose" onClick={onClose} title="Закрыть">✕</button>
        </div>

        {loading ? (
          <div className="mteHint">Загрузка...</div>
        ) : (
          <>
            <label className="mteLabel">Название модуля (фраза)</label>
            <input
              className="mteInput" autoFocus value={title}
              onChange={e => changeTitle(e.target.value)}
              placeholder="Например: Nice to meet you"
            />

            <label className="mteLabel">Полный перевод фразы</label>
            <textarea
              className="mteInput mteArea" value={full} rows={2}
              onChange={e => setFull(e.target.value)}
              placeholder="Показывается в ленте по «раскрыть перевод»"
            />

            <div className="mteWordsHead">
              Перевод по словам
              <span className="mteWordsCount">{filled} из {rows.length}</span>
            </div>
            {rows.length === 0 ? (
              <div className="mteHint">Впиши название — слова разберутся сами</div>
            ) : (
              <div className="mteWords">
                {rows.map((r, i) => (
                  <div className="mteWord" key={i}>
                    <span className="mteWordSrc">{r.w}</span>
                    <input
                      className="mteWordInput" value={r.t} placeholder="перевод"
                      onChange={e => changeRow(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            {err && <div className="mteErr">{err}</div>}

            <div className="mteActions">
              <button className="mteBtn" onClick={onClose}>Отмена</button>
              <button className="mteBtn mteBtnMain" onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? 'Сохраняю...' : 'Сохранить'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

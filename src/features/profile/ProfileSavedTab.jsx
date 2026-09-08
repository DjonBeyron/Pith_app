import { useAdmin } from '../../app/AdminContext.jsx'
import { setLessonBookmark } from '../../shared/lib/lessonBookmarksApi.js'

// Вкладка «Сохранённые»: закладки на модули (как раньше) + закладки на
// отдельные уроки (LessonRefModule.jsx «В закладки», lesson_ref) — та же
// закладка уже показывает урок в «Мои уроки» (MyLessons.jsx), здесь просто
// второе место, где видна вся история сохранённого. Вынесено из ProfileV2.jsx
// — тот упирался в мягкий потолок размера.
//
// Удалить закладку урока может только админ (тест/модерация): снимает её
// целиком, урок пропадает и отсюда, и из «Мои уроки» — обычному пользователю
// эта кнопка не нужна, у него уже есть тоггл прямо на карточке в чате.
export default function ProfileSavedTab({ savedModules, savedLessons, onOpenModule, onOpenLesson, onReload }) {
  const { isAdmin } = useAdmin()

  async function removeLessonBookmark(e, l) {
    e.stopPropagation()
    if (!window.confirm(`Убрать «${l.title}» из закладок? Урок пропадёт и из «Мои уроки».`)) return
    await setLessonBookmark(l.id, false)
    onReload()
  }

  if (savedModules.length === 0 && savedLessons.length === 0) {
    return <div className="pvEmpty">Сохраняй модули и уроки закладкой — они появятся здесь</div>
  }

  return (
    <>
      {savedModules.map(m => (
        <button key={m.id} className="pvWord pvModRow" onClick={() => onOpenModule(m)}>
          <span className="pvWordText">{m.title}</span>
          <span className="pvWordFrom">{m.pct === 100 ? 'пройден' : `${m.pct}%`}</span>
        </button>
      ))}
      {savedLessons.map(l => (
        <div key={l.id} className="pvRowShell">
          <button className="pvWord pvModRow" onClick={() => onOpenLesson(l.id)}>
            <span className="pvWordText">{l.title}</span>
            <span className="pvWordFrom">урок</span>
          </button>
          {isAdmin && (
            <button className="pvRowAdminReset" title="Админ: убрать из закладок (пропадёт и из «Мои уроки»)"
              onClick={e => removeLessonBookmark(e, l)}>✕</button>
          )}
        </div>
      ))}
    </>
  )
}

import { useAdmin } from '../../app/AdminContext.jsx'

// Переключатель «режим пользователя»: админ смотрит приложение глазами ученика.
// Живёт в шапке админки, над субвкладками — единственное место, откуда режим
// выключается обратно (весь остальной админский интерфейс в нём спрятан).
export default function AdminUserModeToggle() {
  const { userMode, setUserMode } = useAdmin()

  return (
    <div className={`avUserMode${userMode ? ' avUserModeOn' : ''}`}>
      <div className="avUserModeText">
        <span className="avUserModeTitle">Режим пользователя</span>
        <span className="avUserModeHint">
          {userMode
            ? 'Админский интерфейс скрыт. Кнопка «Админ» осталась — ею вернуть всё назад.'
            : 'Скрывает весь админский интерфейс, кроме кнопки «Админ». Права в базе не меняются.'}
        </span>
      </div>
      <label className="avUserModeSwitch">
        <input
          type="checkbox"
          checked={userMode}
          onChange={e => setUserMode(e.target.checked)}
        />
        <span className="avUserModeTrack" />
      </label>
    </div>
  )
}

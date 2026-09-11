import { useAdmin } from '../../app/AdminContext.jsx'
import AdminToggleRow from './AdminToggleRow.jsx'

// Переключатель «режим пользователя»: админ смотрит приложение глазами ученика.
// Живёт в шапке админки, над субвкладками — единственное место, откуда режим
// выключается обратно (весь остальной админский интерфейс в нём спрятан).
export default function AdminUserModeToggle() {
  const { userMode, setUserMode } = useAdmin()

  return (
    <AdminToggleRow
      title="Режим пользователя"
      on={userMode}
      onChange={setUserMode}
      hint="Скрывает весь админский интерфейс, кроме кнопки «Админ». Права в базе не меняются."
      hintOn="Админский интерфейс скрыт. Кнопка «Админ» осталась — ею вернуть всё назад."
    />
  )
}

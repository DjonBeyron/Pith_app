import { useState } from 'react'
import AdminToggleRow from './AdminToggleRow.jsx'
import { usePlayerDebugUi, setPlayerDebugUi } from '../../shared/lib/usePlayerDebugUi.js'

// Показывать ли ОСТАЛЬНЫМ (не-админам) диагностический набор в шапке урока:
// кнопку «⬇ лог» и номер версии. Одним тумблером оба — нужны они для одного
// и того же: получить от пользователя внятный отчёт о баге. Админ видит их
// всегда (кроме «режима пользователя» — там он и должен быть как ученик).
//
// Настройка общая, лежит в базе (app_settings.player_debug_ui). Пока сервер
// не подтвердил запись, тумблер заблокирован: иначе он показывал бы включённым
// то, что политика RLS могла и не пропустить.
export default function AdminDebugUiToggle() {
  const on = usePlayerDebugUi()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Значение сюда приходит уже прогретым: ShellV2 запрашивает его на старте
  // приложения, а админка грузится лениво и всегда позже
  async function handleChange(next) {
    setSaving(true)
    setError('')
    try {
      await setPlayerDebugUi(next)
    } catch (e) {
      setError(e?.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminToggleRow
      title="Лог и версия в шапке урока"
      on={on}
      disabled={saving}
      onChange={handleChange}
      hint={error || 'Кнопку «⬇ лог» и номер версии видит только админ. Включи, чтобы их видели все.'}
      hintOn={error || 'Кнопку «⬇ лог» и номер версии видят все — можно просить прислать лог.'}
    />
  )
}

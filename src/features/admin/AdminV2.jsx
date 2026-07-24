import { useState } from 'react'
import AdminModulesTab from './AdminModulesTab.jsx'
import AdminTab from './AdminTab.jsx'
import AdminNotificationsTab from './AdminNotificationsTab.jsx'
import AdminRaceTab from './AdminRaceTab.jsx'
import AdminStreakTab from './AdminStreakTab.jsx'
import AdminErrorsTab from './AdminErrorsTab.jsx'
import { APP_VERSION } from '../../shared/lib/version.js'

// Админ-раздел новой оболочки: субвкладки «Модули» (список с публикацией),
// «Файлы» (таблица файлов R2), «Пуши» (рассылка), «Гонка» (супергонка),
// «Стрик» (вехи наград) и «Ошибки» (ошибки клиентов из client_errors).
export default function AdminV2({ onOpenCanvas }) {
  const [sub, setSub] = useState('modules') // modules | files | push | race | streak | errors

  return (
    <div className="avWrap">
      <div className="avTabs">
        <button className={sub === 'modules' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('modules')}>
          Модули
        </button>
        <button className={sub === 'files' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('files')}>
          Файлы
        </button>
        <button className={sub === 'push' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('push')}>
          Пуши
        </button>
        <button className={sub === 'race' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('race')}>
          Гонка
        </button>
        <button className={sub === 'streak' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('streak')}>
          Стрик
        </button>
        <button className={sub === 'errors' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('errors')}>
          Ошибки
        </button>
      </div>
      <div className="avVersion">v{APP_VERSION}</div>
      {sub === 'modules' && <AdminModulesTab onOpenCanvas={onOpenCanvas} />}
      {sub === 'files' && <div className="shellV2Panel"><AdminTab /></div>}
      {sub === 'push' && <div className="shellV2Panel"><AdminNotificationsTab /></div>}
      {sub === 'race' && <div className="shellV2Panel"><AdminRaceTab /></div>}
      {sub === 'streak' && <AdminStreakTab />}
      {sub === 'errors' && <div className="shellV2Panel"><AdminErrorsTab /></div>}
    </div>
  )
}

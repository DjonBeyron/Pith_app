import { useState } from 'react'
import AdminModulesTab from './AdminModulesTab.jsx'
import AdminTab from './AdminTab.jsx'

// Админ-раздел новой оболочки: субвкладки «Модули» (список с публикацией)
// и «Файлы» (существующая таблица файлов R2).
export default function AdminV2({ onOpenCanvas }) {
  const [sub, setSub] = useState('modules') // modules | files

  return (
    <div className="avWrap">
      <div className="avTabs">
        <button className={sub === 'modules' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('modules')}>
          Модули
        </button>
        <button className={sub === 'files' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('files')}>
          Файлы
        </button>
      </div>
      {sub === 'modules'
        ? <AdminModulesTab onOpenCanvas={onOpenCanvas} />
        : <div className="shellV2Panel"><AdminTab /></div>}
    </div>
  )
}

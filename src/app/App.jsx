import { useState } from 'react'
import AdminTab from '../features/admin/AdminTab.jsx'
import UserTab from '../features/user/UserTab.jsx'

export default function App() {
  const [tab, setTab] = useState('user')

  return (
    <div className="app">
      <div className="tabs">
        <button
          className={tab === 'user' ? 'tabBtn tabBtnActive' : 'tabBtn'}
          onClick={() => setTab('user')}
        >
          Пользователь
        </button>
        <button
          className={tab === 'admin' ? 'tabBtn tabBtnActive' : 'tabBtn'}
          onClick={() => setTab('admin')}
        >
          Админ
        </button>
      </div>
      {tab === 'user' ? <UserTab /> : <AdminTab />}
    </div>
  )
}

import { useState } from 'react'

const TABS = [
  { id: 'profile',  label: 'Профиль' },
  { id: 'auth',     label: 'Войти' },
  { id: 'user',     label: 'Пользователь' },
  { id: 'lessons',  label: 'Уроки' },
  { id: 'admin',    label: 'Админ', adminOnly: true },
  { id: 'settings', label: 'Настройки' },
]

// Навигация по вкладкам: широкий экран — ряд кнопок, узкий — бургер-меню
// (переключение по media query в layout.css).
export default function TabsNav({ tab, onSelect, isAdmin }) {
  const [open, setOpen] = useState(false)
  const items = TABS.filter(t => !t.adminOnly || isAdmin)
  const current = items.find(t => t.id === tab)

  function pick(id) {
    onSelect(id)
    setOpen(false)
  }

  return (
    <>
      <div className="tabs tabsRow">
        {items.map(t => (
          <button key={t.id}
            className={tab === t.id ? 'tabBtn tabBtnActive' : 'tabBtn'}
            onClick={() => pick(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="tabsBurger">
        <button className="burgerBtn" onClick={() => setOpen(o => !o)}>☰</button>
        <span className="burgerCurrent">{current?.label ?? ''}</span>
        {open && (
          <>
            <div className="burgerBackdrop" onClick={() => setOpen(false)} />
            <div className="burgerMenu">
              {items.map(t => (
                <button key={t.id}
                  className={tab === t.id ? 'burgerItem burgerItemActive' : 'burgerItem'}
                  onClick={() => pick(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

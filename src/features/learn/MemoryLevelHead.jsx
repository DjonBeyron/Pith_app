import { useState } from 'react'

// Шапка уровня на странице памяти: название, что за слова, когда спросим.
// По умолчанию описание открыто; кнопка справа сверху — «Свернуть ⌃» — прячет его,
// освобождая место под список слов, и морфингом превращается в компактную кнопку
// «развернуть описание» (иконка описания и шеврон вниз). Нажатие — обратно.
// Сворачивание плавное (высота в CSS: grid-template-rows 1fr → 0fr), текст внутри
// не переносится заново по ходу анимации, список слов едет вслед за высотой,
// а не прыгает. Выбор запоминается в браузере (в разных уровнях и на следующих
// заходах шапка остаётся такой, как оставили)
const KEY = 'pithy_mem_head_shut_v1'

function readShut() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export default function MemoryLevelHead({ cur, level }) {
  const [shut, setShut] = useState(readShut)
  const mod = `memHead--${cur.perm ? 'Perm' : level}`

  function toggle() {
    const next = !shut
    setShut(next)
    try { localStorage.setItem(KEY, next ? '1' : '0') } catch { /* нет хранилища — не страшно */ }
  }

  return (
    <div className={`memHeadWrap ${mod}${shut ? ' memHeadWrap--shut' : ''}`}>
      <div className="memHeadFold" aria-hidden={shut}>
        <div className="memHeadClip">
          <div className={`memHead ${mod}`}>
            <b>{cur.name}</b>
            <p>{cur.about}</p>
            {cur.when && <div className="memHeadWhen">{cur.when}</div>}
          </div>
        </div>
      </div>
      <button className="memHeadToggle" onClick={toggle} aria-expanded={!shut}
        aria-label={shut ? 'Показать описание' : 'Скрыть описание'} title={shut ? 'Показать описание' : 'Скрыть описание'}>
        <span className="memHeadToggleLabel" aria-hidden="true">Свернуть</span>
        <svg className="memHeadToggleDoc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="3" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
        <svg className="memHeadToggleChev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
    </div>
  )
}

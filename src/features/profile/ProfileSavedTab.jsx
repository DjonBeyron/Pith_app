import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { readFlag, writeFlag } from '../../shared/lib/storedFlag.js'

const OPEN_KEY = 'pithy_profile_saved_open_v1'

// «Сохранённые уроки» в профиле: закладки на модули, которые ещё НЕ начаты (PROJECT.md → «Вкладки»: начатое живёт в
// «Моих уроках», закладки отдельных уроков — там же). Тап по строке — схема модуля. Раздел по умолчанию СВЁРНУТ, а
// развёрнутое/свёрнутое запоминается на устройстве. Список ограничен по высоте и листается внутри (без полосы прокрутки).
// Вынесено из ProfileV2.jsx.
export default function ProfileSavedTab({ savedModules, loading, onOpenModule }) {
  const [open, setOpen] = useState(() => readFlag(OPEN_KEY, false))
  const toggle = () => { writeFlag(OPEN_KEY, !open); setOpen(!open) }

  return (
    <>
      <button className="pvSectionTitle pvSectionBtn" aria-expanded={open} onClick={toggle}>
        Сохранённые уроки
        <ChevronDown className={open ? 'pvChev pvChevOpen' : 'pvChev'} />
      </button>
      {open && (loading ? (
        <div className="pvEmpty">Загрузка...</div>
      ) : savedModules.length === 0 ? (
        <div className="pvEmpty">Сохраняй уроки закладкой — те, что ещё не начал, появятся здесь</div>
      ) : (
        <div className="pvSavedList">
          {savedModules.map(m => (
            <button key={m.id} className="pvWord pvModRow" onClick={() => onOpenModule(m)}>
              <span className="pvWordText">{m.title}</span>
              <span className="pvWordFrom">не начат</span>
            </button>
          ))}
        </div>
      ))}
    </>
  )
}

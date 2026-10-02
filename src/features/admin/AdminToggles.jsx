import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAdmin } from '../../app/AdminContext.jsx'
import { readFlag, writeFlag } from '../../shared/lib/storedFlag.js'
import AdminUserModeToggle from './AdminUserModeToggle.jsx'
import AdminNewbieToggle from './AdminNewbieToggle.jsx'
import AdminDebugUiToggle from './AdminDebugUiToggle.jsx'
import AdminAudioWaveformToggle from './AdminAudioWaveformToggle.jsx'
import AdminWordChoiceVoiceToggle from './AdminWordChoiceVoiceToggle.jsx'

const OPEN_KEY = 'pithy_admin_toggles_open_v1'

// Все переключатели админки (чекбоксы-тумблеры) — в одном небольшом сворачиваемом блоке над субвкладками.
// По умолчанию свёрнут, состояние запоминается на устройстве. В «режиме пользователя» блок всегда раскрыт: тумблер
// «Режим пользователя» — единственная дверь обратно, прятать её нельзя (весь остальной админский интерфейс скрыт)
export default function AdminToggles() {
  const { userMode } = useAdmin()
  const [saved, setSaved] = useState(() => readFlag(OPEN_KEY, false))
  const open = saved || userMode
  const toggle = () => { writeFlag(OPEN_KEY, !saved); setSaved(!saved) }

  return (
    <div className="avToggles">
      <button className="avTogglesHead" aria-expanded={open} onClick={toggle} disabled={userMode}>
        Переключатели
        <ChevronDown className={open ? 'avTogglesChev avTogglesChevOpen' : 'avTogglesChev'} />
      </button>
      {open && (
        <div className="avTogglesBody">
          <AdminUserModeToggle />
          <AdminNewbieToggle />
          <AdminDebugUiToggle />
          <AdminAudioWaveformToggle />
          <AdminWordChoiceVoiceToggle />
        </div>
      )}
    </div>
  )
}

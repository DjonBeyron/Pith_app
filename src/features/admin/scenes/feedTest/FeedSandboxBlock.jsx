import { useState } from 'react'
import { useSandbox } from '../../../feed/scene/sandbox/useFeedSandbox.js'
import { formatBackupTime } from '../draftBackup.js'
import { backupForSandbox, sandboxState, openSceneInSandbox, closeSandbox } from './feedTestSandbox.js'

// Блок «Песочница в ленте» панели «Тест в ленте»: открыть последний черновик сборщика (резервная копия на этом устройстве)
// тестовым слайдом ленты — без привязки к модулю и без записи в БД — и закрыть песочницу.
export default function FeedSandboxBlock() {
  const active = useSandbox()
  const [msg, setMsg] = useState(null)

  const openDraft = () => {
    const b = backupForSandbox()
    if (!b) return setMsg({ bad: true, text: 'Резервной копии черновика нет — откройте сборщик и соберите сцену' })
    const st = sandboxState(b)
    if (!st.canRun) return setMsg({ bad: true, text: st.text })
    const res = openSceneInSandbox(b.scene)
    setMsg(res.ok ? null : { bad: true, text: res.error })
  }
  const close = () => { closeSandbox(); setMsg({ bad: false, text: 'Песочница закрыта — тестового слайда в ленте больше нет' }) }

  return (
    <div className="scFtReset">
      <p className="scCardTitle">Песочница в ленте (без привязки)</p>
      <p className="scHint">Показывает черновик сборщика в ленте тестовым слайдом: к модулю не привязан, в базу не пишется, виден только вам и только на этом устройстве, до закрытия вкладки. Если сборщик открыт — берётся его последняя резервная копия (сохраняется через 0,4 с после правки).</p>
      <div className="scFtRow">
        <button type="button" className="scBtn scFtBtn" onClick={openDraft}>Открыть текущий черновик в песочнице</button>
        <button type="button" className="scBtn" onClick={close} disabled={!active}>Закрыть песочницу</button>
      </div>
      <span className="scNote">{active ? `Сейчас в песочнице: «${active.scene?.title || 'Тест сцены'}» (${formatBackupTime(new Date(active.createdAt).toISOString())})` : 'Песочница пуста'}</span>
      {msg && <p className={msg.bad ? 'scBad' : 'scNote'} role="status">{msg.text}</p>}
    </div>
  )
}

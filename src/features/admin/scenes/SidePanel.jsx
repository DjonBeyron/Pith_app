import { useState, useEffect } from 'react'
import Panel from './ui/Panel.jsx'
import { uiRead, uiWrite } from './ui/uiStore.js'
import JsonPanel from './JsonPanel.jsx'
import AiPanel from './AiPanel.jsx'
import SceneLibrary from './SceneLibrary.jsx'

// Правая колонка сборщика — одна сворачиваемая панель (ключ side), заголовок = открытая
// вкладка: «JSON» (экспорт/правка/применить), «Для нейросети» (легенда + промпт + вставка
// ответа), «Мои сцены» (библиотека + шаблоны + «Использовать»). Вкладки — в шапке панели,
// выбранная запоминается локально (uiStore «tab»). mode / onApplyScene — для «Использовать»
// (ui/sceneUseOptions: нода урока / модуль ленты / админка).
const TABS = [['json', 'JSON'], ['ai', 'Для нейросети'], ['library', 'Мои сцены']]
const isTab = v => TABS.some(([id]) => id === v)

export default function SidePanel({ draft, library, onOpenRow, onSave, setStatus, mode = 'admin', onApplyScene = null }) {
  const [tab, setTab] = useState(() => uiRead('tab', 'library', { validate: isTab }))
  useEffect(() => { uiWrite('tab', tab) }, [tab])
  const label = TABS.find(([id]) => id === tab)?.[1] ?? 'Панель'
  const tabs = (
    <div className="fsTabs scbSideTabs" role="tablist" aria-label="JSON, нейросеть, библиотека">
      {TABS.map(([id, name]) => (
        <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'fsTab fsTabOn' : 'fsTab'} onClick={() => setTab(id)}>{name}</button>
      ))}
    </div>
  )
  return (
    <div className="scbSide" data-native-undo="1">
      <Panel id="side" title={label} extra={tabs}>
        {tab === 'json' && <JsonPanel draft={draft} setStatus={setStatus} />}
        {tab === 'ai' && <AiPanel draft={draft} setStatus={setStatus} />}
        {tab === 'library' && <SceneLibrary draft={draft} library={library} onOpenRow={onOpenRow} onSave={onSave} setStatus={setStatus} mode={mode} onApplyScene={onApplyScene} />}
      </Panel>
    </div>
  )
}

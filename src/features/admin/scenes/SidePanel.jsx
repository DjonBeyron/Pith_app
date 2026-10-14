import { useState } from 'react'
import JsonPanel from './JsonPanel.jsx'
import AiPanel from './AiPanel.jsx'
import SceneLibrary from './SceneLibrary.jsx'

// Правая область сборщика: вкладки «JSON» (экспорт/правка/применить), «Для нейросети»
// (легенда + промпт + вставка ответа), «Мои сцены» (библиотека, таблица scenes).
const TABS = [['json', 'JSON'], ['ai', 'Для нейросети'], ['library', 'Мои сцены']]

export default function SidePanel({ draft, library, onOpenRow, onSave, setStatus }) {
  const [tab, setTab] = useState('library')
  return (
    <div className="scbSide">
      <div className="fsTabs" role="tablist" aria-label="JSON, нейросеть, библиотека">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'fsTab fsTabOn' : 'fsTab'} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'json' && <JsonPanel draft={draft} setStatus={setStatus} />}
      {tab === 'ai' && <AiPanel draft={draft} setStatus={setStatus} />}
      {tab === 'library' && <SceneLibrary draft={draft} library={library} onOpenRow={onOpenRow} onSave={onSave} setStatus={setStatus} />}
    </div>
  )
}

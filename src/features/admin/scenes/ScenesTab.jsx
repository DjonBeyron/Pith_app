import { useState, useEffect, lazy, Suspense } from 'react'
import { lazyRetry } from '../../../shared/lib/lazyRetry.js'
import { useSceneBuilderRequest } from '../../../shared/lib/useSceneBuilderRequest.js'
import { consumeSceneBuilderRequest } from '../../../shared/lib/openSceneBuilderEvent.js'
import SpritesPanel from './SpritesPanel.jsx'
import DesignerSpec from './DesignerSpec.jsx'
import FeedTestPanel from './feedTest/FeedTestPanel.jsx'
import '../../../styles/admin-scenes.css'

// Админ → «Сцены» (конструктор сцен, этап 2): четыре раздела — «Спрайты» (галерея реестра),
// «Сборщик» (карточка + полноэкранное окно BuilderWindow, ленивый chunk), «Тест в ленте» (feedTest/FeedTestPanel: модули со сценой,
// открыть ленту с заданием, сброс лимитов), «Для дизайнера»
// (спецификация, шаблоны, проверка SVG). Сам ScenesTab — тоже ленивый chunk из AdminV2.
// Открытый раздел запоминается на устройстве.
const BuilderWindow = lazy(() => lazyRetry(() => import('./BuilderWindow.jsx'), 'scene-builder'))

const SECTION_KEY = 'pithy_admin_scenes_section_v1'
const SECTIONS = [['sprites', 'Спрайты'], ['builder', 'Сборщик'], ['feedtest', 'Тест в ленте'], ['designer', 'Для дизайнера']]
const storedSection = () => {
  try { const v = localStorage.getItem(SECTION_KEY); return SECTIONS.some(([id]) => id === v) ? v : 'sprites' } catch { return 'sprites' }
}

export default function ScenesTab() {
  const [section, setSectionState] = useState(storedSection)
  const [open, setOpen] = useState(false)
  // «← Вернуться в сборщик» с тестового слайда ленты (openSceneBuilderEvent.js): открываем окно сборщика с тем же черновиком.
  // Запрос заводится в состояние прямо при рендере (паттерн «подстроить состояние под проп»), затем забирается
  const req = useSceneBuilderRequest()
  const [fromTest, setFromTest] = useState(null)
  const [seen, setSeen] = useState(0)
  if (req && req.id !== seen) { setSeen(req.id); setFromTest(req); setSectionState('builder'); setOpen(true) }
  useEffect(() => { if (req) consumeSceneBuilderRequest(req.id) }, [req])
  const setSection = id => { setSectionState(id); try { localStorage.setItem(SECTION_KEY, id) } catch { /* приватный режим */ } }

  return (
    <div className="scWrap">
      <div className="scSections" role="tablist" aria-label="Разделы конструктора сцен">
        {SECTIONS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section === id} className={section === id ? 'scSection scSectionOn' : 'scSection'} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </div>
      {section === 'sprites' && <SpritesPanel />}
      {section === 'builder' && (
        <div className="scCard">
          <p className="scCardTitle">Сборщик сцен</p>
          <p className="scHint">
            Полноэкранное окно: слева локация, ячейки предметов, персонажи и реплики; в центре телефонная рамка с живой сценой,
            бюджет узлов и замечания линтера; справа JSON, легенда для нейросети и библиотека «Мои сцены».
          </p>
          <button className="scPrimary" onClick={() => setOpen(true)}>Открыть сборщик</button>
        </div>
      )}
      {section === 'feedtest' && <FeedTestPanel />}
      {section === 'designer' && <DesignerSpec />}
      {open && (
        <Suspense fallback={<p className="scHint">Загрузка сборщика…</p>}>
          <BuilderWindow onClose={() => { setOpen(false); setFromTest(null) }} fromTest={fromTest} />
        </Suspense>
      )}
    </div>
  )
}

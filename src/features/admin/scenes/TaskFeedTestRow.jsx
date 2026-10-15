import { setForcedSceneTask } from '../../feed/scene/sceneTaskLimits.js'
import { feedPushMessage } from './feedTest/feedTestModel.js'

// Строка «Тест в ленте» секции задания: «Проверить в ленте…» открывает диалог (песочница без привязки либо привязка к модулю, переход в ленту),
// «Показать в ленте» — быстрый вариант для уже привязанной сохранённой сцены (принудительный показ, один раз, без лимитов).
export default function TaskFeedTestRow({ savedId, setStatus, onFeedTest }) {
  const force = () => setStatus?.(feedPushMessage(setForcedSceneTask(savedId)))
  return (
    <div className="scbHRow">
      <span className="scbSub">Тест в ленте: без привязки (песочница, по умолчанию) или с привязкой к модулю.</span>
      <div className="scbHBtns">
        {onFeedTest && <button type="button" className="fsBtn fsBtnSmall fsBtnPrimary" onClick={onFeedTest} title="Тест без привязки (песочница) или привязка к модулю, затем лента с заданием">Проверить в ленте…</button>}
        <button type="button" className="fsBtn fsBtnSmall" onClick={force} disabled={!savedId} title={savedId ? 'Следующий показ этой сцены в ленте — с заданием, без лимитов' : 'Сначала сохраните сцену в библиотеку'}>Показать в ленте</button>
      </div>
    </div>
  )
}

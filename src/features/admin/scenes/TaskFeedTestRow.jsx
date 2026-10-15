import { setForcedSceneTask } from '../../feed/scene/sceneTaskLimits.js'
import { feedPushMessage } from './feedTest/feedTestModel.js'

// Строка «Тест в ленте» секции задания: «Проверить в ленте…» открывает диалог (привязка к модулю, сохранение, переход в ленту),
// «Показать в ленте» — быстрый вариант для уже привязанной сохранённой сцены (принудительный показ, один раз, без лимитов).
export default function TaskFeedTestRow({ savedId, setStatus, onFeedTest }) {
  const force = () => setStatus?.(feedPushMessage(setForcedSceneTask(savedId)))
  return (
    <div className="scbHRow">
      <span className="scbSub">Тест в ленте: сцену нужно привязать к модулю ленты.</span>
      <div className="scbHBtns">
        {onFeedTest && <button type="button" className="fsBtn fsBtnSmall fsBtnPrimary" onClick={onFeedTest} title="Сохранить, привязать к модулю и открыть ленту с заданием">Проверить в ленте…</button>}
        <button type="button" className="fsBtn fsBtnSmall" onClick={force} disabled={!savedId} title={savedId ? 'Следующий показ этой сцены в ленте — с заданием, без лимитов' : 'Сначала сохраните сцену в библиотеку'}>Показать в ленте</button>
      </div>
    </div>
  )
}

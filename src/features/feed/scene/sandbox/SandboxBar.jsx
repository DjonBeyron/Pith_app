import { FlaskConical } from 'lucide-react'

// Плашка слайда-песочницы: «ТЕСТ · не в ленте пользователей» + «Закрыть тест» и «Показать задание ещё раз».
// Лежит поверх слайда сверху (панель задания выезжает снизу и её не закрывает). Клики не всплывают — тап по плашке
// не ставит сцену на паузу и не листает ленту.
export default function SandboxBar({ hasTask, onClose, onAgain }) {
  const stop = e => e.stopPropagation()
  return (
    <div className="sbxBar" role="region" aria-label="Тест сцены" onClick={stop} onPointerDown={stop} onTouchStart={stop}>
      <p className="sbxTitle"><FlaskConical aria-hidden="true" /> ТЕСТ · не в ленте пользователей</p>
      <div className="sbxBtns">
        <button type="button" className="sbxBtn" onClick={onAgain} disabled={!hasTask} title={hasTask ? 'Сцена начнётся сначала, задание покажется после первого круга' : 'В сцене нет проверяемого задания'}>
          Показать задание ещё раз
        </button>
        <button type="button" className="sbxBtn sbxBtnClose" onClick={onClose}>Закрыть тест</button>
      </div>
    </div>
  )
}

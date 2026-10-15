import { FlaskConical, ArrowLeft } from 'lucide-react'

// Плашка слайда-песочницы: «ТЕСТ · не в ленте пользователей» + «← Вернуться в сборщик», «Закрыть тест» и «Показать задание ещё раз»,
// ниже — строка статуса задания (status = { tone, text } из sandboxTaskStatus.taskStatusText: ждёт конец диалога / показано /
// пропущено и почему). Лежит поверх слайда сверху (панель задания выезжает снизу и её не закрывает). Клики не всплывают — тап по
// плашке не ставит сцену на паузу и не листает ленту.
export default function SandboxBar({ hasTask, status = null, onClose, onAgain, onBack = null }) {
  const stop = e => e.stopPropagation()
  return (
    <div className="sbxBar" role="region" aria-label="Тест сцены" onClick={stop} onPointerDown={stop} onTouchStart={stop}>
      <p className="sbxTitle"><FlaskConical aria-hidden="true" /> ТЕСТ · не в ленте пользователей</p>
      {status && <p className={`sbxStatus sbxStatus-${status.tone}`} role="status">{status.text}</p>}
      <div className="sbxBtns">
        {onBack && (
          <button type="button" className="sbxBtn sbxBtnBack" onClick={onBack} title="Открыть сборщик с этим же черновиком">
            <ArrowLeft aria-hidden="true" /> Вернуться в сборщик
          </button>
        )}
        <button type="button" className="sbxBtn" onClick={onAgain} disabled={!hasTask} title={hasTask ? 'Сцена начнётся сначала, задание покажется сразу после первого полного проигрывания' : 'В сцене нет проверяемого задания'}>
          Показать задание ещё раз
        </button>
        <button type="button" className="sbxBtn sbxBtnClose" onClick={onClose}>Закрыть тест</button>
      </div>
    </div>
  )
}

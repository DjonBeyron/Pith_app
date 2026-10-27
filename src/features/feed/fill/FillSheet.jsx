import { X, Volume2 } from 'lucide-react'
import GameFoot from '../games/GameFoot.jsx'
import { useOptionRound } from '../games/useOptionRound.js'
import { useFillPlayer } from './useFillPlayer.js'

// Шторка игры ленты «Дополни реплику» (B5, стили — feed-choose.css + feed-games.css). Реплика звучит до слова, вместо
// слова — «мяу» (пауза 350 мс), потом остаток; на экране текст реплики с «мяу» на месте слова и три слова на выбор.
// Неверное слово гаснет, можно пробовать дальше. После верного «мяу» заменяется словом, под ним — «Верно!» и «Дальше».
// Звука нет (item.task.audio = null) — только текст. Варианты никогда не озвучиваются.
// item — открытая игра (feedGame.js): { word, task: { before, after, answer, options, audio }, result };
// onFinishStats — итог раунда ({ wrong, timeMs }); onClose — «Дальше» / крестик (на ответ не влияет)
export default function FillSheet({ item, onFinishStats, onClose }) {
  const { task, result } = item
  const correctAt = task.options.findIndex(o => o.toLowerCase() === task.answer.toLowerCase())
  const round = useOptionRound({ count: task.options.length, correctAt, onFinishStats })
  const { stage, replay } = useFillPlayer(task.audio)
  const gap = round.solved != null ? task.answer : 'мяу'
  return (
    <div className={`chooseSheet fillSheet${task.audio ? '' : ' fillSheet--text'}`} role="group" aria-label="Дополни реплику">
      <div className="chooseHead">
        <span className="chooseTitle">Дополни реплику</span>
        <button type="button" className="chooseClose" onClick={onClose} aria-label="Закрыть"><X size={18} strokeWidth={2.2} /></button>
      </div>
      <div className="gameBody">
        <p className="fillLine">
          {task.before}
          <span className={`fillGap fillGap--${round.solved != null ? 'ok' : stage === 'meow' ? 'meow' : 'idle'}`}>{gap}</span>
          {task.after}
        </p>
        {task.audio && (
          <button type="button" className="gamePlay" onClick={replay} aria-label="Послушать ещё раз">
            <Volume2 size={18} strokeWidth={2.2} /><span>Послушать ещё</span>
          </button>
        )}
        <div className="gameOptions" role="group" aria-label="Какое слово пропущено">
          {task.options.map((w, i) => (
            <button
              key={w}
              type="button"
              className={`gameOption gameOption--${round.stateOf(i)}`}
              disabled={round.solved != null || round.wrong.has(i)}
              onClick={() => round.tap(i)}
            >{w}</button>
          ))}
        </div>
      </div>
      <GameFoot result={result} answer={task.answer} onClose={onClose} />
    </div>
  )
}

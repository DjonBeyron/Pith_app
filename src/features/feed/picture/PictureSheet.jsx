import { X, Volume2 } from 'lucide-react'
import GameFoot from '../games/GameFoot.jsx'
import { useOptionRound } from '../games/useOptionRound.js'
import { useWordVoice } from './useWordVoice.js'

// Шторка игры ленты «Слово голосом → картинка» (B5, стили — feed-choose.css + feed-games.css). Слово звучит (word_audio),
// на экране три картинки (верная + две неверные из ноды photo_choice) — нужно коснуться той, что подходит. Неверная
// гаснет, можно пробовать дальше. Звука нет (item.task.audioUrl = null) — вместо озвучки слово текстом.
// После верного — слово под картинками, «Верно!» и «Дальше». Подписи картинок (imagePrompt) — только alt для скринридера.
// item — открытая игра (feedGame.js): { word, task: { options: [{ id, url, alt, correct }], audioUrl }, result };
// onFinishStats — итог раунда ({ wrong, timeMs }); onClose — «Дальше» / крестик (на ответ не влияет)
export default function PictureSheet({ item, onFinishStats, onClose }) {
  const { word, task, result } = item
  const correctAt = task.options.findIndex(o => o.correct)
  const round = useOptionRound({ count: task.options.length, correctAt, onFinishStats })
  const replay = useWordVoice(task.audioUrl)
  return (
    <div className={`chooseSheet pictureSheet${task.audioUrl ? '' : ' pictureSheet--text'}`} role="group" aria-label="Слово голосом — картинка">
      <div className="chooseHead">
        <span className="chooseTitle">Какая картинка?</span>
        <button type="button" className="chooseClose" onClick={onClose} aria-label="Закрыть"><X size={18} strokeWidth={2.2} /></button>
      </div>
      <div className="gameBody">
        {task.audioUrl ? (
          <button type="button" className="gamePlay gamePlay--big" onClick={replay} aria-label="Послушать слово">
            <Volume2 size={26} strokeWidth={2.2} /><span>{round.solved != null ? word : 'Послушай слово'}</span>
          </button>
        ) : (
          <p className="pictureWord">{word}</p>
        )}
        <div className="pictureGrid" role="group" aria-label="Три картинки">
          {task.options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              className={`pictureOption pictureOption--${round.stateOf(i)}`}
              disabled={round.solved != null || round.wrong.has(i)}
              onClick={() => round.tap(i)}
            ><img src={o.url} alt={o.alt} decoding="async" draggable={false} /></button>
          ))}
        </div>
      </div>
      <GameFoot result={result} answer={word} onClose={onClose} />
    </div>
  )
}

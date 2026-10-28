import WordLaneCat from '../../player/modules/rotate-phone/WordLaneCat.jsx'
import WordLaneMic from '../../player/modules/rotate-phone/WordLaneMic.jsx'
import { useSayAloudGame } from './useSayAloudGame.js'

// Игра «Скажи вслух» (портрет, внутри полноэкранного слоя SayAloudOverlay): Пит показывает перевод, ученик называет английское слово вслух. Вид собран из частей «Повтори за диктором» —
// Пит выглядывает снизу (WordLaneCat), круг-микрофон с волнами по голосу (WordLaneMic), раскладка и цвета слоя (.wl, word-lane.css); дорожки-пилюли вверху — по числу слов (verdict каждого).
// Почему не RotatePhoneModule с синтетической нодой: он целиком про диктора и повторы одной фразы по ступеням (рецепт → стадии → пилюли), режима «перевод → слово голосом» у него нет, а добавить его —
// значит переписать рецепт, стадии и движок пилюль. Здесь тот же слушатель Vosk (createWordListener), те же микрофон и Пит, но свой короткий сценарий (sayAloudFlow.js).
// Верное слово — Пит радуется и слово появляется зелёным; не успел (10 с) или «Пропустить» — Пит смущается, правильное слово показано на 2 секунды. Сценарий и таймеры — useSayAloudGame.js.
export default function SayAloudGame({ words, onFinished, onClose }) {
  const g = useSayAloudGame({ words, onFinished })
  const { s } = g
  const cur = words[Math.min(s.idx, words.length - 1)]
  const verdict = i => (i < s.answers.length ? (s.answers[i] ? 'ok' : 'miss') : i === s.idx ? 'now' : 'wait')

  return (
    <>
      <WordLaneCat apiRef={g.catApi} />
      <div className="sayLanes" aria-hidden="true" data-testid="say-lanes">
        {words.map((w, i) => <i key={w.word} className={`sayLane sayLane--${verdict(i)}`} />)}
      </div>
      {g.fail ? (
        <div className="sayCenter" data-testid="say-fail">
          <p className="sayTitle">Не получилось включить микрофон</p>
          <p className="saySub">Проверь, что микрофон разрешён, и попробуй ещё раз</p>
          <button type="button" className="sayBtn" onClick={onClose}>Закрыть</button>
        </div>
      ) : (
        <>
          <p className="sayHint">Скажи по-английски</p>
          <p className="sayPrompt" key={s.idx} data-testid="say-prompt">{cur.translation}</p>
          <p className={`sayAnswer sayAnswer--${s.mode}`} data-testid="say-answer">{s.mode === 'ok' || s.mode === 'miss' ? cur.word : ''}</p>
          <WordLaneMic mode={g.status} levels={g.levels} note={s.mode === 'ask' ? g.note : ''} visible />
          <div className="sayActions">
            <button type="button" className="sayLink" onClick={g.skip} disabled={s.mode !== 'ask'} data-testid="say-skip">Пропустить</button>
            <button type="button" className="sayLink" onClick={onClose} data-testid="say-cant">Не могу говорить</button>
          </div>
        </>
      )}
    </>
  )
}

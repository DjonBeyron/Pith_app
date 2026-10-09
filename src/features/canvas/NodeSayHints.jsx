import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'
import { HINT_SILENCE_DEFAULT, HINT_MISMATCH_DEFAULT, HINT_PARTIAL_DEFAULT } from '../../shared/lib/speech/sayTexts.js'

// Блок «Подсказки в чате» ноды «Сказать фразу»: после неудачной попытки ведущий пишет в чат (пузырь СЛЕВА, как реплики «Собери фразу»)
// одну из трёх подсказок — по типу неудачи. Внутри самой панели подсказок нет. Поля ноды: hintsOn (переключатель; нет поля = включено),
// hintSilence («не слышу»), hintMismatch («не то»), hintPartial («почти получилось», с подстановками {ok} и {missed}). Пустое поле =
// стандартный текст из sayTexts.js (показан серым как placeholder).
const stop = e => e.stopPropagation()

const FIELDS = [
  { key: 'hintSilence', title: '1. Не слышу вас (тишина, обрыв связи)', def: HINT_SILENCE_DEFAULT },
  { key: 'hintMismatch', title: '2. Сказано не то (совпало меньше половины слов)', def: HINT_MISMATCH_DEFAULT },
  { key: 'hintPartial', title: '3. Почти получилось (совпала половина слов и больше, но не хватило)', def: HINT_PARTIAL_DEFAULT },
]

export default function NodeSayHints({ hintsOn = true, values = {}, onChange }) {
  return (
    <div className="nodeSayHints" onClick={stop}>
      <label className="nodeSayCheck" onClick={stop}>
        <input type="checkbox" checked={hintsOn} onChange={e => onChange({ hintsOn: e.target.checked })} />
        Подсказки в чате: после неудачной попытки ведущий пишет пузырь слева
      </label>
      {hintsOn && (
        <>
          {FIELDS.map(f => (
            <label key={f.key} className="nodeSayField" onClick={stop}>
              <span className="nodeTwLabel">{f.title}</span>
              <textarea
                className="nodeWcInput nodeSayHintInput"
                rows={2}
                value={values[f.key] ?? ''}
                onChange={e => onChange({ [f.key]: e.target.value })}
                placeholder={f.def}
                onClick={stop}
                {...NO_AUTOCORRECT}
              />
            </label>
          ))}
          <p className="nodeTwHint">
            {'{ok}'} и {'{missed}'} подставляются автоматически: {'{ok}'} — слова фразы, которые ученик сказал верно, {'{missed}'} — слова,
            которые не прозвучали или распознаны неверно (через запятую; если верных слов нет, предложение с {'{ok}'} пропускается).
            Пустое поле = стандартный текст (серый). Системные ошибки, где нужно действие ученика (микрофон выключен), подсказки не получают.
          </p>
        </>
      )}
    </div>
  )
}

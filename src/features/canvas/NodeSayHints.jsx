import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'
import { HINT_SILENCE_DEFAULT, HINT_MISMATCH_DEFAULT, HINT_PARTIAL_DEFAULT } from '../../shared/lib/speech/sayTexts.js'
import InfoPopup from '../../shared/ui/InfoPopup.jsx'

// Блок «Подсказки в чате» ноды «Сказать фразу»: после неудачной попытки ведущий пишет в чат (пузырь СЛЕВА, как реплики «Собери фразу»)
// одну из трёх подсказок — по типу неудачи. Внутри самой панели подсказок нет. Поля ноды: hintsOn (переключатель; нет поля = включено),
// hintSilence («не слышу»), hintMismatch («не то»), hintPartial («почти получилось», с подстановками {ok} и {missed}). Пустое поле =
// стандартный текст из sayTexts.js (показан серым как placeholder). Пояснения — в попапах «i» рядом с метками (InfoPopup), не абзацами.
const stop = e => e.stopPropagation()

const FIELDS = [
  { key: 'hintSilence', title: '1. Не слышу вас', when: 'Тишина или обрыв связи.', def: HINT_SILENCE_DEFAULT },
  { key: 'hintMismatch', title: '2. Сказано не то', when: 'Совпало меньше половины слов.', def: HINT_MISMATCH_DEFAULT },
  { key: 'hintPartial', title: '3. Почти получилось', when: 'Совпала половина слов и больше, но до порога не хватило.', def: HINT_PARTIAL_DEFAULT, subst: true },
]

export default function NodeSayHints({ hintsOn = true, values = {}, onChange }) {
  return (
    <div className="nodeSayHints" onClick={stop}>
      <div className="nodeSayCheckRow">
        <label className="nodeSayCheck">
          <input type="checkbox" checked={hintsOn} onChange={e => onChange({ hintsOn: e.target.checked })} />
          Подсказки в чате
        </label>
        <InfoPopup title="Подсказки в чате" testId="say-info-hints">
          <p>После неудачной попытки ведущий пишет в чат пузырь слева — одну из трёх подсказок, по типу неудачи.</p>
          <p>Пустое поле = стандартный текст (он виден серым). Системные ошибки, где нужно действие ученика (микрофон выключен), подсказки не получают.</p>
        </InfoPopup>
      </div>
      {hintsOn && FIELDS.map(f => (
        <div key={f.key} className="nodeSayField">
          <div className="nodeSayLabelRow">
            <span className="nodeTwLabel">{f.title}</span>
            <InfoPopup title={f.title.replace(/^\d\. /, '')} testId={`say-info-${f.key}`}>
              <p><b>Когда:</b> {f.when}</p>
              {f.subst && (
                <p>
                  {'{ok}'} и {'{missed}'} подставляются автоматически: {'{ok}'} — слова фразы, которые ученик сказал верно, {'{missed}'} — слова,
                  которые не прозвучали или распознаны неверно (через запятую; если верных слов нет, предложение с {'{ok}'} пропускается).
                </p>
              )}
            </InfoPopup>
          </div>
          <textarea
            className="nodeWcInput nodeSayHintInput"
            rows={2}
            value={values[f.key] ?? ''}
            onChange={e => onChange({ [f.key]: e.target.value })}
            placeholder={f.def}
            aria-label={f.title}
            onClick={stop}
            {...NO_AUTOCORRECT}
          />
        </div>
      ))}
    </div>
  )
}

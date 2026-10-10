import { useRef, useEffect } from 'react'
import NodeCorrectWrongTriggers from './NodeCorrectWrongTriggers.jsx'
import NodeSayHints from './NodeSayHints.jsx'
import NodeSayCantSpeakNote from './NodeSayCantSpeakNote.jsx'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'
import {
  THRESHOLD_MIN, THRESHOLD_MAX, THRESHOLD_DEFAULT, SAY_LANGS, LANG_DEFAULT, keywordsMissingInPhrase, parseKeywords,
} from '../../shared/lib/speech/sayPhraseData.js'
import { tokenize } from '../../shared/lib/speech/speechMatch.js'
import { findWrongOut, setSayExit } from '../../shared/lib/speech/sayTriggers.js'

// Редактор ноды «Сказать фразу»: ученик произносит английскую фразу в микрофон, приложение мягко сверяет её с эталоном.
// Фраза-эталон (phrase) — проверяемый текст «под капотом»: сам модуль её в чат НЕ пишет и в панели не показывает, задание ученику
// формулирует текстовая нода-сообщение ПЕРЕД модулем (в нём должна быть сама фраза).
// Поля: phrase (обязательно), translation (справочно), keywords (через запятую — обязательно должны прозвучать),
// threshold (% слов эталона для «засчитано», 50–100, по умолчанию 70), lang (en-US / en-GB), listenAudio («Послушать»),
// strict («Строго»: порог 100%, слова точно, без опечаток + консенсус interim и final; у НОВЫХ нод включено), подсказки в чат после
// неудачи (hintsOn + hintSilence/hintMismatch/hintPartial — блок NodeSayHints) и пояснение про «Я не могу говорить» (NodeSayCantSpeakNote).
// Выходы: «Верно» (say_done: проверка пройдена; им же идёт «Я не могу говорить», но сообщение-успех сразу после модуля пропускается) и «Неверно»
// (say_wrong: после третьей неудачной попытки; не соединён — плеер идёт по «Верно»). Штрафов нет: речь тренировка. Старое имя второго выхода — say_skip
// (до перехода на пару верно/неверно): здесь читается как say_wrong и при первом же изменении связей переименовывается.
const LANG_LABEL = { 'en-US': 'Американский (en-US)', 'en-GB': 'Британский (en-GB)' }
const stop = e => e.stopPropagation()

export default function NodeSayPhrasePicker({
  phrase = '', translation = '', keywords = '', threshold = THRESHOLD_DEFAULT, lang = LANG_DEFAULT, listenAudio = true, strict = false,
  hintsOn = true, hints = {}, onChange, triggers = [], allNodes = [], nodeId, onTriggersChange, onTriggerMeasure,
}) {
  const rowRefs = useRef(new Map())

  useEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = ['say_done', 'say_wrong'].map(k => {
      const el = rowRefs.current.get(k)
      return el ? el.offsetTop + el.offsetHeight / 2 : 0
    })
    onTriggerMeasure(offsets)
  })

  // Выход «неверный»: say_wrong, а в старых уроках — say_skip (sayTriggers.js); первая же правка связи переименовывает его в say_wrong
  const doneThen = (triggers.find(t => t.if === 'say_done') ?? triggers[0])?.then ?? ''
  const wrongThen = findWrongOut(triggers)?.then ?? ''
  const setTrigger = (ifVal, then) => onTriggersChange(setSayExit(triggers, ifVal, then))

  const lostKeywords = keywordsMissingInPhrase(phrase, keywords)
  // Превью «как проверит приложение»: слова фразы (ключевые — зелёным) и сколько слов нужно сказать при этом пороге
  const keySet = new Set(parseKeywords(keywords).flatMap(tokenize))
  const total = tokenize(phrase).length
  const need = strict ? total : Math.ceil(total * threshold / 100 - 1e-9)
  const others = allNodes.filter(n => n.id !== nodeId)

  return (
    <div className="nodeTwWrap" onClick={stop}>
      <input
        className="nodeWcInput"
        value={phrase}
        onChange={e => onChange({ phrase: e.target.value })}
        placeholder="Фраза на английском (например: I am trying to please both)"
        onClick={stop}
        {...NO_AUTOCORRECT}
      />
      <input
        className="nodeWcInput"
        value={translation}
        onChange={e => onChange({ translation: e.target.value })}
        placeholder="Перевод (необязательно, справочно: ученику не показывается)"
        onClick={stop}
        {...NO_AUTOCORRECT}
      />
      <span className="nodeTwLabel">Ключевые слова (через запятую)</span>
      <input
        className="nodeWcInput"
        value={keywords}
        onChange={e => onChange({ keywords: e.target.value })}
        placeholder="Что обязательно должно прозвучать, например: please, both"
        onClick={stop}
        {...NO_AUTOCORRECT}
      />
      {lostKeywords.length > 0 && (
        <p className="nodeSayWarn">Нет в фразе (проверка их не учтёт): {lostKeywords.join(', ')}</p>
      )}
      <div className="nodeSayRow">
        <label className="nodeSayField" onClick={stop}>
          <span className="nodeTwLabel">Порог: {strict ? 100 : threshold}% слов{strict ? ' (строго)' : ''}</span>
          <input
            type="range" min={THRESHOLD_MIN} max={THRESHOLD_MAX} step={5} value={strict ? THRESHOLD_MAX : threshold} disabled={strict}
            onChange={e => onChange({ threshold: Number(e.target.value) })}
          />
        </label>
        <label className="nodeSayField" onClick={stop}>
          <span className="nodeTwLabel">Язык распознавания</span>
          <select className="nodeSaySelect" value={lang} onChange={e => onChange({ lang: e.target.value })} onClick={stop}>
            {SAY_LANGS.map(l => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
          </select>
        </label>
      </div>
      {total > 0 && (
        <p className="nodeSayPreview" data-testid="say-preview">
          {phrase.split(/\s+/).filter(Boolean).map((w, i) => (
            <span key={i} className={tokenize(w).some(t => keySet.has(t)) ? 'nodeSayKey' : undefined}>{w} </span>
          ))}
          <span className="nodeSayNeed">— нужно сказать {need} из {total} слов{keySet.size ? ', ключевые обязательны' : ''}</span>
        </p>
      )}
      <label className="nodeSayCheck" onClick={stop}>
        <input type="checkbox" checked={strict} onChange={e => onChange({ strict: e.target.checked })} />
        Строго: все слова точно, без опечаток, порог 100%, консенсус interim+final (слово, которое движок «домыслил» только в итоге, не засчитывается)
      </label>
      <label className="nodeSayCheck" onClick={stop}>
        <input type="checkbox" checked={listenAudio} onChange={e => onChange({ listenAudio: e.target.checked })} />
        Кнопка «Послушать» (озвучка фразы из базы слов)
      </label>
      <NodeSayHints hintsOn={hintsOn} values={hints} onChange={onChange} />
      <p className="nodeTwHint">
        Ученик нажимает на микрофон и говорит фразу. Порядок слов не важен, мелкие неточности прощаются; звук не записывается.
        Фразу ученику даёт текстовое сообщение ПЕРЕД модулем — напишите в нём, что и как сказать. Штрафов нет.
      </p>
      <NodeSayCantSpeakNote />
      <NodeCorrectWrongTriggers
        correctThen={doneThen} wrongThen={wrongThen}
        correctKey="say_done" wrongKey="say_wrong"
        onSetTrigger={setTrigger} otherNodes={others} rowRefs={rowRefs}
      />
    </div>
  )
}

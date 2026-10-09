import { useRef, useEffect } from 'react'
import NodeCorrectWrongTriggers from './NodeCorrectWrongTriggers.jsx'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'
import {
  THRESHOLD_MIN, THRESHOLD_MAX, THRESHOLD_DEFAULT, SAY_LANGS, LANG_DEFAULT, keywordsMissingInPhrase, parseKeywords,
} from '../../shared/lib/speech/sayPhraseData.js'
import { tokenize } from '../../shared/lib/speech/speechMatch.js'

// Редактор ноды «Сказать фразу»: ученик произносит английскую фразу в микрофон, приложение мягко сверяет её с эталоном.
// Поля: phrase (обязательно), translation (по кнопке в чате), keywords (через запятую — обязательно должны прозвучать),
// threshold (% слов эталона для «засчитано», 50–100, по умолчанию 70), lang (en-US / en-GB), listenAudio («Послушать»),
// showPhrase («Показывать фразу в чате», по умолчанию да: выключено — пузыря с фразой нет, эталон только «под капотом»),
// strict («Строго»: все слова эталона и без опечаток; по умолчанию выключено).
// Выходы: «Сказал(а)» (основной; им же идёт «Получилось») и «Не могу говорить» (необязательная ветка пропуска —
// если не соединена, плеер идёт по основному). «Неверно» нет: речь тренировка и не штрафуется.
const LANG_LABEL = { 'en-US': 'Американский (en-US)', 'en-GB': 'Британский (en-GB)' }
const stop = e => e.stopPropagation()

export default function NodeSayPhrasePicker({
  phrase = '', translation = '', keywords = '', threshold = THRESHOLD_DEFAULT, lang = LANG_DEFAULT, listenAudio = true, showPhrase = true, strict = false,
  onChange, triggers = [], allNodes = [], nodeId, onTriggersChange, onTriggerMeasure,
}) {
  const rowRefs = useRef(new Map())

  useEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = ['say_done', 'say_skip'].map(k => {
      const el = rowRefs.current.get(k)
      return el ? el.offsetTop + el.offsetHeight / 2 : 0
    })
    onTriggerMeasure(offsets)
  })

  const doneThen = (triggers.find(t => t.if === 'say_done') ?? triggers[0])?.then ?? ''
  const skipThen = (triggers.find(t => t.if === 'say_skip') ?? triggers[1])?.then ?? ''

  function setTrigger(ifVal, then) {
    const existing = {
      say_done: triggers.find(t => t.if === 'say_done') ?? triggers[0],
      say_skip: triggers.find(t => t.if === 'say_skip') ?? triggers[1],
    }
    existing[ifVal] = { ...existing[ifVal], then: then || null }
    onTriggersChange([
      { id: existing.say_done?.id ?? crypto.randomUUID(), if: 'say_done', then: existing.say_done?.then ?? null },
      { id: existing.say_skip?.id ?? crypto.randomUUID(), if: 'say_skip', then: existing.say_skip?.then ?? null },
    ])
  }

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
        placeholder="Перевод (необязательно) — кнопкой на пузыре"
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
        <input type="checkbox" checked={showPhrase} onChange={e => onChange({ showPhrase: e.target.checked })} />
        Показывать фразу в чате
      </label>
      {!showPhrase && (
        <p className="nodeSayWarn nodeSayNote">Фразы в чате не будет (и перевода тоже): в панели «Произнесите фразу». Проверка, «Послушать» и аналитика работают как обычно.</p>
      )}
      <label className="nodeSayCheck" onClick={stop}>
        <input type="checkbox" checked={strict} onChange={e => onChange({ strict: e.target.checked })} />
        Строго: все слова и без опечаток (порог 100%)
      </label>
      <label className="nodeSayCheck" onClick={stop}>
        <input type="checkbox" checked={listenAudio} onChange={e => onChange({ listenAudio: e.target.checked })} />
        Кнопка «Послушать» (озвучка фразы из базы слов)
      </label>
      <p className="nodeTwHint">
        Ученик нажимает на микрофон и говорит фразу. Порядок слов не важен, мелкие неточности прощаются; звук не записывается.
        Штрафов нет: «Получилось» засчитывает, «Не могу говорить» пропускает.
      </p>
      <NodeCorrectWrongTriggers
        correctThen={doneThen} wrongThen={skipThen}
        correctKey="say_done" wrongKey="say_skip"
        okLabel="✓ Сказал(а) →" errLabel="↷ Не могу говорить →"
        onSetTrigger={setTrigger} otherNodes={others} rowRefs={rowRefs}
      />
    </div>
  )
}

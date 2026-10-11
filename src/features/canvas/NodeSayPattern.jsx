import { useState } from 'react'
import InfoPopup from '../../shared/ui/InfoPopup.jsx'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'
import { parsePattern, matchPattern } from '../../shared/lib/speech/sayPattern.js'

const stop = e => e.stopPropagation()

// «Свободная фраза» ноды «Сказать фразу» (поле pattern, sayPattern.js): вместо одной фразы-эталона автор описывает, какая фраза годится.
// Фраза-эталон при этом остаётся примером (для админа и подсказок). Пустое поле — обычная проверка по эталону.
// Снизу — пробная проверка: автор вводит, что мог бы сказать ученик, и сразу видит, засчитается ли.
export default function NodeSayPattern({ pattern = '', strict = false, onChange }) {
  const [sample, setSample] = useState('')
  const parsed = pattern.trim() ? parsePattern(pattern) : null
  const probe = parsed?.ok && sample.trim() ? matchPattern(pattern, sample, { exact: strict }) : null

  return (
    <div onClick={stop}>
      <div className="nodeSayLabelRow" onClick={stop}>
        <span className="nodeTwLabel">Свободная фраза (шаблон)</span>
        <InfoPopup title="Свободная фраза" testId="say-info-pattern">
          <p>Если ученик должен сказать СВОЮ фразу, опишите шаблон вместо эталона. Пустое поле — обычная проверка по эталону.</p>
          <p><b>I (try|am trying) to **</b> — засчитает «I try to wake up early» и «I'm trying to relax».</p>
          <p><b>(a|b)</b> — любой из вариантов; <b>(a|b)?</b> — можно пропустить; <b>*</b> — одно любое слово; <b>**</b> — одно и больше любых слов. Регистр и знаки не важны.</p>
          <p>Такая нода всегда распознаётся системным распознаванием (у Vosk закрытый словарь под одну фразу), поэтому «голосовое с текстом» у неё не записывается, а «Послушать» скрыта.</p>
          <p>Нюанс: распознавание часто само исправляет грамматику («I tries» → «I try»), поэтому шаблон надёжно проверяет «сказал по шаблону», но не идеальность грамматики.</p>
        </InfoPopup>
      </div>
      <input
        className="nodeWcInput"
        value={pattern}
        onChange={e => onChange({ pattern: e.target.value })}
        placeholder="I (try|am trying) to **"
        aria-label="Шаблон свободной фразы"
        onClick={stop}
        {...NO_AUTOCORRECT}
      />
      {parsed && !parsed.ok && <p className="nodeSayWarn">Шаблон не разобрался ({parsed.error}) — проверка пойдёт по эталону</p>}
      {parsed?.ok && (
        <>
          <input
            className="nodeWcInput"
            value={sample}
            onChange={e => setSample(e.target.value)}
            placeholder="Проверить: что скажет ученик…"
            aria-label="Пробная фраза ученика"
            onClick={stop}
            {...NO_AUTOCORRECT}
          />
          {probe && (
            <p className={probe.passed ? 'nodeSayNeed' : 'nodeSayWarn'} data-testid="say-pattern-probe">
              {probe.passed ? '✓ засчитается' : `✗ не засчитается${probe.missed.length ? ` (не хватило: ${probe.missed.join(', ')})` : ''}`}
            </p>
          )}
        </>
      )}
    </div>
  )
}

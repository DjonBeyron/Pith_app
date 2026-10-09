import { useState, useMemo } from 'react'
import { AP_INTRO, MODE_INFO, ONE_WORD_INFO, RULES_INFO, LOCAL_STATUS } from './antiPredictInfo.js'
import { LANG_VARIANTS, UNSUPPORTED, modeSupported, activeModes, keyWordsOf, parseWrongList } from './antiPredictModes.js'
import DwellSlider from './DwellSlider.jsx'
import VoskLab from './VoskLab.jsx'
import '../../../styles/admin-antipredict.css'

// Строка режима: переключатель, описание, пометка «не поддерживается здесь» (серый) и своё содержимое (чипы языка, статус модели)
function ModeRow({ info, on, supported, busy, onToggle, children }) {
  return (
    <div className={`apCard${supported ? '' : ' apOff'}`}>
      <label className="apToggle">
        <input type="checkbox" checked={supported && on} disabled={!supported || busy} onChange={onToggle} />
        <b>{info.n}. {info.title}</b>
        {info.id !== 'history' && info.id !== 'alts' && info.id !== 'lang' && <span className="aspExp"> эксперимент</span>}
      </label>
      <p className="aspHint">{info.text}</p>
      {!supported && <p className="apNo">{UNSUPPORTED[info.id] || UNSUPPORTED.recognition}</p>}
      {supported && children}
    </div>
  )
}

// Режим 4: слово без контекста — свой запуск «Сказать одно слово» (эталон = слово), журнал помечает такую попытку
function OneWordCard({ reference, busy, recognition, onOneWord }) {
  const keys = keyWordsOf(reference)
  const [oneEdit, setOneEdit] = useState(null) // { ref, text }
  const oneWord = oneEdit && oneEdit.ref === reference ? oneEdit.text : (keys[0] ?? '')
  return (
    <div className="apCard">
      <b>{ONE_WORD_INFO.n}. {ONE_WORD_INFO.title}</b>
      <p className="aspHint">{ONE_WORD_INFO.text}</p>
      <div className="aspChips">
        {keys.map(k => (
          <button key={k} className={`aspChip${k === oneWord ? ' aspChipOn' : ''}`} disabled={busy} onClick={() => setOneEdit({ ref: reference, text: k })}>{k}</button>
        ))}
      </div>
      <div className="aspRow">
        <input className="aspInput apWord" value={oneWord} onChange={e => setOneEdit({ ref: reference, text: e.target.value })} disabled={busy}
          placeholder="слово" aria-label="Слово без контекста" spellCheck={false} autoCapitalize="off" />
        <button className="aspSay apSmall" disabled={!recognition || busy || !oneWord.trim()} onClick={() => onOneWord(oneWord.trim())}>Сказать одно слово</button>
      </div>
    </div>
  )
}

const ORDER = [...MODE_INFO, ONE_WORD_INFO].sort((x, y) => x.n - y.n) // показываем по номерам 1…8

// Свёрнутый блок «Дополнительно: остальные эксперименты» (режимы 1–10, Vosk, правила; внутри «Проверки», перед кнопкой «Сказать»). Всё выключено по умолчанию.
// Простые тесты (серии) вынесены из него наружу — см. SimpleTestsBlock.jsx
export default function AntiPredictBlock({ ap, reference, busy, recognition, onOneWord }) {
  const { settings, update, features } = ap
  const sup = id => modeSupported(id, features)
  const modes = activeModes(settings, features)
  const wrong = useMemo(() => parseWrongList(ap.wrongText, reference), [ap.wrongText, reference])
  const local = ap.local

  return (
    <details className="apBox">
      <summary className="apSum">Дополнительно: остальные эксперименты{modes.length ? ` (включено: ${modes.length})` : ''}</summary>
      <p className="aspHint">{AP_INTRO}</p>
      <label className="aspLabel">Ошибочные формы (через запятую) — для способов 7, 8 и правил
        <input className="aspInput" value={ap.wrongText} onChange={e => ap.setWrongText(e.target.value)} disabled={busy} spellCheck={false} autoCapitalize="off" />
      </label>
      <div className="aspRow">
        <button className="aeRefresh" onClick={ap.resetWrong} disabled={busy}>Сгенерировать заново из эталона</button>
        <span className="aspHint">{wrong.length} шт.</span>
      </div>
      <label className="aspLabel">Что я сказал (для сравнения, вручную)
        <input className="aspInput" value={ap.said} onChange={e => ap.setSaid(e.target.value)} placeholder="например: try" spellCheck={false} autoCapitalize="off" />
      </label>

      {ORDER.map(m => (m === ONE_WORD_INFO ? <OneWordCard key="one" reference={reference} busy={busy} recognition={recognition} onOneWord={onOneWord} /> : (
        <ModeRow key={m.id} info={m} on={m.id === 'lang' ? !!settings.lang : settings[m.id]} supported={sup(m.id)} busy={busy}
          onToggle={() => update(m.id === 'lang' ? { lang: settings.lang ? '' : LANG_VARIANTS[1] } : { [m.id]: !settings[m.id] })}>
          {m.id === 'lang' && (
            <div className="aspChips">
              {LANG_VARIANTS.map(l => (
                <button key={l} className={`aspChip${settings.lang === l ? ' aspChipOn' : ''}`} disabled={busy}
                  onClick={() => update({ lang: settings.lang === l ? '' : l })}>{l}</button>
              ))}
            </div>
          )}
          {m.id === 'local' && settings.local && (
            <div className="aspHint">
              Модель: {local.status ? LOCAL_STATUS[local.status] || local.status : local.error ? `ошибка проверки — ${local.error}` : features.localAvailable ? 'проверяем…' : 'статус узнать нельзя (нет SpeechRecognition.available)'}
              {features.localInstall && local.status !== 'available' && (
                <> <button className="aeRefresh" disabled={ap.installing || busy} onClick={ap.install}>{ap.installing ? 'Устанавливаем…' : 'Установить языковой пакет'}</button></>
              )}
            </div>
          )}
        </ModeRow>
      )))}

      <div className="apCard">
        <b>{RULES_INFO.n}. {RULES_INFO.title}</b><p className="aspHint">{RULES_INFO.text}</p>
        <DwellSlider value={settings.dwell} onChange={v => update({ dwell: v })} disabled={busy} />
      </div>
      <VoskLab reference={reference} wrong={wrong} />
    </details>
  )
}

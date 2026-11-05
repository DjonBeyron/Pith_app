import { useState } from 'react'
import { VOSK_RU_MODEL_URL, defaultRuModelUrl, readRuModelUrl, resetRuModelUrl, writeRuModelUrl } from '../../../shared/lib/vosk/voskConfigRu.js'

// Адрес русской модели Vosk для прохода «назови перевод» игры «Встряхни память» (CONCEPT_RACE.md, «Русская модель»): поле, как у английской в лаборатории Vosk, и «Вернуть по умолчанию».
// Сохранённый адрес (VOSK_RU_URL_KEY в localStorage админа) важнее VITE_VOSK_RU_MODEL_URL и встроенного. Формат — tar.gz с одной папкой модели внутри (zip vosk-browser не читает); свой файл можно положить в бакет R2 так же, как английскую.
export default function RuModelAddress({ locked = false }) {
  const [url, setUrl] = useState(readRuModelUrl)
  const change = v => { setUrl(v); writeRuModelUrl(v) }
  return (
    <div data-testid="race-ru-address">
      <label className="aspLabel">Адрес русской модели слуха (tar.gz)
        <input className="aspInput" value={url} onChange={e => change(e.target.value)} disabled={locked} spellCheck={false} autoCapitalize="off" data-testid="race-ru-url" />
      </label>
      <div className="aspRow">
        {url !== defaultRuModelUrl() && <button type="button" className="aeRefresh" disabled={locked} onClick={() => setUrl(resetRuModelUrl())} data-testid="race-ru-reset">Вернуть по умолчанию</button>}
      </div>
      <p className="aspHint">По умолчанию: {VOSK_RU_MODEL_URL}. Смена адреса действует со следующего скачивания: модель по новому адресу качается отдельно.</p>
    </div>
  )
}

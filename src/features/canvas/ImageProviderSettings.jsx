import { useState, useEffect } from 'react'
import { getImageProvider, saveImageProvider, getImageGenUsage } from '../../shared/api/appSettingsApi.js'

// Переключатель провайдера генерации фото (NodeImageGen.jsx) — глобальная
// настройка (не per-lesson), поэтому сама читает/пишет app_settings и не
// нуждается в пропсах сверху, в отличие от учителя/videoAutoSound рядом.
export default function ImageProviderSettings() {
  const [provider, setProvider] = useState(null) // null — ещё грузится
  const [usage, setUsage] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getImageProvider().then(v => setProvider(v ?? 'cloudflare'))
    getImageGenUsage().then(setUsage)
  }, [])

  async function choose(next) {
    if (next === provider || saving) return
    setSaving(true)
    try {
      await saveImageProvider(next)
      setProvider(next)
    } catch (e) {
      window.alert('Не удалось сохранить провайдера: ' + (e?.message ?? '?'))
    } finally {
      setSaving(false)
    }
  }

  if (provider == null) return null

  return (
    <div className="lessonSettingsRow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span className="lessonSettingsLabel">Провайдер генерации фото</span>
      <div className="lessonSettingsModes">
        <button
          className={`lessonSettingsMode${provider === 'cloudflare' ? ' lessonSettingsModeActive' : ''}`}
          onClick={() => choose('cloudflare')}
          disabled={saving}
        >Cloudflare (бесплатно)</button>
        <button
          className={`lessonSettingsMode${provider === 'gemini' ? ' lessonSettingsModeActive' : ''}`}
          onClick={() => choose('gemini')}
          disabled={saving}
        >Gemini (нужен биллинг)</button>
      </div>
      {provider === 'cloudflare' && usage != null && (
        <span className="lessonSettingsHint">
          Сегодня сгенерировано: {usage}. Точный остаток дневного бесплатного бюджета
          Cloudflare не отдаёт через API — это наш собственный счётчик, не официальная квота.
        </span>
      )}
      {provider === 'gemini' && (
        <span className="lessonSettingsHint">
          Работает только после привязки биллинга к Google Cloud проекту (см. PROJECT.md) —
          иначе Gemini отвечает ошибкой 429.
        </span>
      )}
    </div>
  )
}

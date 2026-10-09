import { useState, useRef } from 'react'
import { VOSK_MODEL_URL, defaultModelUrl, resetModelUrl, writeModelUrl } from '../../../shared/lib/vosk/voskConfig.js'
import { uploadToR2 } from '../../../shared/lib/r2.js'
import { fmtMb } from '../../../shared/lib/vosk/voskDownload.js'

const CORS_RULE = `[{
  "AllowedOrigins": ["https://<адрес приложения на Vercel>", "http://localhost:5173"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["Content-Length"],
  "MaxAgeSeconds": 86400
}]`

// Адрес модели + инструкция «как положить модель в наш бакет R2» + кнопка загрузки файла с устройства через существующий механизм
// (r2-upload-url → presigned PUT). Путь в бакете задаёт сама функция (chat/<случайный>.gz), адрес подставляется автоматически.
export default function VoskModelAddress({ url, setUrl, locked }) {
  const [up, setUp] = useState(null) // { pct, name } | null
  const [upErr, setUpErr] = useState('')
  const fileRef = useRef(null)

  function change(v) { setUrl(v); writeModelUrl(v) }
  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUpErr(''); setUp({ pct: 0, name: `${file.name} (${fmtMb(file.size)})` })
    try {
      const publicUrl = await uploadToR2(file, (l, t) => setUp(u => ({ ...u, pct: Math.floor((l / t) * 100) })))
      change(publicUrl)
    } catch (err) { setUpErr(`Не загрузилось: ${err?.message || err}`) }
    setUp(null)
  }

  return (
    <>
      <label className="aspLabel">Адрес модели (tar.gz)
        <input className="aspInput" value={url} onChange={e => change(e.target.value)} disabled={locked} spellCheck={false} autoCapitalize="off" />
      </label>
      <div className="aspRow">
        {url !== defaultModelUrl() && <button className="aeRefresh" disabled={locked} onClick={() => setUrl(resetModelUrl())}>Вернуть по умолчанию</button>}
        <button className="aeRefresh" disabled={locked || !!up} onClick={() => fileRef.current?.click()}>Загрузить файл модели в наш бакет…</button>
        <input ref={fileRef} type="file" accept=".gz,.tgz,.zip,application/gzip,application/zip" hidden onChange={pick} />
      </div>
      {up && <div className="aspHint">Загрузка в R2: {up.name} — {up.pct}%</div>}
      {upErr && <div className="aspErr"><b>{upErr}</b></div>}
      <details className="apMore">
        <summary>Как положить модель в наш бакет R2 (инструкция)</summary>
        <p className="aspHint">По умолчанию модель берётся с чужого сайта github.io: он может не открываться (в части стран заблокирован) или быть медленным. Надёжнее держать её у себя.</p>
        <ol className="apConc">
          <li>На компьютере скачайте архив модели. Надёжнее всего готовый <code>vosk-model-small-en-us-0.15.tar.gz</code> (его читает vosk-browser): <code>{VOSK_MODEL_URL}</code> — откройте эту ссылку на компьютере, где github.io открывается. Либо с alphacephei.com/vosk/models возьмите <code>vosk-model-small-en-us-0.15.zip</code> (≈40 МБ): он, вероятно, тоже читается, но если движок напишет «не смог прочитать архив» — перепакуйте в tar.gz: распакуйте zip и выполните в терминале <code>tar -czf vosk-model-small-en-us-0.15.tar.gz vosk-model-small-en-us-0.15</code> (в Windows 10+ команда <code>tar</code> уже есть). Внутри архива должна быть одна папка модели.</li>
          <li>Нажмите «Загрузить файл модели в наш бакет…» выше и выберите файл — он уйдёт в R2 тем же способом, что файлы уроков (путь вида <code>chat/…</code> задаёт функция), а поле «Адрес модели» заполнится само. Если кнопка не сработала — консоль Cloudflare: R2 → бакет pithy-files → Objects → Upload, затем включите публичный доступ (Settings → Public access: r2.dev или свой домен) и скопируйте публичный адрес файла.</li>
          <li>Бакету нужно правило CORS (Settings → CORS Policy), иначе браузер не отдаст файл странице:<pre className="vkPre">{CORS_RULE}</pre> В <code>AllowedOrigins</code> — адрес приложения на Vercel (и превью-домены, если нужно) и localhost. Без <code>ExposeHeaders: Content-Length</code> проценты скачивания не видны и целостность файла не проверяется.</li>
          <li>Если адрес вставляли вручную — вставьте публичный адрес в поле выше. Нажмите «Скачать модель» ниже.</li>
        </ol>
      </details>
    </>
  )
}

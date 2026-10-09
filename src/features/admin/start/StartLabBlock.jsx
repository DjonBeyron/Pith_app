import { useState } from 'react'
import { copyText } from './copyText.js'
import { LAB_INDEX_PATH, LAB_PAGES, LAB_HOWTO, LAB_RESULTS } from './startLabInfo.js'

// Админ → «Старт»: «Лаборатория запуска (поиск моргания)». Пять минимальных страниц-веб-клипов (public/lab/*.html), которые
// пользователь по очереди добавляет на «Домой» из Safari и запускает с иконки. Нужны, чтобы разделить причины моргания iOS
// (наш код / стартовые картинки / нативный слой / время ответа сервера). Ссылки открываются в Safari: из установленного
// приложения удобнее скопировать адрес и вставить в Safari.
export default function StartLabBlock() {
  const [note, setNote] = useState('')

  async function copyLink() {
    const ok = await copyText(window.location.origin + LAB_INDEX_PATH)
    setNote(ok ? 'Ссылка скопирована — вставь в Safari' : 'Не удалось скопировать')
  }

  return (
    <section className="astVar astLab">
      <div className="aeTitle">Лаборатория запуска (поиск моргания)</div>
      <p className="aeHint">
        Пять крошечных страниц без нашего приложения: по ним видно, откуда берётся серый кадр при старте с «Домой» на iPhone.
        Каждая добавляется на «Домой» отдельной иконкой.
      </p>
      <div className="astBtns">
        <a className="aeRefresh astLabLink" href={LAB_INDEX_PATH} target="_blank" rel="noopener noreferrer">Открыть /lab/index.html</a>
        <button className="aeRefresh" onClick={copyLink}>Скопировать ссылку</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
      <ol className="astLabList">{LAB_HOWTO.map(t => <li key={t}>{t}</li>)}</ol>
      <div className="astLabPages">
        {LAB_PAGES.map(p => (
          <a key={p.id} className="astLabPage" href={p.path} target="_blank" rel="noopener noreferrer">
            <span className="astVarTitle">{p.title}</span>
            <span className="astVarText">{p.text}</span>
          </a>
        ))}
      </div>
      <div className="aeTitle">Что значат результаты</div>
      <ul className="astLabList">{LAB_RESULTS.map(t => <li key={t}>{t}</li>)}</ul>
    </section>
  )
}

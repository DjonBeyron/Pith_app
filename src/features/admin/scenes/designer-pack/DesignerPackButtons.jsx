import { useState } from 'react'
import { downloadText } from '../fileUtils.js'
import { buildCheckerHtml, CHECKER_FILE } from './buildCheckerHtml.js'
import { buildTemplatesPack, TEMPLATES_FILE } from './buildTemplatesPack.js'
import { printHtml } from './openPrint.js'
import { PACK_FILES } from './packConsts.js'
import ScTip from '../ScTip.jsx'

// Кнопки пакета для дизайнера: «Скачать PDF» (печатный документ в скрытом iframe → окно
// печати → «Сохранить как PDF»), «Скачать HTML-документ» (тот же документ файлом, офлайн),
// «Скачать проверку (HTML)» (автономный проверщик с предпросмотром анимации), «Скачать все
// шаблоны» (HTML с вкладками и кнопками). Документ собирается лениво (react-dom/server —
// отдельный chunk), остальное — чистые строки. Скачивание — Blob + <a download> (fileUtils).
const HTML = 'text/html;charset=utf-8'

export default function DesignerPackButtons() {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const say = t => { setMsg(t); setTimeout(() => setMsg(''), 6000) }

  const doc = async () => (await import('./buildPrintDoc.js')).buildPrintDoc()
  const pdf = async () => {
    setBusy('pdf')
    try {
      const ok = printHtml(await doc())
      say(ok ? 'В окне печати выберите принтер «Сохранить как PDF» (Save as PDF), формат A4.' : 'Печать не открылась — скачайте HTML-документ и напечатайте его из браузера (Ctrl+P).')
    } catch (e) { say(`Не удалось собрать документ: ${e.message}`) } finally { setBusy('') }
  }
  const html = async () => {
    setBusy('html')
    try { downloadText(PACK_FILES.doc, await doc(), HTML); say(`Скачан ${PACK_FILES.doc} — открывается офлайн, из него же печатается PDF (Ctrl+P).`) } catch (e) { say(`Не удалось собрать документ: ${e.message}`) } finally { setBusy('') }
  }
  const checker = () => { downloadText(CHECKER_FILE, buildCheckerHtml(), HTML); say(`Скачан ${CHECKER_FILE} — отправьте дизайнеру вместе с документом; открывается двойным кликом, без интернета.`) }
  const templates = () => { downloadText(TEMPLATES_FILE, buildTemplatesPack(), HTML); say(`Скачан ${TEMPLATES_FILE} — внутри три шаблона с кнопками «Скачать».`) }

  return (
    <div className="scdPack" id="scd-pack">
      <p className="scCardTitle">Пакет для дизайнера <ScTip help="pack" /></p>
      <p className="scHint">Дизайнер не видит эту страницу — отправьте ему три файла: документ (PDF или HTML), проверку и шаблоны. Всё собирается из кода приложения прямо сейчас, поэтому числа в файлах совпадают с проверкой в приложении.</p>
      <div className="scdBtns">
        <button type="button" className="scPrimary" onClick={pdf} disabled={!!busy}>{busy === 'pdf' ? 'Собираю…' : 'Скачать PDF'}</button>
        <button type="button" className="scBtn" onClick={html} disabled={!!busy}>{busy === 'html' ? 'Собираю…' : 'Скачать HTML-документ'}</button>
        <span className="scdBtnTip"><button type="button" className="scBtn" onClick={checker}>Скачать проверку (HTML)</button><ScTip help="pack_checker" /></span>
        <span className="scdBtnTip"><button type="button" className="scBtn" onClick={templates}>Скачать все шаблоны</button><ScTip help="pack_templates" /></span>
      </div>
      <p className="scHint">PDF: откроется окно печати браузера — выберите принтер «Сохранить как PDF». Если окно не появилось (блокировка в PWA), скачайте HTML-документ и нажмите в нём Ctrl+P.</p>
      {msg && <p className="scdPackMsg" role="status">{msg}</p>}
    </div>
  )
}

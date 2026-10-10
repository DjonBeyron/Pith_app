import { BROWSER_NOTE } from '../../../../shared/lib/speech/sayTexts.js'

// Firefox (sayBrowser.js): круг-микрофон не показываем — вместо него спокойное пояснение, что открыть приложение нужно в Safari или Chrome.
// Выход остаётся тот же, что при «Проверка голоса недоступна»: ссылка «Я не могу говорить» внизу панели (SayActions) ведёт по ветке «верный» с пропуском сообщения-успеха.
export default function SayBrowserNote() {
  return <p className="sayBrowserNote" role="status" data-testid="say-browser-note">{BROWSER_NOTE}</p>
}

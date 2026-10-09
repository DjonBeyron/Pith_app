import { Fingerprint } from 'lucide-react'

// Обучающая подсказка «потри фразу — появится перевод» (useRubHint.js). Надпись стоит над фразой и не двигается;
// отпечаток пальца ходит по самой фразе — три потирания вправо-влево, гаснет, пауза, по кругу (feed-rub-hint.css).
// Ширину хода берёт из CSS-переменных стопки фразы (usePhrasePlate.js). Касаний не ловит; прячется, когда перевод открыли
export default function RubHint() {
  return (
    <>
      <div className="feedRubHint" aria-hidden="true">
        <span>Потри фразу — появится перевод</span>
      </div>
      <i className="feedRubFinger" aria-hidden="true">
        <Fingerprint className="feedRubFingerIcon" />
      </i>
    </>
  )
}

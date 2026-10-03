import { Fingerprint } from 'lucide-react'

// Обучающая подсказка «потри фразу — появится перевод» (useRubHint.js): плашка над фразой, отпечаток в ней
// ходит вправо-влево — как надо тереть. Касаний не ловит; прячется, когда перевод открыли
export default function RubHint() {
  return (
    <div className="feedRubHint" aria-hidden="true">
      <Fingerprint className="feedRubHintIcon" />
      <span>Потри фразу — появится перевод</span>
    </div>
  )
}

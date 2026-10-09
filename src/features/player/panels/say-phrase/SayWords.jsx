// Слова фразы под вопросом чата: до проверки нейтральные, после — услышанные подсвечены зелёным, пропущенные красным
// (phraseWords в sayResult.js). Текст всегда один и тот же — меняется только цвет, поэтому панель не прыгает.
export default function SayWords({ words }) {
  return (
    <p className="sayWords" data-testid="say-words">
      {words.map((w, i) => (
        <span key={i} className={`sayWord${w.tone ? ` sayWord--${w.tone}` : ''}`}>{w.text}</span>
      ))}
    </p>
  )
}

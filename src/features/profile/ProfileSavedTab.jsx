// «Сохранённые» в профиле: закладки на модули, которые ещё НЕ начаты
// (PROJECT.md → «Вкладки»: начатое живёт в «Моих уроках», закладки отдельных
// уроков — там же). Тап — схема модуля. Вынесено из ProfileV2.jsx.
export default function ProfileSavedTab({ savedModules, onOpenModule }) {
  if (savedModules.length === 0) {
    return <div className="pvEmpty">Сохраняй модули закладкой — те, что ещё не начал, появятся здесь</div>
  }
  return savedModules.map(m => (
    <button key={m.id} className="pvWord pvModRow" onClick={() => onOpenModule(m)}>
      <span className="pvWordText">{m.title}</span>
      <span className="pvWordFrom">не начат</span>
    </button>
  ))
}

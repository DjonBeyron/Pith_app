import { realSummary } from './sandboxVarsModel.js'

// Строка состояния режима «Моя настоящая память»: загрузка / ошибка / сводка по найденным словам / «слов нет».
// Только показывает; загрузку и кнопки («Обновить память», «Перевыбрать») ведёт SandboxVarsPanel.
export default function SandboxVarsReal({ state }) {
  const { status, stats, source, error } = state
  if (status === 'idle' || status === 'loading') return <p className="scbSub" role="status">Читаю вашу память…</p>
  if (status === 'error') return <p className="fsMsg fsMsg-error" role="alert">Не удалось прочитать память: {error}. Показываются запасные слова. Проверьте сеть и нажмите «Обновить память».</p>
  return (
    <div className="scbSbReal" role="status">
      {source === 'guest' && <p className="scbSub">Вы не вошли в аккаунт (или включён режим «новенький»): читается память гостя на этом устройстве.</p>}
      <p className="scbSub"><b>{realSummary(stats)}</b></p>
      {stats.usable === 0 && <p className="scbSub">В вашей памяти нет слов с переводом — везде будет запасное слово. Пройдите уроки-слова или добавьте тестовые слова (см. «Как проверить шаги 3–4» в PROJECT.md).</p>}
    </div>
  )
}

import WordLaneMirror from './mirror/WordLaneMirror.jsx'
import RehearsalSummary from './RehearsalSummary.jsx'

// Интерфейс актов «Репетиции с Питом» поверх игры (WordLaneGame, портал уже в .wlStage): то, чего нет в обычной игре. Перевод над дорожкой слова, подсветка кусков в читке и пустые подписи «без текста» —
// это подписи дорожек (labelsFor → rehearsalStages.labelsForRehearsal), их рисует сама игра. Здесь: перевод фразы под падающей фразой (заставка), ярлык-плашка «Чётко — для последнего ряда» / «Обычно» над дорожками
// ОДНОЙ строкой с многоточием (решение владельца: подпись не на пилюле, §6 п. 4), экран зеркала (WordLaneMirror из mirror/: две полосы «Пит / Ты», «Сравнить», одна заметка; данные — rh.mirror от useRehearsalTake) и экран итога.
// Не репетиция (f.rh.on = false) — ничего не рисует.
export default function RehearsalActs({ f, cfg, onAgain = null, onSummary = null }) {
  const rh = f.rh
  if (!rh?.on) return null
  const type = f.stage === 'run' ? f.stageObj?.type : null
  const intro = f.phase === 'drop' || f.phase === 'lanes' || f.pausedIntro
  return (
    <>
      {intro && <div className="rhTr" data-testid="rh-translation">{cfg.translation}</div>}
      {rh.tag && <div className="rhTag" key={rh.tag} data-testid="rh-tag">{rh.tag}</div>}
      {type === 'mirror' && rh.mirror && (
        <div className="rhScreen rhMirror" data-testid="rh-mirror">
          <WordLaneMirror dictor={rh.mirror.dictor} student={rh.mirror.student} chunks={cfg.plan.chunks} measure={rh.mirror.measure} note={rh.mirror.note} onDone={f.next} />
        </div>
      )}
      {type === 'summary' && <RehearsalSummary plan={cfg.plan} result={rh.result} onAgain={onAgain} onShown={onSummary} onDone={f.finish} />}
    </>
  )
}

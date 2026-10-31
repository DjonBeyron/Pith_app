import MirrorCompare from './mirror/MirrorCompare.jsx'
import RehearsalSummary from './RehearsalSummary.jsx'

// Интерфейс актов «Репетиции с Питом» поверх игры (WordLaneGame, портал уже в .wlStage): то, чего нет в обычной игре. Перевод над дорожкой слова, подсветка кусков в читке и пустые подписи «без текста» —
// это подписи дорожек (labelsFor → rehearsalStages.labelsForRehearsal), их рисует сама игра. Здесь: ярлык-плашка «Чётко — для последнего ряда» / «Обычно» над дорожками
// ОДНОЙ строкой с многоточием (решение владельца: подпись не на пилюле, §6 п. 4), «Дубль и зеркало» на дорожках (MirrorCompare из mirror/: проигрывание, одна заметка Пита подписью над дорожками, «Сравнить» и «Дальше»;
// сами пилюли сравнения — две ленты Пит / ты на остановленных дорожках — рисует движок пилюль по rh.compare; данные — rh.mirror от useRehearsalTake) и экран итога.
// Пока Пит договаривает реплику на старте стадии (rh.quiet, rehearsalQuiet.js), ничего из этого не показывается — только дорожки и кот. Заставка (падение фразы): ни слов, ни перевода сверху (v3.3.84) — их скрывает и WordLaneGame.
// Не репетиция (f.rh.on = false) — ничего не рисует.
export default function RehearsalActs({ f, cfg, onAgain = null, onSummary = null }) {
  const rh = f.rh
  if (!rh?.on) return null
  const type = f.stage === 'run' ? f.stageObj?.type : null
  if (rh.quiet) return null
  return (
    <>
      {rh.tag && <div className="rhTag" key={rh.tag} data-testid="rh-tag">{rh.tag}</div>}
      {type === 'mirror' && rh.mirror && <MirrorCompare mirror={rh.mirror} chunks={cfg.plan.chunks} sceneApi={f.sceneApi} since={f.at} onDone={f.next} />}
      {type === 'summary' && <RehearsalSummary plan={cfg.plan} result={rh.result} onAgain={onAgain} onShown={onSummary} onDone={f.finish} />}
    </>
  )
}

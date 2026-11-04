import RaceClimb from './RaceClimb.jsx'
import RaceSummary from './RaceSummary.jsx'
import { climbWords, climbHints } from './raceWords.js'

// Интерфейс актов «Гонки с Питом» поверх игры (WordLaneGame, портал в .wlStage); зовёт его RehearsalActs, когда у плана game === 'race'. «Разгон» (перевод внутри пилюль) и «Слушай и лови» рисует сам движок пилюль —
// им нужны только стили (race-sprint.css), поэтому здесь: острова «Вершины» (RaceClimb: на ступенях, на плашке вершины и «времени вышло») и итог (RaceSummary). Пока Пит договаривает реплику на старте стадии (rh.quiet), ничего не показывается — только дорожки и кот.
export default function RaceActs({ f, cfg, onAgain = null, onSummary = null }) {
  const rh = f.rh
  if (rh.quiet) return null
  const st = f.stage === 'run' ? f.stageObj : null
  if (st?.type === 'summary') return <RaceSummary plan={cfg.plan} result={rh.result} onAgain={onAgain} onShown={onSummary} onDone={f.finish} />
  if (st?.act === 'climb') return <RaceClimb climb={rh.race?.climb} words={climbWords(cfg.plan)} hints={climbHints(cfg.plan)} phrase={cfg.plan.chunks.join(' ')} final={st.sid === 'climb-top'} timeUp={st.sid === 'climb-time'} />
  return null
}

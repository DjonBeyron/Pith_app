import RaceClimb from './RaceClimb.jsx'
import RaceSummary from './RaceSummary.jsx'
import RaceCharge from './RaceCharge.jsx'
import RaceRoundCharge from './RaceRoundCharge.jsx'
import RaceBar from './RaceBar.jsx'
import { chargeOn } from './raceCharge.js'
import { climbWords, climbHints } from './raceWords.js'

// Интерфейс актов «Гонки с Питом» поверх игры (WordLaneGame, портал в .wlStage); зовёт его RehearsalActs, когда у плана game === 'race'. «Разгон» (перевод внутри пилюль) и «Слушай и лови» рисует сам движок пилюль —
// им нужны только стили (race-sprint.css), поэтому здесь: острова «Вершины» (RaceClimb: на ступенях, на плашке вершины и «времени вышло») и итог (RaceSummary). Пока Пит договаривает реплику на старте стадии (rh.quiet), ничего не показывается — только дорожки и кот.
export default function RaceActs({ f, cfg, lines = null, onAgain = null, onSummary = null }) {
  const rh = f.rh
  const st = f.stage === 'run' ? f.stageObj : null
  let acts = null
  if (rh.quiet) acts = null
  else if (st?.type === 'summary') acts = <RaceSummary plan={cfg.plan} result={rh.result} onAgain={onAgain} onShown={onSummary} onDone={f.finish} />
  else if (st?.act === 'climb') acts = <RaceClimb climb={rh.race?.climb} words={climbWords(cfg.plan)} hints={climbHints(cfg.plan)} phrase={cfg.plan.chunks.join(' ')} final={st.sid === 'climb-top'} timeUp={st.sid === 'climb-time'} />
  const live = f.stage === 'run' || (f.stage === 'paused' && f.from === 'run') ? f.stages?.[f.idx] ?? null : null // бар остаётся на месте и на паузе
  return <><RaceCharge plan={cfg.plan} lines={lines} on={chargeOn(f)} />{f.stage === 'run' && <RaceRoundCharge plan={cfg.plan} stages={f.stages} i={f.idx} at={f.at} lines={lines} />}<RaceBar stage={live} race={rh.race} />{acts}</> // заставка-зарядка идёт и пока Пит говорит (тишина экрана её не прячет); на месте всегда — не перемонтируется. Бар (RaceBar) живёт весь «Разгон» / «Слушай и лови» и расходуется по пилюле; перед вторым кругом и этапом 2 его заряжает RaceRoundCharge
}

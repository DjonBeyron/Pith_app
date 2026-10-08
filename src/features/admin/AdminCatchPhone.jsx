import { splitTitleTokens } from '../../shared/lib/titleWords.js'
import { LEVEL_CLASS } from '../feed/catch/feedCatch.js'
import CatchOverChip from '../feed/catch/CatchOverChip.jsx'
import CatchStrip from '../feed/catch/CatchStrip.jsx'
import CatchSheet from '../feed/catch/CatchSheet.jsx'

// «Телефон» песочницы Ловли: блок 390 px с тёмным фоном. Сверху — имитация спойлера фразы (серый блок под настоящим
// CatchOverChip — как в ленте, шариков под чипом нет), по тапу ниже в потоке встают настоящие CatchStrip и CatchSheet
// (в ленте они абсолютные и с анимациями — admin-catch.css переопределяет внутри .acPhone).
// После «Готово» вместо спойлера — открытая фраза цветами уровней. sb — результат useCatchSandbox.
// live — вкладка админки на экране: canvas массы шариков в полоске живёт; иначе спит (как в ленте по tabVisible).
export default function AdminCatchPhone({ title, sb, live = true }) {
  return (
    <div className="acPhone">
      <div className="acPhrase">
        {sb.done ? (
          <div className="feedPhrase">
            {splitTitleTokens(title).map((t, i) => {
              const w = t.word ? sb.words.find(x => x.index === t.index) : null
              return <span key={i} className={w ? LEVEL_CLASS(w.level) || undefined : undefined}>{t.text}</span>
            })}
          </div>
        ) : (
          <div className="acSpoiler" onClick={sb.openSheet}>
            <CatchOverChip hidden={sb.open} onOpen={sb.openSheet} />
          </div>
        )}
      </div>
      {sb.open && (
        <div className="catchCover catchCoverShown">
          <CatchStrip
            title={title} words={sb.words} cur={sb.curIndex} typedBy={sb.typedBy}
            phase={sb.phase} results={sb.results} live={live} onPick={sb.setCurrent}
          />
          <CatchSheet
            phase={sb.phase} cur={sb.cur} helped={sb.helped} model={sb.model} isLast={sb.isLast} hasPrev={sb.hasPrev} shift={sb.shift}
            onKey={sb.press} onBackspace={sb.backspace} onNext={sb.next} onPrev={sb.prev} onCheck={sb.check}
            onHelp={sb.help} onReveal={sb.reveal} onFinish={sb.finish}
          />
        </div>
      )}
    </div>
  )
}

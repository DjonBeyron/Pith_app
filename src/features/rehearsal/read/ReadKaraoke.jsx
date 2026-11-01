import { Fragment, useRef } from 'react'
import { splitWords } from './readKaraoke.js'
import { useReadKaraoke } from './useReadKaraoke.js'

// Подписи кусков над дорожками в акте «Читка» (WordLaneGame подставляет их вместо обычных подписей, пока идёт читка): те же .wlHead, только слова по отдельности — белое слово и поверх него зелёный слой
// .rkFill (текст слоя берётся из data-t, чтобы он не дублировался в тексте страницы), который открывается слева направо (clip-path) под голос Пита; впереди идёт курсор «|» (.rkCursor: «|» и кружок в одном узле).
// Всё движение пишет useReadKaraoke прямо в DOM, здесь только разметка. Стили — styles/player/modules/rehearsal-read.css.
//  stage  — стадия (read: читает Пит; turn: «твоя очередь», слова плавно белеют; student: читает игрок); heads — подписи дорожек из игры (f.labels: { text, on });
//  chunks — тексты кусков; live / ready — слушатель игрока (f.live, f.lid === id ступени).
export default function ReadKaraoke({ heads, stage, at, chunks, live, ready, lite }) {
  const cursor = useRef(null)
  const mode = stage.type === 'read' ? 'pit' : stage.type === 'turn' ? 'turn' : stage.type === 'student' ? 'student' : 'idle'
  useReadKaraoke({ cursor, mode, metro: stage.metro, chunks, at, live, ready, lite, textKey: heads.map(h => h.text).join('|') })
  return (
    <>
      {heads.map((h, i) => (
        <span key={i} className={`wlHead rkHead${h.on ? ' wlHead--on' : ''}${h.text ? '' : ' wlHead--empty'}${mode === 'turn' ? ' rkHead--off' : ''}`} data-testid={`wl-head-${i}`}>
          {splitWords(h.text).map((w, k) => (
            <Fragment key={k}>
              {k > 0 && ' '}
              <span className="rkWord" data-testid={`rk-word-${i}-${k}`}>{w}<span className="rkFill" data-t={w} aria-hidden="true" /></span>
            </Fragment>
          ))}
        </span>
      ))}
      <i ref={cursor} className={lite ? 'rkCursor rkCursor--off' : 'rkCursor'} aria-hidden="true" data-testid="rk-cursor"><b className="rkBar" /><b className="rkDot" /></i>
    </>
  )
}

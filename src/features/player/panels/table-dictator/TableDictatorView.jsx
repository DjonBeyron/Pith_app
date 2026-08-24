import TableGrid from '../../../../shared/ui/TableGrid.jsx'
import TableExtraChips from './TableExtraChips.jsx'

// Чистая разметка панели диктанта — вся логика прогона (аудио/часы/RAF/
// проверка) остаётся в TableDictatorPanel.jsx, сюда приходят уже готовые
// значения состояния и колбэки на <audio>. Вынесено, чтобы не раздувать
// файл с состоянием: сам рендер не завязан ни на таймеры, ни на refs сценария.
export default function TableDictatorView({
  show, panelH, panelRef, barElsRef, waveformData, hudVisible,
  assembled, extrasAssembled, result, audioSrc, phase, table,
  highlighted, usedCells, revealedIds, flashDur, chipsVisible,
  shuffledExtras, chipStyles, extrasAssembledKeys, activeExtraKeys, hasExtraLayers,
  audioRef, onPlay, onPause, onEnded, onError,
}) {
  const hudClass = ['tdHud', !waveformData && 'tdHudPulse', hudVisible && 'tdHudVisible']
    .filter(Boolean).join(' ')

  const boxCls = [
    'tdAssemblyBox',
    (assembled.length > 0 || extrasAssembled.length > 0) ? 'tdAssemblyBoxFilled' : '',
    result === 'correct' ? 'tdAssemblyBoxOk'  : '',
    result === 'wrong'   ? 'tdAssemblyBoxErr' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div className="tdSpacer" style={{
        height: show ? panelH : 0,
        transition: show
          ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
          : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
      }} />
      <div ref={panelRef} className={`tdPanel${show ? ' tdPanelVisible' : ''}`}>
        <div className="tdPanelInner">

          {/* HUD-спектр — САМЫЙ ВЕРХ: над боксом сборки и над таблицей */}
          <div className={hudClass}>
            {[0, 1, 2].map(i => (
              <div key={i} ref={el => { barElsRef.current[i] = el }} className="tdHudBar" />
            ))}
          </div>

          <div className={boxCls}>
            {assembled.length === 0 && extrasAssembled.length === 0
              ? <span className="tdAssemblyPlaceholder">{audioSrc ? 'Слушай диктора…' : 'Смотри на таблицу…'}</span>
              : <>
                  {assembled.map((w, i) => <span key={`c${i}`} className="tdAssemblyWord">{w}</span>)}
                  {extrasAssembled.map(t => <span key={t.key} className="tdAssemblyWord">{t.value}</span>)}
                </>
            }
          </div>

          <div className="tdStage">
            <div className={`tdTableSection${phase === 'extras' ? ' tdTableSectionSlid' : ''}`}>
              <div className="tdGridBox">
                <TableGrid
                  columns={table.columns}
                  rows={table.rows}
                  cells={table.cells}
                  rowCount={table.rowCount}
                  highlightedIds={highlighted}
                  dimmedIds={usedCells}
                  revealedIds={revealedIds}
                  flashDurations={flashDur.cells}
                />
              </div>
            </div>

            {chipsVisible && (
              <TableExtraChips
                words={shuffledExtras}
                chipStyles={chipStyles}
                assembledKeys={extrasAssembledKeys}
                activeKeys={activeExtraKeys}
                hasExtraLayers={hasExtraLayers}
                flashDurations={flashDur.chips}
              />
            )}
          </div>

          {audioSrc && (
            <audio
              ref={audioRef}
              src={audioSrc}
              onPlay={onPlay}
              onPause={onPause}
              onEnded={onEnded}
              onError={onError}
            />
          )}
        </div>
      </div>
    </>
  )
}

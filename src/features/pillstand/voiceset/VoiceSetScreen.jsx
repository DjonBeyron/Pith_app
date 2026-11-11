import useVoiceSet from './useVoiceSet.js'
import VoiceSetSetup from './VoiceSetSetup.jsx'
import VoiceSetRecord from './VoiceSetRecord.jsx'
import VoiceSetDone from './VoiceSetDone.jsx'
import '../../../styles/pillstand/voice-set.css'
import '../../../styles/pillstand/voice-set-record.css'

// «🎙 Запись набора» — экран поверх стенда пилюль (v3.3.188, CONCEPT_VOICESET.md): владелец наговаривает набор клипов своим голосом через тот же путь звука, что в игре, и отдаёт его архивом.
// Три вида: настройки / начатый набор (VoiceSetSetup), запись (VoiceSetRecord), итог и архив (VoiceSetDone). Всё состояние — useVoiceSet. keepMic — микрофон стенда включён («Старт» нажат):
// на выходе его не выключаем. Стенд под экраном на это время стоит на паузе (PillStand.jsx).
export default function VoiceSetScreen({ onClose, keepMic = false }) {
  const { levelRef, ...v } = useVoiceSet({ keepMic })
  const close = () => { v.leave(); onClose() }
  return (
    <div className="vsScreen" role="dialog" aria-label="Запись набора" data-view={v.view} data-testid="voice-set">
      <div className="vsHead">
        <b>🎙 Запись набора</b>
        <button type="button" className="psBtn" onClick={close} data-testid="vs-close">✕ к стенду</button>
      </div>
      {v.view === 'record' ? <VoiceSetRecord v={v} levelRef={levelRef} /> : v.view === 'done' ? <VoiceSetDone v={v} /> : <VoiceSetSetup v={v} />}
    </div>
  )
}

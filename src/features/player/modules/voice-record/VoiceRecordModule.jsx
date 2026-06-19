import { useState } from 'react'
import VoiceRecordBar    from './VoiceRecordBar.jsx'
import VoiceRecordBubble from './VoiceRecordBubble.jsx'

// voice_record node: student holds mic button to record, then sends.
// After sending, the recording appears as a right-aligned user bubble.
export default function VoiceRecordModule({ onDone }) {
  const [sent, setSent] = useState(null)  // null | { url, dur, waveData }

  if (sent) {
    return <VoiceRecordBubble url={sent.url} dur={sent.dur} waveData={sent.waveData} />
  }
  return <VoiceRecordBar onSend={data => { setSent(data); onDone?.() }} />
}

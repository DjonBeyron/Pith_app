import AudioModule       from './audio/AudioModule.jsx'
import VoiceRecordModule from './voice-record/VoiceRecordModule.jsx'
import CircleModule     from './circle/CircleModule.jsx'
import TextModule       from './text/TextModule.jsx'
import PhotoModule      from './photo/PhotoModule.jsx'
import VideoModule      from './video/VideoModule.jsx'
import StickerModule    from './sticker/StickerModule.jsx'
import SystemModule     from './system/SystemModule.jsx'
import WordChoiceModule     from './word-choice/WordChoiceModule.jsx'
import PhraseAssemblyModule from './phrase-assembly/PhraseAssemblyModule.jsx'
import PinMessageModule     from './pin-message/PinMessageModule.jsx'
import PhotoChoiceModule    from './photo-choice/PhotoChoiceModule.jsx'
import RegistrationModule   from './registration/RegistrationModule.jsx'

const MODULE_MAP = {
  audio:        AudioModule,
  voice_record: VoiceRecordModule,
  circle:          CircleModule,
  text:            TextModule,
  photo:           PhotoModule,
  video:           VideoModule,
  sticker:         StickerModule,
  system:          SystemModule,
  word_choice:     WordChoiceModule,
  phrase_assembly: PhraseAssemblyModule,
  pin_message:     PinMessageModule,
  photo_choice:    PhotoChoiceModule,
  registration:    RegistrationModule,
}

// Returns the component for a given node type, or null if unknown.
// To add a new module: create modules/<type>/<Type>Module.jsx and add one line here.
export function resolveModule(type) {
  return MODULE_MAP[type] ?? null
}

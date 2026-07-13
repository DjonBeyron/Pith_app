import { useState } from 'react'
import PushToggle from '../profile/PushToggle.jsx'
import InstallSlides from '../../shared/ui/InstallSlides.jsx'

export default function SettingsTab() {
  // Та же инструкция, что при первом запуске (InstallPrompt.jsx), но
  // открывается вручную в любой момент — без ограничений «раз за всё время»
  const [showInstall, setShowInstall] = useState(false)

  return (
    <div className="settingsTab">
      {showInstall && <InstallSlides onClose={() => setShowInstall(false)} />}

      <section className="settingsSection">
        <h2 className="settingsSectionTitle">Приложение</h2>
        <button className="settingsInstallBtn" onClick={() => setShowInstall(true)}>
          Как установить на телефон
        </button>
      </section>

      <section className="settingsSection">
        <h2 className="settingsSectionTitle">Уведомления</h2>
        <PushToggle />
      </section>

      <section className="settingsSection">
        <h2 className="settingsSectionTitle">Аудио</h2>
        <p className="settingsSectionNote">
          Звуки интерфейса хранятся в папке <code>public/sounds/</code>.
          Чтобы заменить звук — положи файл с тем же именем и задеплой.
        </p>

        <div className="settingsSoundList">
          <SoundRow label="Входящее сообщение"  file="message-in.mp3" />
          <SoundRow label="Верный ответ"         file="answer-correct.mp3" />
          <SoundRow label="Неверный ответ"       file="answer-wrong.mp3" />
          <SoundRow label="Закрепить сообщение"  file="pin-message.mp3" />
        </div>
      </section>
    </div>
  )
}

function SoundRow({ label, file }) {
  const src = `/sounds/${file}`

  function handlePlay() {
    const audio = new Audio(src)
    audio.play().catch(() => {})
  }

  return (
    <div className="settingsSoundRow">
      <span className="settingsSoundLabel">{label}</span>
      <code className="settingsSoundFile">{file}</code>
      <button className="settingsSoundPlay" onClick={handlePlay} title="Прослушать">▶</button>
    </div>
  )
}

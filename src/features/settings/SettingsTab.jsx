import PushToggle from '../profile/PushToggle.jsx'

export default function SettingsTab() {
  return (
    <div className="settingsTab">
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

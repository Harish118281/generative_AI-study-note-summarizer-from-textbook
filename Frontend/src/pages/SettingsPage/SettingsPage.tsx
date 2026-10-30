import { useState } from 'react'
import type { CurrentUser } from '../../types/auth'
import type { ChatModel } from '../../types/chat'
import { chatModelOptions } from '../../types/chat'
import { accentColorOptions, type AccentColor } from '../../theme/accentColors'
import './SettingsPage.css'

export type AppearanceMode = 'system' | 'light' | 'dark'

type SettingsPageProps = {
  appearance: AppearanceMode
  accentColor: AccentColor
  defaultModel: ChatModel
  user: CurrentUser
  customInstructions: string
  webSearchEnabled: boolean
  onAppearanceChange: (value: AppearanceMode) => void
  onAccentColorChange: (value: AccentColor) => void
  onClose: () => void
  onDefaultModelChange: (value: ChatModel) => void
  onLogout: () => void
  onWebSearchChange: (value: boolean) => void
  onCustomInstructionsSave: (value: string) => Promise<void>
}

function SettingsPage({
  appearance,
  accentColor,
  defaultModel,
  user,
  customInstructions,
  webSearchEnabled,
  onAppearanceChange,
  onAccentColorChange,
  onClose,
  onDefaultModelChange,
  onLogout,
  onWebSearchChange,
  onCustomInstructionsSave,
}: SettingsPageProps) {
  const [instructionDraft, setInstructionDraft] = useState(customInstructions)
  const [isSavingInstructions, setIsSavingInstructions] = useState(false)
  const [instructionsStatus, setInstructionsStatus] = useState('')

  async function saveInstructions() {
    setIsSavingInstructions(true)
    setInstructionsStatus('')
    try {
      await onCustomInstructionsSave(instructionDraft)
      setInstructionsStatus('Saved')
    } catch (error) {
      setInstructionsStatus(error instanceof Error ? error.message : 'Could not save instructions.')
    } finally {
      setIsSavingInstructions(false)
    }
  }

  return (
    <div className="settings-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-dialog"
        role="dialog"
      >
        <header className="settings-header">
          <div>
            <span className="settings-eyebrow">PREFERENCES</span>
            <h1 id="settings-title">Settings</h1>
          </div>
          <button aria-label="Close settings" className="settings-close" onClick={onClose} type="button">×</button>
        </header>

        <div className="settings-content">
          <section className="settings-group" aria-labelledby="settings-model-title">
            <div>
              <h2 id="settings-model-title">Default model</h2>
              <p>Used for new messages. You can still change the model in the composer.</p>
            </div>
            <select
              aria-label="Default model"
              value={defaultModel}
              onChange={(event) => onDefaultModelChange(event.target.value as ChatModel)}
            >
              {chatModelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </section>

          <section className="settings-group" aria-labelledby="settings-search-title">
            <div>
              <h2 id="settings-search-title">Web search</h2>
              <p>Let the selected model search for current information when needed.</p>
            </div>
            <label className="settings-switch">
              <input
                checked={webSearchEnabled}
                onChange={(event) => onWebSearchChange(event.target.checked)}
                type="checkbox"
              />
              <span aria-hidden="true" />
              <span className="settings-switch-label">{webSearchEnabled ? 'On' : 'Off'}</span>
            </label>
          </section>

          <section className="settings-group settings-instructions" aria-labelledby="settings-instructions-title">
            <div>
              <h2 id="settings-instructions-title">Custom instructions</h2>
              <p>Set response preferences that should apply to your chats.</p>
            </div>
            <textarea
              aria-label="Custom instructions for the assistant"
              maxLength={4000}
              onChange={(event) => {
                setInstructionDraft(event.target.value)
                setInstructionsStatus('')
              }}
              placeholder="For example: explain concepts step by step and define technical terms."
              rows={5}
              value={instructionDraft}
            />
            <div className="settings-instructions-footer">
              <span aria-live="polite">{instructionsStatus || `${instructionDraft.length}/4000`}</span>
              <button
                className="settings-logout"
                disabled={isSavingInstructions || instructionDraft === customInstructions}
                onClick={() => void saveInstructions()}
                type="button"
              >
                {isSavingInstructions ? 'Saving...' : 'Save instructions'}
              </button>
            </div>
          </section>

          <section className="settings-group settings-appearance" aria-labelledby="settings-appearance-title">
            <div>
              <h2 id="settings-appearance-title">Appearance</h2>
              <p>Choose how StudyAI looks on this device.</p>
            </div>
            <div className="settings-segmented" role="group" aria-label="Appearance">
              {(['system', 'light', 'dark'] as const).map((mode) => (
                <button
                  aria-pressed={appearance === mode}
                  className={appearance === mode ? 'selected' : ''}
                  key={mode}
                  onClick={() => onAppearanceChange(mode)}
                  type="button"
                >
                  {mode[0].toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-group settings-accent" aria-labelledby="settings-accent-title">
            <div>
              <h2 id="settings-accent-title">Accent color</h2>
              <p>Choose the highlight color used across the app.</p>
            </div>
            <div className="settings-accent-options" role="group" aria-label="Accent color">
              {accentColorOptions.map((option) => (
                <button
                  aria-label={option.label}
                  aria-pressed={accentColor === option.value}
                  className={accentColor === option.value ? 'selected' : ''}
                  key={option.value}
                  onClick={() => onAccentColorChange(option.value)}
                  style={{ backgroundColor: option.color }}
                  title={option.label}
                  type="button"
                />
              ))}
            </div>
          </section>

          <section className="settings-group settings-account" aria-labelledby="settings-account-title">
            <div>
              <h2 id="settings-account-title">Account</h2>
              <p>Signed in as</p>
            </div>
            <div className="settings-account-user">
              <span className="settings-account-name">{user.name}</span>
              <span>{user.email}</span>
            </div>
            <button className="settings-logout" onClick={onLogout} type="button">Log out</button>
          </section>
        </div>
      </section>
    </div>
  )
}

export default SettingsPage

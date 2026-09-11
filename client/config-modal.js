/**
 * Renders and handles the provider configuration view inside the Task Board modal.
 */
export function renderConfigTab(containerEl, onSaveSuccess) {
  containerEl.innerHTML = `
    <div class="config-container">
      <div class="config-field">
        <label for="provider-select">Select Task Provider</label>
        <select id="provider-select"></select>
      </div>
      <div id="provider-description" style="font-size: 13px; color: #94a3b8;"></div>
      <div id="provider-fields-container" style="display: flex; flex-direction: column; gap: 14px;"></div>
      <div class="config-actions">
        <button type="button" class="config-btn secondary" id="btn-test-connection">Test Connection</button>
        <button type="button" class="config-btn primary" id="btn-save-config">Save Settings</button>
        <span id="config-status" class="config-status-msg"></span>
      </div>
    </div>
  `

  const providerSelect = containerEl.querySelector('#provider-select')
  const descriptionEl = containerEl.querySelector('#provider-description')
  const fieldsContainer = containerEl.querySelector('#provider-fields-container')
  const testBtn = containerEl.querySelector('#btn-test-connection')
  const saveBtn = containerEl.querySelector('#btn-save-config')
  const statusEl = containerEl.querySelector('#config-status')

  let currentProviders = []
  let currentConfig = { active: 'github', providers: {} }

  async function loadData() {
    try {
      const res = await fetch('/api/taskboard/config')
      if (!res.ok) return
      const data = await res.json()
      currentProviders = data.providers || []
      currentConfig = data.config || { active: 'github', providers: {} }

      providerSelect.innerHTML = currentProviders
        .map((p) => `<option value="${p.id}" ${p.id === currentConfig.active ? 'selected' : ''}>${p.name}</option>`)
        .join('')

      renderSelectedProvider()
    } catch (err) {
      statusEl.className = 'config-status-msg err'
      statusEl.textContent = `Failed to load config: ${err.message}`
    }
  }

  function renderSelectedProvider() {
    const selectedId = providerSelect.value
    const provider = currentProviders.find((p) => p.id === selectedId)
    if (!provider) return

    descriptionEl.textContent = provider.description || ''
    const savedValues = currentConfig.providers?.[selectedId] || {}

    fieldsContainer.innerHTML = (provider.fields || [])
      .map((f) => `
        <div class="config-field">
          <label for="field-${f.key}">${f.label} ${f.required ? '<span style="color:#ef4444">*</span>' : ''}</label>
          <input
            id="field-${f.key}"
            data-key="${f.key}"
            type="${f.type || 'text'}"
            placeholder="${f.placeholder || ''}"
            value="${escapeAttr(savedValues[f.key] || '')}"
          />
        </div>
      `)
      .join('')
  }

  function getFormValues() {
    const values = {}
    const inputs = fieldsContainer.querySelectorAll('input')
    for (const input of inputs) {
      values[input.dataset.key] = input.value
    }
    return values
  }

  providerSelect.addEventListener('change', renderSelectedProvider)

  testBtn.addEventListener('click', async () => {
    const selectedId = providerSelect.value
    statusEl.className = 'config-status-msg'
    statusEl.textContent = 'Testing connection...'
    try {
      const res = await fetch('/api/taskboard/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedId,
          config: getFormValues(),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        statusEl.className = 'config-status-msg ok'
        statusEl.textContent = `✓ Connected successfully${data.user ? ` (${data.user})` : ''}!`
      } else {
        statusEl.className = 'config-status-msg err'
        statusEl.textContent = `✕ Connection failed: ${data.error}`
      }
    } catch (err) {
      statusEl.className = 'config-status-msg err'
      statusEl.textContent = `✕ Network error: ${err.message}`
    }
  })

  saveBtn.addEventListener('click', async () => {
    const selectedId = providerSelect.value
    statusEl.className = 'config-status-msg'
    statusEl.textContent = 'Saving...'

    if (!currentConfig.providers) currentConfig.providers = {}
    currentConfig.active = selectedId
    currentConfig.providers[selectedId] = getFormValues()

    try {
      const res = await fetch('/api/taskboard/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentConfig),
      })
      if (res.ok) {
        statusEl.className = 'config-status-msg ok'
        statusEl.textContent = '✓ Saved successfully!'
        if (onSaveSuccess) onSaveSuccess()
      } else {
        statusEl.className = 'config-status-msg err'
        statusEl.textContent = '✕ Failed to save'
      }
    } catch (err) {
      statusEl.className = 'config-status-msg err'
      statusEl.textContent = `✕ ${err.message}`
    }
  })

  loadData()
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;')
}

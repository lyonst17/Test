(() => {
  // DOM elements
  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const temperatureSlider = document.getElementById('temperature-slider');
  const tempValue = document.getElementById('temp-value');
  const maxTokensInput = document.getElementById('max-tokens-input');
  const systemPrompt = document.getElementById('system-prompt');
  const newChatBtn = document.getElementById('new-chat-btn');
  const messagesContainer = document.getElementById('messages');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const apiStatusEl = document.getElementById('api-status');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  const attachmentList = document.getElementById('attachment-list');

  // State
  let conversationHistory = [];
  let isGenerating = false;
  let modelData = {};
  let pendingAttachments = [];

  // Provider display info
  const providerInfo = {
    openai: { label: 'GPT', abbrev: 'G', color: 'provider-openai' },
    anthropic: { label: 'Claude', abbrev: 'C', color: 'provider-anthropic' },
    google: { label: 'Gemini', abbrev: 'G', color: 'provider-google' },
  };

  // Initialize
  async function init() {
    await Promise.all([fetchModels(), checkHealth()]);
    setupEventListeners();
    updateModelList();
  }

  async function fetchModels() {
    try {
      const res = await fetch('/api/chat/models');
      modelData = await res.json();
    } catch {
      modelData = { openai: [], anthropic: [], google: [] };
    }
  }

  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      renderApiStatus(data.providers);
    } catch {
      apiStatusEl.innerHTML = '<span class="status-item">Server offline</span>';
    }
  }

  function renderApiStatus(providers) {
    const names = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google' };
    apiStatusEl.innerHTML = Object.entries(providers)
      .map(
        ([key, configured]) => `
        <div class="status-item">
          <span class="status-dot ${configured ? 'active' : 'inactive'}"></span>
          ${names[key]}: ${configured ? 'Ready' : 'No API key'}
        </div>`
      )
      .join('');
  }

  function updateModelList() {
    const provider = providerSelect.value;
    const models = modelData[provider] || [];
    modelSelect.innerHTML = models
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('');
  }

  function setupEventListeners() {
    providerSelect.addEventListener('change', updateModelList);

    temperatureSlider.addEventListener('input', () => {
      tempValue.textContent = temperatureSlider.value;
    });

    userInput.addEventListener('input', () => {
      sendBtn.disabled = !userInput.value.trim() || isGenerating;
      // Auto-resize
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
    });

    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);
    newChatBtn.addEventListener('click', clearChat);

    // Attachment handlers
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Provider card click handlers
    document.querySelectorAll('.provider-card').forEach((card) => {
      card.addEventListener('click', () => {
        const provider = card.dataset.provider;
        providerSelect.value = provider;
        updateModelList();
        userInput.focus();
      });
    });
  }

  // Attachment handling
  function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      if (pendingAttachments.length >= 5) return; // Max 5 attachments
      pendingAttachments.push(file);
    });
    fileInput.value = '';
    renderAttachmentList();
  }

  function removeAttachment(index) {
    pendingAttachments.splice(index, 1);
    renderAttachmentList();
  }

  function renderAttachmentList() {
    attachmentList.innerHTML = pendingAttachments
      .map(
        (file, i) => `
        <div class="attachment-chip">
          <span>${truncateFilename(file.name, 20)}</span>
          <button class="remove-attachment" data-index="${i}">&times;</button>
        </div>`
      )
      .join('');
    attachmentList.querySelectorAll('.remove-attachment').forEach((btn) => {
      btn.addEventListener('click', () => removeAttachment(parseInt(btn.dataset.index)));
    });
  }

  function truncateFilename(name, maxLen) {
    if (name.length <= maxLen) return name;
    const ext = name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : '';
    const base = name.slice(0, name.length - ext.length);
    const truncLen = maxLen - ext.length - 3;
    return truncLen > 0 ? base.slice(0, truncLen) + '...' + ext : name.slice(0, maxLen);
  }

  async function readFileAsBase64(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function clearChat() {
    conversationHistory = [];
    pendingAttachments = [];
    renderAttachmentList();
    messagesContainer.innerHTML = `
      <div class="welcome-message">
        <h2>Welcome to Marc Fisher Footwear AI Hub</h2>
        <p>Select a provider and model from the sidebar, then start chatting.</p>
        <div class="provider-cards">
          <div class="provider-card" data-provider="openai">
            <div class="provider-icon openai-icon">G</div>
            <span>ChatGPT</span>
          </div>
          <div class="provider-card" data-provider="anthropic">
            <div class="provider-icon anthropic-icon">C</div>
            <span>Claude</span>
          </div>
          <div class="provider-card" data-provider="google">
            <div class="provider-icon google-icon">G</div>
            <span>Gemini</span>
          </div>
        </div>
      </div>`;
    // Re-attach provider card click handlers
    document.querySelectorAll('.provider-card').forEach((card) => {
      card.addEventListener('click', () => {
        providerSelect.value = card.dataset.provider;
        updateModelList();
        userInput.focus();
      });
    });
  }

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isGenerating) return;

    // Remove welcome message on first send
    const welcome = messagesContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Capture attachments for this message
    const attachments = [...pendingAttachments];
    pendingAttachments = [];
    renderAttachmentList();

    // Build attachment file names for display
    const attachmentNames = attachments.map((f) => f.name);

    // Add user message
    conversationHistory.push({ role: 'user', content: text });
    appendMessage('user', text, null, attachmentNames);

    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;
    isGenerating = true;

    // Show typing indicator
    const typingEl = appendTypingIndicator();

    const provider = providerSelect.value;

    try {
      // Build messages with optional system prompt
      const messages = [];
      const sysPrompt = systemPrompt.value.trim();
      if (sysPrompt) {
        messages.push({ role: 'system', content: sysPrompt });
      }

      // If there are attachments, read them and include context
      if (attachments.length > 0) {
        const attachInfo = [];
        for (const file of attachments) {
          if (file.type.startsWith('text/') || file.name.match(/\.(txt|csv|json|xml|md|log|js|py|html|css)$/i)) {
            const content = await file.text();
            attachInfo.push(`[Attached file: ${file.name}]\n${content}`);
          } else {
            attachInfo.push(`[Attached file: ${file.name} (${file.type || 'unknown type'}, ${formatFileSize(file.size)})]`);
          }
        }
        const lastMsg = conversationHistory[conversationHistory.length - 1];
        const enrichedContent = attachInfo.join('\n\n') + '\n\n' + lastMsg.content;
        messages.push(
          ...conversationHistory.slice(0, -1),
          { role: 'user', content: enrichedContent }
        );
      } else {
        messages.push(...conversationHistory);
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: modelSelect.value,
          messages,
          temperature: parseFloat(temperatureSlider.value),
          maxTokens: parseInt(maxTokensInput.value, 10),
        }),
      });

      const data = await res.json();

      typingEl.remove();

      if (!res.ok) {
        appendMessage('error', data.error || 'An error occurred.');
      } else {
        conversationHistory.push({ role: 'assistant', content: data.content });
        appendMessage('assistant', data.content, {
          provider,
          model: data.model,
          usage: data.usage,
        });
      }
    } catch (err) {
      typingEl.remove();
      appendMessage('error', `Network error: ${err.message}`);
    } finally {
      isGenerating = false;
      sendBtn.disabled = !userInput.value.trim();
    }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function appendMessage(role, content, meta, attachmentNames) {
    const provider = meta?.provider || providerSelect.value;
    const info = providerInfo[provider];

    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${role === 'assistant' ? info.color : ''}`;
    avatar.textContent = role === 'user' ? 'U' : info.abbrev;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Show attachment chips if present
    if (attachmentNames && attachmentNames.length > 0) {
      const attachDiv = document.createElement('div');
      attachDiv.className = 'message-attachments';
      attachmentNames.forEach((name) => {
        const chip = document.createElement('span');
        chip.className = 'message-attachment-chip';
        chip.textContent = name;
        attachDiv.appendChild(chip);
      });
      bubble.appendChild(attachDiv);
    }

    const textNode = document.createElement('span');
    textNode.textContent = content;
    bubble.appendChild(textNode);

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);

    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'message-meta';
      const parts = [];
      if (meta.model) parts.push(meta.model);
      if (meta.usage) {
        if (meta.usage.total_tokens) {
          parts.push(`${meta.usage.total_tokens} tokens`);
        } else if (meta.usage.input_tokens && meta.usage.output_tokens) {
          parts.push(`${meta.usage.input_tokens + meta.usage.output_tokens} tokens`);
        }
      }
      if (parts.length) {
        metaEl.textContent = parts.join(' · ');
        bubble.appendChild(metaEl);
      }
    }

    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function appendTypingIndicator() {
    const provider = providerSelect.value;
    const info = providerInfo[provider];

    const wrapper = document.createElement('div');
    wrapper.className = 'message assistant';

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${info.color}`;
    avatar.textContent = info.abbrev;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = `
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>`;

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return wrapper;
  }

  init();
})();

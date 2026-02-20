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
  const historyList = document.getElementById('history-list');
  const userNameEl = document.getElementById('user-name');

  // State
  let conversationHistory = [];
  let isGenerating = false;
  let modelData = {};
  let pendingAttachments = [];
  let currentChatId = null;
  let chatList = [];

  // Provider display info
  const providerInfo = {
    openai: { label: 'GPT', abbrev: 'G', color: 'provider-openai' },
    anthropic: { label: 'Claude', abbrev: 'C', color: 'provider-anthropic' },
    google: { label: 'Gemini', abbrev: 'G', color: 'provider-google' },
  };

  // Initialize
  async function init() {
    await Promise.all([fetchModels(), checkHealth(), loadUser(), loadChatHistory()]);
    setupEventListeners();
    updateModelList();
  }

  async function loadUser() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const user = await res.json();
        userNameEl.textContent = user.name || user.email || '';
      }
    } catch {
      // Ignore — will redirect to login if session expired
    }
  }

  async function fetchModels() {
    try {
      const res = await fetch('/api/chat/models');
      if (!res.ok) return;
      modelData = await res.json();
    } catch {
      modelData = { openai: [], anthropic: [], google: [] };
    }
  }

  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return;
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
    newChatBtn.addEventListener('click', startNewChat);

    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    document.querySelectorAll('.provider-card').forEach((card) => {
      card.addEventListener('click', () => {
        providerSelect.value = card.dataset.provider;
        updateModelList();
        userInput.focus();
      });
    });
  }

  // ---- Chat History ----

  async function loadChatHistory() {
    try {
      const res = await fetch('/api/history');
      if (!res.ok) return;
      chatList = await res.json();
      renderChatHistory();
    } catch {
      // Silently fail
    }
  }

  function renderChatHistory() {
    if (chatList.length === 0) {
      historyList.innerHTML = '<div class="history-empty">No previous chats</div>';
      return;
    }
    historyList.innerHTML = chatList
      .map(
        (chat) => `
      <div class="history-item ${chat.id === currentChatId ? 'active' : ''}" data-id="${chat.id}">
        <div class="history-item-content">
          <div class="history-item-title">${escapeHtml(chat.title)}</div>
          <div class="history-item-date">${formatDate(chat.updated_at)}</div>
        </div>
        <button class="delete-chat" data-id="${chat.id}" title="Delete">&times;</button>
      </div>`
      )
      .join('');

    historyList.querySelectorAll('.history-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-chat')) return;
        openChat(el.dataset.id);
      });
    });

    historyList.querySelectorAll('.delete-chat').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChat(btn.dataset.id);
      });
    });
  }

  async function openChat(chatId) {
    try {
      const res = await fetch(`/api/history/${chatId}`);
      if (!res.ok) return;
      const chat = await res.json();

      currentChatId = chatId;
      conversationHistory = chat.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      // Set provider/model if saved
      if (chat.provider && providerSelect.querySelector(`option[value="${chat.provider}"]`)) {
        providerSelect.value = chat.provider;
        updateModelList();
      }
      if (chat.model && modelSelect.querySelector(`option[value="${chat.model}"]`)) {
        modelSelect.value = chat.model;
      }

      // Clear and render messages
      messagesContainer.innerHTML = '';
      chat.messages.forEach((msg) => {
        const attachments = msg.attachments || null;
        appendMessage(msg.role, msg.content, null, attachments);
      });

      renderChatHistory();
    } catch {
      // Silently fail
    }
  }

  async function deleteChat(chatId) {
    try {
      await fetch(`/api/history/${chatId}`, { method: 'DELETE' });
      if (chatId === currentChatId) {
        startNewChat();
      }
      chatList = chatList.filter((c) => c.id !== chatId);
      renderChatHistory();
    } catch {
      // Silently fail
    }
  }

  async function ensureChat() {
    if (currentChatId) return currentChatId;
    try {
      const provider = providerSelect.value;
      const model = modelSelect.value;
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat', provider, model }),
      });
      const data = await res.json();
      currentChatId = data.id;
      await loadChatHistory();
      return currentChatId;
    } catch {
      return null;
    }
  }

  async function saveMessage(role, content, attachmentNames) {
    if (!currentChatId) return;
    try {
      await fetch(`/api/history/${currentChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content, attachments: attachmentNames || null }),
      });
    } catch {
      // Silently fail
    }
  }

  async function updateChatTitle(title) {
    if (!currentChatId) return;
    try {
      await fetch(`/api/history/${currentChatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const chat = chatList.find((c) => c.id === currentChatId);
      if (chat) chat.title = title;
      renderChatHistory();
    } catch {
      // Silently fail
    }
  }

  // ---- Attachments ----

  function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      if (pendingAttachments.length >= 5) return;
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

  // ---- Chat ----

  function startNewChat() {
    currentChatId = null;
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
    document.querySelectorAll('.provider-card').forEach((card) => {
      card.addEventListener('click', () => {
        providerSelect.value = card.dataset.provider;
        updateModelList();
        userInput.focus();
      });
    });
    renderChatHistory();
  }

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isGenerating) return;

    const welcome = messagesContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Ensure we have a chat record
    await ensureChat();

    const attachments = [...pendingAttachments];
    pendingAttachments = [];
    renderAttachmentList();

    const attachmentNames = attachments.map((f) => f.name);

    // Add user message
    conversationHistory.push({ role: 'user', content: text });
    appendMessage('user', text, null, attachmentNames);
    saveMessage('user', text, attachmentNames.length > 0 ? attachmentNames : null);

    // Auto-title: use first message as chat title
    if (conversationHistory.length === 1) {
      const title = text.length > 50 ? text.slice(0, 50) + '...' : text;
      updateChatTitle(title);
    }

    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;
    isGenerating = true;

    const typingEl = appendTypingIndicator();
    const provider = providerSelect.value;

    try {
      const messages = [];
      const sysPrompt = systemPrompt.value.trim();
      if (sysPrompt) {
        messages.push({ role: 'system', content: sysPrompt });
      }

      if (attachments.length > 0) {
        const attachInfo = [];
        for (const file of attachments) {
          if (
            file.type.startsWith('text/') ||
            file.name.match(/\.(txt|csv|json|xml|md|log|js|py|html|css)$/i)
          ) {
            const content = await file.text();
            attachInfo.push(`[Attached file: ${file.name}]\n${content}`);
          } else {
            attachInfo.push(
              `[Attached file: ${file.name} (${file.type || 'unknown type'}, ${formatFileSize(file.size)})]`
            );
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
        saveMessage('assistant', data.content);

        // Update provider/model on the chat record
        fetch(`/api/history/${currentChatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model: modelSelect.value }),
        }).catch(() => {});
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

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'Z');
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return d.toLocaleDateString();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

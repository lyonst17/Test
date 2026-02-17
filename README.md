# AI LLM Hub

A web application that integrates with multiple AI LLM providers — **ChatGPT (OpenAI)**, **Claude (Anthropic)**, and **Gemini (Google)** — through a unified chat interface.

## Features

- **Multi-provider support** — Switch between OpenAI, Anthropic, and Google Gemini
- **Model selection** — Choose specific models from each provider (GPT-4o, Claude Opus/Sonnet, Gemini Pro/Flash, etc.)
- **Configurable parameters** — Adjust temperature, max tokens, and system prompts per conversation
- **Conversation history** — Full multi-turn chat with context maintained per session
- **API key status** — Visual indicator showing which providers are configured
- **Rate limiting** — Built-in request throttling to prevent abuse
- **Responsive design** — Works on desktop and mobile devices

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure API keys

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add one or more API keys:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AI...
```

You only need keys for the providers you want to use. Providers without keys will show as unavailable in the UI.

### 3. Start the server

```bash
npm start
```

Open `http://localhost:3000` in your browser.

## Project Structure

```
├── server/
│   ├── index.js              # Express server entry point
│   ├── routes/
│   │   └── chat.js           # Chat API routes
│   └── providers/
│       ├── openai.js          # OpenAI ChatGPT integration
│       ├── anthropic.js       # Anthropic Claude integration
│       └── google.js          # Google Gemini integration
├── public/
│   ├── index.html             # Main HTML page
│   ├── styles.css             # Styling
│   └── app.js                 # Frontend JavaScript
├── .env.example               # Environment variable template
└── package.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send a chat message to a provider |
| `GET` | `/api/chat/models` | List available models per provider |
| `GET` | `/api/health` | Check server and API key status |

### POST /api/chat

```json
{
  "provider": "openai | anthropic | google",
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "temperature": 0.7,
  "maxTokens": 2048
}
```

## Supported Models

### OpenAI
- GPT-4o
- GPT-4o Mini
- GPT-4 Turbo
- GPT-3.5 Turbo

### Anthropic
- Claude Opus 4
- Claude Sonnet 4
- Claude 3.5 Sonnet
- Claude 3.5 Haiku

### Google
- Gemini 2.0 Flash
- Gemini 1.5 Pro
- Gemini 1.5 Flash

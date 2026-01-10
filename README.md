# Adventurous Notes

A modern, AI-powered note-taking application with voice recording, automatic transcription, and smart summarization. Built with React, Supabase, and Groq AI.

## ✨ Features

- 🎙️ **Voice Recording**: Record audio notes directly in the browser
- 🖥️ **Meeting Capture**: Record system audio from Zoom, Teams, etc.
- 🤖 **AI Transcription**: Automatic speech-to-text using Groq Whisper
- ✨ **Smart Summaries**: AI-generated summaries with key points and action items
- 🔐 **Secure Authentication**: Email magic link and Google OAuth
- ☁️ **Cloud Storage**: All recordings and notes stored in Supabase
- 📱 **Responsive Design**: Beautiful dark theme that works on all devices
- 💾 **Export**: Download summaries and transcripts as text files

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 16+ installed
- Supabase account (free tier)
- Groq API account (free tier)

### 2. Clone & Install

```bash
cd AdventurousNotes
npm install
```

### 3. Environment Setup

Copy `.env.example` to `.env` and fill in your credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GROQ_API_KEY=gsk_your-groq-key
```

### 4. Complete Setup

Follow the detailed setup guide: **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**

### 5. Run the App

```bash
npm run dev
```

## 📖 How It Works

1. **Sign In**: Email magic link or Google OAuth
2. **Record**: Voice or system audio capture
3. **AI Processing**: Transcription + Summary generation
4. **Store**: Saved to Supabase with encryption
5. **Access**: View, search, export anytime

## 🏗️ Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Storage, Auth)
- **AI**: Groq (Whisper + LLaMA 3.3 70B)
- **Icons**: Lucide React

## 💰 Cost (Free Tier)

Everything runs on free tiers - perfect for personal use!

## 🚀 Deployment

Works with Vercel, Netlify, or any static hosting.

## 📝 License

MIT License

---

Built with ❤️ using Groq AI and Supabase

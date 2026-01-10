# AI Integration Guide

This app currently saves audio recordings but needs real AI integration for transcription and summarization.

## Required Services

### Option 1: OpenAI (Recommended)
- **Whisper API**: Audio transcription
- **GPT-4 API**: Text summarization
- Cost: ~$0.006/minute for transcription + ~$0.03 per summary

### Option 2: AssemblyAI
- All-in-one transcription + summarization
- Cost: ~$0.00025/second (~$0.015/minute)

### Option 3: Deepgram + GPT
- Deepgram: Fast transcription
- OpenAI GPT: Summarization

## Setup Instructions

### 1. Get API Keys

**OpenAI:**
1. Go to https://platform.openai.com/api-keys
2. Create new API key
3. Save it securely

**AssemblyAI:**
1. Go to https://www.assemblyai.com/
2. Sign up and get API key

### 2. Add Environment Variables

Create `.env` file in project root:

```env
VITE_OPENAI_API_KEY=sk-your-key-here
# OR
VITE_ASSEMBLYAI_API_KEY=your-key-here
```

### 3. Install Additional Dependencies

```bash
npm install openai
# OR
npm install assemblyai
```

### 4. Implementation Example

#### Using OpenAI (Whisper + GPT-4)

Create `src/services/ai.js`:

```javascript
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: formData
  });
  
  if (!response.ok) {
    throw new Error('Transcription failed');
  }
  
  const data = await response.json();
  return data.text;
}

export async function generateSummary(transcript) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{
        role: 'system',
        content: 'You are a meeting assistant. Create structured summaries with key points, decisions, and action items.'
      }, {
        role: 'user',
        content: `Summarize this meeting transcript:\n\n${transcript}\n\nFormat:\n📋 Meeting Summary\n\n🎯 Key Discussion Points:\n• Point 1\n• Point 2\n\n✅ Decisions Made:\n• Decision 1\n\n🚀 Next Steps:\n• Action 1`
      }],
      temperature: 0.7,
      max_tokens: 1000
    })
  });
  
  if (!response.ok) {
    throw new Error('Summary generation failed');
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}
```

#### Update Component

In `src/components/AdventurousNotesApp.jsx`:

```javascript
import { transcribeAudio, generateSummary as generateAISummary } from '../services/ai';

// In generateSummary function:
const generateSummary = async (noteId) => {
  const note = notes.find(n => n.id === noteId);
  if (!note || !note.blob) return;

  setIsTranscribing(true);

  try {
    // 1. Transcribe audio
    const transcript = await transcribeAudio(note.blob);
    
    // 2. Generate summary
    const summary = await generateAISummary(transcript);
    
    // 3. Update note
    const updatedNotes = notes.map(n => 
      n.id === noteId 
        ? { 
            ...n, 
            summary: true, 
            summaryText: summary,
            transcript: transcript
          }
        : n
    );
    setNotes(updatedNotes);
  } catch (error) {
    console.error('Error generating summary:', error);
    alert('Failed to generate summary. Please check your API key and internet connection.');
  } finally {
    setIsTranscribing(false);
  }
};
```

### 5. Security Considerations

⚠️ **Important**: Never expose API keys in client-side code in production!

**For Production:**
- Create a backend API (Node.js, Python, etc.)
- Store API keys on the server
- Client calls your backend, backend calls OpenAI/AssemblyAI
- Add authentication to protect your API

**Example Backend (Node.js/Express):**

```javascript
// server.js
import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';

const app = express();
const upload = multer();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: req.file,
      model: 'whisper-1'
    });
    res.json({ transcript: transcription.text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/summarize', express.json(), async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a meeting assistant.' },
        { role: 'user', content: `Summarize: ${req.body.transcript}` }
      ]
    });
    res.json({ summary: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => console.log('API running on port 3001'));
```

## Cost Estimation

### OpenAI Pricing (as of 2024)
- Whisper: $0.006 per minute
- GPT-4: $0.03 per 1K tokens (~750 words)

### Example Costs
- 30-minute meeting: ~$0.18 transcription + ~$0.05 summary = **~$0.23 total**
- 100 meetings/month: **~$23/month**

## Alternative: Free/Open Source Options

### Local Whisper (Python)
```bash
pip install openai-whisper
```

### Ollama (Local LLMs)
```bash
# Install Ollama
curl https://ollama.ai/install.sh | sh

# Run local model
ollama run llama2
```

## Testing

1. Record a short test meeting
2. Click "Generate Summary"
3. Check console for any errors
4. Verify transcript and summary appear correctly

## Troubleshooting

- **401 Unauthorized**: Check API key
- **429 Rate Limit**: Reduce request frequency or upgrade plan
- **Audio format error**: Ensure audio is in supported format
- **CORS errors**: Use backend proxy for API calls

## Resources

- [OpenAI Whisper Docs](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI GPT Docs](https://platform.openai.com/docs/guides/text-generation)
- [AssemblyAI Docs](https://www.assemblyai.com/docs)

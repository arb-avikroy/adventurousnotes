const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1';

/**
 * Transcribe audio using Groq Whisper API
 */
export async function transcribeAudio(audioBlob) {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'en');
    formData.append('response_format', 'json');

    const response = await fetch(`${GROQ_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Transcription failed');
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

/**
 * Generate summary using Groq LLaMA 3.3 70B
 */
export async function generateSummary(transcript) {
  try {
    const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'system',
          content: 'You are a senior meeting intelligence and audio analysis assistant. Your responsibility is to analyze raw voice-to-text transcripts from meetings, webinars, coaching sessions, or training calls. You must first identify the context accurately and then generate structured, executive-ready summary notes using the correct format. You clean filler words, resolve broken sentences, preserve intent, avoid hallucinations, and clearly flag missing information as \'Not specified\'.'
        }, {
          role: 'user',
          content: `You will be given raw transcription text from an audio recording. First, determine whether the content represents (A) a Webinar / Coaching / Training session or (B) a Corporate / Business meeting. Clearly state the identified context type at the top. Then generate summary notes using the corresponding structure below, strictly following formatting and content rules.

COMMON RULES:
• Do not invent or assume information
• Remove filler words, repetitions, and irrelevant chatter
• Preserve intent, decisions, and instructional emphasis
• Use professional, neutral, concise language
• Flag unclear or missing details as 'Not specified'
• Use bullet points only
• Avoid paragraphs longer than two lines
• Bold section headers only
• Maintain consistent tense and terminology

CONTEXT IDENTIFICATION:
Identify context before summarizing:
- Webinar/Coaching: Teaching tone, explanations, frameworks, concepts, mindset guidance, examples
- Corporate Meeting: Decisions, approvals, ownership, timelines, risks, deliverables

---

IF WEBINAR / COACHING / TRAINING:

📚 Context Type: Webinar / Coaching / Training

🎯 SESSION OVERVIEW
• Session type: [Type]
• Topic / Theme: [Topic]
• Speaker(s): [Names or Not specified]
• Target audience: [Audience or Not specified]
• Session goal: [Goal]

💡 CORE TAKEAWAYS
• [6-10 key instructional points or insights]

📖 DETAILED BREAKDOWN
• [Concepts or modules with explanation and examples]

🔧 PRACTICAL INSIGHTS
• [Tools, methods, techniques, or step-by-step processes]

⚠️ COMMON MISTAKES / WARNINGS
• [Mistakes, impact, and suggested corrections]

✅ ACTIONABLE ADVICE
• Immediate actions: [List]
• Long-term strategies: [List]

❓ QUESTIONS FROM PARTICIPANTS
• Q: [Question] | A: [Response]

💬 KEY QUOTES (Optional)
• "[Impactful instructional statements]"

---

IF CORPORATE / BUSINESS MEETING:

💼 Context Type: Corporate / Business Meeting

📋 MEETING OVERVIEW
• Meeting type: [Type]
• Date: [Date or Not specified]
• Participants: [Names or roles]
• Objective: [Purpose]

🎯 EXECUTIVE SUMMARY
• [5-7 bullets covering outcomes and business impact]

🗣️ KEY DISCUSSION POINTS
• [Topics with summaries and important details]

✅ DECISIONS MADE
• Decision: [What] | Rationale: [Why] | Owner: [Who]

🚀 ACTION ITEMS
• Task: [What] | Owner: [Who] | Deadline: [When]

⚠️ RISKS / CONCERNS
• Issue: [What] | Impact: [Effect] | Mitigation: [Plan]

❓ OPEN QUESTIONS
• Question: [What] | Owner: [Who]

📅 NEXT STEPS
• [Immediate follow-ups and upcoming milestones]

---

Transcript:
${transcript}`
        }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Summary generation failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Summary generation error:', error);
    throw error;
  }
}

/**
 * Generate a concise title from transcript or summary
 */
export async function generateTitle(transcriptOrSummary) {
  try {
    const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'system',
          content: 'You are a title generator. Create a short, descriptive, and engaging title (3-7 words) that captures the main topic or purpose of the meeting. Return ONLY the title, nothing else.'
        }, {
          role: 'user',
          content: `Generate a concise title for this meeting:\n\n${transcriptOrSummary.substring(0, 1000)}`
        }],
        temperature: 0.7,
        max_tokens: 50
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Title generation failed');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('Title generation error:', error);
    return 'Meeting Recording'; // Fallback
  }
}

/**
 * Answer questions based on transcript content
 */
export async function answerQuestion(question, transcript) {
  try {
    const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'system',
          content: 'You are a precise Q&A assistant. Answer questions strictly based on the provided transcript. If the answer is not in the transcript, clearly state "This information is not available in the transcript." Do not make assumptions or add information not present in the source material. Be concise and direct.Do not mention while replying that it is based on transcript, say based on the discussions happened, or as discussed in the meeting'
        }, {
          role: 'user',
          content: `Transcript:\n${transcript}\n\n---\n\nQuestion: ${question}\n\nPlease answer based only on the information in the transcript above.`
        }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Question answering failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Question answering error:', error);
    throw error;
  }
}

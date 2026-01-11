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
          content: `You are an expert speech analyst specializing in creating digestible, structured summaries. 
Your task is to summarize the provided speech in a "granola format" - organized as distinct, 
self-contained clusters of related ideas that readers can quickly scan and understand.

INSTRUCTIONS:

1. **Identify the Core Clusters**: Break the speech into 3-7 major topic clusters. 
   Each cluster should represent a distinct theme, argument, or idea.

2. **Format Each Cluster As**:
   - **Cluster Title** (bold, action-oriented or concept-focused)
   - 2-3 key points as short statements (max 15 words each)
   - 1 supporting detail or example (optional, 1 sentence)

3. **Structure Rules**:
   - No paragraphs or dense text blocks
   - Use clear visual separation between clusters
   - Each cluster should stand alone but fit into the larger narrative
   - Prioritize concrete takeaways over abstract descriptions

4. **Key Points Guidelines**:
   - State facts, claims, or arguments concisely
   - Use active voice and specific language
   - Avoid jargon unless necessary; prioritize clarity
   - Include numbers, percentages, or evidence when present

5. **Include These Sections**:
   - **Main Message**: One sentence capturing the speech's central thesis
   - **Key Clusters**: 3-7 organized idea clusters (as described above)
   - **Audience Takeaway**: What should the listener/reader remember most?

6. **Format Example**:
   
   **Main Message**
   [One clear sentence about the overall speech]

   **Cluster Name**
   - Key point 1
   - Key point 2
   - Key point 3
   Supporting detail: [relevant context or example]

TONE & STYLE:
- Professional but accessible
- Objective (avoid editorializing unless the speaker explicitly advocated)
- Scannable (readers should grasp content in 2-3 minutes)
- Actionable (emphasize what people can do or understand)`
        }, {
          role: 'user',
          content: `Please summarize this speech transcript in the granola format as instructed:

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

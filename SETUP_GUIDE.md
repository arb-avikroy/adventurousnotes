# Setup Guide - Adventurous Notes

Complete setup instructions for Supabase, Groq API, and Authentication.

## 1. Supabase Setup

### Create Supabase Project

1. Go to https://supabase.com and create account
2. Click "New Project"
3. Fill in:
   - Project name: `adventurous-notes`
   - Database password: (save this!)
   - Region: Choose closest to you
4. Wait for project to be created

### Get API Keys

1. Go to Project Settings > API
2. Copy:
   - Project URL: `VITE_SUPABASE_URL`
   - anon/public key: `VITE_SUPABASE_ANON_KEY`

### Create Database Tables

Run this SQL in Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create notes table
CREATE TABLE notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT,
  audio_path TEXT,
  transcript TEXT,
  summary_text TEXT,
  duration INTEGER,
  meeting_type TEXT,
  icon TEXT DEFAULT '🎙️',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create participants table
CREATE TABLE note_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
  participant_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Q&A table
CREATE TABLE note_questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_questions ENABLE ROW LEVEL SECURITY;

-- Create policies for notes
CREATE POLICY "Users can view their own notes"
  ON notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes"
  ON notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON notes FOR DELETE
  USING (auth.uid() = user_id);

-- Create policies for participants
CREATE POLICY "Users can view participants of their notes"
  ON note_participants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = note_participants.note_id AND notes.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert participants to their notes"
  ON note_participants FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = note_participants.note_id AND notes.user_id = auth.uid()
  ));

-- Create policies for Q&A
CREATE POLICY "Users can view questions for their notes"
  ON note_questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = note_questions.note_id AND notes.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert questions to their notes"
  ON note_questions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = note_questions.note_id AND notes.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete questions from their notes"
  ON note_questions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = note_questions.note_id AND notes.user_id = auth.uid()
  ));

-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-recordings', 'audio-recordings', false);

-- Create storage policies
CREATE POLICY "Users can upload their own audio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'audio-recordings' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own audio"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'audio-recordings' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own audio"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'audio-recordings' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

### Configure Authentication

1. Go to Authentication > Providers
2. Enable:
   - **Email** (Magic Link) - Already enabled by default
   - **Google OAuth**:
     - Go to https://console.cloud.google.com/
     - Create new project or select existing
     - Enable Google+ API
     - Create OAuth 2.0 credentials
     - Add authorized redirect URI: `https://[YOUR-PROJECT-REF].supabase.co/auth/v1/callback`
     - Copy Client ID and Client Secret to Supabase

## 2. Groq API Setup

### Get API Key

1. Go to https://console.groq.com/
2. Sign up or login
3. Go to API Keys section
4. Click "Create API Key"
5. Copy the key: `VITE_GROQ_API_KEY`

**Note**: Groq offers free tier with:
- Whisper for transcription
- LLaMA 3.3 70B for summarization
- Very fast inference

## 3. Environment Variables

Create `.env` file in project root:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Groq API
VITE_GROQ_API_KEY=gsk_your-groq-key-here
```

**Important**: Add `.env` to `.gitignore` to keep keys secret!

## 4. Install Dependencies

```bash
npm install
```

This will install:
- `@supabase/supabase-js` - Supabase client
- React and other existing dependencies

## 5. Run the App

```bash
npm run dev
```

## 6. Usage Flow

1. **Sign In**: Use email magic link or Google OAuth
2. **Record**: Click microphone or screen recording
3. **Transcribe**: Audio is sent to Groq Whisper API
4. **Summarize**: Transcript is processed by LLaMA 3.3
5. **Store**: Everything saved to Supabase with user association

## 7. Supabase Storage Configuration

### Create Storage Bucket

1. Go to Storage in Supabase dashboard
2. Create bucket: `audio-recordings`
3. Set as **Private** (already handled by policies above)

## 8. Testing

### Test Authentication
1. Try email login - check your inbox
2. Try Google login - verify redirect works

### Test Recording
1. Record a short audio
2. Check transcription appears
3. Generate summary
4. Verify data in Supabase tables

### Check Supabase
- **Authentication > Users**: See logged in users
- **Table Editor > notes**: See stored recordings
- **Storage > audio-recordings**: See audio files

## 9. Production Deployment

### Environment Variables on Hosting Platform

For **Vercel/Netlify**:
```bash
VITE_SUPABASE_URL=your-url
VITE_SUPABASE_ANON_KEY=your-key
VITE_GROQ_API_KEY=your-groq-key
```

### Security Best Practices

1. **Never commit `.env` file**
2. **Use Supabase RLS policies** (already configured)
3. **Rotate API keys** periodically
4. **Monitor usage** on Groq dashboard
5. **Set up alerts** in Supabase for suspicious activity

## 10. Troubleshooting

### "Missing environment variables"
- Check `.env` file exists
- Restart dev server after creating `.env`
- Verify variable names start with `VITE_`

### Authentication not working
- Check Supabase URL and anon key
- Verify email redirect URL in Supabase dashboard
- For Google: Verify OAuth credentials and redirect URIs

### Transcription fails
- Check Groq API key is valid
- Verify audio format (webm) is supported
- Check Groq API status

### Database errors
- Verify SQL tables created correctly
- Check RLS policies are enabled
- Ensure user is authenticated

## 11. Cost Estimation

### Groq (Free Tier)
- Whisper: Free up to 10,000 requests/day
- LLaMA: Free with rate limits
- Very fast response times

### Supabase (Free Tier)
- 500 MB database
- 1 GB file storage
- 50,000 monthly active users
- Unlimited API requests

Perfect for getting started at no cost!

## 12. Next Steps

- [ ] Add real-time sync for collaborative notes
- [ ] Implement offline support with IndexedDB
- [ ] Add export to PDF/Word
- [ ] Implement note sharing
- [ ] Add calendar integration
- [ ] Build mobile app (React Native)

## Support

- **Supabase Docs**: https://supabase.com/docs
- **Groq Docs**: https://console.groq.com/docs
- **Issues**: Open an issue in the repo

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Plus, FileText, Sparkles, Trash2, Download, X, User, Pause, Play, MonitorUp, Volume2, LogOut, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { transcribeAudio, generateSummary as generateAISummary, generateTitle, answerQuestion } from '../services/groqService';

const AdventurousNotesApp = ({ session }) => {
  const [notes, setNotes] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [currentNote, setCurrentNote] = useState('');
  const [recordingSource, setRecordingSource] = useState('microphone');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [qaHistory, setQaHistory] = useState([]);
  const [showManualNoteModal, setShowManualNoteModal] = useState(false);
  const [manualNoteTitle, setManualNoteTitle] = useState('');
  const [manualNoteContent, setManualNoteContent] = useState('');
  const [isSavingManualNote, setIsSavingManualNote] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  // Load notes from Supabase
  useEffect(() => {
    loadNotes();
    cleanupOldRecordings();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select(`
          *,
          note_participants (participant_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedNotes = await Promise.all(data.map(async (note) => {
        // Generate signed URL for private audio file
        let audioUrl = null;
        if (note.audio_path) {
          const { data: urlData, error: urlError } = await supabase.storage
            .from('audio-recordings')
            .createSignedUrl(note.audio_path, 31536000); // 1 year
          
          if (!urlError && urlData) {
            audioUrl = urlData.signedUrl;
          }
        }

        return {
          id: note.id,
          title: note.title,
          description: note.description,
          audioUrl: audioUrl,
          audioPath: note.audio_path,
          duration: note.duration,
          date: note.created_at,
          summary: !!note.summary_text,
          summaryText: note.summary_text,
          transcript: note.transcript,
          author: session.user.email,
          icon: note.icon || '🎙️',
          participants: note.note_participants?.map(p => p.participant_name) || [session.user.email],
          meetingType: note.meeting_type
        };
      }));

      setNotes(formattedNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Cleanup recordings older than 20 days
  const cleanupOldRecordings = async () => {
    try {
      const twentyDaysAgo = new Date();
      twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

      const { data: oldNotes, error } = await supabase
        .from('notes')
        .select('id, audio_path, summary_text')
        .lt('created_at', twentyDaysAgo.toISOString())
        .not('audio_path', 'is', null);

      if (error) throw error;

      for (const note of oldNotes || []) {
        // Delete audio file from storage
        if (note.audio_path) {
          await supabase.storage
            .from('audio-recordings')
            .remove([note.audio_path]);
        }

        // Update note to remove audio references
        await supabase
          .from('notes')
          .update({ audio_url: null, audio_path: null })
          .eq('id', note.id);
      }

      console.log(`Cleaned up ${oldNotes?.length || 0} old recordings`);
    } catch (error) {
      console.error('Error cleaning up old recordings:', error);
    }
  };

  // One-time cleanup: Remove ALL recordings that have summaries
  const cleanupAllRecordingsWithSummaries = async () => {
    try {
      const { data: notesWithAudio, error } = await supabase
        .from('notes')
        .select('id, audio_path, summary_text')
        .not('audio_path', 'is', null)
        .not('summary_text', 'is', null);

      if (error) throw error;

      for (const note of notesWithAudio || []) {
        // Delete audio file from storage
        if (note.audio_path) {
          await supabase.storage
            .from('audio-recordings')
            .remove([note.audio_path]);
        }

        // Update note to remove audio references
        await supabase
          .from('notes')
          .update({ audio_url: null, audio_path: null })
          .eq('id', note.id);
      }

      console.log(`Cleaned up ${notesWithAudio?.length || 0} recordings with summaries`);
      alert(`Successfully cleaned up ${notesWithAudio?.length || 0} audio files!`);
    } catch (error) {
      console.error('Error cleaning up recordings:', error);
      alert('Failed to cleanup recordings. Check console for details.');
    }
  };

  const uploadAudioToStorage = async (blob, noteId) => {
    try {
      const fileName = `${session.user.id}/${noteId}.webm`;
      const { data, error } = await supabase.storage
        .from('audio-recordings')
        .upload(fileName, blob, {
          contentType: 'audio/webm',
          upsert: false
        });

      if (error) throw error;

      // Get signed URL for private bucket (valid for 1 year)
      const { data: urlData, error: urlError } = await supabase.storage
        .from('audio-recordings')
        .createSignedUrl(fileName, 31536000); // 1 year in seconds

      if (urlError) throw urlError;

      return { path: data.path, url: urlData.signedUrl };
    } catch (error) {
      console.error('Error uploading audio:', error);
      throw error;
    }
  };

  const startRecording = async (source = 'microphone') => {
    try {
      let stream;
      
      if (source === 'system') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          }
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          } 
        });
      }
      
      streamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        setIsTranscribing(true);
        
        try {
          // Create note ID
          const noteId = crypto.randomUUID();
          
          // Transcribe audio using Groq (no need to store audio since we have transcript)
          const transcript = await transcribeAudio(blob);
          
          // Generate summary using Groq
          const summary = await generateAISummary(transcript);
          
          // Generate intelligent title from summary
          const generatedTitle = await generateTitle(summary);
          const baseTitle = meetingTitle || generatedTitle;
          
          // Add prefix based on recording type
          const prefix = source === 'system' ? 'Meeting: ' : 'Voice: ';
          const finalTitle = baseTitle.startsWith('Meeting:') || baseTitle.startsWith('Voice:') 
            ? baseTitle 
            : prefix + baseTitle;
          
          // Save to Supabase database (without audio - we already have transcript and summary)
          const { data, error } = await supabase
            .from('notes')
            .insert([{
              id: noteId,
              user_id: session.user.id,
              title: finalTitle,
              description: transcript.substring(0, 200) + '...',
              audio_url: null,
              audio_path: null,
              transcript: transcript,
              summary_text: summary,
              duration: recordingTime,
              meeting_type: source === 'system' ? 'Screen Recording' : 'Voice Note',
              icon: source === 'system' ? '🖥️' : '🎙️'
            }])
            .select()
            .single();

          if (error) throw error;

          // Add participant
          await supabase
            .from('note_participants')
            .insert([{
              note_id: noteId,
              participant_name: session.user.email
            }]);

          // Reload notes
          await loadNotes();
          
          setShowCreateModal(false);
          setMeetingTitle('');
        } catch (error) {
          console.error('Error processing recording:', error);
          alert('Failed to process recording. Please check your API keys and try again.');
        } finally {
          setIsTranscribing(false);
          stream.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setRecordingSource(source);
      setShowCreateModal(true);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error accessing media:', err);
      alert('Unable to access recording device. Please grant permission and try again.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      clearInterval(timerRef.current);
    }
  };

  const generateSummary = async (noteId) => {
    const note = notes.find(n => n.id === noteId);
    if (!note || !note.transcript) return;

    setIsTranscribing(true);

    try {
      const summary = await generateAISummary(note.transcript);
      
      // Generate intelligent title from summary
      const generatedTitle = await generateTitle(summary);
      
      // Add prefix based on recording type
      const prefix = note.meetingType === 'Screen Recording' ? 'Meeting: ' : 'Voice: ';
      const finalTitle = generatedTitle.startsWith('Meeting:') || generatedTitle.startsWith('Voice:') 
        ? generatedTitle 
        : prefix + generatedTitle;
      
      // Delete audio file from storage after transcription and summary
      if (note.audioPath) {
        await supabase.storage
          .from('audio-recordings')
          .remove([note.audioPath]);
      }
      
      // Update in Supabase - remove audio references, add summary, and update title
      const { error } = await supabase
        .from('notes')
        .update({ 
          title: finalTitle,
          summary_text: summary,
          audio_url: null,
          audio_path: null
        })
        .eq('id', noteId);

      if (error) throw error;

      // Reload notes
      await loadNotes();
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Failed to generate summary. Please check your Groq API key.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const viewNoteDetails = async (note) => {
    setSelectedNote(note);
    setShowDetailModal(true);
    setQuestion('');
    setAnswer('');
    
    // Load Q&A history
    try {
      const { data, error } = await supabase
        .from('note_questions')
        .select('*')
        .eq('note_id', note.id)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setQaHistory(data || []);
    } catch (error) {
      console.error('Error loading Q&A history:', error);
      setQaHistory([]);
    }
  };

  const askQuestion = async () => {
    if (!question.trim() || !selectedNote?.transcript) return;

    setIsAnswering(true);
    try {
      const response = await answerQuestion(question, selectedNote.transcript);
      setAnswer(response);
      
      // Save Q&A to database
      const { error } = await supabase
        .from('note_questions')
        .insert([{
          note_id: selectedNote.id,
          question: question,
          answer: response
        }]);
      
      if (error) throw error;
      
      // Reload Q&A history
      const { data } = await supabase
        .from('note_questions')
        .select('*')
        .eq('note_id', selectedNote.id)
        .order('created_at', { ascending: true });
      
      setQaHistory(data || []);
      setQuestion(''); // Clear question after saving
    } catch (error) {
      console.error('Error answering question:', error);
      alert('Failed to answer question. Please try again.');
    } finally {
      setIsAnswering(false);
    }
  };

  const deleteNote = async (id) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const note = notes.find(n => n.id === id);
      
      // Delete audio from storage
      if (note.audioPath) {
        await supabase.storage
          .from('audio-recordings')
          .remove([note.audioPath]);
      }

      // Delete from database (participants will cascade)
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Reload notes
      await loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      alert('Failed to delete note');
    }
  };

  const downloadNote = (note) => {
    const content = `${note.title}\n${'='.repeat(50)}\n\nDate: ${formatDate(note.date)}\nDuration: ${formatTime(note.duration)}\nParticipants: ${note.participants?.join(', ') || 'N/A'}\n\n${note.summaryText || 'No summary available'}\n\n${'='.repeat(50)}\nTranscript:\n${note.transcript || 'No transcript available'}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSignOut = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await supabase.auth.signOut();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    
    // Reset time to midnight for accurate day comparison
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffTime = nowOnly - dateOnly;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeRange = (dateString, durationSeconds) => {
    const startDate = new Date(dateString);
    
    return startDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const saveManualNote = async () => {
    if (!manualNoteTitle.trim() && !manualNoteContent.trim()) {
      alert('Please enter a title or content for the note');
      return;
    }

    setIsSavingManualNote(true);

    try {
      const noteTitle = 'Manual: ' + (manualNoteTitle.trim() || 'Untitled Note');
      
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: session.user.id,
          title: noteTitle,
          description: manualNoteContent.trim(),
          duration: 0,
          icon: '📝'
        })
        .select()
        .single();

      if (error) throw error;

      // Reset form
      setManualNoteTitle('');
      setManualNoteContent('');
      setShowManualNoteModal(false);

      // Reload notes
      await loadNotes();
    } catch (error) {
      console.error('Error saving manual note:', error);
      alert('Failed to save note. Please try again.');
    } finally {
      setIsSavingManualNote(false);
    }
  };

  const recent = notes;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="animate-spin text-amber-500" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Main Card */}
        <div className="bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden border border-zinc-800">
          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <span className="text-white text-lg font-bold">📝</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-amber-200">Adventurous Notes</h1>
                <p className="text-xs text-zinc-500">{session.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 text-sm font-medium text-amber-200 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2"
              >
                <Mic size={18} />
                Record
              </button>
              <button
                onClick={() => setShowManualNoteModal(true)}
                className="px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus size={18} />
                Manual Note
              </button>
              <button
                onClick={handleSignOut}
                className="p-2 text-amber-200 hover:bg-zinc-800 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Recent Section */}
            <div className="mb-6">
              <h2 className="text-sm font-medium text-zinc-500 mb-3">Your Recordings</h2>
              {notes.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <Mic size={32} className="text-zinc-600" />
                  </div>
                  <p className="text-zinc-500 mb-2">No recordings yet</p>
                  <p className="text-xs text-zinc-600">Click "Create note" to start recording</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2 scrollbar-thin">
                  {recent.map((note) => (
                    <div
                      key={note.id}
                      onClick={() => viewNoteDetails(note)}
                      className="group p-4 rounded-xl hover:bg-zinc-800 transition-all cursor-pointer border border-zinc-800 hover:border-amber-600"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-900 to-orange-900 flex items-center justify-center text-xl flex-shrink-0">
                          {note.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-amber-200 mb-1">{note.title}</h3>
                          {note.icon === '📝' ? (
                            <div className="mt-1">
                              <p className="text-xs text-zinc-500 line-clamp-2">{note.description.substring(0, 150)}{note.description.length > 150 ? '...' : ''}</p>
                              {note.description.split(' ').length > 150 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedNote(note);
                                    setShowTranscriptModal(true);
                                  }}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 mt-1 flex items-center gap-1"
                                >
                                  <FileText size={12} />
                                  View Full Note
                                </button>
                              )}
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-zinc-400 line-clamp-1">{note.description}</p>
                              {note.transcript && (
                                <div className="mt-1">
                                  <p className="text-xs text-zinc-500 line-clamp-2">{note.transcript.substring(0, 150)}...</p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedNote(note);
                                      setShowTranscriptModal(true);
                                    }}
                                    className="text-xs text-amber-400 hover:text-amber-300 mt-1 flex items-center gap-1"
                                  >
                                    <FileText size={12} />
                                    View Full Transcript
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                          {note.meetingType && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-zinc-500">{note.meetingType}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">{formatDate(note.date)}</span>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNote(note.id);
                            }}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-900 rounded transition-all"
                          >
                            <Trash2 size={16} className="text-red-600" />
                          </button>
                        </div>
                      </div>
                      {note.summary && (
                        <div className="mt-2 ml-13 flex items-center gap-2">
                          <div className="px-2 py-1 bg-emerald-950 rounded text-xs font-medium text-emerald-400 flex items-center gap-1">
                            <Sparkles size={12} />
                            Summary ready
                          </div>
                          <span className="text-xs text-zinc-500">{formatTimeRange(note.date, note.duration)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadNote(note);
                            }}
                            className="ml-auto px-2 py-1 text-xs text-amber-200 hover:bg-zinc-800 rounded flex items-center gap-1"
                          >
                            <Download size={12} />
                            Export
                          </button>
                        </div>
                      )}
                      {!note.summary && note.transcript && note.icon !== '📝' && (
                        <div className="mt-2 ml-13">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              generateSummary(note.id);
                            }}
                            className="px-2 py-1 bg-amber-950 hover:bg-amber-900 rounded text-xs font-medium text-amber-400 flex items-center gap-1"
                          >
                            <Sparkles size={12} />
                            Generate Summary
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Notes Input */}
            <div className="mt-6 pt-6 border-t border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-amber-200">Quick Record</h2>
              </div>
              <div className="relative bg-zinc-800 rounded-xl border border-zinc-700 focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-900 transition-all">
                <input
                  type="text"
                  value={currentNote}
                  onChange={(e) => setCurrentNote(e.target.value)}
                  placeholder="Note title (optional)"
                  className="w-full px-4 py-3 bg-transparent text-sm text-amber-200 placeholder-zinc-600 focus:outline-none"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    onClick={startRecording}
                    className="p-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg hover:from-amber-700 hover:to-orange-700 transition-all shadow-sm"
                    title="Record with microphone"
                  >
                    <Mic size={18} />
                  </button>
                  <button
                    onClick={() => startRecording('system')}
                    className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm"
                    title="Record system audio (Zoom, Teams, etc.)"
                  >
                    <MonitorUp size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recording Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-zinc-800">
            <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-amber-200">
                {isRecording ? (isPaused ? 'Recording Paused' : 'Recording...') : 'Create New Note'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  if (isRecording) stopRecording();
                }}
                className="p-2 text-amber-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              {isTranscribing ? (
                <div className="text-center py-8">
                  <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center animate-pulse">
                    <Sparkles size={40} className="text-white" />
                  </div>
                  <div className="text-xl font-bold text-amber-200 mb-2">Processing Recording</div>
                  <p className="text-sm text-zinc-400 mb-4">Transcribing and generating AI summary...</p>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full animate-pulse" style={{ width: '70%' }}></div>
                  </div>
                </div>
              ) : isRecording ? (
                <div className="text-center py-8">
                  <div className={`w-24 h-24 mx-auto mb-6 rounded-full ${
                    recordingSource === 'system' 
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500' 
                      : 'bg-gradient-to-r from-red-500 to-orange-500'
                  } flex items-center justify-center ${isPaused ? '' : 'animate-pulse'}`}>
                    {recordingSource === 'system' ? (
                      <MonitorUp size={40} className="text-white" />
                    ) : (
                      <Mic size={40} className="text-white" />
                    )}
                  </div>
                  <div className="mb-4">
                    <input
                      type="text"
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value)}
                      placeholder="Meeting title (optional)"
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-amber-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                  </div>
                  <div className="text-3xl font-bold text-amber-200 mb-2">{formatTime(recordingTime)}</div>
                  <p className="text-sm text-zinc-400 mb-2">
                    {isPaused ? 'Paused' : `Recording ${recordingSource === 'system' ? 'system audio' : 'microphone'}...`}
                  </p>
                  <p className="text-xs text-zinc-500 mb-8">
                    {recordingSource === 'system' ? '🖥️ Capturing screen & audio' : '🎙️ Capturing voice'}
                  </p>
                  <div className="flex gap-3 justify-center">
                    {isPaused ? (
                      <button
                        onClick={resumeRecording}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg flex items-center gap-2"
                      >
                        <Play size={18} />
                        Resume
                      </button>
                    ) : (
                      <button
                        onClick={pauseRecording}
                        className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-medium hover:from-yellow-600 hover:to-orange-600 transition-all shadow-lg flex items-center gap-2"
                      >
                        <Pause size={18} />
                        Pause
                      </button>
                    )}
                    <button
                      onClick={stopRecording}
                      className="px-6 py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl font-medium hover:from-red-600 hover:to-orange-600 transition-all shadow-lg flex items-center gap-2"
                    >
                      <Square size={18} fill="currentColor" />
                      Stop
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mb-4">
                    <input
                      type="text"
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value)}
                      placeholder="Meeting title (optional)"
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-amber-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                  </div>
                  <button
                    onClick={() => startRecording('microphone')}
                    className="w-full p-4 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-medium hover:from-amber-700 hover:to-orange-700 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Mic size={20} />
                    Record with Microphone
                  </button>
                  <button
                    onClick={() => startRecording('system')}
                    className="w-full p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <MonitorUp size={20} />
                    Record Zoom/Teams Meeting
                  </button>
                  <p className="text-xs text-center text-zinc-500 mt-2">
                    💡 Tip: Recording will be automatically transcribed and summarized using AI
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Note Detail Modal */}
      {showDetailModal && selectedNote && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-zinc-800">
            <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-900 to-orange-900 flex items-center justify-center text-2xl">
                  {selectedNote.icon}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-amber-200">{selectedNote.title}</h2>
                  <p className="text-xs text-zinc-500">
                    {formatDate(selectedNote.date)} • {formatTimeRange(selectedNote.date, selectedNote.duration)} • {selectedNote.meetingType}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedNote(null);
                }}
                className="p-2 text-amber-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {/* Participants */}
              {selectedNote.participants && selectedNote.participants.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-amber-200 mb-2 flex items-center gap-2">
                    <User size={16} />
                    Participants ({selectedNote.participants.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedNote.participants.map((participant, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg">
                        <span className="text-xs text-zinc-300">{participant}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Summary */}
              {selectedNote.summary && selectedNote.summaryText && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-amber-200 mb-2 flex items-center gap-2">
                    <Sparkles size={16} className="text-emerald-400" />
                    AI Summary
                  </h3>
                  <div className="bg-gradient-to-br from-emerald-950 to-teal-950 rounded-xl p-4 border border-emerald-900">
                    <pre className="text-sm text-emerald-300 whitespace-pre-wrap font-sans">{selectedNote.summaryText}</pre>
                  </div>
                </div>
              )}

              {/* Transcript Preview */}
              {selectedNote.transcript && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-amber-200 mb-2 flex items-center gap-2">
                    <FileText size={16} />
                    Transcript Preview
                  </h3>
                  <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
                    <p className="text-sm text-zinc-300 line-clamp-3">{selectedNote.transcript}</p>
                    <button
                      onClick={() => {
                        setShowDetailModal(false);
                        setShowTranscriptModal(true);
                      }}
                      className="mt-3 px-4 py-2 bg-amber-900 hover:bg-amber-800 text-amber-200 rounded-lg text-xs font-medium transition-all flex items-center gap-2"
                    >
                      <FileText size={14} />
                      View Full Transcript
                    </button>
                  </div>
                </div>
              )}

              {/* Note Preview for Manual Notes */}
              {!selectedNote.transcript && selectedNote.description && selectedNote.icon === '📝' && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-emerald-200 mb-2 flex items-center gap-2">
                    <FileText size={16} />
                    Note Preview
                  </h3>
                  <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
                    <p className="text-sm text-zinc-300 line-clamp-3">{selectedNote.description}</p>
                    {selectedNote.description.split(' ').length > 150 && (
                      <button
                        onClick={() => {
                          setShowDetailModal(false);
                          setShowTranscriptModal(true);
                        }}
                        className="mt-3 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-emerald-200 rounded-lg text-xs font-medium transition-all flex items-center gap-2"
                      >
                        <FileText size={14} />
                        View Full Note
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Audio Player - Only for Voice Notes */}
              {selectedNote.audioUrl && selectedNote.meetingType === 'Voice Note' && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-amber-200 mb-2 flex items-center gap-2">
                    <Volume2 size={16} />
                    Recording
                  </h3>
                  <audio controls className="w-full">
                    <source src={selectedNote.audioUrl} type="audio/webm" />
                  </audio>
                </div>
              )}

              {/* Q&A Section */}
              {selectedNote.transcript && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-amber-200 mb-3 flex items-center gap-2">
                    ❓ Ask a Question
                  </h3>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && askQuestion()}
                        placeholder="Ask anything about this recording..."
                        className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-amber-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-600"
                        disabled={isAnswering}
                      />
                      <button
                        onClick={askQuestion}
                        disabled={!question.trim() || isAnswering}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isAnswering ? (
                          <>
                            <Loader size={16} className="animate-spin" />
                            Thinking...
                          </>
                        ) : (
                          'Ask'
                        )}
                      </button>
                    </div>
                    {answer && (
                      <div className="bg-gradient-to-br from-purple-950 to-pink-950 rounded-xl p-4 border border-purple-900">
                        <p className="text-xs text-purple-300 mb-1 font-semibold">Answer:</p>
                        <p className="text-sm text-purple-200 whitespace-pre-wrap">{answer}</p>
                      </div>
                    )}
                    
                    {/* Q&A History */}
                    {qaHistory.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-zinc-500 mb-2 font-semibold">Previous Questions:</p>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-2 scrollbar-thin">
                          {qaHistory.map((qa, index) => (
                            <div key={qa.id} className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                              <p className="text-xs text-amber-300 mb-1 font-semibold">Q: {qa.question}</p>
                              <p className="text-xs text-zinc-400 whitespace-pre-wrap">A: {qa.answer}</p>
                              <p className="text-xs text-zinc-600 mt-1">
                                {new Date(qa.created_at).toLocaleString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  hour: 'numeric', 
                                  minute: '2-digit',
                                  hour12: true 
                                })}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => downloadNote(selectedNote)}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg font-medium hover:from-amber-700 hover:to-orange-700 transition-all flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Export Summary
                </button>
                {!selectedNote.summary && selectedNote.transcript && (
                  <button
                    onClick={() => {
                      generateSummary(selectedNote.id);
                      setShowDetailModal(false);
                    }}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles size={18} />
                    Generate Summary
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Note Modal */}
      {showManualNoteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-zinc-800">
            <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-emerald-200">Create Manual Note</h2>
              <button
                onClick={() => {
                  setShowManualNoteModal(false);
                  setManualNoteTitle('');
                  setManualNoteContent('');
                }}
                className="p-2 text-amber-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={manualNoteTitle}
                    onChange={(e) => setManualNoteTitle(e.target.value)}
                    placeholder="Enter note title"
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-amber-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-900 transition-all"
                    disabled={isSavingManualNote}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Content
                  </label>
                  <textarea
                    value={manualNoteContent}
                    onChange={(e) => setManualNoteContent(e.target.value)}
                    placeholder="Enter your note content..."
                    rows={10}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-amber-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-900 transition-all resize-none"
                    disabled={isSavingManualNote}
                  />
                </div>
              </div>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    setShowManualNoteModal(false);
                    setManualNoteTitle('');
                    setManualNoteContent('');
                  }}
                  className="flex-1 px-4 py-3 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 transition-colors font-medium"
                  disabled={isSavingManualNote}
                >
                  Cancel
                </button>
                <button
                  onClick={saveManualNote}
                  disabled={isSavingManualNote || (!manualNoteTitle.trim() && !manualNoteContent.trim())}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSavingManualNote ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Plus size={18} />
                      Save Note
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Modal */}
      {showTranscriptModal && selectedNote && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-zinc-800">
            <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <FileText size={24} className={selectedNote.icon === '📝' ? "text-emerald-400" : "text-amber-400"} />
                <div>
                  <h2 className="text-lg font-semibold text-amber-200">
                    {selectedNote.icon === '📝' ? 'Full Note' : 'Full Transcript'}
                  </h2>
                  <p className="text-xs text-zinc-500">{selectedNote.title}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTranscriptModal(false);
                }}
                className="p-2 text-amber-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="bg-zinc-800 rounded-xl p-6 border border-zinc-700">
                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {selectedNote.icon === '📝' ? selectedNote.description : selectedNote.transcript}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 flex-shrink-0">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const contentToCopy = selectedNote.icon === '📝' ? selectedNote.description : selectedNote.transcript;
                    navigator.clipboard.writeText(contentToCopy);
                    alert(`${selectedNote.icon === '📝' ? 'Note' : 'Transcript'} copied to clipboard!`);
                  }}
                  className="flex-1 px-4 py-2 bg-zinc-800 text-amber-200 rounded-lg font-medium hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
                >
                  <FileText size={18} />
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setShowTranscriptModal(false)}
                  className="px-6 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg font-medium hover:from-amber-700 hover:to-orange-700 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdventurousNotesApp;

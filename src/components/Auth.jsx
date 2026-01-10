import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, LogIn, Loader, Lock } from 'lucide-react';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Check for email confirmation on component mount
  useEffect(() => {
    const checkEmailConfirmation = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');
      
      if (type === 'signup') {
        setMessage('✅ Email confirmed! You can now sign in with your password.');
        setIsSignUp(false);
        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    
    checkEmailConfirmation();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSignUp) {
        // Sign up new user
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://ainotes.adventurousinvestorhub.com',
            data: {
              email_confirmed: false
            }
          }
        });

        if (error) throw error;
        
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setMessage('This email is already registered. Please sign in instead.');
          setIsSignUp(false);
        } else {
          setMessage('✅ Verification email sent! Please check your inbox and click the confirmation link. After confirming, return here and sign in with your password.');
          setEmail('');
          setPassword('');
        }
      } else {
        // Sign in existing user
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        // Successful login will trigger the session state change in App.jsx
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://ainotes.adventurousinvestorhub.com'
        }
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-3xl shadow-2xl max-w-md w-full p-8 border border-zinc-800">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-3xl">📝</span>
          </div>
          <h1 className="text-2xl font-bold text-amber-200 mb-2">Adventurous Notes</h1>
          <p className="text-zinc-400 text-sm">Record, transcribe, and summarize your meetings with AI</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-amber-200 mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-amber-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-amber-200 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              minLength={6}
              disabled={loading}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-amber-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg font-medium hover:from-amber-700 hover:to-orange-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader size={18} className="animate-spin" /> : <Lock size={18} />}
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage('');
            }}
            className="w-full text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-zinc-900 text-zinc-500">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-amber-200 rounded-lg font-medium hover:bg-zinc-750 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>

        {message && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            message.includes('Check') 
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' 
              : 'bg-red-950 text-red-400 border border-red-900'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

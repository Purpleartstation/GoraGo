import { useState } from 'react';
import { auth } from '../firebase';
import { createHousehold, joinHousehold } from '../db';
import { useAppStore } from '../store';
import { Wallet, Users, UserPlus, LogOut, Copy, Check } from 'lucide-react';
import { signOut } from 'firebase/auth';

interface SetupScreenProps {
  userId: string;
  userName: string;
}

export default function SetupScreen({ userId, userName }: SetupScreenProps) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [householdName, setHouseholdName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdId, setCreatedId] = useState('');
  const [copied, setCopied] = useState(false);

  const setCurrentHousehold = useAppStore((s) => s.setCurrentHousehold);

  const handleCreate = async () => {
    if (!householdName.trim()) {
      setError('Please enter a name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const id = await createHousehold(userId, householdName.trim());
      setCreatedId(id);
    } catch (err) {
      setError('Failed to create household. Try again.');
      console.error(err);
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError('Please enter a household code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const success = await joinHousehold(userId, joinCode.trim());
      if (success) {
        setCurrentHousehold(joinCode.trim());
        window.location.reload();
      } else {
        setError('Household not found. Check the code and try again.');
      }
    } catch (err) {
      setError('Failed to join. Try again.');
      console.error(err);
    }
    setLoading(false);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(createdId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinishCreate = () => {
    setCurrentHousehold(createdId);
    window.location.reload();
  };

  // Show the code to share after creating
  if (createdId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-emerald-500 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
          <Check className="text-white" size={32} />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight mb-2">Household Created!</h1>
        <p className="text-zinc-400 font-medium mb-6 max-w-[300px]">
          Share this code with your partner so they can join:
        </p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4 w-full max-w-[340px]">
          <p className="text-xs text-zinc-500 mb-2 font-medium">HOUSEHOLD CODE</p>
          <p className="text-amber-400 font-mono text-lg font-bold break-all select-all">{createdId}</p>
        </div>

        <button
          onClick={handleCopyCode}
          className="h-12 px-6 bg-zinc-800 text-white font-bold rounded-xl flex items-center gap-2 mb-4 active:scale-95 transition-transform mx-auto"
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? 'Copied!' : 'Copy Code'}
        </button>

        <button
          onClick={handleFinishCreate}
          className="h-14 px-8 bg-amber-500 text-black font-bold rounded-2xl flex items-center gap-2 active:scale-95 transition-transform mx-auto"
        >
          Continue to App →
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-amber-500 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-amber-500/20">
        <Wallet className="text-white" size={32} />
      </div>
      <h1 className="text-2xl font-black text-white tracking-tight mb-1">Welcome, {userName}!</h1>
      <p className="text-zinc-400 font-medium mb-8 max-w-[280px]">
        Set up your shared finance household to get started.
      </p>

      {mode === 'choose' && (
        <div className="w-full max-w-[340px] space-y-3">
          <button
            onClick={() => { setMode('create'); setError(''); }}
            className="w-full h-16 bg-zinc-900 border border-zinc-800 text-white font-bold rounded-2xl flex items-center gap-4 px-5 active:scale-[0.98] transition-transform"
          >
            <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
              <Users className="text-amber-400" size={20} />
            </div>
            <div className="text-left">
              <p className="font-bold text-sm">Create Household</p>
              <p className="text-zinc-500 text-xs">Start a new shared space</p>
            </div>
          </button>

          <button
            onClick={() => { setMode('join'); setError(''); }}
            className="w-full h-16 bg-zinc-900 border border-zinc-800 text-white font-bold rounded-2xl flex items-center gap-4 px-5 active:scale-[0.98] transition-transform"
          >
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <UserPlus className="text-blue-400" size={20} />
            </div>
            <div className="text-left">
              <p className="font-bold text-sm">Join Household</p>
              <p className="text-zinc-500 text-xs">Enter a code from your partner</p>
            </div>
          </button>

          <button
            onClick={() => signOut(auth)}
            className="mt-4 text-zinc-500 text-sm font-medium flex items-center gap-1 mx-auto hover:text-zinc-300 transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div className="w-full max-w-[340px] space-y-3">
          <input
            type="text"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            placeholder="Household name (e.g. Our Finances)"
            className="w-full h-14 bg-zinc-900 border border-zinc-800 text-white font-medium rounded-2xl px-5 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full h-14 bg-amber-500 text-black font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Household'}
          </button>
          <button
            onClick={() => { setMode('choose'); setError(''); }}
            className="text-zinc-500 text-sm font-medium mx-auto block hover:text-zinc-300 transition-colors"
          >
            ← Back
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="w-full max-w-[340px] space-y-3">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Paste household code"
            className="w-full h-14 bg-zinc-900 border border-zinc-800 text-white font-medium rounded-2xl px-5 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full h-14 bg-blue-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? 'Joining...' : 'Join Household'}
          </button>
          <button
            onClick={() => { setMode('choose'); setError(''); }}
            className="text-zinc-500 text-sm font-medium mx-auto block hover:text-zinc-300 transition-colors"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

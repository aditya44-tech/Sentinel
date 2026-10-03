"use client";

import React, { useState } from 'react';
import {
  ShieldAlert,
  User,
  Lock,
  LogIn,
  Eye,
  EyeOff,
  GraduationCap,
  Layers,
} from 'lucide-react';

export type AuthUser =
  | { role: 'mentor'; name: string }
  | { role: 'student'; studentId: string; name: string };

interface LoginViewProps {
  students: { studentId: string; name: string }[];
  onLogin: (user: AuthUser) => void;
}


export const LoginView: React.FC<LoginViewProps> = ({ students, onLogin }) => {
  const [tab, setTab] = useState<'mentor' | 'student'>('mentor');
  const [mentorUser, setMentorUser] = useState('');
  const [mentorPass, setMentorPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');

  const handleMentorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'mentor', password: mentorPass }),
      });
      if (res.ok) {
        onLogin({ role: 'mentor', name: 'Mentor' });
      } else {
        setError('Invalid mentor credentials. Please try again.');
      }
    } catch {
      setError('An error occurred during login.');
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const sid = studentId.trim().toUpperCase();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'student', studentId: sid }),
      });
      if (res.ok) {
        const match = students.find((s) => s.studentId.toUpperCase() === sid);
        onLogin({ role: 'student', studentId: sid, name: match?.name || sid });
      } else {
        setError(
          students.length === 0
            ? 'No students are registered yet. A mentor must upload student data first.'
            : 'Student ID not found. Please check your ID and try again.'
        );
      }
    } catch {
      setError('An error occurred during login.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F1E8] flex flex-col items-center justify-center p-4">
      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-[#D62828] text-white flex items-center justify-center font-black text-2xl border-3 border-[#0D0D0D] shadow-[4px_4px_0px_#0D0D0D]">
            S
          </div>
          <div className="text-left">
            <div className="font-black text-2xl uppercase tracking-tight text-[#0D0D0D]">Sentinel</div>
            <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Predictive Engine</div>
          </div>
        </div>
        <p className="text-sm text-neutral-600 font-medium">Student Dropout Detection &amp; Targeted Intervention System</p>
      </div>

      {/* Login Card */}
      <div className="neo-card w-full max-w-md bg-white p-0 overflow-hidden">
        {/* Tab Toggle */}
        <div className="flex border-b-3 border-[#0D0D0D]">
          <button
            onClick={() => { setTab('mentor'); setError(''); }}
            className={`flex-1 py-3 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
              tab === 'mentor'
                ? 'bg-[#0D0D0D] text-white'
                : 'bg-white text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <Layers className="w-4 h-4" />
            Mentor
          </button>
          <button
            onClick={() => { setTab('student'); setError(''); }}
            className={`flex-1 py-3 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors border-l-2 border-[#0D0D0D] ${
              tab === 'student'
                ? 'bg-[#0D0D0D] text-white'
                : 'bg-white text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            Student
          </button>
        </div>

        <div className="p-6">
          {tab === 'mentor' ? (
            <form onSubmit={handleMentorLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-black uppercase tracking-wider text-[#0D0D0D] mb-1">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={mentorUser}
                    onChange={(e) => setMentorUser(e.target.value)}
                    placeholder="mentor"
                    className="neo-input w-full pl-10 pr-4 py-2.5 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-black uppercase tracking-wider text-[#0D0D0D] mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={mentorPass}
                    onChange={(e) => setMentorPass(e.target.value)}
                    placeholder="••••••••••••"
                    className="neo-input w-full pl-10 pr-10 py-2.5 text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="bg-red-50 border-2 border-red-600 text-red-700 text-sm font-bold px-3 py-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="neo-btn w-full py-3 bg-[#D62828] text-white font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Login as Mentor
              </button>
            </form>
          ) : (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-black uppercase tracking-wider text-[#0D0D0D] mb-1">
                  Student ID
                </label>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="e.g. STU001"
                    className="neo-input w-full pl-10 pr-4 py-2.5 text-sm font-mono uppercase"
                    required
                  />
                </div>
                <p className="text-xs text-neutral-500 font-medium mt-1">
                  Enter the student ID provided by your institution.
                </p>
              </div>
              {error && (
                <div className="bg-red-50 border-2 border-red-600 text-red-700 text-sm font-bold px-3 py-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="neo-btn w-full py-3 bg-[#0D0D0D] text-white font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Login as Student
              </button>
            </form>
          )}
        </div>

        <div className="px-6 pb-5 text-center text-xs text-neutral-400 font-medium border-t border-neutral-100 pt-4">
          Sentinel · Powered by Groq AI · Secure Access Only
        </div>
      </div>
    </div>
  );
};

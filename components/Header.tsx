"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { UserCheck, GraduationCap, LogOut } from 'lucide-react';
import { useSentinel } from '@/app/providers';

export function Header() {
  const { authUser, logout } = useSentinel();
  const pathname = usePathname();

  // Never show the app header on the landing page — it has its own navbar
  if (pathname === '/') return null;

  return (
    <header className="bg-[#0D0D0D] text-white border-b-4 border-[#0D0D0D] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Logo / Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D62828] text-white flex items-center justify-center font-black text-xl border-2 border-white shadow-[2px_2px_0px_#FFFFFF]">
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg md:text-xl tracking-tight uppercase">
                  Sentinel
                </span>
                <span className="px-1.5 py-0.2 bg-[#D62828] text-white font-mono font-bold text-[10px] tracking-wider uppercase border border-white">
                  Predictive Engine
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 font-medium hidden sm:block">
                Student Dropout Detection &amp; Targeted Intervention System
              </p>
            </div>
          </div>

          {/* Auth Info & Controls */}
          {authUser && (
            <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto">
              <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-600 px-3 py-1.5">
                {authUser.role === 'mentor' ? (
                  <UserCheck className="w-4 h-4 text-[#D62828]" />
                ) : (
                  <GraduationCap className="w-4 h-4 text-[#2563EB]" />
                )}
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  {authUser.role === 'student' ? `${authUser.name} (${authUser.studentId})` : authUser.name}
                </span>
              </div>

              <button
                onClick={logout}
                className="px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-transparent text-neutral-400 hover:text-white border-2 border-transparent hover:border-neutral-600 flex items-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

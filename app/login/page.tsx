"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSentinel } from '@/app/providers';
import { LoginView } from '@/views/LoginView';

export default function LoginPage() {
  const { authUser, students, login } = useSentinel();
  const router = useRouter();

  useEffect(() => {
    if (authUser) {
      if (authUser.role === 'mentor') {
        router.push('/dashboard');
      } else {
        router.push('/student');
      }
    }
  }, [authUser, router]);

  if (authUser) return null; // Avoid flashing login while redirecting

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
      <LoginView students={students.map(s => ({ studentId: s.studentId, name: s.name }))} onLogin={login} />
    </div>
  );
}

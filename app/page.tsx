import React from 'react';
import Link from 'next/link';
import { Marquee } from '@/components/Marquee';
import { FadeInSection } from '@/components/FadeInSection';
import { ArrowRight, Database, ShieldAlert, Cpu, FileSpreadsheet, Activity, MessageSquareText, ShieldCheck, User, RefreshCcw, Layers, MessageCircle, AlertTriangle, CheckSquare } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F5F1E8] text-[#0D0D0D] font-sans selection:bg-[#d4ff00] overflow-x-hidden">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-[#F5F1E8] border-b-[3px] border-[#0D0D0D]">
        <div className="max-w-[85rem] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-[#FF4D4D] border-[2.5px] border-[#0D0D0D] w-7 h-7 flex items-center justify-center font-black font-mono text-white text-sm shadow-[2px_2px_0px_#0D0D0D]">
              S
            </div>
            <span className="font-black font-mono text-xl uppercase tracking-tighter text-[#0D0D0D]">
              SENTINEL
            </span>
            <span className="hidden sm:inline-block border-[2px] border-[#0D0D0D] bg-[#d4ff00] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest font-mono ml-1">
              BETA
            </span>
          </div>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-6 font-mono font-bold text-[12px] uppercase tracking-widest">
            <a href="#how-it-works" className="hover:text-[#FF4D4D] transition-colors border-b-[2px] border-transparent hover:border-[#FF4D4D] pb-0.5">
              How It Works
            </a>
            <a href="#features" className="hover:text-[#FF4D4D] transition-colors border-b-[2px] border-transparent hover:border-[#FF4D4D] pb-0.5">
              Features
            </a>
            <a href="#why" className="hover:text-[#FF4D4D] transition-colors border-b-[2px] border-transparent hover:border-[#FF4D4D] pb-0.5">
              Why Sentinel
            </a>
          </div>

          {/* CTA */}
          <Link
            href="/login"
            className="bg-[#d4ff00] border-[2.5px] border-[#0D0D0D] font-black font-mono text-[12px] uppercase tracking-widest px-4 py-2 shadow-[3px_3px_0px_#0D0D0D] hover:shadow-[1px_1px_0px_#0D0D0D] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-1.5 shrink-0"
          >
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full border-b-[3px] border-[#0D0D0D] overflow-hidden bg-[#F5F1E8]">
        <div className="max-w-[85rem] mx-auto px-4 sm:px-6 py-8 md:py-12 flex flex-col lg:flex-row items-center relative">
          <FadeInSection className="w-full flex flex-col lg:flex-row items-center justify-between relative z-10 gap-8 lg:gap-8">
            
            {/* Left Column */}
            <div className="flex flex-col items-start w-full lg:w-[50%] pr-0 lg:pr-8">
              <div className="inline-flex bg-white border-[3px] border-[#0D0D0D] px-3 py-1.5 mb-4 shadow-[3px_3px_0px_#0D0D0D] font-mono font-bold text-[11px] uppercase items-center gap-2 tracking-widest">
                <div className="w-2.5 h-2.5 bg-[#FF4D4D] border-[1.5px] border-[#0D0D0D]"></div>
                EARLY WARNING & DROPOUT PREVENTION
              </div>
              
              <h1 className="text-7xl md:text-[5.5rem] lg:text-[7rem] font-black leading-[0.85] uppercase tracking-tighter mb-4 text-[#0D0D0D]">
                SENTINEL
              </h1>
              
              <p className="text-2xl md:text-3xl lg:text-[2rem] font-black mb-4 leading-[1.1] tracking-tight text-[#0D0D0D]">
                Identifying at-risk students before they drop out using deterministic scoring + AI-powered narratives.
              </p>
              
              <p className="text-base font-bold text-gray-800 mb-6 max-w-xl">
                A full-stack platform for college mentors to detect, understand, and intervene with students at risk of dropping out, and for students to see their own risk profile and active support.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-6 w-full sm:w-auto">
                <Link href="/login" className="bg-[#d4ff00] border-[3px] border-[#0D0D0D] font-bold text-base px-6 py-3 uppercase flex items-center justify-center gap-2 shadow-[6px_6px_0px_#0D0D0D] hover:shadow-[4px_4px_0px_#0D0D0D] active:translate-x-1 active:translate-y-1 active:shadow-[0px_0px_0px_#0D0D0D] transition-all">
                  GET STARTED <ArrowRight className="w-5 h-5" />
                </Link>
                <a href="#how-it-works" className="bg-white border-[3px] border-[#0D0D0D] font-bold text-base px-6 py-3 uppercase flex items-center justify-center shadow-[6px_6px_0px_#0D0D0D] hover:shadow-[4px_4px_0px_#0D0D0D] active:translate-x-1 active:translate-y-1 active:shadow-[0px_0px_0px_#0D0D0D] transition-all">
                  HOW IT WORKS
                </a>
              </div>
              
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] font-bold uppercase tracking-widest font-mono border-t-[3px] border-[#0D0D0D] pt-4 w-full">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4"/> 100% AUDITABLE SCORING
                </span>
                <span className="flex items-center gap-2">
                  <Cpu className="w-4 h-4"/> RULE-BASED AI FALLBACK
                </span>
                <span className="flex items-center gap-2">
                  <Database className="w-4 h-4"/> MONGODB DATABASE
                </span>
              </div>
            </div>

            {/* Right Column (Diagnostic Card) */}
            <div className="w-full lg:w-[50%] mt-4 lg:mt-0 flex justify-center lg:justify-end">
              <div className="bg-white border-[4px] border-[#0D0D0D] w-full max-w-[520px] shadow-[12px_12px_0px_#0D0D0D] flex flex-col transform lg:rotate-1 hover:rotate-0 transition-transform duration-300">
                {/* Card Header */}
                <div className="border-b-[4px] border-[#0D0D0D] px-4 py-3 flex justify-between items-center bg-white">
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 bg-[#FF4D4D] border-[2px] border-[#0D0D0D]"></div>
                      <div className="w-3 h-3 bg-[#FFCC00] border-[2px] border-[#0D0D0D]"></div>
                      <div className="w-3 h-3 bg-[#00CC66] border-[2px] border-[#0D0D0D]"></div>
                    </div>
                    <span className="font-mono text-[11px] font-black uppercase tracking-widest">DIAGNOSTIC_PREVIEW.LOG</span>
                  </div>
                  <div className="bg-[#d4ff00] px-2 py-1 border-[2px] border-[#0D0D0D] font-mono text-[10px] font-black uppercase tracking-widest leading-none">
                    LIVE ENGINE
                  </div>
                </div>
                
                {/* Card Body */}
                <div className="p-4 flex-1 bg-white">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 font-mono">STUDENT ID: CS-2024-042</div>
                      <h3 className="text-2xl font-black uppercase leading-[1] mb-1">AARAV SHARMA</h3>
                      <div className="text-xs font-bold text-gray-700 font-mono tracking-tight">Computer Science • Year 2</div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="bg-[#FF4D4D] text-white px-3 py-1 border-[3px] border-[#0D0D0D] font-bold text-xs uppercase inline-block mb-1.5 shadow-[2px_2px_0px_#0D0D0D]">
                        HIGH RISK
                      </div>
                      <div className="text-2xl font-black font-mono tracking-tighter">
                        80/100
                      </div>
                    </div>
                  </div>
                  
                  {/* Two boxes side by side */}
                  <div className="grid grid-cols-2 gap-3 mb-3">

                    {/* Breakdown Box */}
                    <div className="border-[3px] border-[#0D0D0D] p-3 bg-white">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3 font-mono">RISK FACTORS</div>
                      <div className="space-y-1.5 font-mono text-[11px] font-bold tracking-tight">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-1">
                          <span className="text-gray-700">Attendance:</span>
                          <span className="text-[#FF4D4D]">+30</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-gray-100 pb-1">
                          <span className="text-gray-700">Grades:</span>
                          <span className="text-[#FF4D4D]">+18</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-gray-100 pb-1">
                          <span className="text-gray-700">Backlogs:</span>
                          <span className="text-[#FF4D4D]">+17</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700">Fee Overdue:</span>
                          <span className="text-[#FF4D4D]">+15</span>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t-[2px] border-[#0D0D0D] flex justify-between">
                        <span className="font-mono text-[9px] uppercase text-gray-500">Academic Score</span>
                        <span className="font-mono font-black text-[#FF4D4D] text-xs">80/100</span>
                      </div>
                    </div>

                    {/* Consultancy Box */}
                    <div className="border-[3px] border-[#0D0D0D] p-3 bg-[#F5F1E8]">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3 font-mono">CONSULTANCY</div>
                      <div className="space-y-1.5 font-mono text-[11px] font-bold tracking-tight">
                        <div className="flex justify-between items-center border-b border-gray-200 pb-1">
                          <span className="text-gray-700">Reason:</span>
                          <span className="bg-[#FF4D4D] text-white px-1.5 py-0.5 text-[9px] uppercase border-[1.5px] border-[#0D0D0D]">FORCED</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-gray-200 pb-1">
                          <span className="text-gray-700">Motivation:</span>
                          <span className="bg-[#FF4D4D] text-white px-1.5 py-0.5 text-[9px] uppercase border-[1.5px] border-[#0D0D0D]">LOW 1/5</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-gray-200 pb-1">
                          <span className="text-gray-700">Stress:</span>
                          <span className="bg-[#FF4D4D] text-white px-1.5 py-0.5 text-[9px] uppercase border-[1.5px] border-[#0D0D0D]">HIGH 5/5</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700">Belonging:</span>
                          <span className="bg-[#FFCC00] text-[#0D0D0D] px-1.5 py-0.5 text-[9px] uppercase border-[1.5px] border-[#0D0D0D]">MED 2/5</span>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t-[2px] border-[#0D0D0D] flex justify-between">
                        <span className="font-mono text-[9px] uppercase text-gray-500">Psych Score</span>
                        <span className="font-mono font-black text-[#FF4D4D] text-xs">80/100</span>
                      </div>
                    </div>

                  </div>

                  {/* Groq AI Box */}
                  <div className="bg-[#0D0D0D] p-5 md:p-6 border-[3px] border-[#0D0D0D]">
                    <div className="flex items-center gap-2 text-[#d4ff00] text-[10px] font-bold uppercase tracking-widest mb-3 font-mono">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                      GROQ AI DIAGNOSTIC NARRATIVE
                    </div>
                    <p className="text-[#d4ff00] font-mono text-[13px] leading-relaxed">
                      "Critical drop risk: Sudden attendance dip in Week 3 compounded by 3 active subject backlogs and 45-day overdue tuition. Recommend immediate tutoring assignment and parent conference."
                    </p>
                  </div>
                </div>
                
                {/* Card Footer */}
                <div className="p-4 md:p-5 border-t-[4px] border-[#0D0D0D] bg-white">
                  <button className="w-full bg-white py-3 border-[3px] border-[#0D0D0D] font-black uppercase text-sm flex justify-center items-center gap-2 hover:bg-gray-50 transition-colors shadow-[2px_2px_0px_#0D0D0D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_#0D0D0D]">
                    ASSIGN INTERVENTION PLAN <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
          </FadeInSection>
        </div>
      </section>

      {/* Marquee Component */}
      <Marquee />

      {/* How It Works Section */}
      <section className="bg-white border-b-[3px] border-[#0D0D0D] py-24" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6">
          <FadeInSection>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-16 inline-block border-b-[4px] border-[#0D0D0D] pb-2">
              How It Works
            </h2>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Upload Data",
                desc: "Mentor uploads CSV data: attendance (overall + subject-wise), grades, backlogs, fees.",
                icon: <FileSpreadsheet className="w-10 h-10" />,
                color: "bg-[#FF90E8]"
              },
              {
                step: "02",
                title: "Risk Scoring",
                desc: "Deterministic engine scores each student 0-100 across five weighted factors: Attendance (30), Grades (25), Backlogs (20), Fees (15), Engagement (10) â†’ Risk Level: Low (0-30) / Medium (31-60) / High (61-100).",
                icon: <Activity className="w-10 h-10" />,
                color: "bg-[#00E5FF]"
              },
              {
                step: "03",
                title: "AI Narratives",
                desc: "Groq AI translates the score into a plain-language explanation for the mentor. Falls back to deterministic text automatically if the AI is unavailable, so the UI never breaks.",
                icon: <MessageSquareText className="w-10 h-10" />,
                color: "bg-[#d4ff00]"
              },
              {
                step: "04",
                title: "Assign Intervention",
                desc: "Mentor reviews the student and assigns an intervention: Extra Class/Tutoring, Counseling/Check-in, Financial Aid Referral, or Academic Support.",
                icon: <ShieldCheck className="w-10 h-10" />,
                color: "bg-[#FF4D4D]"
              },
              {
                step: "05",
                title: "Student Portal",
                desc: "Student logs in and sees their own risk profile and active intervention details (schedule, instructor, subject).",
                icon: <User className="w-10 h-10" />,
                color: "bg-[#4ADE80]"
              },
              {
                step: "06",
                title: "Outcome Tracking",
                desc: "Next upload cycle recalculates scores and compares against baseline. Outcome shown as Improving / Worsening / No Change.",
                icon: <RefreshCcw className="w-10 h-10" />,
                color: "bg-[#FBBF24]"
              }
            ].map((item, i) => (
              <FadeInSection key={i} delay={i * 100} className="flex h-full">
                <div className="neo-card flex flex-col h-full relative group hover:-translate-y-2 hover:shadow-[8px_8px_0px_#0D0D0D] transition-all duration-200">
                  <div className={`absolute top-0 right-0 border-l-[3px] border-b-[3px] border-[#0D0D0D] font-mono font-black text-2xl p-2 ${item.color}`}>
                    {item.step}
                  </div>
                  <div className="p-6 pt-10 flex-grow flex flex-col">
                    <div className="mb-4 p-3 bg-[#F5F1E8] border-[3px] border-[#0D0D0D] inline-block shadow-[2px_2px_0px_#0D0D0D]">
                      {item.icon}
                    </div>
                    <h3 className="text-2xl font-black uppercase mb-3 leading-tight">{item.title}</h3>
                    <p className="font-medium text-gray-800 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section id="features" className="bg-[#F5F1E8] border-b-[3px] border-[#0D0D0D] py-24">
        <div className="max-w-7xl mx-auto px-6">
          <FadeInSection>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-16 inline-block border-b-[4px] border-[#0D0D0D] pb-2">
              Key Features
            </h2>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "Subject-Wise Tracking",
                desc: "Attendance tracking alongside overall attendance.",
                icon: <Layers className="w-8 h-8" />
              },
              {
                title: "Upload Revert",
                desc: "Snapshot-based revert restores prior state and recalculates scores instantly.",
                icon: <RefreshCcw className="w-8 h-8" />
              },
              {
                title: "Initial Consultancy",
                desc: "5-question framework to find root causes (e.g., financial stress, forced admission).",
                icon: <MessageCircle className="w-8 h-8" />
              },
              {
                title: "Escalation Ladder",
                desc: "Automated timeline that escalates unresponsive cases up the chain.",
                icon: <AlertTriangle className="w-8 h-8" />
              },
              {
                title: "SMS Integration",
                desc: "Rate-limited, banned-word-filtered dispatch to securely contact students.",
                icon: <MessageSquareText className="w-8 h-8" />
              },
              {
                title: "Input Validation",
                desc: "Filters dirty CSV data (e.g. >100% attendance) so it never inflates risk scores.",
                icon: <CheckSquare className="w-8 h-8" />
              },
              {
                title: "MongoDB Persistence",
                desc: "Stores student data, interventions, and historical outcomes securely.",
                icon: <Database className="w-8 h-8" />
              },
              {
                title: "Intervention Management",
                desc: "Complete assignment workflows with full audit trails.",
                icon: <ShieldCheck className="w-8 h-8" />
              }
            ].map((feat, i) => (
              <FadeInSection key={i} delay={i * 50} className="h-full">
                <div className="bg-white border-[3px] border-[#0D0D0D] p-6 h-full shadow-[4px_4px_0px_#0D0D0D] hover:shadow-[2px_2px_0px_#0D0D0D] hover:translate-x-1 hover:translate-y-1 transition-all">
                  <div className="text-[#0D0D0D] mb-4">{feat.icon}</div>
                  <h3 className="text-xl font-black uppercase mb-2 leading-tight">{feat.title}</h3>
                  <p className="text-gray-700 font-medium text-sm">{feat.desc}</p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* Why This Approach Section */}
      <section id="why" className="bg-[#0D0D0D] text-white py-24 border-b-[3px] border-[#0D0D0D]">
        <div className="max-w-7xl mx-auto px-6">
          <FadeInSection>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-16 text-[#d4ff00]">
              Why This Approach
            </h2>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FadeInSection delay={100}>
              <div className="bg-[#1A1A1A] border-[3px] border-white p-8 shadow-[6px_6px_0px_#d4ff00] hover:translate-x-1 hover:-translate-y-1 transition-transform h-full">
                <ShieldAlert className="w-12 h-12 text-[#d4ff00] mb-6" />
                <h3 className="text-2xl font-black uppercase mb-4">Auditable Scoring</h3>
                <p className="text-gray-300 font-medium leading-relaxed">
                  Deterministic scoring means every score is explainable and auditable, not a black box. Also works offline with no training data needed.
                </p>
              </div>
            </FadeInSection>

            <FadeInSection delay={200}>
              <div className="bg-[#1A1A1A] border-[3px] border-white p-8 shadow-[6px_6px_0px_#00E5FF] hover:translate-x-1 hover:-translate-y-1 transition-transform h-full">
                <CheckSquare className="w-12 h-12 text-[#00E5FF] mb-6" />
                <h3 className="text-2xl font-black uppercase mb-4">41 Automated Tests</h3>
                <p className="text-gray-300 font-medium leading-relaxed">
                  41 passing automated tests covering the entire risk engine and intervention lifecycle, guaranteeing stability and correct computations.
                </p>
              </div>
            </FadeInSection>

            <FadeInSection delay={300}>
              <div className="bg-[#1A1A1A] border-[3px] border-white p-8 shadow-[6px_6px_0px_#FF90E8] hover:translate-x-1 hover:-translate-y-1 transition-transform h-full">
                <Cpu className="w-12 h-12 text-[#FF90E8] mb-6" />
                <h3 className="text-2xl font-black uppercase mb-4">Graceful Fallback</h3>
                <p className="text-gray-300 font-medium leading-relaxed">
                  Dual-risk explanation: AI narrative when available, deterministic fallback when not. The UI never breaks even if services fail.
                </p>
              </div>
            </FadeInSection>
          </div>
        </div>
      </section>

      {/* Tech Strip */}
      <div className="bg-[#d4ff00] border-b-[3px] border-[#0D0D0D] py-6 w-full overflow-hidden relative">
         <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-center gap-6 md:gap-16 items-center w-full">
            <span className="font-mono font-black uppercase tracking-widest text-sm text-[#0D0D0D]">Next.js 15 (Turbopack)</span>
            <span className="font-mono font-black uppercase tracking-widest text-sm text-[#0D0D0D]">TypeScript</span>
            <span className="font-mono font-black uppercase tracking-widest text-sm text-[#0D0D0D]">Groq API</span>
            <span className="font-mono font-black uppercase tracking-widest text-sm text-[#0D0D0D]">MongoDB</span>
            <span className="font-mono font-black uppercase tracking-widest text-sm text-[#0D0D0D]">Tailwind CSS</span>
         </div>
      </div>

      {/* Footer */}
      <footer className="bg-white py-12 border-t-[3px] border-[#0D0D0D]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-mono font-black text-2xl uppercase">Sentinel</div>
          <p className="font-bold text-sm border-l-[3px] border-[#d4ff00] pl-4 text-gray-800">
            Because every student deserves a chance to succeed.
          </p>
          <Link href="/login" className="font-bold uppercase tracking-wider underline decoration-[3px] underline-offset-4 hover:text-[#FF4D4D] transition-colors">
            Mentor Portal
          </Link>
        </div>
      </footer>
    </div>
  );
}

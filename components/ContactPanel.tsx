'use client';

import React, { useState } from 'react';
import type { ContactRecord, ContactLogEntry } from '@/lib/counseling';
import { Phone, Mail, MessageSquare, Plus, Clock } from 'lucide-react';

interface ContactPanelProps {
  contact: ContactRecord;
  contactLog?: ContactLogEntry[];
  onAddContactLog?: (entry: ContactLogEntry) => void;
}

const CHANNELS: ContactLogEntry['channel'][] = [
  'Phone', 'WhatsApp', 'Email', 'In-person', 'Other',
];
const PERSONS: ContactLogEntry['personContacted'][] = [
  'Student', 'Parent', 'Coordinator', 'HOD', 'Welfare Cell', 'Other',
];

function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

export const ContactPanel: React.FC<ContactPanelProps> = ({
  contact,
  contactLog = [],
  onAddContactLog,
}) => {
  const [showLogForm, setShowLogForm] = useState(false);
  const [logEntry, setLogEntry] = useState<Partial<ContactLogEntry>>({
    date: new Date().toISOString().split('T')[0],
    channel: 'Phone',
    personContacted: 'Student',
    outcome: '',
    note: '',
  });

  const handleSubmitLog = () => {
    if (!logEntry.date || !logEntry.outcome) return;
    onAddContactLog?.({
      date: logEntry.date!,
      channel: logEntry.channel as ContactLogEntry['channel'],
      personContacted: logEntry.personContacted as ContactLogEntry['personContacted'],
      outcome: logEntry.outcome!,
      note: logEntry.note ?? '',
    });
    setShowLogForm(false);
    setLogEntry({
      date: new Date().toISOString().split('T')[0],
      channel: 'Phone',
      personContacted: 'Student',
      outcome: '',
      note: '',
    });
  };

  return (
    <div className="space-y-4">
      {/* Student contact */}
      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-neutral-600 mb-2">
          Student Contact
        </h4>
        <div className="p-4 border-2 border-[#0D0D0D] bg-white space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-black text-sm text-[#0D0D0D]">{contact.name}</p>
              <p className="text-xs font-mono text-neutral-500">{contact.studentId}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {contact.studentPhone && (
              <>
                <a
                  href={`tel:${contact.studentPhone}`}
                  className="neo-btn px-3 py-1.5 bg-[#4ADE80] text-[#0D0D0D] text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                  title="Call student — opens your phone app"
                >
                  <Phone className="w-3 h-3" /> Call
                </a>
                <a
                  href={whatsappHref(contact.studentPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neo-btn px-3 py-1.5 bg-[#25D366] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                  title="WhatsApp — opens your WhatsApp"
                >
                  <MessageSquare className="w-3 h-3" /> WhatsApp
                </a>
                <span className="text-xs font-mono text-neutral-600 self-center">{contact.studentPhone}</span>
              </>
            )}
            {contact.studentEmail && (
              <>
                <a
                  href={`mailto:${contact.studentEmail}`}
                  className="neo-btn px-3 py-1.5 bg-[#2563EB] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                  title="Email student — opens your email app"
                >
                  <Mail className="w-3 h-3" /> Email
                </a>
                <span className="text-xs font-mono text-neutral-600 self-center">{contact.studentEmail}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Parent contact */}
      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-neutral-600 mb-2">
          Parent / Guardian Contact
        </h4>
        <div className="p-4 border-2 border-[#0D0D0D] bg-[#FFFDEB] space-y-3">
          <p className="font-black text-sm text-[#0D0D0D]">{contact.parentName || '—'}</p>
          <div className="flex flex-wrap gap-2">
            {contact.parentPhone && (
              <>
                <a
                  href={`tel:${contact.parentPhone}`}
                  className="neo-btn px-3 py-1.5 bg-[#4ADE80] text-[#0D0D0D] text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Phone className="w-3 h-3" /> Call Parent
                </a>
                <a
                  href={whatsappHref(contact.parentPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neo-btn px-3 py-1.5 bg-[#25D366] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3 h-3" /> WhatsApp Parent
                </a>
                <span className="text-xs font-mono text-neutral-600 self-center">{contact.parentPhone}</span>
              </>
            )}
            {contact.parentEmail && (
              <>
                <a
                  href={`mailto:${contact.parentEmail}`}
                  className="neo-btn px-3 py-1.5 bg-[#2563EB] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Mail className="w-3 h-3" /> Email Parent
                </a>
                <span className="text-xs font-mono text-neutral-600 self-center">{contact.parentEmail}</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-neutral-500 font-medium border-t border-neutral-200 pt-2 mt-2">
            ⚠ Parent contact should follow your college&apos;s communication policy. Sentinel opens your own apps — it does not send notifications automatically.
          </p>
        </div>
      </div>

      {/* Contact log */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Contact Log
          </h4>
          {onAddContactLog && (
            <button
              onClick={() => setShowLogForm((v) => !v)}
              className="neo-btn px-2.5 py-1 bg-[#0D0D0D] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Log Contact
            </button>
          )}
        </div>

        {/* Log form */}
        {showLogForm && (
          <div className="p-4 border-2 border-[#0D0D0D] bg-[#F5F1E8] space-y-3 mb-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={logEntry.date ?? ''}
                  onChange={(e) => setLogEntry((p) => ({ ...p, date: e.target.value }))}
                  className="w-full border-2 border-[#0D0D0D] px-2 py-1.5 text-sm font-mono bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
                  Channel
                </label>
                <select
                  value={logEntry.channel ?? 'Phone'}
                  onChange={(e) => setLogEntry((p) => ({ ...p, channel: e.target.value as any }))}
                  className="w-full border-2 border-[#0D0D0D] px-2 py-1.5 text-sm bg-white font-bold"
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
                  Person Contacted
                </label>
                <select
                  value={logEntry.personContacted ?? 'Student'}
                  onChange={(e) => setLogEntry((p) => ({ ...p, personContacted: e.target.value as any }))}
                  className="w-full border-2 border-[#0D0D0D] px-2 py-1.5 text-sm bg-white font-bold"
                >
                  {PERSONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
                  Outcome
                </label>
                <input
                  type="text"
                  placeholder="e.g. No answer, Callback requested..."
                  value={logEntry.outcome ?? ''}
                  onChange={(e) => setLogEntry((p) => ({ ...p, outcome: e.target.value }))}
                  className="w-full border-2 border-[#0D0D0D] px-2 py-1.5 text-sm bg-white"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
                Note
              </label>
              <textarea
                rows={2}
                placeholder="Optional additional note..."
                value={logEntry.note ?? ''}
                onChange={(e) => setLogEntry((p) => ({ ...p, note: e.target.value }))}
                className="w-full border-2 border-[#0D0D0D] px-2 py-1.5 text-sm bg-white resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSubmitLog}
                className="neo-btn px-4 py-2 bg-[#0D0D0D] text-white text-xs font-black uppercase tracking-wider"
              >
                Save
              </button>
              <button
                onClick={() => setShowLogForm(false)}
                className="neo-btn px-4 py-2 bg-white text-[#0D0D0D] text-xs font-bold border border-[#0D0D0D]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Log entries */}
        {contactLog.length === 0 ? (
          <div className="p-3 border border-neutral-200 bg-neutral-50 text-xs text-neutral-500 font-medium text-center">
            No contact log entries yet.
          </div>
        ) : (
          <div className="space-y-2">
            {contactLog.map((entry, i) => (
              <div key={i} className="p-3 border-2 border-[#0D0D0D] bg-white">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-mono font-bold text-neutral-600">{entry.date}</span>
                  <span className="px-1.5 py-0.5 bg-[#0D0D0D] text-white text-[10px] font-black uppercase">
                    {entry.channel}
                  </span>
                  <span className="px-1.5 py-0.5 bg-neutral-100 text-[#0D0D0D] text-[10px] font-black uppercase border border-[#0D0D0D]">
                    {entry.personContacted}
                  </span>
                </div>
                <p className="text-sm font-bold text-[#0D0D0D]">{entry.outcome}</p>
                {entry.note && <p className="text-xs text-neutral-600 mt-0.5">{entry.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

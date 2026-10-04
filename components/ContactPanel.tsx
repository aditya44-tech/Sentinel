'use client';

import React, { useState, useEffect } from 'react';
import type { ContactRecord, ContactLogEntry } from '@/lib/counseling';
import { Phone, Mail, MessageSquare, Plus, Clock, Send } from 'lucide-react';

interface ContactPanelProps {
  contact: ContactRecord;
  contactLog?: ContactLogEntry[];
  onAddContactLog?: (entry: ContactLogEntry) => void;
}

const CHANNELS: ContactLogEntry['channel'][] = [
  'Phone', 'WhatsApp', 'Email', 'In-person', 'Other', 'SMS',
];
const PERSONS: ContactLogEntry['personContacted'][] = [
  'Student', 'Parent', 'Coordinator', 'HOD', 'Welfare Cell', 'Other',
];

function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

const TEMPLATES = {
  first: 'Hi {name}, this is {mentor} from the CS department. You\'re not in any trouble. I\'d just like to hear how college is going and see if I can help with anything. Reply "OK" or open Sentinel to choose a time that suits you.',
  reminder: 'Hi {name}, {mentor} here again. No pressure at all. If this week is busy, just tap "I need a different time" in Sentinel and I\'ll work around you. I\'m here to help, not to judge.',
  last: 'Hi {name}, I haven\'t heard back and I wanted you to know the door is still open. You can reach me at {mentorPhone}, or the student welfare cell at {welfarePhone} if you\'d rather talk to someone else. Whenever you\'re ready.',
  parent: 'Hello, this is {mentor} from the CS department. I would like to speak with you briefly about {studentName}\'s college experience. Please call me at {mentorPhone} when convenient.',
};

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

  // SMS State
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [smsRecipientType, setSmsRecipientType] = useState<'student'|'parent'>('student');
  const [smsTemplate, setSmsTemplate] = useState<keyof typeof TEMPLATES>('first');
  const [smsMessage, setSmsMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [smsError, setSmsError] = useState('');

  const BANNED_WORDS = [/risk/i, /dropout/i, /failing/i, /high/i];
  const hasBannedWords = BANNED_WORDS.some(regex => regex.test(smsMessage));

  useEffect(() => {
    let msg = TEMPLATES[smsTemplate]
      .replace(/\{name\}/g, contact.name.split(' ')[0])
      .replace(/\{studentName\}/g, contact.name)
      .replace(/\{mentor\}/g, 'Your Mentor')
      .replace(/\{mentorPhone\}/g, '+919999999999')
      .replace(/\{welfarePhone\}/g, '+918888888888');
    setSmsMessage(msg);
  }, [smsTemplate, contact.name]);

  const handleOpenSms = (type: 'student'|'parent') => {
    setSmsRecipientType(type);
    setSmsTemplate(type === 'parent' ? 'parent' : 'first');
    setSmsDialogOpen(true);
    setSmsError('');
  };

  const handleSendSms = async (force = false) => {
    if (hasBannedWords) {
      setSmsError('Remove banned words (risk, dropout, failing, high) before sending.');
      return;
    }
    const phone = smsRecipientType === 'student' ? contact.studentPhone : contact.parentPhone;
    if (!phone) {
      setSmsError('No phone number available.');
      return;
    }

    setIsSending(true);
    setSmsError('');
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: contact.studentId,
          recipient: phone,
          message: smsMessage,
          templateId: smsTemplate,
          force
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'RATE_LIMIT' && !force) {
          throw new Error('RATE_LIMIT');
        }
        throw new Error(data.error || 'Failed to send SMS');
      }
      
      setSmsDialogOpen(false);
      // Let the parent component refresh the log via a page refresh or state update
      // Optionally simulate the log locally:
      if (onAddContactLog) {
        onAddContactLog({
          date: new Date().toISOString().split('T')[0],
          channel: 'SMS',
          personContacted: smsRecipientType === 'student' ? 'Student' : 'Parent',
          outcome: data.status === 'demo' ? 'SMS sent (demo)' : 'SMS sent',
          note: `Template: ${smsTemplate}. Message: "${smsMessage}"`,
          loggedBy: 'Mentor',
        });
      }
    } catch (e: any) {
      if (e.message === 'RATE_LIMIT') {
        setSmsError('Rate limit exceeded (1 SMS/day). Use "Send Now (Override)" to force.');
      } else {
        setSmsError(e.message);
      }
    } finally {
      setIsSending(false);
    }
  };

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
    <div className="space-y-4 relative">
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
                <button
                  onClick={() => handleOpenSms('student')}
                  className="neo-btn px-3 py-1.5 bg-[#0D0D0D] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" /> Send SMS
                </button>
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
                <button
                  onClick={() => handleOpenSms('parent')}
                  className="neo-btn px-3 py-1.5 bg-[#0D0D0D] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" /> Send SMS
                </button>
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

      {/* SMS Dialog Overlay */}
      {smsDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white border-4 border-[#0D0D0D] shadow-[8px_8px_0px_#0D0D0D] p-5 w-full max-w-lg space-y-4">
            <h3 className="font-black text-lg uppercase tracking-wider">
              Send SMS ({smsRecipientType})
            </h3>
            
            {smsRecipientType === 'student' && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
                  Template
                </label>
                <select
                  value={smsTemplate}
                  onChange={(e) => setSmsTemplate(e.target.value as any)}
                  className="w-full border-2 border-[#0D0D0D] px-2 py-1.5 text-sm bg-white font-bold"
                >
                  <option value="first">First Contact</option>
                  <option value="reminder">Reminder</option>
                  <option value="last">Last Attempt</option>
                </select>
              </div>
            )}
            
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
                Message Preview
              </label>
              <textarea
                rows={5}
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                className="w-full border-2 border-[#0D0D0D] px-2 py-1.5 text-sm bg-white resize-none"
              />
              {hasBannedWords && (
                <p className="text-xs font-bold text-[#D62828] mt-1">
                  ⚠ Warning: Avoid alarming terms (risk, dropout, failing, high).
                </p>
              )}
            </div>

            {smsRecipientType === 'parent' && (
              <p className="text-xs font-black text-[#D62828] bg-[#FDECEA] border-2 border-[#D62828] p-2">
                Send as per college policy?
              </p>
            )}

            {smsError && (
              <div className="text-xs font-bold text-white bg-[#D62828] p-2 border-2 border-[#0D0D0D]">
                {smsError}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-neutral-200">
              <button
                onClick={() => handleSendSms(false)}
                disabled={isSending || hasBannedWords}
                className="neo-btn flex-1 py-2 bg-[#0D0D0D] text-white text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                {isSending ? 'Sending...' : 'Send SMS'}
              </button>
              {smsError.includes('Rate limit') && (
                <button
                  onClick={() => handleSendSms(true)}
                  disabled={isSending || hasBannedWords}
                  className="neo-btn flex-1 py-2 bg-[#D62828] text-white text-xs font-black uppercase tracking-wider disabled:opacity-50"
                >
                  Send Now (Override)
                </button>
              )}
              <button
                onClick={() => setSmsDialogOpen(false)}
                disabled={isSending}
                className="neo-btn flex-1 py-2 bg-white text-[#0D0D0D] text-xs font-bold border-2 border-[#0D0D0D]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

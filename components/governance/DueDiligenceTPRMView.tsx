import React, { useState, useRef, useCallback, ChangeEvent, KeyboardEvent } from 'react';
import * as XLSX from 'xlsx';

import * as SupabaseService from '../../services/supabase';
import { QuestionnaireResult, DueDiligenceAnswer } from '../../types';
import { UploadIcon, DownloadIcon, ArrowPathIcon, BotIcon, MessageSquareIcon, ExclamationTriangleIcon } from '../Icons';

// The four canonical answer fields and their default (appended) column labels.
const ANSWER_FIELDS = ['answer', 'comments', 'evidence', 'rationale'] as const;
type AnswerField = typeof ANSWER_FIELDS[number];
const FIELD_LABELS: Record<AnswerField, string> = {
  answer: 'Answer',
  comments: 'Comments',
  evidence: 'Evidence & Reference',
  rationale: 'Rationale',
};

interface ParsedFile {
  headers: string[];
  rows: Record<string, any>[];
}

type Mode = 'questionnaire' | 'chat';
type Phase = 'upload' | 'answering' | 'preview';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

// ─── Spreadsheet parsing ─────────────────────────────────────────────────────
function parseSpreadsheet(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        // First row that has any non-empty cell is the header row.
        const headerIdx = aoa.findIndex((r) => r.some((c: any) => String(c ?? '').trim()));
        if (headerIdx < 0) return reject(new Error('The sheet appears to be empty.'));

        const seen = new Map<string, number>();
        const headers: string[] = (aoa[headerIdx] || []).map((h: any, i: number) => {
          let name = String(h ?? '').trim() || `Column ${i + 1}`;
          if (seen.has(name)) {
            const n = (seen.get(name) || 0) + 1;
            seen.set(name, n);
            name = `${name} (${n})`;
          } else {
            seen.set(name, 0);
          }
          return name;
        });

        const rows: Record<string, any>[] = aoa
          .slice(headerIdx + 1)
          .filter((r) => r.some((c: any) => String(c ?? '').trim()))
          .map((r) => {
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
            return obj;
          });

        if (rows.length === 0) return reject(new Error('No data rows found below the header.'));
        resolve({ headers, rows });
      } catch (err: any) {
        reject(new Error(err?.message || 'Failed to parse the spreadsheet.'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ─── Questionnaire tool ──────────────────────────────────────────────────────
const QuestionnaireTool: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('upload');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [result, setResult] = useState<QuestionnaireResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase('upload');
    setFileName('');
    setParsed(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    try {
      const p = await parseSpreadsheet(file);
      setParsed(p);
    } catch (err: any) {
      setParsed(null);
      setError(err.message);
    }
  };

  const proceed = async () => {
    if (!parsed) return;
    setPhase('answering');
    setError(null);
    try {
      const res = await SupabaseService.answerQuestionnaire(parsed.headers, parsed.rows, null);
      setResult(res);
      setPhase('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to answer the questionnaire.');
      setPhase('upload');
    }
  };

  // Output column layout: original headers, plus appended columns for any answer
  // field that has no existing column to reuse.
  const buildLayout = (res: QuestionnaireResult, headers: string[]) => {
    const appended = ANSWER_FIELDS.filter((f) => !res.column_map[f]);
    const outputHeaders = [...headers, ...appended.map((f) => FIELD_LABELS[f])];
    const answerHeaders = new Set<string>([
      ...ANSWER_FIELDS.map((f) => res.column_map[f]).filter(Boolean) as string[],
      ...appended.map((f) => FIELD_LABELS[f]),
    ]);
    return { outputHeaders, answerHeaders };
  };

  const filledRow = (
    res: QuestionnaireResult,
    origRow: Record<string, any>,
    rowIndex: number,
    byIndex: Map<number, DueDiligenceAnswer>,
  ): Record<string, any> => {
    const ans = byIndex.get(rowIndex);
    const out = { ...origRow };
    for (const f of ANSWER_FIELDS) {
      const val = ans ? (ans[f] || '') : '';
      const mapped = res.column_map[f];
      out[mapped || FIELD_LABELS[f]] = val;
    }
    return out;
  };

  const download = () => {
    if (!result || !parsed) return;
    const byIndex = new Map(result.answers.map((a) => [a.row_index, a]));
    const { outputHeaders } = buildLayout(result, parsed.headers);
    const outRows = parsed.rows.map((r, i) => filledRow(result, r, i, byIndex));
    const ws = XLSX.utils.json_to_sheet(outRows, { header: outputHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Answered');
    const stamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `due-diligence-answered-${stamp}.xlsx`);
  };

  // ── Render ──
  if (phase === 'answering') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BotIcon className="w-10 h-10 text-blue-500 animate-pulse" />
        <p className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-200">
          Answering questions from your control registry…
        </p>
        <p className="mt-1 text-xs text-gray-500">This can take a moment for large questionnaires.</p>
      </div>
    );
  }

  if (phase === 'preview' && result && parsed) {
    const byIndex = new Map(result.answers.map((a) => [a.row_index, a]));
    const { outputHeaders, answerHeaders } = buildLayout(result, parsed.headers);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Answered <span className="font-semibold">{result.questions_answered}</span> question
            {result.questions_answered === 1 ? '' : 's'} · question column:{' '}
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{result.question_column}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <ArrowPathIcon className="w-4 h-4" /> Start over
            </button>
            <button
              onClick={download}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              <DownloadIcon className="w-4 h-4" /> Download Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-500 w-10">#</th>
                {outputHeaders.map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-2 text-left font-semibold whitespace-nowrap ${
                      answerHeaders.has(h) ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {parsed.rows.map((r, i) => {
                const row = filledRow(result, r, i, byIndex);
                return (
                  <tr key={i} className="align-top">
                    <td className="px-2 py-2 text-gray-400">{i + 1}</td>
                    {outputHeaders.map((h) => (
                      <td
                        key={h}
                        className={`px-3 py-2 max-w-xs ${
                          answerHeaders.has(h)
                            ? 'bg-blue-50/50 dark:bg-blue-900/10 text-gray-800 dark:text-gray-100'
                            : 'text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // upload phase
  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
        Upload a security due-diligence questionnaire (.xlsx or .csv). We'll answer each question
        from your control registry — Yes/No with comments, evidence references and rationale — then
        let you preview and download the filled sheet. Nothing is stored.
      </p>

      <div
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors"
      >
        <UploadIcon className="w-8 h-8 mx-auto text-gray-400" />
        <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          {fileName || 'Click to choose a questionnaire file'}
        </p>
        <p className="text-xs text-gray-500 mt-1">.xlsx, .xls or .csv</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}

      {parsed && !error && (
        <div className="mt-4 flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800 rounded-md px-4 py-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            Detected <span className="font-semibold">{parsed.rows.length}</span> rows ·{' '}
            <span className="font-semibold">{parsed.headers.length}</span> columns
          </span>
          <button
            onClick={proceed}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Proceed →
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Chat tool ───────────────────────────────────────────────────────────────
const ChatTool: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await SupabaseService.askDueDiligence(q, history);
      setMessages((prev) => [...prev, { role: 'assistant', text: res.answer, sources: res.sources }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `⚠️ ${err.message || 'Failed to get an answer.'}` }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="max-w-3xl flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: 360 }}>
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-6">
            Ask a security question about this organisation and get a short, grounded answer.
            <ul className="mt-3 space-y-1.5">
              {[
                'Do we maintain an asset inventory with an owner for each asset?',
                'Is data encrypted in transit and at rest?',
                'Do we have an incident response capability?',
              ].map((ex) => (
                <li key={ex}>
                  <button
                    onClick={() => setInput(ex)}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                  >
                    “{ex}”
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.sources.map((s, j) => (
                    <span
                      key={j}
                      className="text-[10px] bg-white/70 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-sm">
              <BotIcon className="w-4 h-4 inline animate-pulse mr-1" /> Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a security question…"
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
};

// ─── Container ───────────────────────────────────────────────────────────────
interface Props {
  isActive?: boolean;
}

export const DueDiligenceTPRMView: React.FC<Props> = () => {
  const [mode, setMode] = useState<Mode>('questionnaire');

  const tabs: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: 'questionnaire', label: 'Questionnaire', icon: <UploadIcon className="w-4 h-4" /> },
    { id: 'chat', label: 'Ask', icon: <MessageSquareIcon className="w-4 h-4" /> },
  ];

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Due Diligence &amp; TPRM</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Auto-answer third-party security questionnaires and ask quick questions about your posture.
        </p>
      </div>

      <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              mode === t.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {mode === 'questionnaire' ? <QuestionnaireTool /> : <ChatTool />}
    </div>
  );
};

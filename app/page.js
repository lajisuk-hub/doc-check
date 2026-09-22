'use client';

// 서류 점검기
//  1. 심사표 넣기  → AI가 항목·배점을 뽑아 표로 보여 주고, 손으로 고칠 수 있다
//  2. 문서 넣기    → PDF(쪽 번호 표시)·한글(hwpx)·붙여넣기
//  3. 심사표에 맞게 분석 → 항목마다 예상 점수·근거·보완, 합계, 지금 바로 고칠 것
// 저장은 브라우저(localStorage)에 최근 것 하나만. 로그인 없음.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fileToText, looksScanned } from '@/lib/pdfText';
import { GRADE_STYLE, gradeOf } from '@/lib/parse';

const KEY = 'doc-check-v1';
const KAKAO_URL = 'https://open.kakao.com/o/s0rTIOEi';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function save(part) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...part, savedAt: new Date().toISOString() }));
  } catch {
    /* 저장 공간이 없어도 화면은 계속 동작한다 */
  }
}

function Badge({ grade }) {
  const s = GRADE_STYLE[grade] || GRADE_STYLE['보통'];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        color: s.color,
        background: s.bg,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

function Bar({ score, points }) {
  const r = points ? Math.max(0, Math.min(1, score / points)) : 0;
  const g = gradeOf(score, points);
  return (
    <div style={{ background: '#eeeae1', borderRadius: 6, height: 8, overflow: 'hidden', minWidth: 70 }}>
      <div style={{ width: `${Math.round(r * 100)}%`, height: '100%', background: GRADE_STYLE[g].color }} />
    </div>
  );
}

function Spinner({ text }) {
  return (
    <div className="info">
      <span className="spin" style={{ borderColor: '#1a3a5c', borderTopColor: 'transparent' }} />
      {text}
    </div>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  // 1단계 심사표
  const critFileRef = useRef(null);
  const [critPaste, setCritPaste] = useState('');
  const [critNote, setCritNote] = useState(null);
  const [critBusy, setCritBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState([]); // [{id, group, name, points, desc}]

  // 2단계 서류
  const docFileRef = useRef(null);
  const [docText, setDocText] = useState('');
  const [docName, setDocName] = useState('');
  const [docPages, setDocPages] = useState(0);
  const [docPaste, setDocPaste] = useState('');
  const [docNote, setDocNote] = useState(null);

  // 3단계 결과
  const [checking, setChecking] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const d = load();
    if (Array.isArray(d.criteria) && d.criteria.length) setCriteria(d.criteria);
    if (d.title) setTitle(d.title);
    if (d.docText) {
      setDocText(d.docText);
      setDocName(d.docName || '');
      setDocPages(d.docPages || 0);
      setDocNote({ type: 'info', text: `지난번에 올린 서류(${d.docName || '붙여넣기'})가 남아 있습니다. 새로 올리면 바뀝니다.` });
    }
    if (d.result && Array.isArray(d.result.results)) setResult(d.result);
    setReady(true);
  }, []);

  // ── 1단계 ──────────────────────────────────────
  async function extractCriteria(text) {
    setError('');
    setCritBusy(true);
    setCritNote({ type: 'info', text: '심사 항목과 배점을 뽑는 중입니다... (20초쯤)' });
    try {
      const r = await fetch('/api/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '심사표를 읽지 못했습니다.');
      setCriteria(j.items);
      setTitle(j.title || '');
      setResult(null);
      save({ criteria: j.items, title: j.title || '', result: null });
      const total = j.items.reduce((s, c) => s + (Number(c.points) || 0), 0);
      setCritNote({
        type: 'info',
        text: `✅ 심사 항목 ${j.items.length}개(총 ${total}점)를 뽑았습니다. 아래 표를 확인하고 틀린 곳은 고쳐 주세요.`,
      });
    } catch (err) {
      setCritNote({ type: 'warn', text: err.message });
    } finally {
      setCritBusy(false);
    }
  }

  const onCritFile = useCallback(async (file) => {
    if (!file) return;
    setCritNote({ type: 'info', text: '파일을 읽는 중입니다...' });
    try {
      const { text } = await fileToText(file);
      if (looksScanned(text)) {
        setCritNote({
          type: 'warn',
          text: '글자를 거의 읽지 못했습니다. 사진으로 스캔한 파일은 읽을 수 없어요. 심사기준표 부분을 복사해 아래 칸에 붙여넣어 주세요.',
        });
        return;
      }
      await extractCriteria(text);
    } catch (err) {
      setCritNote({ type: 'warn', text: err.message });
    }
  }, []);

  const updateCrit = (id, part) => {
    setCriteria((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...part } : c));
      save({ criteria: next });
      return next;
    });
  };
  const removeCrit = (id) =>
    setCriteria((prev) => {
      const next = prev.filter((c) => c.id !== id);
      save({ criteria: next });
      return next;
    });
  const addCrit = () =>
    setCriteria((prev) => {
      const next = [...prev, { id: `m${Date.now()}`, group: '', name: '새 항목', points: 10, desc: '' }];
      save({ criteria: next });
      return next;
    });

  // ── 2단계 ──────────────────────────────────────
  const onDocFile = useCallback(async (file) => {
    if (!file) return;
    setError('');
    setDocNote({ type: 'info', text: '서류를 읽는 중입니다...' });
    try {
      const { text, pages } = await fileToText(file);
      if (looksScanned(text)) {
        setDocText('');
        setDocNote({
          type: 'warn',
          text: '글자를 거의 읽지 못했습니다. 한글에서 [파일 → PDF로 저장하기]로 저장한 파일을 올려 주세요. 사진으로 스캔한 파일은 읽을 수 없습니다.',
        });
        return;
      }
      setDocText(text);
      setDocName(file.name);
      setDocPages(pages);
      setDocPaste('');
      setResult(null);
      save({ docText: text, docName: file.name, docPages: pages, result: null });
      setDocNote({
        type: 'info',
        text: `✅ 다 읽었습니다 — ${pages ? `${pages}쪽, ` : ''}약 ${text.length.toLocaleString()}자.`,
      });
    } catch (err) {
      setDocNote({ type: 'warn', text: err.message });
    }
  }, []);

  function useDocPaste() {
    const t = docPaste.trim();
    if (t.length < 30) return;
    setDocText(t);
    setDocName('붙여넣은 글');
    setDocPages(0);
    setResult(null);
    save({ docText: t, docName: '붙여넣은 글', docPages: 0, result: null });
    setDocNote({ type: 'info', text: `✅ 붙여넣은 글 약 ${t.length.toLocaleString()}자를 쓰겠습니다.` });
  }

  // ── 3단계 ──────────────────────────────────────
  async function runCheck() {
    if (!criteria.length) return setError('먼저 1단계에서 심사표를 넣어 주세요.');
    if (!docText) return setError('먼저 2단계에서 서류를 넣어 주세요.');
    setError('');
    setResult(null);
    setChecking('서류 전체를 심사기준에 맞춰 살펴보는 중입니다... (40초쯤 걸립니다)');
    try {
      const n = criteria.length;
      const mid = n > 6 ? Math.ceil(n / 2) : n; // 6개 이하면 한 번에
      const call = (from, to, withSummary) =>
        fetch('/api/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceText: docText, criteria, from, to, title, withSummary }),
        }).then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || '분석하지 못했습니다.');
          return j;
        });
      const parts = mid < n ? await Promise.all([call(0, mid, true), call(mid, n, false)]) : [await call(0, n, true)];
      const results = parts.flatMap((p) => p.results);
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      const rows = criteria.map((c) => {
        const r = byId[c.id];
        const score = r ? r.score : 0;
        return {
          ...c,
          score,
          grade: r ? r.grade : gradeOf(score, c.points),
          evidence: r ? r.evidence : '(이 항목은 결과가 오지 않았습니다. 다시 눌러 주세요)',
          page: r ? r.page : '',
          fix: r ? r.fix : '',
          missing: !r,
        };
      });
      const total = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
      const got = rows.reduce((s, r) => s + (Number(r.score) || 0), 0);
      const merged = {
        rows,
        total,
        got,
        summary: parts[0].summary,
        strengths: parts[0].strengths,
        fixes: parts[0].fixes,
        priorities: parts[0].priorities,
        truncated: parts.some((p) => p.truncated),
        docName,
        docPages,
        title,
        at: new Date().toISOString(),
      };
      setResult(merged);
      save({ result: merged });
      setTimeout(() => document.getElementById('result')?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking('');
    }
  }

  function printResult() {
    document.body.classList.add('print-result');
    const off = () => {
      document.body.classList.remove('print-result');
      window.removeEventListener('afterprint', off);
    };
    window.addEventListener('afterprint', off);
    window.print();
  }

  function resetAll() {
    if (!confirm('심사표·서류·결과를 모두 지우고 처음부터 할까요?')) return;
    localStorage.removeItem(KEY);
    setCriteria([]);
    setTitle('');
    setCritPaste('');
    setCritNote(null);
    setDocText('');
    setDocName('');
    setDocPages(0);
    setDocPaste('');
    setDocNote(null);
    setResult(null);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!ready) return null;

  const totalPoints = criteria.reduce((s, c) => s + (Number(c.points) || 0), 0);
  const pct = result && result.total ? Math.round((result.got / result.total) * 100) : 0;
  const overall = result ? gradeOf(result.got, result.total) : null;
  const weak = result ? result.rows.filter((r) => r.grade === '보완필요').length : 0;

  return (
    <>
      <div className="head noprint">
        <h1>서류 점검기</h1>
        <p>심사기준표에 맞춰 서류를 미리 채점해 보고, 보완할 곳을 한눈에 봅니다</p>
      </div>

      <div className="wrap" style={{ maxWidth: 820 }}>
        <div className="steps noprint">
          <div className={criteria.length ? 'done' : 'on'}>1. 심사표 넣기{criteria.length ? ` ✓ ${criteria.length}항목` : ''}</div>
          <div className={docText ? 'done' : criteria.length ? 'on' : ''}>2. 문서 넣기{docText ? ' ✓' : ''}</div>
          <div className={result ? 'done' : docText && criteria.length ? 'on' : ''}>3. 심사표에 맞게 분석{result ? ' ✓' : ''}</div>
        </div>

        {error && <div className="err">{error}</div>}

        {/* ── 1단계 ── */}
        <div className="card noprint">
          <h2>1. 심사표 넣기</h2>
          <p className="sub">지자체 공고문이나 심사기준표(배점표) 파일을 올리면 항목과 배점을 뽑아 드립니다.</p>
          <div className="row">
            <input
              ref={critFileRef}
              type="file"
              accept=".pdf,.hwpx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                onCritFile(e.target.files && e.target.files[0]);
                e.target.value = '';
              }}
            />
            <button className="btn btn-gold" onClick={() => critFileRef.current?.click()} disabled={critBusy}>
              심사표 파일 올리기 (PDF · 한글 .hwpx)
            </button>
          </div>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>
              파일이 없으면 심사기준표 글을 여기에 붙여넣어 주세요
            </summary>
            <textarea
              value={critPaste}
              onChange={(e) => setCritPaste(e.target.value)}
              placeholder="예) 1. 운영 목표 및 방침 (10점) — 보육철학과 운영목표의 구체성 ..."
              style={{ marginTop: 8 }}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn btn-ghost"
                onClick={() => extractCriteria(critPaste)}
                disabled={critBusy || critPaste.trim().length < 20}
              >
                붙여넣은 글에서 항목 뽑기
              </button>
            </div>
          </details>
          {critNote && (critBusy ? <Spinner text={critNote.text} /> : <div className={critNote.type === 'warn' ? 'warn' : 'info'}>{critNote.text}</div>)}

          {criteria.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label>심사표 이름</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  save({ title: e.target.value });
                }}
                placeholder="예) 2026년 ○○시 국공립어린이집 위탁 심사 기준"
              />
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="crit">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>#</th>
                      <th style={{ width: '22%' }}>큰항목</th>
                      <th style={{ width: '28%' }}>심사 항목</th>
                      <th style={{ width: 70 }}>배점</th>
                      <th>심사 내용</th>
                      <th style={{ width: 44 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.map((c, i) => (
                      <tr key={c.id}>
                        <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                        <td>
                          <input type="text" value={c.group || ''} onChange={(e) => updateCrit(c.id, { group: e.target.value })} />
                        </td>
                        <td>
                          <input type="text" value={c.name} onChange={(e) => updateCrit(c.id, { name: e.target.value })} />
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={c.points}
                            onChange={(e) => updateCrit(c.id, { points: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                            style={{ textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <textarea
                            value={c.desc || ''}
                            onChange={(e) => updateCrit(c.id, { desc: e.target.value })}
                            style={{ minHeight: 44, padding: '7px 9px', fontSize: 13.5 }}
                          />
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => removeCrit(c.id)} title="이 항목 지우기">
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>
                        합계
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalPoints}점</td>
                      <td colSpan={2}>
                        <button className="btn btn-ghost btn-sm" onClick={addCrit}>
                          + 항목 추가
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── 2단계 ── */}
        <div className="card noprint">
          <h2>2. 문서 넣기</h2>
          <p className="sub">
            작성한 서류를 올려 주세요. 한글 문서는 <b>[파일 → PDF로 저장하기]</b>로 저장한 PDF가 가장 정확합니다.
          </p>
          <div className="row">
            <input
              ref={docFileRef}
              type="file"
              accept=".pdf,.hwpx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                onDocFile(e.target.files && e.target.files[0]);
                e.target.value = '';
              }}
            />
            <button className="btn btn-gold" onClick={() => docFileRef.current?.click()} disabled={!!checking}>
              서류 파일 올리기 (PDF · 한글 .hwpx)
            </button>
            {docText && (
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                {docName} · {docPages ? `${docPages}쪽 · ` : ''}
                {docText.length.toLocaleString()}자
              </span>
            )}
          </div>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>
              파일이 안 읽히면 서류 내용을 여기에 붙여넣어 주세요
            </summary>
            <textarea value={docPaste} onChange={(e) => setDocPaste(e.target.value)} style={{ marginTop: 8 }} />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={useDocPaste} disabled={docPaste.trim().length < 30}>
                붙여넣은 글 쓰기
              </button>
            </div>
          </details>
          {docNote && <div className={docNote.type === 'warn' ? 'warn' : 'info'}>{docNote.text}</div>}
        </div>

        {/* ── 3단계 ── */}
        <div className="card noprint">
          <h2>3. 심사표에 맞게 분석</h2>
          <p className="sub">항목마다 예상 점수와 근거, 보완할 곳을 매깁니다. 결과는 AI가 본 것이니 참고로 쓰세요.</p>
          <div className="row">
            <button className="btn" onClick={runCheck} disabled={!criteria.length || !docText || !!checking}>
              {checking ? '살펴보는 중...' : '분석 시작'}
            </button>
            <button className="btn btn-ghost" onClick={resetAll} disabled={!!checking}>
              처음부터 다시
            </button>
          </div>
          {checking && <Spinner text={checking} />}
        </div>

        {result && (
          <div className="card result-card" id="result">
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {result.title ? `${result.title} · ` : ''}
              {result.docName ? `${result.docName} · ` : ''}
              {result.docPages ? `${result.docPages}쪽 · ` : ''}
              {new Date(result.at).toLocaleString('ko-KR')} 점검
            </div>
            {result.truncated && <div className="warn">서류가 너무 길어 앞 15만 자까지만 살폈습니다.</div>}

            {/* 합계 */}
            <div
              style={{
                marginTop: 10,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 2fr)',
                gap: 12,
                alignItems: 'stretch',
              }}
              className="score-grid"
            >
              <div
                style={{
                  border: `1px solid ${GRADE_STYLE[overall].color}`,
                  background: GRADE_STYLE[overall].bg,
                  borderRadius: 14,
                  padding: '16px 18px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>예상 점수</div>
                <div style={{ fontSize: 38, fontWeight: 800, color: GRADE_STYLE[overall].color, lineHeight: 1.2 }}>
                  {result.got}
                  <span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 500 }}> / {result.total}점</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Badge grade={overall} />{' '}
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>{pct}%</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                  보완 필요 {weak}개 / {result.rows.length}항목
                </div>
              </div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', background: '#fff' }}>
                <b style={{ color: 'var(--navy)' }}>심사위원 한마디</b>
                <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.7 }}>{result.summary || '—'}</p>
              </div>
            </div>

            {result.priorities?.length > 0 && (
              <div className="warn" style={{ marginTop: 14 }}>
                <b>지금 바로 고칠 것</b>
                <ol style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
                  {result.priorities.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* 항목별 */}
            <h3 style={{ margin: '18px 0 8px', fontSize: 16, color: 'var(--navy)' }}>항목별 예상 점수</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="res">
                <thead>
                  <tr>
                    <th style={{ width: '26%' }}>심사 항목</th>
                    <th style={{ width: 120 }}>예상 / 배점</th>
                    <th style={{ width: 86 }}>등급</th>
                    <th>근거 · 보완할 것</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td>
                        {r.group && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.group}</div>}
                        <b>
                          {i + 1}. {r.name}
                        </b>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: GRADE_STYLE[r.grade].color }}>
                          {r.score} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>/ {r.points}</span>
                        </div>
                        <Bar score={r.score} points={r.points} />
                      </td>
                      <td>
                        <Badge grade={r.grade} />
                      </td>
                      <td style={{ lineHeight: 1.6 }}>
                        <div>
                          {r.evidence}
                          {r.page && <span style={{ color: 'var(--muted)' }}> ({r.page}쪽)</span>}
                        </div>
                        {r.fix && (
                          <div style={{ marginTop: 4, color: '#b5651d' }}>
                            <b>보완</b> {r.fix}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid2" style={{ marginTop: 16 }}>
              <div style={{ background: '#eaf5ef', borderRadius: 10, padding: '10px 14px' }}>
                <b style={{ color: '#2e7d5b' }}>잘 살린 부분</b>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
                  {result.strengths?.length ? result.strengths.map((t, i) => <li key={i}>{t}</li>) : <li>—</li>}
                </ul>
              </div>
              <div style={{ background: '#fdf0e4', borderRadius: 10, padding: '10px 14px' }}>
                <b style={{ color: '#b5651d' }}>고치면 점수가 오를 부분</b>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
                  {result.fixes?.length ? result.fixes.map((t, i) => <li key={i}>{t}</li>) : <li>—</li>}
                </ul>
              </div>
            </div>

            <div className="row noprint" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={printResult}>
                결과 인쇄 · PDF 저장
              </button>
              <button className="btn btn-ghost" onClick={runCheck} disabled={!!checking}>
                다시 분석
              </button>
            </div>
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
              서류를 고친 뒤 다시 올려 몇 번이든 점검할 수 있습니다. 예상 점수는 AI의 추정이라 실제 심사 점수와 다를 수 있습니다.
            </p>
          </div>
        )}

        <a className="card contact link noprint" href={KAKAO_URL} target="_blank" rel="noreferrer">
          <p>어려움이 있을 경우 라지숙 소장에게 연락하세요!</p>
          <span className="kakao">
            <b>💬</b> 문의사항이 있을 경우 클릭 후 카톡 상담하세요
          </span>
        </a>
      </div>
    </>
  );
}

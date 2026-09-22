// AI 응답은 JSON 대신 ### 구분자 형식으로 받아 여기서 읽는다.
// (JSON은 인용문 따옴표 때문에 자주 깨진다 — 여러 앱에서 겪은 교훈)

function blocksOf(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .split(/^###/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const nl = b.indexOf('\n');
      const kind = (nl === -1 ? b : b.slice(0, nl)).trim();
      const body = nl === -1 ? '' : b.slice(nl + 1);
      const grab = (label) => {
        const m = body.match(new RegExp(`^${label}\\s*[:：]\\s*(.+)$`, 'm'));
        return m ? m[1].trim() : '';
      };
      return { kind, body, grab };
    });
}

// 한 블록 안에 같은 이름 줄이 여러 개면 모두 (AI가 강점 3개를 한 블록에 몰아 쓰기도 한다)
function grabAll(body, label) {
  const re = new RegExp(`^${label}\\s*[:：]\\s*(.+)$`, 'gm');
  const out = [];
  let m;
  while ((m = re.exec(body))) out.push(m[1].trim().replace(/^[-·•]\s*/, ''));
  return out;
}

const num = (s) => {
  const m = String(s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
};

/**
 * 심사기준표 추출 결과
 * ###항목 / 이름 / 배점 / 내용(심사 관점) / 큰항목
 */
export function parseCriteria(raw) {
  const items = [];
  let title = '';
  for (const b of blocksOf(raw)) {
    if (b.kind.startsWith('제목')) {
      title = b.grab('이름') || b.body.trim();
    } else if (b.kind.startsWith('항목')) {
      const name = b.grab('이름');
      if (!name) continue;
      items.push({
        id: `c${items.length + 1}`,
        group: b.grab('큰항목'),
        name,
        points: num(b.grab('배점')),
        desc: b.grab('내용'),
      });
    }
  }
  return { title, items };
}

/**
 * 분석 결과
 * ###항목 / 번호 / 예상점수 / 등급 / 근거 / 쪽 / 보완
 * ###총평 / 요약 / 강점 / 보완
 * ###우선 / 내용
 */
export function parseCheck(raw, criteria) {
  const results = [];
  const priorities = [];
  const strengths = [];
  const fixes = [];
  let summary = '';
  for (const b of blocksOf(raw)) {
    if (b.kind.startsWith('항목')) {
      const no = num(b.grab('번호'));
      const crit = criteria.find((c, i) => i + 1 === no) || null;
      if (!crit) continue;
      const grade = b.grab('등급').replace(/\s+/g, '');
      results.push({
        id: crit.id,
        score: Math.max(0, Math.min(crit.points || 0, num(b.grab('예상점수')))),
        grade: grade.includes('보완') ? '보완필요' : grade.includes('좋') ? '좋음' : '보통',
        evidence: b.grab('근거'),
        page: b.grab('쪽').replace(/[^\d~,\-]/g, ''),
        fix: b.grab('보완'),
      });
    } else if (b.kind.startsWith('총평')) {
      summary = b.grab('요약');
    } else if (b.kind.startsWith('강점')) {
      strengths.push(...grabAll(b.body, '내용'));
    } else if (b.kind.startsWith('보완')) {
      fixes.push(...grabAll(b.body, '내용'));
    } else if (b.kind.startsWith('우선')) {
      priorities.push(...grabAll(b.body, '내용'));
    }
  }
  return { results, summary, strengths, fixes, priorities };
}

export const GRADE_STYLE = {
  좋음: { color: '#2e7d5b', bg: '#eaf5ef', label: '좋음' },
  보통: { color: '#a07a2c', bg: '#fbf4e3', label: '보통' },
  보완필요: { color: '#b5651d', bg: '#fdf0e4', label: '보완 필요' },
};

/** 점수 비율로 등급을 다시 매긴다 (AI 등급이 비어 있을 때 대비) */
export function gradeOf(score, points) {
  if (!points) return '보통';
  const r = score / points;
  return r >= 0.8 ? '좋음' : r >= 0.6 ? '보통' : '보완필요';
}

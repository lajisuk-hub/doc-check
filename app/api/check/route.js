// 서류를 심사기준표에 맞춰 항목마다 살펴 예상 점수·근거·보완점을 매긴다.
// 항목이 많으면 60초 제한에 걸리므로 화면에서 항목을 두 묶음으로 나눠 동시에 부른다.
// (묶음 하나마다 서류 전문이 함께 가므로 서류가 길어도 전체를 본다 — 앞부분만 보내면 뒤쪽을 못 찾는다)
import Anthropic from '@anthropic-ai/sdk';
import { parseCheck } from '@/lib/parse';

export const maxDuration = 60;
const MODEL = 'claude-sonnet-5';
const SRC_LIMIT = 150000;

function prompt({ source, criteria, offset, title, withSummary }) {
  const list = criteria
    .map((c, i) => {
      const no = offset + i + 1;
      return (
        `[${no}] ${c.group ? `(${c.group}) ` : ''}${c.name} — 배점 ${c.points || 0}점\n` +
        `    심사 내용: ${c.desc || '(문서에 설명 없음)'}`
      );
    })
    .join('\n');

  return `당신은 어린이집 위탁·평가 심사에 여러 번 참여한 심사위원입니다.
아래 [서류]는 지원자가 제출하려는 서류 전문이고, [심사기준]은 이 서류를 채점할 기준표${title ? `(${title})` : ''}입니다.
글자는 PDF에서 뽑은 것이라 표·그림은 글자만 남아 있고, [쪽 N] 표시는 그 줄부터 N쪽이라는 뜻입니다.

=== 서류 ===
${source}
=== 서류 끝 ===

=== 심사기준 ===
${list}
=== 심사기준 끝 ===

할 일
심사기준 항목마다 ###항목 블록을 하나씩, 번호 순서대로 모두 쓰세요. 하나도 빠뜨리면 안 됩니다.
- 예상점수: 심사위원이 실제로 줄 법한 점수. 배점을 넘길 수 없습니다. 서류에 근거가 전혀 없으면 배점의 30% 이하.
  잘 갖춰졌으면 80~100%, 있긴 한데 구체성이 부족하면 50~79%, 미흡하면 그 아래. 정수로.
- 등급: 좋음(80% 이상) / 보통(60~79%) / 보완필요(60% 미만) 중 하나.
- 근거: 서류의 어느 부분(제목·문구)이 이 항목에 해당하는지 한 줄. 서류에 없으면 '서류에서 찾지 못함'.
- 쪽: 근거가 있는 쪽 번호([쪽 N] 표시 기준). 모르면 -.
- 보완: 점수를 올리려면 어디를 어떻게 고치거나 보태야 하는지 한 줄. 어린이집 원장님이 바로 알아듣게 쉬운 말로.
${
  withSummary
    ? `
그리고 마지막에
- ###총평: 서류 전체에 대한 심사위원 소감 두세 문장.
- ###강점 3개: 잘 살린 부분(어디가 왜 좋은지).
- ###보완 3~5개: 고치면 점수가 오를 부분(어디를 어떻게). 지원 지역·기관에 맞지 않는 이름이 남아 있거나 숫자가 앞뒤로 다른 것도 살피세요.
- ###우선 최대 3개: 지금 바로 고칠 것을 중요한 순서로. 몇 쪽 무엇을 어떻게.`
    : ''
}

지켜야 할 것
- 서류에 실제로 있는 것만 근거로 삼으세요. 없는 내용을 지어내면 안 됩니다.
- 큰따옴표를 쓰지 마세요. 강조는 홑따옴표로.
- 설명은 60자 안팎 한 줄. 전문용어·영어 약자는 피하세요.
- 아래 형식 그대로만 출력하세요. 형식 밖의 말은 절대 쓰지 마세요.

###항목
번호: ${offset + 1}
예상점수: 11
등급: 보통
근거: (한 줄)
쪽: 12
보완: (한 줄)
###항목
번호: ${offset + 2}
...${
    withSummary
      ? `
###총평
요약: (두세 문장)
###강점
내용: (한 줄)
###보완
내용: (한 줄)
###우선
내용: (한 줄)`
      : ''
  }`;
}

export async function POST(req) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI 열쇠가 설정되지 않았습니다. 관리자에게 문의해 주세요.' }, { status: 500 });
    }
    const body = await req.json();
    const full = String(body.sourceText || '').trim();
    if (full.length < 30) {
      return Response.json({ error: '서류 내용이 없습니다. 파일을 올리거나 붙여넣어 주세요.' }, { status: 400 });
    }
    const all = Array.isArray(body.criteria) ? body.criteria : [];
    const from = Math.max(0, Number(body.from) || 0);
    const to = Math.min(all.length, Number(body.to) || all.length);
    const part = all.slice(from, to);
    if (!part.length) {
      return Response.json({ error: '심사 항목이 없습니다. 먼저 심사기준표를 넣어 주세요.' }, { status: 400 });
    }

    const source = full.slice(0, SRC_LIMIT);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt({
                source,
                criteria: part,
                offset: from,
                title: body.title,
                withSummary: !!body.withSummary,
              }),
            },
          ],
        },
      ],
    });
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    const out = parseCheck(text, all);
    if (!out.results.length) {
      return Response.json({ error: '분석 결과를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.' }, { status: 502 });
    }
    return Response.json({ ...out, truncated: full.length > SRC_LIMIT });
  } catch (err) {
    return Response.json({ error: err.message || '알 수 없는 오류' }, { status: 500 });
  }
}

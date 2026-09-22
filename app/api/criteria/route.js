// 심사기준표(공고문·배점표) 글에서 심사 항목·배점·심사 내용을 뽑는다.
import Anthropic from '@anthropic-ai/sdk';
import { parseCriteria } from '@/lib/parse';

export const maxDuration = 60;
const MODEL = 'claude-sonnet-5';
const SRC_LIMIT = 60000;

function prompt(source) {
  return `아래 글은 어린이집(또는 기관) 심사에 쓰이는 심사기준표·배점표가 들어 있는 문서입니다.
심사 항목을 하나도 빠짐없이 뽑아 주세요.

=== 문서 ===
${source}
=== 문서 끝 ===

할 일
- 실제로 점수가 매겨지는 가장 작은 단위의 심사 항목마다 ###항목 블록을 하나씩 쓰세요. 문서에 나온 순서 그대로.
- 큰항목(영역·분야 이름)이 있으면 함께 적으세요. 없으면 비워 두세요.
- 배점은 숫자만(예: 15). 배점이 안 적혀 있으면 0.
- 내용에는 그 항목에서 심사위원이 무엇을 보는지(세부 심사 내용·평가 지표)를 문서에 있는 말로 한두 줄 요약하세요.
- 심사기준표가 여러 개면(예: 서류심사·면접심사) 서류 쪽 것을 고르세요.
- 문서에 심사 항목 표가 전혀 없으면 ###없음 한 줄만 쓰세요.
- 큰따옴표를 쓰지 마세요. 아래 형식 밖의 말은 쓰지 마세요.

###제목
이름: (심사표 이름, 예: 2026년 국공립어린이집 위탁 심사 기준)
###항목
큰항목: (영역 이름 또는 비움)
이름: (심사 항목 이름)
배점: 15
내용: (심사 내용 한두 줄)
###항목
...`;
}

export async function POST(req) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI 열쇠가 설정되지 않았습니다. 관리자에게 문의해 주세요.' }, { status: 500 });
    }
    const body = await req.json();
    const source = String(body.text || '').trim().slice(0, SRC_LIMIT);
    if (source.length < 20) {
      return Response.json({ error: '심사기준표 내용이 없습니다. 파일을 올리거나 붙여넣어 주세요.' }, { status: 400 });
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt(source) }] }],
    });
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    const out = parseCriteria(text);
    if (!out.items.length) {
      return Response.json(
        { error: '이 문서에서 심사 항목 표를 찾지 못했습니다. 심사기준표(배점표) 부분만 복사해 붙여넣어 주세요.' },
        { status: 422 }
      );
    }
    return Response.json(out);
  } catch (err) {
    return Response.json({ error: err.message || '알 수 없는 오류' }, { status: 500 });
  }
}

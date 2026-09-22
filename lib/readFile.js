'use client';

const JSZIP_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_SRC;
    s.onload = resolve;
    s.onerror = () => reject(new Error('압축 도구를 불러오지 못했습니다'));
    document.head.appendChild(s);
  });
  return window.JSZip;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// 한글 hwpx 는 사실 압축파일이라, 안의 글자만 뽑아낼 수 있다.
async function hwpxToText(buf) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort();
  let out = '';
  for (const n of names) {
    const xml = await zip.file(n).async('string');
    out += xml
      .replace(/<hp:lineBreak[^>]*\/>/g, '\n')
      .replace(/<\/hp:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 업로드한 공고문 파일을 서버에 보낼 수 있는 모양으로 바꾼다.
 * PDF 는 그대로 보내 AI 가 직접 읽고, 한글(hwpx)은 글자만 뽑아 보낸다.
 */
export async function readNoticeFile(file) {
  const name = (file.name || '').toLowerCase();
  const buf = await file.arrayBuffer();

  if (name.endsWith('.pdf')) {
    if (buf.byteLength > 24 * 1024 * 1024) {
      throw new Error('PDF가 너무 큽니다(24MB 초과). 목차 부분만 복사해 붙여넣어 주세요.');
    }
    return { kind: 'pdf', base64: toBase64(buf) };
  }

  if (name.endsWith('.hwpx')) {
    const text = await hwpxToText(buf);
    if (!text) throw new Error('한글 파일에서 글자를 찾지 못했습니다.');
    return { kind: 'text', text };
  }

  if (name.endsWith('.hwp')) {
    throw new Error(
      '옛날 한글 파일(.hwp)은 읽을 수 없습니다. 한글에서 열고 [다른 이름으로 저장] → 파일 형식을 "한글 문서 (*.hwpx)"로 바꿔 저장한 뒤 올려주세요. 또는 목차 부분만 복사해 붙여넣어 주세요.'
    );
  }

  if (name.endsWith('.txt')) {
    return { kind: 'text', text: new TextDecoder('utf-8').decode(buf) };
  }

  throw new Error('PDF 또는 한글(.hwpx) 파일만 올릴 수 있습니다.');
}

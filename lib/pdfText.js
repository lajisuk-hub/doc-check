'use client';

// 올린 파일에서 글자를 뽑는다.
//  · PDF  → pdf.js로 쪽마다 [쪽 N] 표시를 넣고 줄 끝(hasEOL)은 줄바꿈으로 살린다
//  · hwpx → 압축을 풀어 글자만 (lib/readFile.js)
//  · txt  → 그대로
// 사진으로 스캔한 PDF는 글자가 안 나오므로 호출한 쪽에서 길이를 보고 안내한다.
import { readNoticeFile } from '@/lib/readFile';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('PDF 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
    document.head.appendChild(s);
  });
}

async function pdfToText(file) {
  await loadScript(PDFJS);
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let full = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let t = '';
    for (const it of content.items) {
      t += it.str;
      t += it.hasEOL ? '\n' : ' ';
    }
    full += `\n[쪽 ${i}]\n${t.replace(/[ \t]+\n/g, '\n').trim()}\n`;
  }
  return { text: full.trim(), pages: pdf.numPages };
}

/** @returns {{text:string, pages:number}} */
export async function fileToText(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.pdf')) return pdfToText(file);
  const r = await readNoticeFile(file);
  return { text: r.kind === 'text' ? r.text : '', pages: 0 };
}

/** 글자가 거의 없으면(스캔본) true */
export function looksScanned(text) {
  return String(text || '').replace(/\[쪽 \d+\]/g, '').trim().length < 200;
}

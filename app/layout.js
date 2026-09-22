import './globals.css';

export const metadata = {
  title: '서류 점검기 — 심사기준표에 맞춰 서류 점검',
  description: '심사기준표와 작성한 서류를 올리면 항목마다 예상 점수·근거·보완할 곳을 한눈에 보여 줍니다.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

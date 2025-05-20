// pages/index.js - 기본 페이지
import Head from 'next/head';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // 페이지 로드 후 실행할 코드
  }, []);

  return (
    <div className="container">
      <Head>
        <title>LG 브라질 A2A 쇼핑 어시스턴트</title>
        <meta name="description" content="LG 브라질 A2A 쇼핑 어시스턴트" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="main">
        <h1 className="title">
          LG 브라질 A2A 쇼핑 어시스턴트
        </h1>

        <p className="description">
          이 페이지는 LG 브라질 쇼핑몰에 쇼핑 어시스턴트를 제공하는 서비스의 기본 페이지입니다.
          실제 쇼핑 어시스턴트는 LG 브라질 쇼핑몰 사이트에 통합되어 있습니다.
        </p>

        <div className="grid">
          <div className="card">
            <h2>설치 안내</h2>
            <p>
              아래의 스크립트를 LG 브라질 웹사이트에 추가하여 쇼핑 어시스턴트를 통합할 수 있습니다:
            </p>
            <pre>
              <code>
{`<script src="${process.env.NEXT_PUBLIC_BASE_URL || 'https://your-deployment-url.vercel.app'}/js/lge-br-injection.js" async></script>`}
              </code>
            </pre>
          </div>

          <div className="card">
            <h2>API 상태</h2>
            <p>
              서비스가 정상적으로 작동 중입니다.
            </p>
            <p>
              현재 시간: {new Date().toLocaleString()}
            </p>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>© 2025 LG A2A 쇼핑 어시스턴트</p>
      </footer>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .title {
          margin: 0;
          line-height: 1.15;
          font-size: 4rem;
          text-align: center;
        }

        .description {
          text-align: center;
          line-height: 1.5;
          font-size: 1.5rem;
          margin: 2rem 0;
        }

        .grid {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          flex-wrap: wrap;
          max-width: 800px;
          margin-top: 3rem;
        }

        .card {
          margin: 1rem;
          flex-basis: 45%;
          padding: 1.5rem;
          color: inherit;
          text-decoration: none;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          transition: color 0.15s ease, border-color 0.15s ease;
        }

        .card h2 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }

        .card p {
          margin: 0;
          font-size: 1.25rem;
          line-height: 1.5;
        }

        code {
          background: #f4f4f4;
          border-radius: 5px;
          padding: 0.75rem;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono,
            Bitstream Vera Sans Mono, Courier New, monospace;
          overflow-x: auto;
          display: block;
          width: 100%;
        }

        pre {
          width: 100%;
          overflow-x: auto;
        }

        @media (max-width: 600px) {
          .grid {
            width: 100%;
            flex-direction: column;
          }
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen,
            Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}

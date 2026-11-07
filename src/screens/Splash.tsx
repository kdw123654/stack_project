import { useEffect, useRef, useState } from 'react';
import stackIcon from '../assets/stack-icon.svg';

/**
 * CM-01 스플래시 / 온보딩 로고 모션 — 라이트 버전
 * Figma: "v2 / 온보딩 로고 모션 / 낙하 스택 (라이트)"
 * 구성은 다크 원본과 동일(앱 아이콘 + STACK 워드마크 + USW), 배경과 글자색만 라이트로 전환.
 * 레이어 3장이 위에서 차례로 떨어져 쌓이는 "낙하 스택" 모션.
 */
export default function Splash({ onDone, duration = 1900 }: { onDone?: () => void; duration?: number }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const total = reduce ? 600 : duration;
    const t1 = setTimeout(() => setLeaving(true), total - 300);
    const t2 = setTimeout(() => doneRef.current?.(), total);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [duration]);

  return (
    <div className={`splash ${leaving ? 'is-leaving' : ''}`} role="img" aria-label="STACK USW">
      <div className="splash__glow" />
      <div className="splash__icon">
        <svg className="splash__mark" viewBox="0 0 87 87" aria-hidden="true">
          <defs>
            <linearGradient id="splash-bg" x1="11.31" y1="0" x2="73.95" y2="87" gradientUnits="userSpaceOnUse">
              <stop stopColor="#102449" />
              <stop offset=".55" stopColor="#091A39" />
              <stop offset="1" stopColor="#05112A" />
            </linearGradient>
            <radialGradient id="splash-bg-glow" cx="0" cy="0" r="1" gradientTransform="translate(46.11 32.19) scale(62.64)" gradientUnits="userSpaceOnUse">
              <stop stopColor="#112A54" stopOpacity=".55" />
              <stop offset="1" stopColor="#06152F" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="splash-top-fill" x1="22" y1="21" x2="40.78" y2="56.4" gradientUnits="userSpaceOnUse">
              <stop stopColor="white" />
              <stop offset=".65" stopColor="white" />
              <stop offset="1" stopColor="#F5F7FD" />
            </linearGradient>
            <linearGradient id="splash-mid-fill" x1="23.53" y1="52.59" x2="44.68" y2="27.79" gradientUnits="userSpaceOnUse">
              <stop stopColor="#61C1FF" />
              <stop offset=".45" stopColor="#429FFF" />
              <stop offset="1" stopColor="#2876F9" />
            </linearGradient>
            <linearGradient id="splash-bottom-fill" x1="23.67" y1="52.79" x2="35.02" y2="78.86" gradientUnits="userSpaceOnUse">
              <stop stopColor="#54B6FF" />
              <stop offset=".43" stopColor="#388CFF" />
              <stop offset="1" stopColor="#266DFB" />
            </linearGradient>
            <clipPath id="splash-mark-clip"><rect width="87" height="87" rx="22.216" /></clipPath>
          </defs>
          <g clipPath="url(#splash-mark-clip)">
            <rect width="87" height="87" fill="url(#splash-bg)" />
            <rect width="87" height="87" fill="url(#splash-bg-glow)" />
            <g className="splash__layer splash__layer--3">
              <path d="M23.9368 53.1848C24.8689 52.4598 25.9564 52.4598 27.1993 53.1848L36.676 58.6223C38.126 59.4509 39.6278 59.3991 41.1814 58.4669L54.6975 51.1652C56.251 50.233 57.701 50.1812 59.0475 51.0098L63.3975 53.4955C65.7796 54.7384 66.1421 56.2919 64.485 58.1562C64.1743 58.4669 63.6564 58.8294 62.9314 59.2437L42.4243 70.4294C40.9743 71.3616 39.5243 71.3616 38.0743 70.4294L23.0046 61.7294C20.9332 60.4866 20.4671 58.8812 21.6064 56.9134C22.2278 55.1527 23.0046 53.9098 23.9368 53.1848Z" fill="#020A20" transform="translate(0 1.5)" />
              <path d="M23.9368 52.5634C24.8689 51.9419 25.9564 51.9937 27.1993 52.7187L36.676 58.1562C38.126 58.9848 39.6278 58.933 41.1814 58.0009L54.6975 50.6991C56.251 49.8705 57.701 49.8705 59.0475 50.6991L63.3975 53.1848C65.7796 54.3241 66.1421 55.8259 64.485 57.6901C64.1743 58.0009 63.6564 58.3634 62.9314 58.7776L42.4243 68.7205C40.9743 69.6526 39.5243 69.7044 38.0743 68.8759L23.0046 60.1759C20.9332 58.933 20.4671 57.3794 21.6064 55.5151C22.2278 54.3759 23.0046 53.3919 23.9368 52.5634Z" fill="url(#splash-bottom-fill)" />
              <path d="M23.9368 52.5634C24.9725 51.7348 26.06 51.7866 27.1993 52.7188L36.676 58.1563C38.126 58.9848 39.6278 58.933 41.1814 58.0009L54.6975 50.6991C56.3546 49.767 57.8046 49.767 59.0475 50.6991" stroke="#76C4FF" strokeOpacity=".19" strokeWidth="2.5" strokeLinecap="round" />
            </g>
            <g className="splash__layer splash__layer--2">
              <path d="M24.5464 46.2964C25.7893 45.4679 27.1357 45.4679 28.5857 46.2964L36.975 50.8018C38.2179 51.5268 39.5125 51.475 40.8589 50.6464L53.1321 41.9464C54.4786 41.1179 55.825 41.0661 57.1714 41.7911L64.0071 45.3643C66.2857 46.4 66.5964 47.85 64.9393 49.7143C64.6286 50.025 64.1107 50.3875 63.3857 50.8018L43.1893 61.0554C41.4286 62.0911 39.6679 62.1429 37.9071 61.2107L23.3036 52.6661C21.3357 51.4232 20.8179 49.9732 21.75 48.3161C22.3714 47.3839 23.3036 46.7107 24.5464 46.2964Z" fill="#010A1E" transform="translate(0 1.5)" />
              <path d="M24.5464 43.1892C25.7893 42.3607 27.1357 42.3607 28.5857 43.1892L36.975 47.6946C38.2179 48.4196 39.5125 48.3678 40.8589 47.5392L53.1321 38.8392C54.4786 38.0107 55.825 37.9589 57.1714 38.6839L64.0071 42.2571C66.2857 43.2928 66.5964 44.7428 64.9393 46.6071C64.6286 46.9178 64.1107 47.2803 63.3857 47.6946L43.1893 57.9482C41.4286 58.9839 39.6679 59.0357 37.9071 58.1035L23.3036 49.5589C21.3357 48.316 20.8179 46.866 21.75 45.2089C22.3714 44.2767 23.3036 43.6035 24.5464 43.1892Z" fill="url(#splash-mid-fill)" />
            </g>
            <g className="splash__layer splash__layer--1">
              <path d="M24.6244 35.7998L42.9566 25.0801C44.7173 24.0444 46.5298 23.9926 48.3941 24.9248L61.9101 31.7605C64.0851 32.8998 64.7066 34.3498 63.7744 36.1105C63.4637 36.8355 62.7905 37.5087 61.7548 38.1301L40.3155 49.7819C38.6584 50.8176 37.0012 50.8694 35.3441 49.9373L24.003 43.2569C22.0351 42.1176 21.5173 40.6158 22.4494 38.7516C22.8637 37.6123 23.5887 36.6283 24.6244 35.7998Z" fill="#020A1C" transform="translate(0 1.5)" />
              <path d="M24.6244 32.5373L42.9566 21.8177C44.7173 20.782 46.5298 20.7302 48.3941 21.6623L61.9101 28.498C64.0851 29.6373 64.7066 31.0873 63.7744 32.848C63.4637 33.573 62.7905 34.2462 61.7548 34.8677L40.3155 46.5195C38.6584 47.5552 37.0012 47.607 35.3441 46.6748L24.003 39.9945C22.0351 38.8552 21.5173 37.3534 22.4494 35.4891C22.8637 34.3498 23.5887 33.3659 24.6244 32.5373Z" fill="url(#splash-top-fill)" />
            </g>
          </g>
        </svg>
        <img className="splash__mark-final" src={stackIcon} alt="" aria-hidden="true" />
      </div>
      <div className="splash__wordmark">
        <span className="splash__stack">STACK</span>
        <span className="splash__usw">USW</span>
      </div>
    </div>
  );
}

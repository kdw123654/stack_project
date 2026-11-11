import { createContext, useContext, useEffect } from 'react';

// 상세·단계 화면에서는 큰 로고 헤더를 숨기고 '← 뒤로 + 제목' 줄만 상단에 고정 (Figma v2 헤더 규칙)
export const HeaderContext = createContext<(hidden: boolean) => void>(() => {});

export function useHideHeader(hidden: boolean): void {
  const setHidden = useContext(HeaderContext);
  useEffect(() => {
    setHidden(hidden);
    return () => setHidden(false);
  }, [hidden, setHidden]);
}

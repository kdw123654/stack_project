// 가로로 넘기는 줄(.chips, .thumb-strip)을 PC에서도 넘길 수 있게 해요.
// - 마우스로 끌기: 누른 채 좌우로 끌면 넘어가요 (끈 경우엔 버튼 클릭으로 치지 않아요)
// - 마우스 휠: 위아래로 굴리면 좌우로 넘어가요 (끝에 닿으면 페이지가 스크롤돼요)
// 휴대폰 터치는 브라우저가 원래 지원해서 건드리지 않아요.
const SELECTOR = '.chips, .thumb-strip, .h-scroll';

function scroller(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>(SELECTOR) : null;
  return el && el.scrollWidth > el.clientWidth ? el : null;
}

export function enableDragScroll() {
  let active: HTMLElement | null = null;
  let startX = 0;
  let startLeft = 0;
  let moved = false;

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    active = scroller(e.target);
    if (!active) return;
    startX = e.clientX;
    startLeft = active.scrollLeft;
    moved = false;
  });

  document.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) {
      moved = true;
      active.classList.add('is-dragging');
    }
    if (moved) active.scrollLeft = startLeft - dx;
  });

  const end = () => {
    active?.classList.remove('is-dragging');
    active = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  // 끈 직후의 클릭은 막아요 (칩을 끌다가 손을 뗀 곳의 칩이 눌리지 않게)
  document.addEventListener('click', (e) => {
    if (moved && scroller(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    }
  }, true);

  document.addEventListener('wheel', (e) => {
    const el = scroller(e.target);
    if (!el || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
}

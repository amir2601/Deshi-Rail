import { useEffect, useState } from 'react';

const W = 320;
const H = 180;

/**
 * Reproduce the original responsive `fit()` layout in React.
 *
 * Portrait screens put the toolbar under the picture, wide screens put it
 * beside it, and if neither leaves enough room the toolbar floats over the
 * bottom of the picture. The canvas is a fixed 320x180 buffer scaled by CSS.
 *
 * @param appRef    the flex container (carries the safe-area padding)
 * @param canvasRef the <canvas> to size
 * @param buttons   number of visible toolbar buttons
 */
export function useFitLayout(appRef, canvasRef, buttons) {
  const [layout, setLayout] = useState({ mode: 'below', width: W, height: H });

  useEffect(() => {
    const fit = () => {
      const app = appRef.current;
      if (!app) return;
      const cs = getComputedStyle(app);
      const aw = window.innerWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ah = window.innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

      const n = buttons;
      const B = 48;
      const GAP = 8;
      const along = n * B + (n - 1) * 6;
      const rows = Math.ceil(n / Math.max(1, Math.floor((aw + 6) / (B + 6))));
      const tall = rows * B + (rows - 1) * 6;
      const below = rows <= 2 ? Math.min(aw / W, (ah - tall - GAP) / H) : 0;
      const side = along <= ah ? Math.min((aw - B - GAP) / W, ah / H) : 0;
      const over = Math.min(aw / W, ah / H);

      let mode = side >= below ? 'side' : 'below';
      let scale = Math.max(side, below);
      if (scale < over * 0.8) {
        mode = 'overlay';
        scale = over;
      }

      setLayout({ mode, width: Math.floor(W * scale), height: Math.floor(H * scale) });
    };

    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, [appRef, canvasRef, buttons]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
  }, [canvasRef, layout]);

  return layout;
}

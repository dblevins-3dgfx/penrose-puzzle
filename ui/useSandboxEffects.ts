// Drives Sandbox canvas rendering and placement visual/audio effects (spec 7).
// Runs a requestAnimationFrame loop only while effects are active.
import { useEffect, useRef, type RefObject } from 'react';
import { connectedEdgesForTile, SANDBOX_WORLD, type SandboxCamera, type Tile } from '../rules';
import { drawBoard, type Preview } from './draw';
import { playSound } from './jigsawSound';
import {
  drawSandboxEffects,
  hasActiveSandboxEffects,
  pruneSandboxEffects,
  type SandboxPlacementEffect
} from './sandboxEffects';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useSandboxRenderAndEffects = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  tiles: Tile[],
  preview: Preview | null,
  vpWidth: number,
  vpHeight: number,
  dpr: number,
  camera: SandboxCamera,
  effectsEnabled: boolean,
  soundEnabled: boolean
) => {
  const effectsRef = useRef<SandboxPlacementEffect[]>([]);
  const prevTilesRef = useRef<Tile[]>(tiles);

  // Detect newly locked tiles cleanly (ignoring Undo / Clear).
  useEffect(() => {
    const prev = prevTilesRef.current;
    prevTilesRef.current = tiles;

    if (!effectsEnabled || tiles.length < prev.length) {
      effectsRef.current = [];
    }
    if (tiles.length === prev.length + 1) {
      const placed = tiles[tiles.length - 1];
      if (effectsEnabled) {
        const now = performance.now();
        const seams = connectedEdgesForTile(prev, placed);
        effectsRef.current = [...pruneSandboxEffects(effectsRef.current, now), { tile: placed, seams, startTime: now }];
      }
      if (soundEnabled) playSound('lock');
    }
  }, [tiles, effectsEnabled, soundEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const backingW = Math.max(1, Math.round(vpWidth * dpr));
    const backingH = Math.max(1, Math.round(vpHeight * dpr));
    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }

    let rafId: number | null = null;
    const paint = (now: number) => {
      const reduced = prefersReducedMotion();
      effectsRef.current = pruneSandboxEffects(effectsRef.current, now);
      const active = hasActiveSandboxEffects(effectsRef.current, now);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const s = camera.zoom * dpr;
      ctx.setTransform(s, 0, 0, s, camera.panX * dpr, camera.panY * dpr);
      drawBoard(ctx, tiles, preview, SANDBOX_WORLD);
      if (active) {
        drawSandboxEffects(ctx, effectsRef.current, now, reduced);
        rafId = window.requestAnimationFrame(paint);
      } else {
        rafId = null;
      }
    };

    paint(performance.now());
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [canvasRef, tiles, preview, vpWidth, vpHeight, dpr, camera, effectsEnabled]);
};

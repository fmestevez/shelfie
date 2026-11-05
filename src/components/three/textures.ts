"use client";

import * as THREE from "three";
import { loadImage, proxied } from "@/lib/images";
import { hexToHsl } from "@/lib/sorting";
import type { Game } from "@/lib/types";

const textColorFor = (hex: string) => (hexToHsl(hex)[2] > 0.6 ? "#1b1b1b" : "#f7f4ee");

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxPx: number, weight = 700) {
  let px = maxPx;
  ctx.font = `${weight} ${px}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxW && px > 9) {
    px -= 1;
    ctx.font = `${weight} ${px}px system-ui, sans-serif`;
  }
  return px;
}

// ---------- spines ----------

const spineCache = new Map<string, THREE.Texture>();

/**
 * Spine for the visible edge, drawn at the face's real proportions so text isn't
 * stretched; text runs top-to-bottom on upright boxes. With `art`, a band of the box
 * art fills the spine; with `title`, the game's name is printed on it.
 */
export function spineTexture(
  game: Game,
  color: string,
  faceW: number,
  faceH: number,
  art: HTMLCanvasElement | undefined,
  title: boolean,
) {
  const vertical = faceH > faceW;
  const aspect = Math.round((Math.max(faceW, faceH) / Math.max(0.1, Math.min(faceW, faceH))) * 4) / 4;
  const key = `${game.collId}|${color}|${vertical}|${aspect}|${art ? 1 : 0}|${title}`;
  let tex = spineCache.get(key);
  if (tex) return tex;

  const L = 320;
  const S = Math.max(16, Math.min(L, Math.round(L / aspect)));
  const [c, ctx] = vertical ? canvas(S, L) : canvas(L, S);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  if (vertical) {
    ctx.translate(S / 2, L / 2);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(L / 2, S / 2);
  }
  if (art) {
    // A horizontal band through the middle of the cover, scaled to fill the strip.
    const bandH = Math.min(art.height, (art.width * S) / L);
    ctx.drawImage(art, 0, (art.height - bandH) / 2, art.width, bandH, -L / 2, -S / 2, L, S);
    if (title) {
      ctx.fillStyle = "rgba(0,0,0,0.38)"; // keeps the title readable
      ctx.fillRect(-L / 2, -S / 2, L, S);
    }
  }
  // subtle bands at both ends, like printed spines
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(-L / 2, -S / 2, 10, S);
  ctx.fillRect(L / 2 - 10, -S / 2, 10, S);
  if (title) {
    ctx.fillStyle = art ? "#fff" : textColorFor(color);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, game.name, L - 36, Math.min(26, S * 0.62));
    if (art) {
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
    }
    ctx.fillText(game.name, 0, 1);
  }

  tex = finish(c);
  spineCache.set(key, tex);
  return tex;
}

// ---------- covers ----------

const coverCache = new Map<string, Promise<THREE.Texture>>();
let active = 0;
const waiting: (() => void)[] = [];
async function throttle<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 6) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function generatedCover(game: Game, color: string) {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, color);
  g.addColorStop(1, "#111");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, 228, 228);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = game.name.split(" ");
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    ctx.font = "800 30px system-ui, sans-serif";
    if (last && ctx.measureText(`${last} ${w}`).width < 200) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  lines.forEach((l, i) => {
    fitText(ctx, l, 210, 30, 800);
    ctx.fillText(l, 128, 128 + (i - (lines.length - 1) / 2) * 34);
  });
  return c;
}

const titleCoverCache = new Map<string, THREE.Texture>();
/** A cover with just the title on the box colour (for when art is switched off). */
export function titleCover(game: Game, color: string) {
  const key = `${game.collId}|${color}`;
  let t = titleCoverCache.get(key);
  if (!t) {
    t = finish(generatedCover(game, color));
    titleCoverCache.set(key, t);
  }
  return t;
}

/** Box art as a texture, downscaled to `maxSize` to keep GPU memory in check. */
export function coverTexture(game: Game, color: string, hd: boolean, maxSize: number): Promise<THREE.Texture> {
  const url = hd ? (game.image ?? game.thumbnail) : (game.thumbnail ?? game.image);
  const key = `${game.collId}|${url ?? color}|${maxSize}`;
  let p = coverCache.get(key);
  if (p) return p;

  p = (async () => {
    let source: HTMLCanvasElement;
    let generated = false;
    const src = proxied(url);
    if (src) {
      try {
        const img = await throttle(() => loadImage(src));
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const [c, ctx] = canvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        source = c;
      } catch {
        source = generatedCover(game, color);
        generated = true;
      }
    } else {
      source = generatedCover(game, color);
      generated = true;
    }
    const tex = finish(source);
    tex.userData.generated = generated;
    return tex;
  })();
  coverCache.set(key, p);
  return p;
}

/** Rotate a cover 90° when its aspect doesn't match the face it's drawn on. */
const rotatedCache = new WeakMap<THREE.Texture, THREE.Texture>();
export function orientCover(tex: THREE.Texture, faceU: number, faceV: number) {
  const img = tex.image as HTMLCanvasElement;
  const imgLandscape = img.width > img.height * 1.08;
  const imgPortrait = img.height > img.width * 1.08;
  const faceLandscape = faceU > faceV * 1.08;
  const facePortrait = faceV > faceU * 1.08;
  if (!((imgLandscape && facePortrait) || (imgPortrait && faceLandscape))) return tex;
  let r = rotatedCache.get(tex);
  if (!r) {
    r = tex.clone();
    r.center.set(0.5, 0.5);
    r.rotation = Math.PI / 2;
    r.needsUpdate = true;
    rotatedCache.set(tex, r);
  }
  return r;
}

// ---------- procedural surfaces ----------

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, count: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * amount;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

const surfaceCache = new Map<string, THREE.Texture>();
function surface(key: string, draw: () => HTMLCanvasElement) {
  let t = surfaceCache.get(key);
  if (!t) {
    t = finish(draw());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    surfaceCache.set(key, t);
  }
  return t;
}

export function woodFloor(base: [number, number, number]) {
  return surface(`wood|${base}`, () => {
    const [c, ctx] = canvas(1024, 1024);
    const plankH = 1024 / 8;
    for (let row = 0; row < 8; row++) {
      let x = -((row * 337) % 600);
      while (x < 1024) {
        const len = 500 + ((row * 97 + x) % 300);
        const v = 0.85 + Math.random() * 0.3;
        ctx.fillStyle = `rgb(${base.map((b) => Math.min(255, b * v)).join(",")})`;
        ctx.fillRect(x, row * plankH, len, plankH);
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        for (let g = 0; g < 14; g++) {
          ctx.beginPath();
          const y = row * plankH + Math.random() * plankH;
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + len / 3, y + 6, x + (2 * len) / 3, y - 6, x + len, y + Math.random() * 4);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x, row * plankH, 2, plankH);
        x += len;
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, row * plankH, 1024, 2);
    }
    return c;
  });
}

export function woodGrain(base: [number, number, number]) {
  return surface(`grain|${base}`, () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = `rgb(${base.join(",")})`;
    ctx.fillRect(0, 0, 512, 512);
    for (let g = 0; g < 70; g++) {
      ctx.strokeStyle = `rgba(90,50,20,${0.04 + Math.random() * 0.08})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const y = Math.random() * 512;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + 10 * Math.random(), 340, y - 10 * Math.random(), 512, y);
      ctx.stroke();
    }
    return c;
  });
}

export function brickWall() {
  return surface("brick", () => {
    const [c, ctx] = canvas(1024, 1024);
    ctx.fillStyle = "#cfc6b8";
    ctx.fillRect(0, 0, 1024, 1024);
    const bw = 128, bh = 48, m = 6;
    for (let row = 0; row * bh < 1024; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < 1024; x += bw) {
        const r = 140 + Math.random() * 50, g = 60 + Math.random() * 30, b = 45 + Math.random() * 20;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + m / 2, row * bh + m / 2, bw - m, bh - m);
      }
    }
    noise(ctx, 1024, 1024, 0.12, 30000);
    return c;
  });
}

export function speckled(key: string, color: string, amount = 0.08) {
  return surface(`speckle|${key}`, () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);
    noise(ctx, 512, 512, amount, 40000);
    return c;
  });
}

// ---------- decor ----------

const paintedCache = new Map<string, THREE.Texture>();
/** A one-off canvas texture (art, rugs, signs), drawn once per key. */
export function painted(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  let t = paintedCache.get(key);
  if (!t) {
    const [c, ctx] = canvas(w, h);
    draw(ctx);
    t = finish(c);
    paintedCache.set(key, t);
  }
  return t;
}

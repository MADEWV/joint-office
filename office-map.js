/* ─────────────────────────────────────────────────────────────
   office-map.js · 합동 비서실 2D 탑뷰 오피스 맵 엔진
   - HTML5 Canvas. 월드 좌표(가로 배치 1000×800 / 세로 배치 780×1040)
   - 방·벽·문·가구를 데이터로 만들고, 격자 A*로 문을 지나 실제로 걸어서 이동
   - Firebase의 zone / status 만 읽어 자율 행동(좌석·산책·회의·수면)
   - 기존 앱과의 접점: sync(members) / getPositions() / onSelect(id)
   ───────────────────────────────────────────────────────────── */

const CELL = 10;
const WALL_T = 12;

export const ZONE_LABELS = {
  ceo: "대표실", huchu: "후추 데스크", muse: "뮤즈 데스크",
  flex: "AI 좌석", meeting: "회의실", lounge: "라운지"
};
const ZONE_ACCENT = {
  ceo: "#e4572e", huchu: "#2f9e8f", muse: "#8b5cf6",
  flex: "#7b8794", meeting: "#5b6ee1", lounge: "#c08a2e"
};

/* ── 배치도 ───────────────────────────────────────────────────
   wide: 데스크톱(가로) — 위층 3실 + 중앙 복도 + 아래층 3실
   tall: 모바일(세로)  — 2실/2실/2실 + 복도 2줄
   doors: [방, 면, 위치(0~1), 폭]                                    */
const LAYOUTS = {
  wide: {
    w: 1000, h: 800,
    rooms: {
      ceo:     { x: 0,   y: 0,   w: 325, h: 330 },
      meeting: { x: 325, y: 0,   w: 350, h: 330 },
      lounge:  { x: 675, y: 0,   w: 325, h: 330 },
      huchu:   { x: 0,   y: 420, w: 300, h: 380 },
      muse:    { x: 300, y: 420, w: 320, h: 380 },
      flex:    { x: 620, y: 420, w: 380, h: 380 }
    },
    halls: [{ x: 0, y: 330, w: 1000, h: 90 }],
    doors: [
      ["ceo", "bottom", 0.50, 78],
      ["meeting", "bottom", 0.50, 90],
      ["lounge", "bottom", 0.52, 78],
      ["huchu", "top", 0.56, 78],
      ["muse", "top", 0.48, 78],
      ["flex", "top", 0.42, 90]
    ],
    windows: [
      ["ceo", "top", 0.24, 0.72], ["ceo", "left", 0.28, 0.72],
      ["lounge", "top", 0.30, 0.78], ["lounge", "right", 0.30, 0.74],
      ["huchu", "left", 0.30, 0.74], ["huchu", "bottom", 0.28, 0.7],
      ["muse", "bottom", 0.32, 0.78],
      ["flex", "right", 0.30, 0.74], ["flex", "bottom", 0.30, 0.78]
    ]
  },
  square: {
    w: 1000, h: 960,
    rooms: {
      ceo:     { x: 0,   y: 0,   w: 330, h: 420 },
      meeting: { x: 330, y: 0,   w: 340, h: 420 },
      lounge:  { x: 670, y: 0,   w: 330, h: 420 },
      huchu:   { x: 0,   y: 500, w: 300, h: 460 },
      muse:    { x: 300, y: 500, w: 320, h: 460 },
      flex:    { x: 620, y: 500, w: 380, h: 460 }
    },
    halls: [{ x: 0, y: 420, w: 1000, h: 80 }],
    doors: [
      ["ceo", "bottom", 0.50, 78],
      ["meeting", "bottom", 0.50, 90],
      ["lounge", "bottom", 0.52, 78],
      ["huchu", "top", 0.56, 78],
      ["muse", "top", 0.48, 78],
      ["flex", "top", 0.42, 90]
    ],
    windows: [
      ["ceo", "top", 0.24, 0.72], ["ceo", "left", 0.26, 0.70],
      ["lounge", "top", 0.30, 0.78], ["lounge", "right", 0.30, 0.74],
      ["huchu", "left", 0.30, 0.74], ["huchu", "bottom", 0.28, 0.7],
      ["muse", "bottom", 0.32, 0.78],
      ["flex", "right", 0.30, 0.74], ["flex", "bottom", 0.30, 0.78]
    ]
  },
  tall: {
    w: 780, h: 1040,
    rooms: {
      ceo:     { x: 0,   y: 0,   w: 390, h: 290 },
      meeting: { x: 390, y: 0,   w: 390, h: 290 },
      huchu:   { x: 0,   y: 360, w: 390, h: 300 },
      muse:    { x: 390, y: 360, w: 390, h: 300 },
      lounge:  { x: 0,   y: 730, w: 400, h: 310 },
      flex:    { x: 400, y: 730, w: 380, h: 310 }
    },
    halls: [
      { x: 0, y: 290, w: 780, h: 70 },
      { x: 0, y: 660, w: 780, h: 70 }
    ],
    doors: [
      ["ceo", "bottom", 0.38, 78],
      ["meeting", "bottom", 0.58, 82],
      ["huchu", "top", 0.50, 78], ["huchu", "bottom", 0.46, 78],
      ["muse", "top", 0.50, 78], ["muse", "bottom", 0.54, 78],
      ["lounge", "top", 0.56, 78],
      ["flex", "top", 0.44, 78]
    ],
    windows: [
      ["ceo", "top", 0.26, 0.74], ["ceo", "left", 0.28, 0.72],
      ["meeting", "top", 0.52, 0.88], ["meeting", "right", 0.28, 0.72],
      ["huchu", "left", 0.30, 0.74],
      ["muse", "right", 0.30, 0.74],
      ["lounge", "left", 0.30, 0.74], ["lounge", "bottom", 0.28, 0.72],
      ["flex", "right", 0.30, 0.74], ["flex", "bottom", 0.30, 0.74]
    ]
  }
};

/* ── 색 ───────────────────────────────────────────────────── */
const C = {
  woodA: "#e8cda4", woodB: "#e2c69a", woodLine: "#d2b183",
  carpetA: "#efe5d2", carpetB: "#e9deca",
  hallA: "#efe6d6", hallB: "#e7dcc8", hallLine: "#dccfb8",
  wallTop: "#ddcab0", wallBody: "#bda184", wallEdge: "#96805f", wallShadow: "rgba(96,74,50,.18)",
  deskTop1: "#e3bc8c", deskTop2: "#cfa774", deskEdge: "#a97e4f",
  chair: "#8f93a3", sofa: "#7fa6a0",
  plant: "#4f8f5d", pot: "#cf8b62",
  rug: "#f2e2c8", rugEdge: "#e2caa6"
};

/* ── 작은 유틸 ─────────────────────────────────────────────── */
function rrPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
function fillRR(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  rrPath(ctx, x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function shade(hex, amt) {
  const h = String(hex || "#888888").replace("#", "");
  const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h.padEnd(6, "8").slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function hashStr(s) {
  let h = 2166136261;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/* 가구 그리기 프리미티브 ------------------------------------- */
function drawDesk(ctx, x, y, w, h) {
  fillRR(ctx, x + 2, y + 5, w, h, 6, "rgba(80,58,36,.13)");
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, C.deskTop1); g.addColorStop(1, C.deskTop2);
  fillRR(ctx, x, y, w, h, 6, g, C.deskEdge, 1.2);
  ctx.fillStyle = "rgba(255,255,255,.30)";
  ctx.fillRect(x + 4, y + 2.5, w - 8, 2);
  ctx.fillStyle = "rgba(150,110,66,.30)";
  ctx.fillRect(x + 4, y + h - 3.5, w - 8, 2);
}
function drawMonitor(ctx, x, y, w, h) {
  fillRR(ctx, x + w / 2 - 3.5, y + h * 0.55, 7, h * 0.4, 2.5, "rgba(70,55,40,.35)");
  fillRR(ctx, x, y, w, h, 3, "#3b3f49", "#2b2e36", 1);
  fillRR(ctx, x + 2, y + 2, w - 4, h - 4, 2, "#5ea9d0");
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillRect(x + 3, y + 3, w - 6, 1.6);
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(x + 3, y + h - 4.5, w - 6, 1.4);
}
function drawChair(ctx, cx, cy, s, color, facing) {
  const w = s, h = s * 0.9;
  fillRR(ctx, cx - w / 2 + 1, cy - h / 2 + 3, w, h, 6, "rgba(70,55,40,.14)");
  fillRR(ctx, cx - w / 2, cy - h / 2, w, h, 6, color, shade(color, -0.4), 1);
  fillRR(ctx, cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6, 4, shade(color, 0.2));
  const t = 3.6;
  const back = shade(color, -0.22);
  if (facing === "up") fillRR(ctx, cx - w / 2, cy + h / 2 - t + 1, w, t, 2, back);
  else if (facing === "left") fillRR(ctx, cx + w / 2 - t + 1, cy - h / 2, t, h, 2, back);
  else if (facing === "right") fillRR(ctx, cx - w / 2 - 1, cy - h / 2, t, h, 2, back);
  else fillRR(ctx, cx - w / 2, cy - h / 2 - 1, w, t, 2, back);
}
function drawPlant(ctx, cx, cy, r) {
  ctx.beginPath(); ctx.ellipse(cx + 1, cy + r * 0.45, r * 0.95, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(70,55,40,.14)"; ctx.fill();
  for (let i = 0; i < 7; i++) {
    const ang = -Math.PI / 2 + (i - 3) * 0.44;
    const len = r * (0.82 + (i % 3) * 0.13);
    const ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len * 0.95;
    ctx.beginPath();
    ctx.ellipse((cx + ex) / 2, (cy + ey) / 2, len * 0.4, len * 0.24, ang, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? C.plant : "#437d51";
    ctx.fill();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = C.pot; ctx.fill();
  ctx.strokeStyle = "#a96b47"; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = "#7a4a30"; ctx.fill();
}
function drawShelf(ctx, x, y, w, h) {
  fillRR(ctx, x + 2, y + 4, w, h, 4, "rgba(70,55,40,.13)");
  fillRR(ctx, x, y, w, h, 4, "#b98a5c", "#8e6540", 1.2);
  fillRR(ctx, x + 3, y + 3, w - 6, h - 6, 2, "#e9d7bd");
  const books = ["#c8553d", "#4f7d8c", "#d9a441", "#7a9e6a", "#8b6fb0", "#cf7a52"];
  if (h >= w) {
    let yy = y + 5;
    while (yy < y + h - 7) {
      const bh = Math.min(h - (yy - y) - 6, 8);
      ctx.fillStyle = books[Math.floor(yy) % books.length];
      ctx.fillRect(x + 4.5, yy, w - 9, bh - 1.4);
      yy += 9;
    }
  } else {
    let xx = x + 5;
    while (xx < x + w - 7) {
      const bw = Math.min(w - (xx - x) - 6, 7);
      ctx.fillStyle = books[Math.floor(xx) % books.length];
      ctx.fillRect(xx, y + 4.5, bw - 1.4, h - 9);
      xx += 8;
    }
  }
}
function drawCatTower(ctx, cx, cy, r) {
  ctx.beginPath(); ctx.ellipse(cx + 1, cy + 3, r * 0.98, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(70,55,40,.14)"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.92, r * 0.74, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#e2c096"; ctx.fill();
  ctx.strokeStyle = "#b78f62"; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#cda87c"; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = "#7a5a3c"; ctx.fill();
  // 고양이 장난감 공
  ctx.beginPath(); ctx.arc(cx + r * 0.78, cy - r * 0.55, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = "#e4572e"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx - r * 0.7, cy + r * 0.55, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = "#5b8ec9"; ctx.fill();
}
function drawEasel(ctx, cx, cy, s) {
  ctx.strokeStyle = "rgba(70,55,40,.16)"; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.45, cy + s * 0.3); ctx.lineTo(cx + s * 0.2, cy + s * 0.55); ctx.stroke();
  ctx.strokeStyle = "#b1854f"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.42, cy + s * 0.28); ctx.lineTo(cx - s * 0.2, cy - s * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + s * 0.34, cy + s * 0.34); ctx.lineTo(cx + s * 0.2, cy - s * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.5); ctx.lineTo(cx + s * 0.06, cy - s * 0.4); ctx.stroke();
  fillRR(ctx, cx - s * 0.46, cy - s * 0.5, s * 0.92, s * 0.8, 2, "#fffdf6", "#d7c9b2", 1.2);
  ctx.fillStyle = "#8fbfd6"; ctx.fillRect(cx - s * 0.36, cy - s * 0.36, s * 0.34, s * 0.24);
  ctx.fillStyle = "#e8a13c"; ctx.beginPath(); ctx.arc(cx + s * 0.16, cy - s * 0.2, s * 0.12, 0, 7); ctx.fill();
  ctx.fillStyle = "#c8553d"; ctx.beginPath(); ctx.arc(cx + s * 0.05, cy - s * 0.02, s * 0.09, 0, 7); ctx.fill();
  ctx.fillStyle = "#6f9e6a"; ctx.beginPath(); ctx.arc(cx + s * 0.22, cy + s * 0.02, s * 0.07, 0, 7); ctx.fill();
}
function drawSofa(ctx, x, y, w, h, color) {
  fillRR(ctx, x + 2, y + 4, w, h, 9, "rgba(70,55,40,.14)");
  fillRR(ctx, x, y, w, h, 9, color, shade(color, -0.35), 1.2);
  const pad = 4.5;
  fillRR(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 6, shade(color, 0.16));
  // 쿠션 경계
  const n = Math.max(2, Math.round(w / (h * 1.1)));
  ctx.strokeStyle = shade(color, -0.18); ctx.lineWidth = 1;
  for (let i = 1; i < n; i++) {
    const px = x + pad + (w - pad * 2) * i / n;
    ctx.beginPath(); ctx.moveTo(px, y + pad + 2); ctx.lineTo(px, y + h - pad - 2); ctx.stroke();
  }
}
function drawCoffeeTable(ctx, x, y, w, h) {
  fillRR(ctx, x + 2, y + 4, w, h, 5, "rgba(70,55,40,.13)");
  fillRR(ctx, x, y, w, h, 5, "#e0bb8a", "#b78a56", 1.1);
  fillRR(ctx, x + 3, y + 3, w - 6, h - 6, 3, "rgba(255,255,255,.24)");
  // 머그컵 + 잡지
  ctx.beginPath(); ctx.arc(x + w * 0.28, y + h * 0.5, Math.min(w, h) * 0.15, 0, 7);
  ctx.fillStyle = "#f6f1e6"; ctx.fill(); ctx.strokeStyle = "#c9bda8"; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w * 0.28, y + h * 0.5, Math.min(w, h) * 0.08, 0, 7);
  ctx.fillStyle = "#6d4a33"; ctx.fill();
  fillRR(ctx, x + w * 0.52, y + h * 0.28, w * 0.34, h * 0.44, 2, "#dfe8ee", "#b9c8d2", 1);
  ctx.fillStyle = "rgba(120,150,170,.5)";
  ctx.fillRect(x + w * 0.55, y + h * 0.38, w * 0.26, 2);
  ctx.fillRect(x + w * 0.55, y + h * 0.47, w * 0.2, 2);
}
function drawWhiteboard(ctx, x, y, w, h) {
  fillRR(ctx, x + 2, y + 3, w, h, 3, "rgba(70,55,40,.14)");
  fillRR(ctx, x, y, w, h, 3, "#fbfbfb", "#c9c3b8", 1.2);
  ctx.strokeStyle = "#5b8ec9"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x + w * 0.1, y + h * 0.62); ctx.lineTo(x + w * 0.28, y + h * 0.34);
  ctx.lineTo(x + w * 0.42, y + h * 0.55); ctx.lineTo(x + w * 0.6, y + h * 0.26); ctx.stroke();
  ctx.strokeStyle = "#e4572e"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x + w * 0.66, y + h * 0.34); ctx.lineTo(x + w * 0.9, y + h * 0.34); ctx.stroke();
  ctx.fillStyle = "#7a9e6a";
  ctx.fillRect(x + w * 0.66, y + h * 0.52, w * 0.22, 2.4);
  ctx.fillRect(x + w * 0.66, y + h * 0.66, w * 0.15, 2.4);
}
function drawCounter(ctx, x, y, w, h) {
  fillRR(ctx, x + 2, y + 4, w, h, 4, "rgba(70,55,40,.13)");
  fillRR(ctx, x, y, w, h, 4, "#d8d2c6", "#a9a29a", 1);
  fillRR(ctx, x + 2, y + 2, w - 4, h - 4, 3, "#efeae0");
  // 커피머신
  const mw = Math.min(w * 0.34, 26), mh = Math.min(h * 0.66, 20);
  fillRR(ctx, x + w * 0.5 - mw / 2, y + h * 0.2, mw, mh, 3, "#4a4f57", "#33373d", 1);
  fillRR(ctx, x + w * 0.5 - mw * 0.28, y + h * 0.2 + mh * 0.3, mw * 0.56, mh * 0.3, 1.5, "#b9c3cc");
  ctx.beginPath(); ctx.arc(x + w * 0.2, y + h * 0.55, Math.min(w, h) * 0.12, 0, 7);
  ctx.fillStyle = "#f6f1e6"; ctx.fill(); ctx.strokeStyle = "#c9bda8"; ctx.stroke();
}
function drawPrinter(ctx, x, y, w, h) {
  fillRR(ctx, x + 2, y + 4, w, h, 3, "rgba(70,55,40,.13)");
  fillRR(ctx, x, y, w, h, 3, "#dcd8d0", "#a8a49c", 1);
  fillRR(ctx, x + 3, y + 3, w - 6, h * 0.36, 1, "#c3bfb7");
  ctx.fillStyle = "#fbfaf7"; ctx.fillRect(x + w * 0.3, y + h * 0.12, w * 0.4, h * 0.22);
  ctx.fillStyle = "#8f938f";
  ctx.fillRect(x + w * 0.18, y + h * 0.62, w * 0.16, 3);
  ctx.fillStyle = "#4fbf7a";
  ctx.beginPath(); ctx.arc(x + w * 0.82, y + h * 0.7, 2, 0, 7); ctx.fill();
}
function drawPalette(ctx, x, y, s) {
  ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.66, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = "#e7cba4"; ctx.fill();
  ctx.strokeStyle = "#b78a56"; ctx.lineWidth = 1; ctx.stroke();
  const dots = ["#e4572e", "#e8a13c", "#5b8ec9", "#6f9e6a", "#8b5cf6"];
  dots.forEach((c, i) => {
    const a = -2.4 + i * 0.5;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.36, s * 0.14, 0, 7);
    ctx.fillStyle = c; ctx.fill();
  });
}
function drawBrushCup(ctx, x, y, s) {
  ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, 7);
  ctx.fillStyle = "#cfd6db"; ctx.fill();
  ctx.strokeStyle = "#a7aeb3"; ctx.stroke();
  const cols = ["#b9743f", "#4f6d8c", "#8a5f9e"];
  cols.forEach((c, i) => {
    ctx.strokeStyle = c; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.16 + i * s * 0.16, y + s * 0.1);
    ctx.lineTo(x - s * 0.1 + i * s * 0.16, y - s * 0.5);
    ctx.stroke();
  });
}
function drawMug(ctx, x, y, s) {
  ctx.beginPath(); ctx.arc(x, y, s, 0, 7);
  ctx.fillStyle = "#f7f2e8"; ctx.fill();
  ctx.strokeStyle = "#cabfa9"; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, 7);
  ctx.fillStyle = "#6d4a33"; ctx.fill();
}
function drawKeyboard(ctx, x, y, w, h) {
  fillRR(ctx, x, y, w, h, 2, "#e9e4dc", "#bdb6aa", 0.8);
  ctx.fillStyle = "rgba(150,144,134,.55)";
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 2, y + 2 + i * (h - 4) / 3, w - 4, 1);
}

/* ── 맵 클래스 ─────────────────────────────────────────────── */
export class OfficeMap {
  constructor({ canvas, wrap, onSelect, getMyId, statuses }) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext("2d");
    this.onSelect = onSelect || (() => {});
    this.getMyId = getMyId || (() => null);
    this.statusMap = {};
    (statuses || []).forEach(s => { this.statusMap[s.id] = s.color; });

    this.actors = new Map();
    this.layoutName = null;
    this.world = { w: 1000, h: 800 };
    this.sx = 1; this.sy = 1;
    this.offsetX = 0; this.offsetY = 0;
    this.dpr = 1; this.cssW = 0; this.cssH = 0;
    this.hover = null; this.ripples = [];
    this._wrapCache = new Map();
    this._last = 0;
    this._now = performance.now();

    this._bindPointer();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.wrap);
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  /* ── 크기 / 배치 ───────────────────────────────────────── */
  resize() {
    const w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const aspect = w / h;
    const name = aspect < 0.97 ? "tall" : aspect < 1.16 ? "square" : "wide";
    const sizeChanged = Math.abs(w - this.cssW) > 1 || Math.abs(h - this.cssH) > 1 || dpr !== this.dpr;
    if (name === this.layoutName && !sizeChanged) return;
    this.dpr = dpr; this.cssW = w; this.cssH = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.setLayout(name, name !== this.layoutName);
  }

  setLayout(name) {
    this.layoutName = name;
    const L = LAYOUTS[name];
    this.L = L;
    this.world = { w: L.w, h: L.h };
    this.rooms = {};
    this.halls = L.halls.map(h => ({ ...h }));
    this.solids = [];
    this.items = [];
    this.decals = [];
    this.seats = {};
    this.spots = {};
    this.walls = [];
    this.doors = [];
    this.windows = [];
    this.glass = [];
    this.buildRooms();
    this.buildFurniture();
    this.buildWalls();
    this.buildGrid();
    this.validateSeats();

    const pad = 0.985;
    const rawX = (this.cssW / this.world.w) * pad;
    const rawY = (this.cssH / this.world.h) * pad;
    const fit = Math.min(rawX, rawY) / Math.max(rawX, rawY);
    if (fit >= 0.9) {
      // 거의 맞으면 남는 자리를 채운다(최대 10% 늘어남 — 눈에 띄지 않음)
      this.sx = rawX; this.sy = rawY;
    } else {
      this.sx = this.sy = Math.min(rawX, rawY);
    }
    this.offsetX = (this.cssW - this.world.w * this.sx) / 2;
    this.offsetY = (this.cssH - this.world.h * this.sy) / 2;
    this.renderBackground();
    this._wrapCache.clear();

    // 배치가 바뀌면 캐릭터를 각자의 자리로 순간 이동
    for (const a of this.actors.values()) {
      const z = a.zone || "flex";
      const anchor = this.pickSeat(a, z);
      a.anchor = anchor;
      a.anchorZone = z;
      a.x = anchor.x; a.y = anchor.y;
      a.path = []; a.moving = false; a.seated = !!anchor.sit;
      a.nextThink = this._now + 1200 + Math.random() * 2000;
    }
  }

  buildRooms() {
    for (const [id, r] of Object.entries(this.L.rooms)) {
      this.rooms[id] = { id, ...r, label: ZONE_LABELS[id] || id };
      this.seats[id] = [];
    }
    // 복도도 하나의 '구역'처럼 산책 대상이 된다
    this.halls.forEach(h => {
      h.id = "hall";
      h.label = "복도";
    });
  }

  /* ── 가구 배치 ─────────────────────────────────────────── */
  buildFurniture() {
    for (const id of Object.keys(this.rooms)) {
      const R = this.rooms[id];
      const api = this.roomApi(R);
      switch (id) {
        case "ceo": this.furnCeo(api, R); break;
        case "huchu": this.furnHuchu(api, R); break;
        case "muse": this.furnMuse(api, R); break;
        case "flex": this.furnFlex(api, R); break;
        case "meeting": this.furnMeeting(api, R); break;
        case "lounge": this.furnLounge(api, R); break;
      }
    }
    // 복도: 러너 러그 + 화분 두 개
    this.halls.forEach(h => {
      const rugH = Math.min(26, h.h * 0.42);
      this.decals.push({ draw: ctx => {
        fillRR(ctx, h.x + h.w * 0.12, h.y + h.h / 2 - rugH / 2, h.w * 0.76, rugH, 6,
          "rgba(210,158,110,.24)");
        ctx.strokeStyle = "rgba(180,130,90,.35)";
        ctx.lineWidth = 1.5;
        rrPath(ctx, h.x + h.w * 0.12 + 4, h.y + h.h / 2 - rugH / 2 + 4, h.w * 0.76 - 8, rugH - 8, 4);
        ctx.stroke();
      }});
    });
  }

  roomApi(R) {
    const self = this;
    return {
      R,
      decal(fn) { self.decals.push({ draw: fn }); },
      item(fn) { self.items.push({ draw: fn }); },
      solid(x, y, w, h) { self.solids.push({ x, y, w, h }); },
      seat(zone, x, y, face = "down", sit = true, key = null) {
        self.seats[zone].push({ x, y, face, sit, zone, key: key || `${zone}-${Math.round(x)}-${Math.round(y)}` });
      },
      spot(zone, x, y) {
        if (!self.spots[zone]) self.spots[zone] = [];
        self.spots[zone].push({ x, y });
      }
    };
  }

  furnCeo(A, R) {
    const { item, solid, seat, decal, spot } = A;
    const cx = R.x + R.w * 0.5;
    decal(ctx => {
      fillRR(ctx, cx - R.w * 0.30, R.y + R.h * 0.36, R.w * 0.60, R.h * 0.40, 10, C.rug, C.rugEdge, 1.4);
      fillRR(ctx, cx - R.w * 0.30 + 7, R.y + R.h * 0.36 + 7, R.w * 0.60 - 14, R.h * 0.40 - 14, 7,
        "rgba(255,255,255,.22)");
    });
    const dw = R.w * 0.52, dh = Math.min(R.h * 0.17, 62);
    const dx = cx - dw / 2, dy = R.y + R.h * 0.34;
    item(ctx => {
      drawDesk(ctx, dx, dy, dw, dh);
      drawMonitor(ctx, dx + dw * 0.12, dy + dh * 0.20, dw * 0.30, dh * 0.48);
      drawMonitor(ctx, dx + dw * 0.58, dy + dh * 0.20, dw * 0.30, dh * 0.48);
      drawKeyboard(ctx, cx - dw * 0.17, dy + dh * 0.76, dw * 0.34, dh * 0.14);
      drawMug(ctx, dx + dw * 0.90, dy + dh * 0.80, Math.min(8, dh * 0.15));
      // 대표 명패
      fillRR(ctx, dx + dw * 0.03, dy + dh * 0.72, dw * 0.16, dh * 0.18, 2, "#f3d9a4", "#c9a86a", 1);
    });
    solid(dx, dy, dw, dh);
    const chairY = dy + dh + Math.max(22, R.h * 0.075);
    item(ctx => drawChair(ctx, cx, chairY, Math.min(26, R.w * 0.09), C.chair, "up"));
    seat("ceo", cx, chairY, "up", true, "ceo-chair");

    // 책장 (왼쪽 벽)
    const sw = Math.min(30, R.w * 0.10), sh = R.h * 0.34;
    item(ctx => drawShelf(ctx, R.x + 14, R.y + R.h * 0.30, sw, sh));
    solid(R.x + 14, R.y + R.h * 0.30, sw, sh);
    // 화분 (오른쪽 아래) + 방문객 의자
    item(ctx => drawPlant(ctx, R.x + R.w * 0.85, R.y + R.h * 0.84, Math.min(15, R.w * 0.045) + 4));
    solid(R.x + R.w * 0.85 - 12, R.y + R.h * 0.84 - 12, 24, 24);
    spot("ceo", R.x + 14 + sw + 24, R.y + R.h * 0.46);
    spot("ceo", R.x + R.w * 0.85 - 30, R.y + R.h * 0.80);
    spot("ceo", R.x + R.w * 0.42, R.y + 34);
    seat("ceo", R.x + R.w * 0.72, R.y + R.h * 0.20, "down", false, "ceo-window");
    seat("ceo", R.x + R.w * 0.30, R.y + R.h * 0.83, "up", false, "ceo-shelf");
  }

  furnHuchu(A, R) {
    const { item, solid, seat, decal, spot } = A;
    const cx = R.x + R.w * 0.46;
    decal(ctx => {
      fillRR(ctx, R.x + R.w * 0.16, R.y + R.h * 0.30, R.w * 0.62, R.h * 0.38, 10,
        "#e6f4ee", "#c9e2d8", 1.2);
    });
    const dw = R.w * 0.52, dh = Math.min(R.h * 0.15, 56);
    const dx = cx - dw / 2, dy = R.y + R.h * 0.34;
    item(ctx => {
      drawDesk(ctx, dx, dy, dw, dh);
      drawMonitor(ctx, dx + dw * 0.30, dy + dh * 0.18, dw * 0.36, dh * 0.5);
      drawKeyboard(ctx, dx + dw * 0.30, dy + dh * 0.76, dw * 0.34, dh * 0.14);
      drawMug(ctx, dx + dw * 0.90, dy + dh * 0.78, Math.min(8, dh * 0.15));
      // 후추 스티커
      ctx.font = "700 9px 'Noto Sans KR',sans-serif";
      ctx.fillStyle = "#2f9e8f";
      ctx.fillText("🐾", dx + dw * 0.06, dy + dh * 0.42);
    });
    solid(dx, dy, dw, dh);
    const chairY = dy + dh + Math.max(20, R.h * 0.07);
    item(ctx => drawChair(ctx, cx, chairY, Math.min(25, R.w * 0.09), "#87a9a2", "up"));
    seat("huchu", cx, chairY, "up", true, "huchu-chair");

    // 캣타워
    const tw = Math.min(28, R.w * 0.10);
    item(ctx => drawCatTower(ctx, R.x + R.w * 0.84, R.y + R.h * 0.22, tw));
    solid(R.x + R.w * 0.84 - tw * 0.8, R.y + R.h * 0.22 - tw * 0.7, tw * 1.6, tw * 1.4);
    spot("huchu", R.x + R.w * 0.84 - tw - 18, R.y + R.h * 0.26);
    spot("huchu", R.x + R.w * 0.16 + 26, R.y + R.h * 0.80);
    seat("huchu", R.x + R.w * 0.84, R.y + R.h * 0.44, "up", false, "huchu-cat");
    // 화분 + 낮은 수납장
    item(ctx => drawPlant(ctx, R.x + R.w * 0.16, R.y + R.h * 0.84, Math.min(14, R.w * 0.045) + 4));
    solid(R.x + R.w * 0.16 - 12, R.y + R.h * 0.84 - 12, 24, 24);
    const sw = Math.min(26, R.w * 0.09), sh = R.h * 0.22;
    item(ctx => drawShelf(ctx, R.x + 14, R.y + R.h * 0.24, sw, sh));
    solid(R.x + 14, R.y + R.h * 0.24, sw, sh);
    seat("huchu", R.x + R.w * 0.26, R.y + R.h * 0.62, "down", false, "huchu-stand");
  }

  furnMuse(A, R) {
    const { item, solid, seat, decal, spot } = A;
    const cx = R.x + R.w * 0.40;
    decal(ctx => {
      fillRR(ctx, R.x + R.w * 0.12, R.y + R.h * 0.32, R.w * 0.66, R.h * 0.36, 10,
        "#efe9fb", "#dcd0f4", 1.2);
    });
    const dw = R.w * 0.48, dh = Math.min(R.h * 0.15, 56);
    const dx = cx - dw / 2, dy = R.y + R.h * 0.36;
    item(ctx => {
      drawDesk(ctx, dx, dy, dw, dh);
      drawMonitor(ctx, dx + dw * 0.24, dy + dh * 0.18, dw * 0.32, dh * 0.5);
      drawKeyboard(ctx, dx + dw * 0.24, dy + dh * 0.76, dw * 0.30, dh * 0.14);
      drawPalette(ctx, dx + dw * 0.76, dy + dh * 0.42, Math.min(13, dw * 0.10));
      drawBrushCup(ctx, dx + dw * 0.93, dy + dh * 0.35, Math.min(11, dw * 0.08));
    });
    solid(dx, dy, dw, dh);
    const chairY = dy + dh + Math.max(20, R.h * 0.07);
    item(ctx => drawChair(ctx, cx, chairY, Math.min(25, R.w * 0.09), "#a99cc9", "up"));
    seat("muse", cx, chairY, "up", true, "muse-chair");

    // 이젤
    const ex = R.x + R.w * 0.80, ey = R.y + R.h * 0.62;
    item(ctx => drawEasel(ctx, ex, ey, Math.min(46, R.w * 0.16)));
    solid(ex - 16, ey - 16, 32, 30);
    spot("muse", ex - 44, ey + 26);
    spot("muse", R.x + R.w * 0.15 + 26, R.y + R.h * 0.80);
    seat("muse", ex - 30, ey + 16, "right", false, "muse-easel");
    item(ctx => drawPlant(ctx, R.x + R.w * 0.15, R.y + R.h * 0.84, Math.min(14, R.w * 0.045) + 4));
    solid(R.x + R.w * 0.15 - 12, R.y + R.h * 0.84 - 12, 24, 24);
    seat("muse", R.x + R.w * 0.30, R.y + R.h * 0.20, "down", false, "muse-window");
  }

  furnFlex(A, R) {
    const { item, solid, seat, spot } = A;
    const colX = [0.20, 0.50, 0.80];
    colX.forEach((fx, i) => {
      const cxx = R.x + R.w * fx;
      const dw = Math.min(R.w * 0.23, 92), dh = Math.min(R.h * 0.13, 52);
      const dx = cxx - dw / 2, dy = R.y + R.h * 0.32;
      item(ctx => {
        drawDesk(ctx, dx, dy, dw, dh);
        drawMonitor(ctx, dx + dw * 0.28, dy + dh * 0.2, dw * 0.44, dh * 0.5);
        drawKeyboard(ctx, dx + dw * 0.3, dy + dh * 0.76, dw * 0.4, dh * 0.14);
      });
      solid(dx, dy, dw, dh);
      const chairY = dy + dh + Math.max(20, R.h * 0.065);
      item(ctx => drawChair(ctx, cxx, chairY, Math.min(23, R.w * 0.08), "#9aa3ad", "up"));
      seat("flex", cxx, chairY, "up", true, `flex-chair-${i}`);
    });
    // 프린터 / 화분
    const pw = Math.min(34, R.w * 0.11), ph = Math.min(28, R.h * 0.09);
    const px = R.x + R.w * 0.88, py = R.y + R.h * 0.14;
    item(ctx => drawPrinter(ctx, px - pw / 2, py, pw, ph));
    solid(px - pw / 2, py, pw, ph);
    spot("flex", px - pw / 2 - 22, py + ph + 14);
    spot("flex", R.x + R.w * 0.10 + 26, R.y + R.h * 0.80);
    item(ctx => drawPlant(ctx, R.x + R.w * 0.10, R.y + R.h * 0.84, Math.min(14, R.w * 0.042) + 4));
    solid(R.x + R.w * 0.10 - 12, R.y + R.h * 0.84 - 12, 24, 24);
    seat("flex", R.x + R.w * 0.16, R.y + R.h * 0.20, "down", false, "flex-stand-0");
    seat("flex", R.x + R.w * 0.66, R.y + R.h * 0.80, "down", false, "flex-stand-1");
  }

  furnMeeting(A, R) {
    const { item, solid, seat, spot } = A;
    // 화이트보드 (위쪽 벽)
    const wbW = R.w * 0.42, wbH = Math.min(30, R.h * 0.11);
    item(ctx => drawWhiteboard(ctx, R.x + R.w * 0.5 - wbW / 2, R.y + 16, wbW, wbH));
    spot("meeting", R.x + R.w * 0.5, R.y + 16 + wbH + 22);
    spot("meeting", R.x + R.w * 0.88, R.y + R.h * 0.80);
    // 긴 회의 테이블
    const tw = R.w * 0.56, th = Math.min(R.h * 0.20, 66);
    const tx = R.x + R.w * 0.5 - tw / 2, ty = R.y + R.h * 0.50;
    item(ctx => {
      fillRR(ctx, tx + 3, ty + 6, tw, th, 14, "rgba(80,58,36,.14)");
      const g = ctx.createLinearGradient(0, ty, 0, ty + th);
      g.addColorStop(0, "#e6c293"); g.addColorStop(1, "#cfa974");
      fillRR(ctx, tx, ty, tw, th, 14, g, "#a97e4f", 1.4);
      fillRR(ctx, tx + 6, ty + 5, tw - 12, th - 10, 10, "rgba(255,255,255,.22)");
      // 서류와 컵
      fillRR(ctx, tx + tw * 0.16, ty + th * 0.28, tw * 0.10, th * 0.4, 2, "#fbfaf6", "#ddd5c6", 1);
      fillRR(ctx, tx + tw * 0.62, ty + th * 0.3, tw * 0.12, th * 0.36, 2, "#fbfaf6", "#ddd5c6", 1);
      drawMug(ctx, tx + tw * 0.46, ty + th * 0.5, Math.min(8, th * 0.16));
    });
    solid(tx, ty, tw, th);
    // 위/아래 의자 3+3
    const cw = Math.min(25, R.w * 0.075);
    [0.30, 0.50, 0.70].forEach((f, i) => {
      const x = tx + tw * f;
      const yTop = ty - Math.max(19, cw * 0.8);
      item(ctx => drawChair(ctx, x, yTop, cw, "#8794b8", "down"));
      seat("meeting", x, yTop, "down", true, `meeting-top-${i}`);
      const yBot = ty + th + Math.max(19, cw * 0.8);
      item(ctx => drawChair(ctx, x, yBot, cw, "#8794b8", "up"));
      seat("meeting", x, yBot, "up", true, `meeting-bot-${i}`);
    });
    // 화분 + 유리 파티션
    item(ctx => drawPlant(ctx, R.x + R.w * 0.90, R.y + R.h * 0.86, Math.min(14, R.w * 0.045) + 4));
    solid(R.x + R.w * 0.90 - 12, R.y + R.h * 0.86 - 12, 24, 24);
    this.glass.push(
      { x: R.x + 2, y: R.y + 8, w: 7, h: R.h - 16, dir: "v" },
      { x: R.x + R.w - 9, y: R.y + 8, w: 7, h: R.h - 16, dir: "v" }
    );
    seat("meeting", R.x + R.w * 0.16, R.y + R.h * 0.80, "right", false, "meeting-stand");
  }

  furnLounge(A, R) {
    const { item, solid, seat, decal, spot } = A;
    decal(ctx => {
      fillRR(ctx, R.x + R.w * 0.14, R.y + R.h * 0.40, R.w * 0.72, R.h * 0.48, 14,
        "#fbeed6", "#e6cfa8", 1.4);
      fillRR(ctx, R.x + R.w * 0.14 + 9, R.y + R.h * 0.40 + 9, R.w * 0.72 - 18, R.h * 0.48 - 18, 10,
        "rgba(255,255,255,.28)");
    });
    // L자 소파 — 아래 + 왼쪽
    const sw = R.w * 0.50, sh = Math.min(R.h * 0.15, 52);
    const sx = R.x + R.w * 0.5 - sw / 2, sy = R.y + R.h * 0.78;
    item(ctx => drawSofa(ctx, sx, sy, sw, sh, C.sofa));
    solid(sx, sy, sw, sh);
    const vw = Math.min(R.w * 0.15, 52), vh = R.h * 0.30;
    const vx = R.x + R.w * 0.17, vy = R.y + R.h * 0.52;
    item(ctx => {
      ctx.save();
      ctx.translate(vx + vw / 2, vy + vh / 2);
      ctx.rotate(Math.PI / 2);
      drawSofa(ctx, -vh / 2, -vw / 2, vh, vw, C.sofa);
      ctx.restore();
    });
    solid(vx, vy, vw, vh);
    // 좌석 3 + 커피 테이블 + 커피머신
    seat("lounge", sx + sw * 0.18, sy + sh * 0.42, "up", true, "lounge-sofa-0");
    seat("lounge", sx + sw * 0.5, sy + sh * 0.42, "up", true, "lounge-sofa-1");
    seat("lounge", sx + sw * 0.82, sy + sh * 0.42, "up", true, "lounge-sofa-2");
    const tw = R.w * 0.28, th = Math.min(R.h * 0.16, 46);
    const tx = R.x + R.w * 0.52 - tw / 2, ty = R.y + R.h * 0.55;
    item(ctx => drawCoffeeTable(ctx, tx, ty, tw, th));
    solid(tx, ty, tw, th);
    const cw = R.w * 0.30, ch = Math.min(R.h * 0.12, 34);
    const cxx = R.x + R.w * 0.62 - cw / 2, cyy = R.y + 12;
    item(ctx => drawCounter(ctx, cxx, cyy, cw, ch));
    solid(cxx, cyy, cw, ch);
    spot("lounge", cxx + cw + 20, cyy + ch + 12);
    spot("lounge", R.x + R.w * 0.88 - 28, R.y + R.h * 0.80);
    item(ctx => drawPlant(ctx, R.x + R.w * 0.88, R.y + R.h * 0.86, Math.min(14, R.w * 0.045) + 4));
    solid(R.x + R.w * 0.88 - 12, R.y + R.h * 0.86 - 12, 24, 24);
    seat("lounge", R.x + R.w * 0.30, R.y + R.h * 0.24, "down", false, "lounge-stand-0");
    seat("lounge", R.x + R.w * 0.80, R.y + R.h * 0.66, "down", false, "lounge-stand-1");
  }

  /* ── 벽 · 문 · 창 ──────────────────────────────────────── */
  buildWalls() {
    const segs = new Map();
    const addSeg = (x1, y1, x2, y2) => {
      const key = (y1 === y2)
        ? `h${y1}|${Math.min(x1, x2)}-${Math.max(x1, x2)}`
        : `v${x1}|${Math.min(y1, y2)}-${Math.max(y1, y2)}`;
      if (!segs.has(key)) segs.set(key, { x1, y1, x2, y2 });
    };
    const rects = [...Object.values(this.rooms), ...this.halls];
    for (const r of rects) {
      addSeg(r.x, r.y, r.x + r.w, r.y);
      addSeg(r.x, r.y + r.h, r.x + r.w, r.y + r.h);
      addSeg(r.x, r.y, r.x, r.y + r.h);
      addSeg(r.x + r.w, r.y, r.x + r.w, r.y + r.h);
    }
    // 문(벽의 빈 구간)
    const gaps = [];
    for (const [roomId, side, at, w] of this.L.doors) {
      const r = this.rooms[roomId]; if (!r) continue;
      let g;
      if (side === "bottom" || side === "top") {
        const y = side === "bottom" ? r.y + r.h : r.y;
        const a = r.x + r.w * at - w / 2, b = a + w;
        g = { orient: "h", pos: y, a, b };
        this.doors.push({ orient: "h", x: a, y: y - WALL_T / 2, w: w, h: WALL_T });
      } else {
        const x = side === "right" ? r.x + r.w : r.x;
        const a = r.y + r.h * at - w / 2, b = a + w;
        g = { orient: "v", pos: x, a, b };
        this.doors.push({ orient: "v", x: x - WALL_T / 2, y: a, w: WALL_T, h: w });
      }
      gaps.push(g);
    }
    for (const s of segs.values()) {
      const horizontal = s.y1 === s.y2;
      const pos = horizontal ? s.y1 : s.x1;
      const a0 = horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
      const b0 = horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
      const cuts = gaps
        .filter(g => (g.orient === "h") === horizontal && Math.abs(g.pos - pos) < 0.5)
        .map(g => [Math.max(a0, g.a), Math.min(b0, g.b)])
        .filter(([p, q]) => q > p)
        .sort((p, q) => p[0] - q[0]);
      let cur = a0;
      for (const [p, q] of cuts) {
        if (p > cur) this.walls.push(horizontal
          ? { x1: cur, y1: pos, x2: p, y2: pos }
          : { x1: pos, y1: cur, x2: pos, y2: p });
        cur = Math.max(cur, q);
      }
      if (cur < b0) this.walls.push(horizontal
        ? { x1: cur, y1: pos, x2: b0, y2: pos }
        : { x1: pos, y1: cur, x2: pos, y2: b0 });
    }
    // 창문
    for (const [roomId, side, f0, f1] of this.L.windows) {
      const r = this.rooms[roomId]; if (!r) continue;
      let x, y, w, h;
      if (side === "top" || side === "bottom") {
        const yy = side === "top" ? r.y : r.y + r.h;
        x = r.x + r.w * f0; w = r.w * (f1 - f0); y = yy - WALL_T / 2; h = WALL_T;
      } else {
        const xx = side === "left" ? r.x : r.x + r.w;
        y = r.y + r.h * f0; h = r.h * (f1 - f0); x = xx - WALL_T / 2; w = WALL_T;
      }
      this.windows.push({ x, y, w, h, orient: (side === "top" || side === "bottom") ? "h" : "v" });
    }
    // 바깥 테두리 벽이 문으로 뚫리지 않도록: 문은 내벽에만 두었으므로 그대로.
  }

  /* ── 격자 + A* ─────────────────────────────────────────── */
  buildGrid() {
    const cols = Math.ceil(this.world.w / CELL);
    const rows = Math.ceil(this.world.h / CELL);
    const blocked = new Uint8Array(cols * rows);
    const markRect = (x, y, w, h, pad = 0) => {
      const x0 = Math.max(0, Math.floor((x - pad) / CELL));
      const y0 = Math.max(0, Math.floor((y - pad) / CELL));
      const x1 = Math.min(cols - 1, Math.floor((x + w + pad) / CELL));
      const y1 = Math.min(rows - 1, Math.floor((y + h + pad) / CELL));
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const cx = gx * CELL, cy = gy * CELL;
          if (cx < x + w + pad && cx + CELL > x - pad && cy < y + h + pad && cy + CELL > y - pad) {
            blocked[gy * cols + gx] = 1;
          }
        }
      }
    };
    for (const s of this.walls) {
      if (s.y1 === s.y2) markRect(Math.min(s.x1, s.x2), s.y1 - WALL_T / 2, Math.abs(s.x2 - s.x1), WALL_T, 1);
      else markRect(s.x1 - WALL_T / 2, Math.min(s.y1, s.y2), WALL_T, Math.abs(s.y2 - s.y1), 1);
    }
    for (const s of this.solids) markRect(s.x, s.y, s.w, s.h, 3);
    this.grid = { cols, rows, blocked };
  }

  isFree(x, y) {
    const g = this.grid; if (!g) return false;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return false;
    return !g.blocked[cy * g.cols + cx];
  }

  nearestFree(x, y) {
    if (this.isFree(x, y)) return { x, y };
    const g = this.grid;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const gx = cx + dx, gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= g.cols || gy >= g.rows) continue;
          if (!g.blocked[gy * g.cols + gx]) {
            return { x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 };
          }
        }
      }
    }
    return null;
  }

  validateSeats() {
    for (const zone of Object.keys(this.seats)) {
      for (const s of this.seats[zone]) {
        const f = this.nearestFree(s.x, s.y);
        if (f) { s.x = f.x; s.y = f.y; }
      }
    }
  }

  lineClear(ax, ay, bx, by, radius = 8) {
    const dx = bx - ax, dy = by - ay;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return this.isFree(ax, ay);
    const steps = Math.max(1, Math.ceil(d / 6));
    const nx = -dy / d, ny = dx / d;
    for (let k = 1; k <= steps; k++) {
      const x = ax + dx * k / steps, y = ay + dy * k / steps;
      if (!this.isFree(x, y)) return false;
      if (!this.isFree(x + nx * radius, y + ny * radius)) return false;
      if (!this.isFree(x - nx * radius, y - ny * radius)) return false;
    }
    return true;
  }

  findPath(sx, sy, tx, ty) {
    const g = this.grid;
    if (!g) return null;
    const start = this.nearestFree(sx, sy);
    const goal = this.nearestFree(tx, ty);
    if (!start || !goal) return null;
    const s = Math.floor(start.y / CELL) * g.cols + Math.floor(start.x / CELL);
    const t = Math.floor(goal.y / CELL) * g.cols + Math.floor(goal.x / CELL);
    if (s === t) return [{ x: tx, y: ty }];

    const N = g.cols * g.rows;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const tx0 = t % g.cols, ty0 = Math.floor(t / g.cols);
    const hfn = (i) => {
      const x = i % g.cols, y = Math.floor(i / g.cols);
      const dx = Math.abs(x - tx0), dy = Math.abs(y - ty0);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    gScore[s] = 0;
    heap.push(s, hfn(s));
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
    ];
    let found = false;
    let guard = 0;
    while (heap.size && guard++ < 20000) {
      const cur = heap.pop();
      if (cur === t) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % g.cols, cy = Math.floor(cur / g.cols);
      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
        const ni = ny * g.cols + nx;
        if (g.blocked[ni] || closed[ni]) continue;
        if (dx && dy) {
          // 대각선은 모서리를 자르지 않을 때만
          if (g.blocked[cy * g.cols + nx] || g.blocked[ny * g.cols + cx]) continue;
        }
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + hfn(ni));
        }
      }
    }
    if (!found) return null;

    const pts = [];
    let cur = t;
    while (cur !== -1 && cur !== s) {
      pts.push({ x: (cur % g.cols) * CELL + CELL / 2, y: Math.floor(cur / g.cols) * CELL + CELL / 2 });
      cur = came[cur];
      if (pts.length > 4000) break;
    }
    pts.reverse();
    pts.push({ x: tx, y: ty });
    return this.smoothPath([{ x: sx, y: sy }, ...pts]);
  }

  smoothPath(pts) {
    if (pts.length <= 2) return pts.slice(1);
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        if (this.lineClear(pts[i].x, pts[i].y, pts[j].x, pts[j].y, 7)) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /* ── 좌석 배정 ─────────────────────────────────────────── */
  anchorsOf(zone) {
    if (this.seats[zone] && this.seats[zone].length) return this.seats[zone];
    const fallback = this.seats.flex;
    return fallback && fallback.length ? fallback : [{ x: this.world.w / 2, y: this.world.h / 2, sit: false, zone: "flex" }];
  }

  pickSeat(actor, zone) {
    const list = this.anchorsOf(zone);
    const taken = new Set();
    for (const o of this.actors.values()) {
      if (o === actor) continue;
      if (o.anchor && o.anchor.zone === zone) taken.add(o.anchor.key);
    }
    // 앉는 자리(의자·소파)를 먼저 채우고, 그다음 서 있는 자리
    const ordered = [...list.filter(s => s.sit), ...list.filter(s => !s.sit)];
    for (const s of ordered) if (!taken.has(s.key)) return s;
    return ordered[0];
  }

  roomOf(zone) {
    if (zone === "hall") return this.halls[0];
    return this.rooms[zone] || null;
  }

  /* ── 멤버 동기화 ──────────────────────────────────────── */
  sync(members) {
    const list = Object.entries(members || {})
      .filter(([, m]) => m && typeof m === "object")
      .sort((a, b) => (Number(a[1].order) || 99) - (Number(b[1].order) || 99));

    for (const [id, m] of list) {
      let a = this.actors.get(id);
      if (!a) {
        a = {
          id, x: 0, y: 0, path: [], moving: false, seated: false,
          facing: "down", phase: Math.random() * 6, speed: 58,
          alpha: 0, alphaTarget: 1, nextThink: this._now + 800 + Math.random() * 1800,
          goalKind: "seat", sitOnArrive: true, status: "idle", zone: "flex",
          name: id, emoji: "🙂", color: "#8d8f9c", message: "", order: 99
        };
        this.actors.set(id, a);
        const z = this.normZone(m.zone);
        a.zone = z; a.anchorZone = z;
        a.anchor = this.pickSeat(a, z);
        a.x = a.anchor.x; a.y = a.anchor.y;
        a.seated = true;
        a.nextThink = this._now + 1500 + Math.random() * 3000;
      }
      a.member = m;
      const prevZone = a.zone, prevStatus = a.status;
      a.zone = this.normZone(m.zone);
      a.status = this.normStatus(m.status);
      a.name = String(m.name || id);
      a.emoji = m.emoji || "🙂";
      a.color = /^#[0-9a-f]{3,8}$/i.test(m.color || "") ? m.color : "#8d8f9c";
      a.message = String(m.message || "");
      a.order = Number(m.order) || 99;
      a.alphaTarget = a.status === "offline" ? 0.62 : 1;

      if (prevZone !== a.zone || prevStatus !== a.status) {
        a.anchor = this.pickSeat(a, a.zone);
        a.anchorZone = a.zone;
        this.retarget(a, prevZone !== a.zone ? "transit" : "status");
      }
    }
    // 사라진 멤버 정리
    for (const id of [...this.actors.keys()]) {
      if (!members || !members[id]) this.actors.delete(id);
    }
  }

  normZone(z) {
    return Object.prototype.hasOwnProperty.call(this.seats, z) ? z : "flex";
  }
  normStatus(s) {
    return ["working", "idle", "meeting", "rest", "offline"].includes(s) ? s : "idle";
  }

  retarget(a, reason) {
    const now = this._now;
    const zone = a.zone;
    a.goalKind = "seat";
    a.seated = false;
    if (a.status === "offline") {
      this.goTo(a, a.anchor, true);
      a.speed = 54;
      a.nextThink = now + 20000;
      return;
    }
    if (a.status === "meeting" || zone === "meeting") {
      this.goTo(a, this.pickSeat(a, "meeting"), true);
      a.speed = reason === "transit" ? 74 : 58;
      a.nextThink = now + 6000;
      return;
    }
    if (a.status === "idle" || a.status === "rest") {
      a.speed = 44;
      if (a.status === "rest" && Math.random() < 0.6) {
        this.goTo(a, this.pickSeat(a, "lounge"), true);
      } else {
        this.goTo(a, a.anchor, false);
      }
      a.nextThink = now + 2500 + Math.random() * 3000;
      return;
    }
    // working
    a.speed = reason === "transit" ? 70 : 56;
    this.goTo(a, a.anchor, true);
    a.nextThink = now + 4000 + Math.random() * 4000;
  }

  goTo(a, target, sitOnArrive) {
    if (!target) return;
    a.sitOnArrive = !!sitOnArrive;
    a.path = this.findPath(a.x, a.y, target.x, target.y) || [];
    a.tx = target.x; a.ty = target.y;
    if (!a.path.length) {
      // 이미 도착했거나 경로가 없으면 그 자리에서
      if (Math.hypot(target.x - a.x, target.y - a.y) < 6) {
        a.x = target.x; a.y = target.y; a.seated = a.sitOnArrive;
      } else {
        a.seated = false;
      }
    }
  }

  /* ── 자율 행동 ─────────────────────────────────────────── */
  decide(a) {
    const now = this._now;
    a.nextThink = now + 2200 + Math.random() * 3200;
    if (a.status === "offline") { a.nextThink = now + 12000; return; }

    if (a.status === "meeting" || a.zone === "meeting") {
      if (!a.seated) { this.goTo(a, this.pickSeat(a, "meeting"), true); a.nextThink = now + 1200; }
      else if (Math.random() < 0.12) this.strollNear(a, "meeting");   // 화이트보드 앞으로 잠깐
      return;
    }

    if (a.status === "idle" || a.status === "rest") {
      const r = Math.random();
      if (r < 0.40) this.wanderIn(a, a.zone, 40);
      else if (r < 0.66) this.wanderIn(a, Math.random() < 0.5 ? "hall" : this.otherZone(a.zone), 40);
      else if (r < 0.84) {
        const spot = this.rooms.lounge ? this.pickSeat(a, "lounge") : null;
        if (spot) this.goTo(a, spot, true);
      } else {
        this.goTo(a, a.anchor, true);
      }
      a.speed = 40 + Math.random() * 8;
      return;
    }

    // working — 대부분 자리에, 가끔 자리 주변 산책
    if (Math.random() < 0.60 || !this.rooms[a.zone]) {
      if (Math.hypot(a.anchor.x - a.x, a.anchor.y - a.y) > 8) this.goTo(a, a.anchor, true);
      else a.seated = true;
    } else {
      this.strollNear(a, a.zone);
    }
    a.speed = 54 + Math.random() * 8;
  }

  otherZone(zone) {
    const list = Object.keys(this.rooms).filter(z => z !== zone);
    return list[Math.floor(Math.random() * list.length)] || "flex";
  }

  wanderIn(a, zone, speed) {
    const r = this.roomOf(zone);
    if (!r) return;
    const spot = this.randomSpot(r);
    if (spot) { this.goTo(a, spot, false); a.speed = speed; a.goalKind = "stroll"; }
  }

  strollNear(a, zone) {
    const r = this.roomOf(zone);
    if (!r) return;
    // 1) 소품(화분·책장·프린터·이젤·캣타워·화이트보드) 쪽으로 잠깐
    const pool = (this.spots[zone] || []).slice();
    for (let i = 0; i < 6 && pool.length; i++) {
      const sp = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const jx = sp.x + (Math.random() - 0.5) * 18;
      const jy = sp.y + (Math.random() - 0.5) * 18;
      if (!this.isFree(jx, jy)) continue;
      if (Math.hypot(jx - a.x, jy - a.y) < 26) continue;
      const p = this.findPath(a.x, a.y, jx, jy);
      if (p && p.length) {
        a.path = p; a.seated = false; a.sitOnArrive = false; a.goalKind = "stroll";
        a.speed = 50 + Math.random() * 10;
        return;
      }
    }
    // 2) 아니면 자리 주변을 살짝
    for (let i = 0; i < 8; i++) {
      const spot = this.randomSpot(r, 40);
      if (!spot) break;
      if (Math.hypot(spot.x - a.x, spot.y - a.y) < 30) continue;
      if (Math.hypot(spot.x - a.anchor.x, spot.y - a.anchor.y) > 150) continue;
      const p = this.findPath(a.x, a.y, spot.x, spot.y);
      if (p && p.length) {
        a.path = p; a.seated = false; a.sitOnArrive = false; a.goalKind = "stroll";
        a.speed = 50 + Math.random() * 10;
        return;
      }
    }
  }

  randomSpot(r, inset = 34) {
    const pad = Math.min(inset, r.w / 4, r.h / 4);
    for (let i = 0; i < 26; i++) {
      const x = r.x + pad + Math.random() * (r.w - pad * 2);
      const y = r.y + pad + Math.random() * (r.h - pad * 2);
      if (!this.isFree(x, y)) continue;
      if (!this.isFree(x + 9, y) || !this.isFree(x - 9, y) || !this.isFree(x, y + 9) || !this.isFree(x, y - 9)) continue;
      return { x, y };
    }
    return null;
  }

  /* ── 프레임 루프 ───────────────────────────────────────── */
  _frame(ts) {
    requestAnimationFrame(this._frame);
    const now = performance.now();
    const dt = Math.min(0.06, Math.max(0, (now - (this._last || now)) / 1000));
    this._last = now;
    this._now = now;
    if (!this.layoutName) return;
    if (document.hidden) return;
    if (!this.wrap.clientHeight) return;      // 모바일 대화방 탭 등 숨김 상태
    this.update(dt, now);
    this.draw(now);
  }

  update(dt, now) {
    for (const a of this.actors.values()) {
      if (a.alphaTarget > a.alpha) a.alpha = Math.min(a.alphaTarget, a.alpha + dt * 2.2);
      else if (a.alphaTarget < a.alpha) a.alpha = Math.max(a.alphaTarget, a.alpha - dt * 2.2);

      if (a.path && a.path.length) {
        a.moving = true;
        a.seated = false;
        let budget = a.speed * dt;
        while (budget > 0 && a.path.length) {
          const p = a.path[0];
          const dx = p.x - a.x, dy = p.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.8) { a.x = p.x; a.y = p.y; a.path.shift(); continue; }
          if (Math.abs(dx) > Math.abs(dy)) a.facing = dx > 0 ? "right" : "left";
          else a.facing = dy > 0 ? "down" : "up";
          const step = Math.min(d, budget);
          a.x += dx / d * step;
          a.y += dy / d * step;
          budget -= step;
          a.phase += dt * 7;
          if (d - step < 0.8) { a.path.shift(); }
        }
        if (!a.path.length) this.arrive(a, now);
      } else {
        a.moving = false;
        if (now >= a.nextThink) this.decide(a);
      }
    }
    // 겹침 방지
    const list = [...this.actors.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (!a.alpha || !b.alpha) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = 20;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const ux = dx / d, uy = dy / d;
          if (!a.seated || b.seated) this._slide(a, -ux * push, -uy * push);
          if (!b.seated || a.seated) this._slide(b, ux * push, uy * push);
        }
      }
    }
    // 클릭 이동 잔물결
    this.ripples = this.ripples.filter(r => now - r.t < 620);
  }

  _slide(a, dx, dy) {
    const nx = a.x + dx, ny = a.y + dy;
    if (this.isFree(nx, ny)) { a.x = nx; a.y = ny; }
  }

  arrive(a, now) {
    a.moving = false;
    a.seated = !!a.sitOnArrive;
    a.goalKind = "seat";
    a.nextThink = now + (a.status === "offline" ? 15000 : 2600 + Math.random() * 4600);
    if (a.path.length === 0 && a.sitOnArrive) a.seated = true;
  }

  /* ── 그리기 ───────────────────────────────────────────── */
  renderBackground() {
    const sX = this.sx * this.dpr, sY = this.sy * this.dpr;
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(this.world.w * sX));
    cv.height = Math.max(1, Math.round(this.world.h * sY));
    const ctx = cv.getContext("2d");
    ctx.setTransform(sX, 0, 0, sY, 0, 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // 바닥
    for (const r of Object.values(this.rooms)) this.drawFloor(ctx, r);
    for (const h of this.halls) this.drawHallFloor(ctx, h);

    // 러그
    for (const d of this.decals) d.draw(ctx);
    // 가구
    for (const it of this.items) it.draw(ctx);
    // 벽
    for (const s2 of this.walls) this.drawWall(ctx, s2);
    // 문턱
    for (const d of this.doors) this.drawDoor(ctx, d);
    // 유리 파티션
    for (const g of this.glass) {
      fillRR(ctx, g.x, g.y, g.w, g.h, 3, "rgba(178,224,236,.30)");
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.4;
      for (let y = g.y + 6; y < g.y + g.h - 4; y += 16) {
        ctx.beginPath(); ctx.moveTo(g.x + 1, y); ctx.lineTo(g.x + g.w - 1, y + 6); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(140,190,205,.55)"; ctx.lineWidth = 1;
      ctx.strokeRect(g.x, g.y, g.w, g.h);
    }
    // 창문
    for (const w of this.windows) {
      fillRR(ctx, w.x, w.y, w.w, w.h, 2, "#cfe9ef", "rgba(160,190,200,.8)", 1);
      ctx.fillStyle = "rgba(255,255,255,.72)";
      if (w.orient === "h") {
        ctx.fillRect(w.x + 4, w.y + w.h * 0.5 - 1, w.w - 8, 1.6);
        ctx.fillRect(w.x + w.w * 0.5 - 1, w.y + 1, 1.6, w.h - 2);
      } else {
        ctx.fillRect(w.x + w.w * 0.5 - 1, w.y + 4, 1.6, w.h - 8);
        ctx.fillRect(w.x + 1, w.y + w.h * 0.5 - 1, w.w - 2, 1.6);
      }
    }
    // 방마다 은은한 조명
    for (const r of Object.values(this.rooms)) {
      const g = ctx.createRadialGradient(
        r.x + r.w * 0.5, r.y + r.h * 0.45, 12,
        r.x + r.w * 0.5, r.y + r.h * 0.5, Math.max(r.w, r.h) * 0.72);
      g.addColorStop(0, "rgba(255,246,226,.30)");
      g.addColorStop(1, "rgba(255,246,226,0)");
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    // 바깥 테두리 그림자
    ctx.save();
    ctx.strokeStyle = "rgba(120,96,68,.22)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, this.world.w - 3, this.world.h - 3);
    ctx.restore();

    this.bg = cv;
  }

  drawFloor(ctx, r) {
    const carpet = r.id === "lounge" || r.id === "flex";
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    if (!carpet) {
      ctx.fillStyle = C.woodA; ctx.fillRect(r.x, r.y, r.w, r.h);
      const ph = 26;
      let i = 0;
      for (let y = r.y; y < r.y + r.h; y += ph, i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,.055)" : "rgba(133,96,52,.05)";
        ctx.fillRect(r.x, y, r.w, ph);
        ctx.strokeStyle = "rgba(150,112,64,.20)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(r.x, y + 0.5); ctx.lineTo(r.x + r.w, y + 0.5); ctx.stroke();
        const off = (i * 137) % 190;
        for (let x = r.x + off; x < r.x + r.w; x += 190) {
          ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + ph); ctx.stroke();
        }
      }
    } else {
      ctx.fillStyle = C.carpetA; ctx.fillRect(r.x, r.y, r.w, r.h);
      const t = 34;
      for (let y = r.y, j = 0; y < r.y + r.h; y += t, j++) {
        for (let x = r.x, k = 0; x < r.x + r.w; x += t, k++) {
          ctx.fillStyle = ((j + k) % 2) ? "rgba(210,196,172,.30)" : "rgba(255,255,255,.26)";
          ctx.fillRect(x, y, t, t);
        }
      }
      ctx.fillStyle = "rgba(255,255,255,.10)";
      for (let k = 0; k < 40; k++) {
        const x = r.x + ((k * 97) % r.w), y = r.y + ((k * 173) % r.h);
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }
    ctx.restore();
  }

  drawHallFloor(ctx, h) {
    ctx.save();
    ctx.beginPath(); ctx.rect(h.x, h.y, h.w, h.h); ctx.clip();
    ctx.fillStyle = C.hallA; ctx.fillRect(h.x, h.y, h.w, h.h);
    const t = 38;
    for (let y = h.y, j = 0; y < h.y + h.h; y += t, j++) {
      for (let x = h.x, k = 0; x < h.x + h.w; x += t, k++) {
        ctx.fillStyle = (j + k) % 2 ? "rgba(210,198,176,.34)" : "rgba(255,255,255,.22)";
        ctx.fillRect(x, y, t, t);
      }
    }
    ctx.strokeStyle = "rgba(170,152,122,.20)"; ctx.lineWidth = 1;
    for (let x = h.x; x <= h.x + h.w; x += t) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, h.y); ctx.lineTo(x + 0.5, h.y + h.h); ctx.stroke();
    }
    ctx.restore();
  }

  drawWall(ctx, s) {
    const horizontal = s.y1 === s.y2;
    const x = horizontal ? Math.min(s.x1, s.x2) : s.x1 - WALL_T / 2;
    const y = horizontal ? s.y1 - WALL_T / 2 : Math.min(s.y1, s.y2);
    const w = horizontal ? Math.abs(s.x2 - s.x1) : WALL_T;
    const h = horizontal ? WALL_T : Math.abs(s.y2 - s.y1);
    ctx.fillStyle = C.wallShadow;
    if (horizontal) ctx.fillRect(x + 1, y + 3, w + 1, h);
    else ctx.fillRect(x + 3, y + 1, w, h + 1);
    ctx.fillStyle = C.wallBody;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.wallTop;
    if (horizontal) ctx.fillRect(x, y, w, 4.5);
    else ctx.fillRect(x, y, 4.5, h);
    ctx.strokeStyle = C.wallEdge; ctx.lineWidth = 1;
    if (horizontal) {
      ctx.beginPath(); ctx.moveTo(x, y + h - 0.5); ctx.lineTo(x + w, y + h - 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + w, y + 0.5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(x + w - 0.5, y); ctx.lineTo(x + w - 0.5, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + h); ctx.stroke();
    }
  }

  drawDoor(ctx, d) {
    if (d.orient === "h") {
      fillRR(ctx, d.x, d.y + 1, d.w, d.h - 2, 2, "#f4e6cf");
      ctx.strokeStyle = "rgba(180,150,110,.55)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(d.x, d.y + d.h / 2); ctx.lineTo(d.x + d.w, d.y + d.h / 2); ctx.stroke();
      ctx.fillStyle = "rgba(120,96,70,.35)";
      ctx.fillRect(d.x - 1, d.y + 2, 2, d.h - 4);
      ctx.fillRect(d.x + d.w - 1, d.y + 2, 2, d.h - 4);
    } else {
      fillRR(ctx, d.x + 1, d.y, d.w - 2, d.h, 2, "#f4e6cf");
      ctx.strokeStyle = "rgba(180,150,110,.55)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(d.x + d.w / 2, d.y); ctx.lineTo(d.x + d.w / 2, d.y + d.h); ctx.stroke();
      ctx.fillStyle = "rgba(120,96,70,.35)";
      ctx.fillRect(d.x + 2, d.y - 1, d.w - 4, 2);
      ctx.fillRect(d.x + 2, d.y + d.h - 1, d.w - 4, 2);
    }
  }

  /* 화면 좌표 변환 */
  toScreen(x, y) {
    return { x: this.offsetX + x * this.sx, y: this.offsetY + y * this.sy };
  }
  toWorld(x, y) {
    return { x: (x - this.offsetX) / this.sx, y: (y - this.offsetY) / this.sy };
  }

  draw(now) {
    this.frames = (this.frames || 0) + 1;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.cssW, H = this.cssH;
    // 바깥 배경 (책상 위 도면 느낌)
    ctx.fillStyle = "#f3ecdf";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(160,138,108,.16)";
    const step = 26;
    for (let y = 6; y < H; y += step) {
      for (let x = 6; x < W; x += step) {
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }
    if (this.bg) {
      ctx.drawImage(this.bg, this.offsetX, this.offsetY,
        this.world.w * this.sx, this.world.h * this.sy);
    }

    // 캐릭터 (월드 좌표)
    ctx.save();
    ctx.setTransform(this.dpr * this.sx, 0, 0, this.dpr * this.sy,
      this.dpr * this.offsetX, this.dpr * this.offsetY);
    const actors = [...this.actors.values()].filter(a => a.alpha > 0.01);
    actors.sort((p, q) => p.y - q.y);
    for (const a of actors) this.drawActorWorld(ctx, a);
    // 클릭 잔물결
    for (const r of this.ripples) {
      const p = (now - r.t) / 620;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 6 + p * 20, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(228,87,46,${0.55 * (1 - p)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    // 라벨 · 말풍선 (화면 좌표: 어느 화면에서나 읽히는 크기)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawRoomLabels(ctx);
    this.drawActorLabels(ctx, actors);
  }

  drawActorWorld(ctx, a) {
    const color = a.color || "#8d8f9c";
    const seated = a.seated;
    const moving = a.moving;
    const swing = moving ? Math.sin(a.phase * 2.2) : 0;
    const bob = moving ? Math.abs(Math.sin(a.phase * 2.2)) * 1.4 : 0;
    const footY = a.y;
    const bodyB = footY - (seated ? 3 : 0) - bob;
    const bodyH = seated ? 14 : 16;
    const bodyW = seated ? 19 : 18;
    const bodyT = bodyB - bodyH;
    const headR = 9.2;
    const headY = bodyT - headR + 2.2;

    ctx.save();
    ctx.globalAlpha = a.alpha;
    // 캐릭터를 발끝 기준으로 키운다 (가구·방 대비 잘 보이도록)
    const S = 1.35;
    ctx.translate(a.x, footY);
    ctx.scale(S, S);
    ctx.translate(-a.x, -footY);

    // 그림자
    ctx.beginPath();
    ctx.ellipse(a.x, footY + 1.5, 10.5, 4.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(58,42,28,.20)";
    ctx.fill();

    // 호버 링
    if (this.hover === a.id) {
      ctx.beginPath();
      ctx.ellipse(a.x, footY - 1, 15, 8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(228,87,46,.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(a.x, footY - 1, 11, 5.5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 다리
    if (!seated) {
      fillRR(ctx, a.x - 6.2 + swing * 2.0, footY - 10, 5.2, 10, 2.4, "#4a4550");
      fillRR(ctx, a.x + 1.0 - swing * 2.0, footY - 10, 5.2, 10, 2.4, "#413c48");
      fillRR(ctx, a.x - 6.2 + swing * 2.0, footY - 2.2, 5.6, 3, 1.5, "#2f2b35");
      fillRR(ctx, a.x + 0.8 - swing * 2.0, footY - 2.2, 5.6, 3, 1.5, "#2a2731");
    }

    // 팔
    fillRR(ctx, a.x - bodyW / 2 - 2.6, bodyT + 3.5 - swing * 1.4, 4.6, 8.4, 2.3, shade(color, -0.14));
    fillRR(ctx, a.x + bodyW / 2 - 2.0, bodyT + 3.5 + swing * 1.4, 4.6, 8.4, 2.3, shade(color, -0.14));

    // 몸통
    const g = ctx.createLinearGradient(0, bodyT, 0, bodyB);
    g.addColorStop(0, shade(color, 0.22));
    g.addColorStop(1, shade(color, -0.06));
    // 밝은 바닥 위에서도 또렷하게: 흰 테두리 한 겹
    fillRR(ctx, a.x - bodyW / 2 - 1.4, bodyT - 1.4, bodyW + 2.8, bodyH + 2.8, 8, "rgba(255,255,255,.82)");
    fillRR(ctx, a.x - bodyW / 2, bodyT, bodyW, bodyH, 7, g, shade(color, -0.32), 1);

    // 목/칼라
    fillRR(ctx, a.x - 4.4, bodyT + 0.4, 8.8, 3.4, 1.7, "rgba(255,255,255,.62)");

    // 머리
    ctx.beginPath();
    ctx.arc(a.x, headY, headR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffe3c9";
    ctx.fill();
    ctx.strokeStyle = "rgba(122,88,60,.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(a.x, headY, headR + 1.2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 머리카락 (윗면)
    ctx.beginPath();
    ctx.arc(a.x, headY - 0.6, headR - 0.2, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fillStyle = shade(color, -0.28);
    ctx.fill();
    // 앞머리 결
    ctx.beginPath();
    ctx.moveTo(a.x - headR + 1.5, headY - 2.2);
    ctx.quadraticCurveTo(a.x, headY - 5.2, a.x + headR - 1.5, headY - 2.2);
    ctx.strokeStyle = shade(color, -0.42);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 눈 · 입 · 볼
    const ex = a.facing === "left" ? -1.4 : a.facing === "right" ? 1.4 : 0;
    const eyeY = headY + 1.6;
    ctx.fillStyle = "#3a3230";
    ctx.beginPath(); ctx.arc(a.x - 3.1 + ex, eyeY, 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(a.x + 3.1 + ex, eyeY, 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(90,60,50,.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(a.x + ex * 0.8, eyeY + 2.2, 2.0, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "rgba(240,140,130,.28)";
    ctx.beginPath(); ctx.arc(a.x - 5.4 + ex, eyeY + 2.4, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(a.x + 5.4 + ex, eyeY + 2.4, 1.6, 0, Math.PI * 2); ctx.fill();

    // 오프라인 수면 표시
    if (a.status === "offline") {
      ctx.globalAlpha = a.alpha * 0.9;
      ctx.fillStyle = "#6b7a8c";
      ctx.font = "700 9px 'Noto Sans KR',sans-serif";
      ctx.fillText("z", a.x + 9, headY - 9);
      ctx.fillText("z", a.x + 14, headY - 15);
    }
    ctx.restore();
  }

  drawRoomLabels(ctx) {
    ctx.save();
    ctx.font = "700 10px 'Noto Sans KR',system-ui,sans-serif";
    ctx.textBaseline = "middle";
    for (const r of Object.values(this.rooms)) {
      const p = this.toScreen(r.x + 10, r.y + 11);
      const text = (ZONE_LABELS[r.id] || r.id);
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = "rgba(255,253,248,.72)";
      fillRR(ctx, p.x, p.y - 8, w, 16, 8, "rgba(255,253,248,.74)", "rgba(140,120,96,.18)", 1);
      ctx.fillStyle = "rgba(105,96,86,.92)";
      ctx.fillText(text, p.x + 7, p.y + 0.5);
      // 구역 색 점
      ctx.beginPath();
      ctx.arc(p.x + w - 6.5, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = ZONE_ACCENT[r.id] || "#999";
      ctx.fill();
    }
    ctx.restore();
  }

  wrapBubble(ctx, text, maxW) {
    const key = text + "|" + Math.round(maxW);
    if (this._wrapCache.has(key)) return this._wrapCache.get(key);
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    const pushLine = () => { if (cur) { lines.push(cur); cur = ""; } };
    for (let word of words) {
      // 한 단어가 너무 길면 글자 단위로 쪼갠다 (한글 대응)
      while (ctx.measureText(word).width > maxW) {
        let i = 1;
        while (i < word.length && ctx.measureText(word.slice(0, i + 1)).width <= maxW) i++;
        if (cur) { pushLine(); }
        lines.push(word.slice(0, i));
        word = word.slice(i);
        if (!word) break;
      }
      if (!word) continue;
      const test = cur ? cur + " " + word : word;
      if (ctx.measureText(test).width <= maxW) cur = test;
      else { pushLine(); cur = word; }
      if (lines.length >= 2) break;
    }
    pushLine();
    let trimmed = false;
    if (lines.length > 2) { lines.length = 2; trimmed = true; }
    const res = { lines: lines.slice(0, 2), trimmed };
    if (this._wrapCache.size > 300) this._wrapCache.clear();
    this._wrapCache.set(key, res);
    return res;
  }

  drawActorLabels(ctx, actors) {
    const myId = this.getMyId();
    const placed = [];
    const order = [...actors].sort((a, b) => a.y - b.y);
    const CVPAD = 3;
    ctx.textBaseline = "middle";

    const overlaps = (r, q) =>
      r.x < q.x + q.w + 3 && r.x + r.w + 3 > q.x &&
      r.y < q.y + q.h + 2 && r.y + r.h + 2 > q.y;

    for (const a of order) {
      const p = this.toScreen(a.x, a.y);
      const headTop = p.y - 62 * this.sy;
      const name = a.name;
      const offline = a.status === "offline";

      ctx.font = "800 11px 'Noto Sans KR',system-ui,sans-serif";
      const nameW = ctx.measureText(name).width;
      const emoji = a.emoji || "🙂";
      const emojiW = ctx.measureText(emoji).width + 3;
      const pillW = 9 + 7 + emojiW + nameW + 8;
      const pillH = 17;

      // 말풍선 (좁은 화면에서는 폭을 줄인다)
      let bubble = null;
      if (a.message) {
        ctx.font = "600 10.5px 'Noto Sans KR',system-ui,sans-serif";
        const maxW = Math.max(96, Math.min(146, this.cssW * 0.30));
        const wrapped = this.wrapBubble(ctx, a.message, maxW - 14);
        const tw = Math.max(...wrapped.lines.map(l => ctx.measureText(l).width), 10);
        const bw = Math.min(maxW, tw + 14);
        const bh = wrapped.lines.length * 13 + 9;
        bubble = { w: bw, h: bh, lines: wrapped.lines, trimmed: wrapped.trimmed };
      }

      const groupW = Math.max(pillW, bubble ? bubble.w : 0);
      const groupH = pillH + (bubble ? bubble.h + 5 : 0);
      const baseTop = headTop - 3 - groupH;

      // 겹치지 않는 자리 찾기: 위로 → 살짝 좌우 → 더 위로
      const below = 62 * this.sy + groupH + 8;   // 발밑에 두는 후보
      const tries = [{ dx: 0, dy: 0 }];
      for (let k = 1; k <= 4; k++) tries.push({ dx: 0, dy: -k * 8 });
      for (let k = 1; k <= 3; k++) {
        tries.push({ dx: 26 * k, dy: -6 }, { dx: -26 * k, dy: -6 });
      }
      tries.push({ dx: 0, dy: below }, { dx: 26, dy: below }, { dx: -26, dy: below });
      for (let k = 1; k <= 2; k++) {
        tries.push({ dx: 14 * k, dy: -22 * k }, { dx: -14 * k, dy: -22 * k });
      }
      let box = null;
      for (const t of tries) {
        const cand = { x: p.x - groupW / 2 + t.dx, y: baseTop + t.dy, w: groupW, h: groupH };
        if (cand.x < CVPAD || cand.x + cand.w > this.cssW - CVPAD) continue;
        if (cand.y < CVPAD) continue;
        if (placed.some(q => overlaps(cand, q))) continue;
        box = cand;
        break;
      }
      if (!box) {
        box = { x: p.x - groupW / 2, y: Math.max(CVPAD, baseTop), w: groupW, h: groupH };
      }
      placed.push(box);

      const pillX = box.x + (groupW - pillW) / 2;
      const pillY = box.y + (groupH - pillH);
      const bx = box.x + (groupW - (bubble ? bubble.w : 0)) / 2;
      const by = box.y;

      // 말풍선
      if (bubble) {
        ctx.save();
        ctx.shadowColor = "rgba(74,58,42,.16)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        fillRR(ctx, bx, by, bubble.w, bubble.h, 8, "rgba(255,254,250,.97)", "rgba(190,172,148,.55)", 1);
        ctx.restore();
        // 꼬리 (캐릭터 쪽을 향해)
        const tailX = Math.max(bx + 9, Math.min(bx + bubble.w - 9, p.x));
        ctx.beginPath();
        ctx.moveTo(tailX - 4.5, by + bubble.h - 0.5);
        ctx.lineTo(tailX, by + bubble.h + 5.5);
        ctx.lineTo(tailX + 4.5, by + bubble.h - 0.5);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,254,250,.97)";
        ctx.fill();
        ctx.strokeStyle = "rgba(190,172,148,.55)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#5c564f";
        ctx.font = "600 10.5px 'Noto Sans KR',system-ui,sans-serif";
        bubble.lines.forEach((line, i) => {
          ctx.fillText(line + (bubble.trimmed && i === bubble.lines.length - 1 ? "…" : ""),
            bx + 7, by + 8 + i * 13);
        });
      }

      // 이름표
      const stColor = this.statusMap[a.status] || "#9aa0a6";
      ctx.save();
      if (a.id === myId) {
        ctx.shadowColor = "rgba(228,87,46,.4)";
        ctx.shadowBlur = 8;
      }
      fillRR(ctx, pillX, pillY, pillW, pillH, 9,
        a.id === myId ? "rgba(255,246,240,.98)" : "rgba(255,253,248,.94)",
        a.id === myId ? "rgba(228,87,46,.65)" : "rgba(180,162,138,.45)", 1);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(pillX + 9, pillY + pillH / 2, offline ? 2.6 : 3, 0, Math.PI * 2);
      ctx.fillStyle = stColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#3b3630";
      ctx.font = "700 11px 'Noto Sans KR',system-ui,sans-serif";
      ctx.fillText(emoji, pillX + 15, pillY + pillH / 2 + 0.5);
      ctx.font = "800 11px 'Noto Sans KR',system-ui,sans-serif";
      ctx.fillStyle = offline ? "#8b8b8b" : "#2c2a28";
      ctx.fillText(name, pillX + 15 + emojiW, pillY + pillH / 2 + 0.5);

      // 이름표가 캐릭터에서 멀어졌으면 가는 선으로 이어 준다
      const gapX = Math.abs(pillX + pillW / 2 - p.x);
      const gapY = Math.abs(headTop - (pillY + pillH));
      if (gapX > 12 || gapY > 10) {
        ctx.save();
        ctx.strokeStyle = "rgba(150,130,104,.42)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pillX + pillW / 2, pillY + pillH + 1);
        ctx.lineTo(p.x, headTop + 1);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ── 입력 ─────────────────────────────────────────────── */
  _bindPointer() {
    const cv = this.canvas;
    const local = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener("pointermove", (e) => {
      const p = local(e);
      const hit = this.hitTest(p.x, p.y);
      this.hover = hit ? hit.id : null;
      cv.style.cursor = hit ? "pointer" : "crosshair";
    });
    cv.addEventListener("pointerleave", () => { this.hover = null; });
    cv.addEventListener("click", (e) => {
      const p = local(e);
      const hit = this.hitTest(p.x, p.y);
      if (hit) { this.onSelect(hit.id); return; }
      const w = this.toWorld(p.x, p.y);
      if (!this.isFree(w.x, w.y)) {
        const nf = this.nearestFree(w.x, w.y);
        if (!nf) return;
        w.x = nf.x; w.y = nf.y;
      }
      const myId = this.getMyId();
      const a = myId ? this.actors.get(myId) : null;
      if (!a) return;
      a.seated = false;
      a.goalKind = "manual";
      a.sitOnArrive = false;
      a.path = this.findPath(a.x, a.y, w.x, w.y) || [];
      a.speed = 66;
      this.ripples.push({ x: w.x, y: w.y, t: performance.now() });
      if (!a.path.length && Math.hypot(a.x - w.x, a.y - w.y) < 3) {
        a.nextThink = performance.now() + 1500;
      }
    });
  }

  hitTest(px, py) {
    const list = [...this.actors.values()].filter(a => a.alpha > 0.3);
    list.sort((a, b) => b.y - a.y);
    for (const a of list) {
      const p = this.toScreen(a.x, a.y);
      const w = Math.max(15, 20 * this.sx);
      const top = p.y - Math.max(40, 62 * this.sy);
      if (px >= p.x - w && px <= p.x + w && py >= top && py <= p.y + 6) return a;
    }
    return null;
  }

  getPositions() {    const out = {};
    for (const [id, a] of this.actors) {
      out[id] = {
        x: Math.round(a.x * 10) / 10,
        y: Math.round(a.y * 10) / 10,
        zone: a.zone, status: a.status, seated: a.seated, moving: a.moving,
        path: a.path ? a.path.length : 0,
        anchor: a.anchor ? a.anchor.key : null
      };
    }
    return out;
  }

  get layoutInfo() {
    return { name: this.layoutName, world: this.world, sx: this.sx, sy: this.sy, rooms: Object.keys(this.rooms) };
  }
}

/* ── 최소 힙 (A*용) ─────────────────────────────────────── */
class MinHeap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  push(v, p) {
    this.items.push(v); this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.prio[par] <= this.prio[i]) break;
      this._swap(i, par); i = par;
    }
  }
  pop() {
    const top = this.items[0];
    const lastV = this.items.pop(), lastP = this.prio.pop();
    if (this.items.length) {
      this.items[0] = lastV; this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this._swap(i, m); i = m;
      }
    }
    return top;
  }
  _swap(a, b) {
    const tv = this.items[a]; this.items[a] = this.items[b]; this.items[b] = tv;
    const tp = this.prio[a]; this.prio[a] = this.prio[b]; this.prio[b] = tp;
  }
}

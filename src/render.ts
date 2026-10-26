import type { BikeSpec, BikeState } from './physics';
import { BIKE_GEOMETRY as G } from './geometry';
import { COIN_SPACING, COIN_START, coinPosition, seeded, TERRAIN_STEP, terrainSlope, terrainY } from './terrain';

const H = 720;
export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 1280;
  private height = 720;
  private dpr = 1;
  private scale = 1;
  private camera = 0;
  private cameraY = 0;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Your browser does not support Canvas 2D.');
    this.ctx = context;
    this.resize();
  }

  resize(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = Math.max(0.2, height / H);
    this.width = width / this.scale;
    this.height = H;
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
  }

  frame(bike: BikeState, spec: BikeSpec, elapsed: number, running: boolean): void {
    this.time += elapsed;
    this.camera = Math.max(0, bike.x - this.width * (running ? 0.31 : 0.69));
    const targetY = running ? Math.min(0, bike.y - 220) : 0;
    this.cameraY += (targetY-this.cameraY)*(1-Math.exp(-elapsed*6));
    const c = this.ctx;
    c.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    this.sky();
    this.mountains(0.13, 467, '#d0dfe2', 125);
    this.mountains(0.25, 511, '#adcbd0', 100);
    this.clouds();
    this.mountains(0.38, 556, '#8db9b0', 75);
    c.save();
    c.translate(-this.camera, -this.cameraY);
    this.drawTerrain();
    this.drawDetails();
    this.drawCoins(bike);
    if (running) this.drawBike(bike, spec);
    else {
      const x = this.width * 0.77;
      const y = terrainY(x) - (48 * spec.wheelScale + 1), angle = Math.atan(terrainSlope(x));
      this.drawBike({ ...bike, x, y, angle, wheels: [-1, 1].map(side => ({
        x: x + (side*G.axleX*Math.cos(angle) - G.axleY*Math.sin(angle))*spec.wheelScale,
        y: y + (side*G.axleX*Math.sin(angle) + G.axleY*Math.cos(angle))*spec.wheelScale,
        angle: this.time*0.45, grounded: false,
      })) as BikeState['wheels'] }, spec);
    }
    c.restore();
    this.vignette();
  }

  private sky(): void {
    const c = this.ctx;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#a5dbeb');
    g.addColorStop(0.5, '#c2e5dd');
    g.addColorStop(1, '#fae3b2');
    c.fillStyle = g;
    c.fillRect(0, 0, this.width, H);
    const sunX = this.width * 0.77 - this.camera * 0.015;
    const sunY = 167;
    const glow = c.createRadialGradient(sunX, sunY, 20, sunX, sunY, 160);
    glow.addColorStop(0, 'rgba(255,244,190,.53)');
    glow.addColorStop(1, 'rgba(255,244,190,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(sunX, sunY, 160, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffedc4';
    c.beginPath(); c.arc(sunX, sunY, 55, 0, Math.PI * 2); c.fill();
  }

  private mountains(parallax: number, base: number, color: string, height: number): void {
    const c = this.ctx;
    const span = 310;
    const shift = (this.camera * parallax) % span;
    c.beginPath(); c.moveTo(-span, H);
    for (let x = -span * 2; x < this.width + span * 2; x += 24) {
      const worldX = x + shift;
      const y = base - height * (0.42 + 0.25 * Math.sin(worldX / 205) + 0.16 * Math.sin(worldX / 93) + 0.12 * Math.cos(worldX / 52));
      c.lineTo(x, y);
    }
    c.lineTo(this.width + span, H); c.closePath(); c.fillStyle = color; c.fill();
  }

  private clouds(): void {
    const c = this.ctx;
    for (let i = 0; i < 13; i++) {
      const x = (((i * 360 - this.camera * 0.085 + this.time * 2) % (this.width + 520)) + this.width + 520) % (this.width + 520) - 140;
      const y = 90 + seeded(i * 19) * 140;
      const s = 0.55 + seeded(i * 12) * 0.85;
      c.save(); c.translate(x, y); c.scale(s, s); c.globalAlpha = 0.48;
      c.fillStyle = '#fffdf0';
      c.beginPath();
      c.ellipse(0, 0, 60, 17, 0, 0, Math.PI * 2);
      c.ellipse(22, -13, 31, 22, 0, 0, Math.PI * 2);
      c.ellipse(-24, -11, 27, 19, 0, 0, Math.PI * 2);
      c.fill(); c.restore();
    }
  }

  private drawTerrain(): void {
    const c = this.ctx;
    const minX = Math.floor(this.camera / TERRAIN_STEP) * TERRAIN_STEP - 32;
    const maxX = this.camera + this.width + 28;
    c.beginPath(); c.moveTo(minX, H + 100);
    for (let x = minX; x <= maxX + 14; x += TERRAIN_STEP) c.lineTo(x, terrainY(x));
    c.lineTo(maxX + 14, H + 100); c.closePath();
    const soil = c.createLinearGradient(0, 440, 0, H);
    soil.addColorStop(0, '#83b668'); soil.addColorStop(0.15, '#547d60'); soil.addColorStop(1, '#254e50');
    c.fillStyle = soil; c.fill();
    c.lineWidth = 11; c.strokeStyle = '#b8d78a';
    c.beginPath();
    for (let x = minX; x <= maxX + 14; x += TERRAIN_STEP) {
      if (x === minX) c.moveTo(x, terrainY(x)); else c.lineTo(x, terrainY(x));
    }
    c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#ecf0b5'; c.stroke();
    for (let x = Math.floor(minX / 60) * 60; x < maxX + 60; x += 60) {
      const y = terrainY(x);
      if (seeded(x * 2) > 0.42) {
        c.strokeStyle = '#b3d28e'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x, y - 1); c.lineTo(x - 5, y - 9); c.moveTo(x, y - 1); c.lineTo(x + 4, y - 12); c.stroke();
      }
      if (seeded(x) > 0.76) {
        c.fillStyle = '#fff6c2'; c.beginPath(); c.arc(x + 8, y - 8, 3.1, 0, Math.PI * 2); c.fill();
      }
    }
  }

  private drawDetails(): void {
    const c = this.ctx;
    const start = Math.floor(this.camera / 310) - 2;
    const end = Math.ceil((this.camera + this.width) / 310) + 2;
    for (let i = start; i <= end; i++) {
      const x = i * 310 + 130;
      const y = terrainY(x);
      if (x < 450 || seeded(i * 5) > 0.7) continue;
      const height = 31 + seeded(i) * 45;
      c.fillStyle = '#466b61';
      c.beginPath(); c.moveTo(x, y - height); c.lineTo(x - 19, y); c.lineTo(x + 19, y); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x, y - height + 12); c.lineTo(x - 15, y + 1); c.lineTo(x + 15, y + 1); c.closePath(); c.fill();
      c.fillStyle = '#5a6750'; c.fillRect(x - 2, y - 8, 4, 15);
    }
  }

  private drawCoins(bike: BikeState): void {
    const c = this.ctx;
    const first = Math.max(0, Math.floor((this.camera - COIN_START) / COIN_SPACING) - 1);
    const last = Math.max(first, Math.ceil((this.camera + this.width - COIN_START) / COIN_SPACING) + 1);
    for (let i = first; i <= last; i++) {
      if (bike.collected.has(i)) continue;
      const pos = coinPosition(i);
      const y = pos.y + Math.sin(this.time * 3.5 + i) * 5;
      c.save(); c.translate(pos.x, y);
      c.shadowColor = 'rgba(252,194,79,.6)'; c.shadowBlur = 22;
      c.fillStyle = '#fbc65f'; c.strokeStyle = '#ffecac'; c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, 17, 0, Math.PI * 2); c.fill(); c.stroke();
      c.shadowBlur = 0; c.fillStyle = '#b97538'; c.font = 'bold 20px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('◈', 0, 1);
      c.restore();
    }
  }

  private drawBike(b: BikeState, spec: BikeSpec): void {
    const c = this.ctx;
    c.save(); c.translate(b.x, b.y);
    if (b.slamming) {
      c.strokeStyle = 'rgba(255,247,201,.8)'; c.lineWidth = 3;
      for (const x of [-30, 30]) { c.beginPath(); c.moveTo(x, -85); c.lineTo(x, -25); c.stroke(); }
    }
    c.rotate(b.angle);
    const s = spec.wheelScale;
    if (b.overboost > 0) {
      const length = (32 + Math.sin(this.time*45)*9)*s;
      c.fillStyle = '#f5894e'; c.beginPath();
      c.moveTo(-22*s, -13*s); c.lineTo(-34*s-length, -8*s); c.lineTo(-24*s, -2*s); c.fill();
      c.fillStyle = '#ffe2a1'; c.beginPath();
      c.moveTo(-23*s, -10*s); c.lineTo(-30*s-length*0.7, -7*s); c.lineTo(-24*s, -5*s); c.fill();
    }
    const r = G.tireRadius * s;
    const cos = Math.cos(b.angle), sin = Math.sin(b.angle);
    const axles = b.wheels.map(w => ({
      x: (w.x-b.x)*cos + (w.y-b.y)*sin,
      y: -(w.x-b.x)*sin + (w.y-b.y)*cos,
      angle: w.angle-b.angle,
    }));
    c.shadowColor = 'rgba(18,40,44,.15)'; c.shadowBlur = 8;
    for (const axle of axles) {
      c.save(); c.translate(axle.x, axle.y); c.rotate(axle.angle);
      c.fillStyle = '#1d3139'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ddf1e8'; c.beginPath(); c.arc(0, 0, r - 7*s, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#49616a'; c.lineWidth = 2;
      for (let j = 0; j < 6; j++) {
        const a = j * Math.PI / 3;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * (r - 8*s), Math.sin(a) * (r - 8*s)); c.stroke();
      }
      c.fillStyle = '#455660'; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill(); c.restore();
    }
    c.shadowBlur = 0;
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = '#24323c'; c.lineWidth = 7 * s;
    const [rear, front] = axles;
    c.beginPath(); c.moveTo(rear.x, rear.y); c.lineTo(-14*s, -4*s); c.lineTo(14*s, 4*s); c.lineTo(front.x, front.y); c.stroke();
    c.strokeStyle = spec.accent; c.lineWidth = 5 * s;
    c.beginPath(); c.moveTo(rear.x, rear.y); c.lineTo(14*s, 4*s); c.lineTo(-14*s, -4*s); c.lineTo(rear.x, rear.y); c.stroke();
    // Fork and swingarm follow the physical suspension instead of a rigid axle.
    c.strokeStyle = '#ddf1e8'; c.lineWidth = 3*s;
    c.beginPath(); c.moveTo(21*s, -11*s); c.lineTo(front.x, front.y); c.moveTo(-14*s, -4*s); c.lineTo(rear.x, rear.y); c.stroke();
    c.fillStyle = spec.color;
    c.beginPath(); c.moveTo(-23*s, -17*s); c.lineTo(5*s, -18*s); c.lineTo(25*s, -7*s); c.lineTo(14*s, 1*s); c.lineTo(-18*s, 0); c.closePath(); c.fill();
    c.fillStyle = '#293b46'; c.fillRect(-23*s, -24*s, 27*s, 6*s);
    c.strokeStyle = '#364954'; c.lineWidth = 4 * s;
    const stroke = (points: readonly (readonly [number, number])[]) => {
      c.beginPath(); points.forEach(([x, y], i) => { if (i) c.lineTo(x*s, y*s); else c.moveTo(x*s, y*s); }); c.stroke();
    };
    stroke(G.handlebar);
    // Rider and helmet, entirely original vector art.
    c.strokeStyle = '#27354a'; c.lineWidth = 10 * s;
    stroke(G.legs);
    c.strokeStyle = '#324a64'; c.lineWidth = 13 * s;
    c.beginPath(); c.moveTo(G.torso.ax*s, G.torso.ay*s); c.lineTo(G.torso.bx*s, G.torso.by*s); c.stroke();
    c.strokeStyle = '#f7d29d'; c.lineWidth = 6 * s;
    stroke(G.arms);
    c.fillStyle = '#213348'; c.beginPath(); c.arc(G.head.x*s, G.head.y*s, G.head.radius*s, 0, Math.PI * 2); c.fill();
    c.fillStyle = spec.accent; c.beginPath(); c.arc(-16*s, -55*s, 9*s, Math.PI * 1.08, Math.PI * 1.97); c.lineTo(-15*s, -55*s); c.closePath(); c.fill();
    c.fillStyle = '#94e1f2'; c.fillRect(-11*s, -58*s, 12*s, 5*s);
    c.restore();
  }

  private vignette(): void {
    const c = this.ctx;
    const shade = c.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(21,48,64,.10)');
    shade.addColorStop(0.25, 'rgba(21,48,64,0)');
    shade.addColorStop(1, 'rgba(12,28,29,.20)');
    c.fillStyle = shade; c.fillRect(0, 0, this.width, this.height);
  }
}

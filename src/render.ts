import { BikeSpec, BikeState } from './physics';
import { coinPosition, seeded, terrainSlope, terrainY } from './terrain';

const H = 720;
export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 1280;
  private height = 720;
  private dpr = 1;
  private scale = 1;
  private camera = 0;
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
    const c = this.ctx;
    c.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    this.sky();
    this.mountains(0.13, 467, '#d0dfe2', 125);
    this.mountains(0.25, 511, '#adcbd0', 100);
    this.clouds();
    this.mountains(0.38, 556, '#8db9b0', 75);
    c.save();
    c.translate(-this.camera, 0);
    this.drawTerrain();
    this.drawDetails();
    this.drawCoins(bike);
    if (running) this.drawBike(bike, spec);
    else {
      const x = this.width * 0.77;
      this.drawBike({ ...bike, x, y: terrainY(x) - (44 * spec.wheelScale + 15), angle: Math.atan(terrainSlope(x)), wheelSpin: this.time * 0.45 }, spec);
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
    const minX = Math.floor(this.camera / 14) * 14 - 28;
    const maxX = this.camera + this.width + 28;
    c.beginPath(); c.moveTo(minX, H + 100);
    for (let x = minX; x <= maxX + 14; x += 14) c.lineTo(x, terrainY(x));
    c.lineTo(maxX + 14, H + 100); c.closePath();
    const soil = c.createLinearGradient(0, 440, 0, H);
    soil.addColorStop(0, '#83b668'); soil.addColorStop(0.15, '#547d60'); soil.addColorStop(1, '#254e50');
    c.fillStyle = soil; c.fill();
    c.lineWidth = 11; c.strokeStyle = '#b8d78a';
    c.beginPath();
    for (let x = minX; x <= maxX + 14; x += 10) {
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
    const first = Math.max(0, Math.floor((this.camera - 690) / 235) - 1);
    const last = Math.max(first, Math.ceil((this.camera + this.width - 690) / 235) + 1);
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
    c.save(); c.translate(b.x, b.y); c.rotate(b.angle);
    const s = spec.wheelScale;
    const wx = 40 * s; const wy = 27 * s; const r = 17 * s;
    c.shadowColor = 'rgba(18,40,44,.15)'; c.shadowBlur = 8;
    for (const x of [-wx, wx]) {
      c.save(); c.translate(x, wy); c.rotate(b.wheelSpin);
      c.fillStyle = '#1d3139'; c.beginPath(); c.arc(0, 0, r + 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ddf1e8'; c.beginPath(); c.arc(0, 0, r - 3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#49616a'; c.lineWidth = 2;
      for (let j = 0; j < 6; j++) {
        const a = j * Math.PI / 3;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4)); c.stroke();
      }
      c.fillStyle = '#455660'; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill(); c.restore();
    }
    c.shadowBlur = 0;
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = '#24323c'; c.lineWidth = 7 * s;
    c.beginPath(); c.moveTo(-wx, wy); c.lineTo(-14*s, -4*s); c.lineTo(14*s, 4*s); c.lineTo(wx, wy); c.lineTo(-wx, wy); c.stroke();
    c.strokeStyle = spec.accent; c.lineWidth = 5 * s;
    c.beginPath(); c.moveTo(-wx, wy); c.lineTo(14*s, 4*s); c.lineTo(-14*s, -4*s); c.lineTo(-wx, wy); c.stroke();
    c.fillStyle = spec.color;
    c.beginPath(); c.moveTo(-23*s, -17*s); c.lineTo(5*s, -18*s); c.lineTo(25*s, -7*s); c.lineTo(14*s, 1*s); c.lineTo(-18*s, 0); c.closePath(); c.fill();
    c.fillStyle = '#293b46'; c.fillRect(-23*s, -24*s, 27*s, 6*s);
    c.strokeStyle = '#364954'; c.lineWidth = 4 * s;
    c.beginPath(); c.moveTo(21*s, -11*s); c.lineTo(32*s, -26*s); c.lineTo(44*s, -24*s); c.stroke();
    // Rider and helmet, entirely original vector art.
    c.strokeStyle = '#27354a'; c.lineWidth = 10 * s;
    c.beginPath(); c.moveTo(-9*s, -26*s); c.lineTo(5*s, -15*s); c.lineTo(12*s, -6*s); c.stroke();
    c.strokeStyle = '#324a64'; c.lineWidth = 13 * s;
    c.beginPath(); c.moveTo(-13*s, -44*s); c.lineTo(-7*s, -27*s); c.stroke();
    c.strokeStyle = '#f7d29d'; c.lineWidth = 6 * s;
    c.beginPath(); c.moveTo(-10*s, -37*s); c.lineTo(12*s, -27*s); c.lineTo(31*s, -24*s); c.stroke();
    c.fillStyle = '#213348'; c.beginPath(); c.arc(-16*s, -55*s, 13*s, 0, Math.PI * 2); c.fill();
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

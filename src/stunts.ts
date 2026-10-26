export const BIG_AIR_SECONDS = 1.6;
export const BIG_AIR_HEIGHT = 180;
const TURN = Math.PI*2;

export type StuntKind = 'flip' | 'air' | 'wheelie' | 'stoppie' | 'slam';
export interface StuntFrame {
  angle: number;
  av: number;
  airborne: boolean;
  bothGrounded: boolean;
  wheelie: 'wheelie' | 'stoppie' | null;
  clearance: number;
  slamming: boolean;
  dead: boolean;
}
export interface StuntResult {
  flip: number;
  frontFlips: number;
  backFlips: number;
  boostEarned: number;
  overboostEarned: number;
  stunt: StuntKind | null;
  callout: string | null;
}

/** One combo survives short tire contacts; only a settled landing banks it. */
export class StuntTracker {
  frontFlips = 0;
  backFlips = 0;
  private active = false;
  private lastAngle: number;
  private rotation = 0;
  private airTime = 0;
  private groundTime = 0;
  private wheelieTime = 0;
  private wheelies = 0;
  private stoppies = 0;
  private slamTime = 0;
  private bigAir = false;
  private bigAirCooldown = 0;

  constructor(angle: number) { this.lastAngle = angle; }

  private summary(): string {
    return [
      this.frontFlips ? `FRONT FLIP x${this.frontFlips}` : '',
      this.backFlips ? `BACKFLIP x${this.backFlips}` : '',
      this.wheelies ? `WHEELIE x${this.wheelies}` : '',
      this.stoppies ? `STOPPIE x${this.stoppies}` : '',
    ].filter(Boolean).join(' · ');
  }

  update(frame: StuntFrame, dt: number): StuntResult {
    const result: StuntResult = { flip: 0, frontFlips: this.frontFlips, backFlips: this.backFlips,
      boostEarned: 0, overboostEarned: 0, stunt: null, callout: null };
    const delta = frame.angle-this.lastAngle;
    this.lastAngle = frame.angle;
    this.bigAirCooldown = Math.max(0, this.bigAirCooldown-dt);
    if (frame.dead) { this.active = false; return result; }
    if (!this.active && !frame.bothGrounded) {
      this.active = true;
      this.frontFlips = this.backFlips = this.wheelies = this.stoppies = 0;
      this.rotation = this.airTime = this.groundTime = this.wheelieTime = this.slamTime = 0;
      this.bigAir = false;
    }
    if (!this.active) return result;
    this.rotation += delta;
    // A small landing tolerance still requires almost a full revolution. Reversing
    // a half-turn cancels progress; it cannot manufacture a flip.
    while (this.rotation >= TURN-0.2) {
      this.frontFlips++; this.rotation -= TURN;
      result.boostEarned += 18; result.stunt = 'flip';
    }
    while (this.rotation <= -TURN+0.2) {
      this.backFlips++; this.rotation += TURN;
      result.boostEarned += 18; result.stunt = 'flip';
    }
    if (result.stunt === 'flip') result.callout = this.summary();

    if (frame.airborne) {
      this.airTime += dt;
      this.groundTime = 0;
      if (frame.slamming) this.slamTime += dt;
      if (!this.bigAir && this.airTime >= BIG_AIR_SECONDS && frame.clearance >= BIG_AIR_HEIGHT && !this.bigAirCooldown) {
        this.bigAir = true;
        this.bigAirCooldown = 8;
        if (!this.frontFlips && !this.backFlips) { result.stunt = 'air'; result.callout = 'BIG AIR!'; }
      }
    } else this.groundTime += dt;

    this.wheelieTime = frame.wheelie ? this.wheelieTime+dt : 0;
    if (this.wheelieTime >= 0.85) {
      this.wheelieTime -= 0.85;
      if (frame.wheelie === 'wheelie') this.wheelies++; else this.stoppies++;
      result.overboostEarned += 1.25;
      result.stunt ??= frame.wheelie;
      result.callout = this.summary();
    }
    // A controlled one-tire landing is valid too. Requiring both tires in exactly
    // the same tick discarded real flips on slopes and suspension rebounds.
    if (this.groundTime >= 0.12 && (frame.bothGrounded || (this.airTime >= 0.25 && Math.abs(frame.av) < 2.5))) {
      result.flip = this.frontFlips+this.backFlips;
      result.overboostEarned += result.flip*2.5 + (this.bigAir ? 1 : 0) + (this.slamTime >= 0.08 && this.airTime >= 0.25 ? 1.5 : 0);
      if (result.overboostEarned) {
        result.stunt = result.flip ? 'flip' : this.slamTime >= 0.08 ? 'slam' : 'air';
        result.callout = this.summary() || (result.stunt === 'slam' ? 'SLAM!' : 'LANDING');
      }
      this.active = false;
    }
    result.frontFlips = this.frontFlips;
    result.backFlips = this.backFlips;
    return result;
  }
}

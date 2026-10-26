export type HoldAction = 'back' | 'forward' | 'boost';
/** Keyboard and simultaneous touch pointers feed one identical physics input. */
export class RideControls {
  private keys = new Set<string>();
  private pointers: Record<HoldAction, Set<number>> = { back: new Set(), forward: new Set(), boost: new Set() };

  key(code: string, down: boolean): void {
    if (down) this.keys.add(code); else this.keys.delete(code);
  }

  pointer(action: HoldAction, id: number, down: boolean): void {
    if (down) this.pointers[action].add(id); else this.pointers[action].delete(id);
  }

  reset(): void {
    this.keys.clear();
    for (const pointers of Object.values(this.pointers)) pointers.clear();
  }

  sample(): { lean: number; boost: boolean } {
    const held = (action: HoldAction, codes: string[]) => this.pointers[action].size > 0 || codes.some(code => this.keys.has(code));
    return {
      lean: Number(held('forward', ['KeyD', 'ArrowRight']))-Number(held('back', ['KeyA', 'ArrowLeft'])),
      boost: held('boost', ['KeyW', 'ArrowUp', 'Space']),
    };
  }
}

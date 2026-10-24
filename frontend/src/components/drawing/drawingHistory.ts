/** A bounded, immutable undo history for one notebook page. */
export class DrawingHistory<T> {
  private readonly limit: number;
  private past: T[] = [];
  private future: T[] = [];
  private current: T;

  constructor(initial: T, limit = 100) {
    this.current = initial;
    this.limit = limit;
  }

  value(): T {
    return this.current;
  }

  record(next: T): T {
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = next;
    this.future = [];
    return this.current;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(this.current);
    this.current = previous;
    return this.current;
  }

  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }
}

export function createDrawingHistory<T>(initial: T, limit?: number): DrawingHistory<T> {
  return new DrawingHistory(initial, limit);
}

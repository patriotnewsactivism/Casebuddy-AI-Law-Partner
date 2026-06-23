/**
 * priorityQueue.ts — Min-heap priority queue for background task scheduling.
 *
 * Lower numeric priority value = higher urgency.
 * Urgency map: urgent=0, high=1, medium=2, low=3
 */

export type PQPriority = 'urgent' | 'high' | 'medium' | 'low';

const PRIORITY_WEIGHT: Record<PQPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface PQItem<T> {
  priority: PQPriority;
  item: T;
  enqueuedAt: number;
}

export class PriorityQueue<T> {
  private heap: PQItem<T>[] = [];

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  enqueue(item: T, priority: PQPriority): void {
    this.heap.push({ priority, item, enqueuedAt: Date.now() });
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;
    this.swap(0, this.heap.length - 1);
    const top = this.heap.pop()!;
    this.sinkDown(0);
    return top.item;
  }

  peek(): T | undefined {
    return this.heap[0]?.item;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(i, parent) < 0) {
        this.swap(i, parent);
        i = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;

      if (left < n && this.compare(left, smallest) < 0) smallest = left;
      if (right < n && this.compare(right, smallest) < 0) smallest = right;

      if (smallest !== i) {
        this.swap(i, smallest);
        i = smallest;
      } else {
        break;
      }
    }
  }

  private compare(a: number, b: number): number {
    const wa = PRIORITY_WEIGHT[this.heap[a].priority];
    const wb = PRIORITY_WEIGHT[this.heap[b].priority];
    if (wa !== wb) return wa - wb;
    // FIFO for equal priority
    return this.heap[a].enqueuedAt - this.heap[b].enqueuedAt;
  }

  private swap(a: number, b: number): void {
    [this.heap[a], this.heap[b]] = [this.heap[b], this.heap[a]];
  }
}

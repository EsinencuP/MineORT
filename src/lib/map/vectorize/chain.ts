/** A straight piece between two points whose coordinates are multiples of 0.5. */
export type Seg = [number, number, number, number];
export type Chain = { points: number[]; closed: boolean };

const key = (x: number, z: number) =>
  `${Math.round(x * 2)},${Math.round(z * 2)}`;

/**
 * Joins loose segments into polylines. A chain stops where it meets a point shared by anything
 * other than exactly two segments (a free end or a junction); what is left over closes into rings.
 */
export function chainSegments(segs: Seg[]): Chain[] {
  const at = new Map<string, number[]>();
  const add = (k: string, i: number) => {
    const list = at.get(k);
    if (list) list.push(i);
    else at.set(k, [i]);
  };
  segs.forEach((s, i) => {
    add(key(s[0], s[1]), i);
    add(key(s[2], s[3]), i);
  });

  const used = new Uint8Array(segs.length);
  const chains: Chain[] = [];

  /** Walks from the segment's `from` end onward while the way is unambiguous. */
  const walk = (first: number, fromStart: boolean): Chain => {
    let s = segs[first];
    let [ax, az, bx, bz] = fromStart ? s : [s[2], s[3], s[0], s[1]];
    const points = [ax, az, bx, bz];
    const startKey = key(ax, az);
    used[first] = 1;
    let current = first;
    for (;;) {
      const here = key(bx, bz);
      if (here === startKey) {
        points.length -= 2;
        return { points, closed: true };
      }
      const list = at.get(here)!;
      if (list.length !== 2) break;
      const next = list[0] === current ? list[1] : list[0];
      if (used[next]) break;
      used[next] = 1;
      s = segs[next];
      const forward = key(s[0], s[1]) === here;
      ax = bx;
      az = bz;
      [bx, bz] = forward ? [s[2], s[3]] : [s[0], s[1]];
      points.push(bx, bz);
      current = next;
    }
    return { points, closed: false };
  };

  // open chains first: start them at free ends and junctions
  for (const [k, list] of at) {
    if (list.length === 2) continue;
    for (const i of list) {
      if (used[i]) continue;
      const s = segs[i];
      chains.push(walk(i, key(s[0], s[1]) === k));
    }
  }
  // whatever remains has no free end: it is a ring
  for (let i = 0; i < segs.length; i++) {
    if (!used[i]) chains.push(walk(i, true));
  }
  return chains;
}

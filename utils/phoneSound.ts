// Synthesized telephone ringback tone — played while "connecting" a team member on a
// live call. Generated with the Web Audio API rather than shipping an audio
// asset: keeps the bundle/service-worker cache lean, and (importantly) starting
// it inside the user's click gesture unlocks audio output so the agent's first
// spoken words aren't blocked by the browser's autoplay policy.
//
// US ringback cadence: 440 Hz + 480 Hz, ~2s tone then a short gap, repeating
// until stop() is called (normally the moment the agent picks up).

export interface Ringback {
  stop: () => void;
}

const NOOP: Ringback = { stop: () => {} };

export function playRingback(): Ringback {
  if (typeof window === 'undefined') return NOOP;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return NOOP;

  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return NOOP;
  }
  // Browsers often start the context suspended until resumed inside a gesture.
  ctx.resume?.().catch(() => {});

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const ring = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    // Soft attack/decay so the ring doesn't click.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    gain.gain.setValueAtTime(0.12, now + 1.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

    [440, 480].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 2.05);
    });

    timer = setTimeout(ring, 4000); // 2s tone + ~2s gap, classic cadence
  };
  ring();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      setTimeout(() => { try { ctx.close(); } catch { /* already closed */ } }, 60);
    },
  };
}

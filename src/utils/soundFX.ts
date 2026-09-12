import { useAppStore } from '../store';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

/**
 * Play a synthesized sound effect using the Web Audio API.
 * @param type The sound effect preset:
 * - 'pop': Button presses & menu taps.
 * - 'snap': Toggle switches & tabs.
 * - 'success': Completed actions, deposits, & transfers.
 * - 'error': Invalid PINs & warnings.
 */
export function playSound(type: 'pop' | 'snap' | 'success' | 'error') {
  try {
    const isSoundEnabled = useAppStore.getState().soundEffectsEnabled;
    if (!isSoundEnabled) {
      return;
    }
  } catch (err) {
    // Fail-safe default
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  // Browser security policy requires resume on interaction
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  try {
    const now = ctx.currentTime;

    switch (type) {
      case 'pop': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }

      case 'snap': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(850, now);
        osc.frequency.setValueAtTime(450, now + 0.02);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.start(now);
        osc.stop(now + 0.06);
        break;
      }

      case 'success': {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Major Chord Arpeggio)
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.type = 'sine';
          const triggerTime = now + idx * 0.055;
          osc.frequency.setValueAtTime(freq, triggerTime);

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.08, triggerTime + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, triggerTime + 0.25);

          osc.start(triggerTime);
          osc.stop(triggerTime + 0.25);
        });
        break;
      }

      case 'error': {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(125, now); // C3

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(128, now); // Detuned generator for warning buzz

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.3);
        osc2.stop(now + 0.3);
        break;
      }
    }
  } catch (e) {
    console.warn('Synth sound play failed:', e);
  }
}

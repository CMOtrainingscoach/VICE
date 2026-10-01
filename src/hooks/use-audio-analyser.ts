"use client";

import { useEffect, useRef, useState } from "react";

const IDLE_WAVE = Array(48).fill(0.08);

export function useAudioAnalyser(stream: MediaStream | null, active: boolean) {
  const [levels, setLevels] = useState({ mic: 0, tab: 0 });
  const [waveform, setWaveform] = useState<number[]>(IDLE_WAVE);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || !active) {
      return;
    }

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i];
      const avg = sum / data.length / 255;
      setLevels({ mic: avg, tab: avg * 0.92 });

      const bars: number[] = [];
      const step = Math.floor(data.length / 48);
      for (let i = 0; i < 48; i += 1) {
        const v = data[i * step] / 255;
        bars.push(Math.max(0.06, Math.min(1, v * 1.4)));
      }
      setWaveform(bars);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      void ctx.close();
    };
  }, [stream, active]);

  if (!stream || !active) {
    return { levels: { mic: 0, tab: 0 }, waveform: IDLE_WAVE };
  }

  return { levels, waveform };
}

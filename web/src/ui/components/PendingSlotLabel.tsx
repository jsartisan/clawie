import { useEffect, useMemo, useState } from 'react';

const VERBS = [
  'Analyzing',
  'Composing',
  'Sketching',
  'Rendering',
  'Painting',
  'Detailing',
  'Refining',
  'Diffusing',
  'Sampling',
  'Denoising',
  'Upscaling',
  'Shading',
  'Stylizing',
  'Framing',
  'Enhancing',
  'Tuning',
  'Generating',
  'Crafting',
  'Polishing',
  'Imagining',
  'Envisioning',
  'Illustrating',
  'Texturing',
  'Blending',
  'Shaping',
  'Dreaming',
  'Conjuring',
  'Weaving',
  'Capturing',
];

const CYCLE_MS = 10000;

interface Props {
  /** When true, freezes label to "Finalizing" — used during the 400ms swap to the final image. */
  completing?: boolean;
}

export function PendingSlotLabel({ completing }: Props) {
  const startIdx = useMemo(() => Math.floor(Math.random() * VERBS.length), []);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (completing) return;
    const id = window.setInterval(() => setTick((t) => t + 1), CYCLE_MS);
    return () => window.clearInterval(id);
  }, [completing]);

  const verb = completing
    ? 'Finalizing'
    : VERBS[(startIdx + tick) % VERBS.length];

  return (
    <span
      key={verb}
      className="text-muted-foreground animate-in fade-in text-xs font-medium duration-500"
    >
      {verb}…
    </span>
  );
}

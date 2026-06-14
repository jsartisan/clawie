import { describe, expect, it } from 'vitest';

import { deriveFolder } from './create-agent.js';

describe('deriveFolder', () => {
  const never = () => false;

  it('slugifies display names', () => {
    expect(deriveFolder('Andy', never)).toBe('andy');
    expect(deriveFolder('My Research Buddy!', never)).toBe('my-research-buddy');
    expect(deriveFolder('  --Weird   input--  ', never)).toBe('weird-input');
  });

  it('falls back to "agent" when nothing survives slugification', () => {
    expect(deriveFolder('???', never)).toBe('agent');
  });

  it('appends a counter until the folder is free', () => {
    const taken = new Set(['andy', 'andy-2']);
    expect(deriveFolder('Andy', (f) => taken.has(f))).toBe('andy-3');
  });

  it('caps the slug length', () => {
    const long = 'a'.repeat(100);
    expect(deriveFolder(long, never).length).toBeLessThanOrEqual(40);
  });
});

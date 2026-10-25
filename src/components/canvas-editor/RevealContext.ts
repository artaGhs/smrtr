'use client';
import { createContext } from 'react';
import type { RevealPhase } from '@/lib/canvas-presentation/reveal';
/** Updates existing React Flow renderers before its controlled-node store catches up. */
export const RevealContext = createContext<Record<string, RevealPhase> | undefined>(undefined);

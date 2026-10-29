'use client';

import React from 'react';
import type { EditorState } from '@/hooks/useEditorState';

interface AnimationsPanelProps {
  animSpeed: number;
  cameraMode: 'static' | 'follow' | 'orbit';
  onChange: <K extends keyof EditorState>(key: K, value: EditorState[K]) => void;
}

const SPEED_PRESETS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '1.0x', value: 1 },
  { label: '2.0x', value: 2 },
];

export default function AnimationsPanel({ animSpeed, cameraMode, onChange }: AnimationsPanelProps) {
  return (
    <div className="p-4 space-y-6">
      {/* Speed */}
      <div>
        <h3 className="text-[10px] font-bold text-white uppercase tracking-widest mb-3 flex items-center justify-between">
          <span>Tempo</span>
          <span className="text-[#CCFF00] font-mono">{animSpeed}x</span>
        </h3>
        <div className="flex gap-2">
          {SPEED_PRESETS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onChange('animSpeed', value)}
              className={`flex-1 py-1.5 rounded text-[11px] font-medium transition-colors ${
                animSpeed === value
                  ? 'bg-[#CCFF00] text-black'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>


    </div>
  );
}

'use client';

import React from 'react';
import { Pin, Navigation, Orbit } from 'lucide-react';
import type { EditorState } from '@/hooks/useEditorState';
import { t, useT, k } from '@/lib/i18n';

type CameraMode = 'static' | 'follow' | 'orbit';

interface CameraPanelProps {
  cameraMode: CameraMode;
  onChange: <K extends keyof EditorState>(key: K, value: EditorState[K]) => void;
}

// Icons instead of text; the name and meaning are in the tooltip
export const CAMERA_MODES: { value: CameraMode; label: string; hint: string; Icon: typeof Pin }[] = [
  { value: 'static', label: k('Statisch'), hint: k('Kamera bleibt stehen'), Icon: Pin },
  { value: 'follow', label: k('Folgen'), hint: k('Kamera folgt dem Fahrzeug'), Icon: Navigation },
  { value: 'orbit', label: k('Orbit'), hint: k('Kamera folgt und kreist um die Route'), Icon: Orbit },
];

export default function CameraPanel({ cameraMode, onChange }: CameraPanelProps) {
  useT();
  return (
    <div className="p-4">
      <h3 className="text-[10px] font-bold text-white uppercase tracking-widest mb-3">
        {t('Kamera')}
      </h3>
      <div className="flex gap-2">
        {CAMERA_MODES.map(({ value, label, hint, Icon }) => (
          <button
            key={value}
            onClick={() => onChange('cameraMode', value)}
            title={`${t(label)} – ${t(hint)}`}
            aria-label={t(label)}
            aria-pressed={cameraMode === value}
            className={`flex-1 h-9 rounded flex items-center justify-center transition-colors ${
              cameraMode === value
                ? 'bg-[#CCFF00] text-black'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

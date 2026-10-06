import { useEffect, useRef, useState } from 'react';

export const learnerPages = {
  profile: 'Mi perfil',
  progress: 'Mi progreso',
  issues: 'Lo que debo mejorar',
  vocabulary: 'Mi vocabulario',
  privacy: 'Privacidad',
} as const;
export type LearnerPage = 'home' | keyof typeof learnerPages;

// A disclosure with ordinary buttons keeps native Tab/Shift+Tab navigation.
export function ProfileMenu({ onNavigate, onLogout, busy }: {
  onNavigate: (page: LearnerPage) => void;
  onLogout: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  return <div className="profile-menu" ref={container}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
    <button className="profile-trigger secondary" ref={trigger} type="button"
      aria-label="Abrir menú de perfil" aria-expanded={open} aria-controls="profile-navigation"
      onClick={() => setOpen(!open)}>
      <svg className="avatar" aria-hidden="true" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="11" r="5" fill="currentColor" />
        <path d="M6 28v-3a10 10 0 0 1 20 0v3" fill="currentColor" />
      </svg>
      <span>Mi perfil</span><span aria-hidden="true">▾</span>
    </button>
    {open && <nav id="profile-navigation" className="profile-dropdown" aria-label="Mi aprendizaje">
      {Object.entries(learnerPages).map(([page, label]) =>
        <button className="secondary" key={page} type="button" onClick={() => {
          setOpen(false);
          onNavigate(page as LearnerPage);
        }}>{label}</button>)}
      <button className="secondary logout" type="button" disabled={busy}
        onClick={() => { setOpen(false); onLogout(); }}>Cerrar sesión</button>
    </nav>}
  </div>;
}

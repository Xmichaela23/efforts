import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function PlansBuild() {
  const navigate = useNavigate();
  const safeBack = () => { if (window.history.length > 1) navigate(-1); else navigate('/'); };

  const Section: React.FC<{ title: string; desc: string; action?: { label: string; onClick: () => void; }; disabled?: boolean }>=({ title, desc, action, disabled })=> (
    <div className={`border rounded-md p-4 ${disabled ? 'opacity-30' : ''}`}>
      <div className="text-base font-semibold mb-1">{title}</div>
      <div className="text-sm text-gray-600 mb-3">{desc}</div>
      <div className="flex items-center gap-4">
        {action && !disabled && (
          <button className="text-sm text-blue-600 hover:text-blue-700" onClick={action.onClick}>{action.label}</button>
        )}
        {disabled && (
          <span className="text-sm text-gray-400">Build — coming soon</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full">
            <div className="flex items-center space-x-1 pl-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-white/80 hover:text-white transition-colors p-2">
                    <Menu className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/baselines')}>Training Baselines</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/connections')}>Connections</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/')}>Dashboard</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <h1 className="text-2xl font-light tracking-wider text-white">efforts</h1>
              <div className="flex items-center gap-3">
                <Button onClick={safeBack} variant="ghost" className="text-sm font-medium text-gray-700 hover:bg-gray-50">
                  ← Back
                </Button>
                <Button onClick={() => navigate('/')} variant="ghost" className="text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Dashboard
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="mobile-main-content">
        <div className="max-w-3xl mx-auto p-4 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Build Plans</h1>
            <p className="text-sm text-gray-600">Create simple plans that populate your calendar and prefill the loggers.</p>
          </div>

      <Section
        title="Mobility"
        desc="Author mobility/PT sessions with simple text. Saves as Mobility and shows as MBL on the calendar."
        action={{ label: 'Build', onClick: () => navigate('/plans/pt') }}
      />

      <Section
        title="Run"
        desc="Generate run sessions with simple language (intervals, tempo, long)."
        disabled
      />

      <Section
        title="Ride"
        desc="Create ride workouts (VO2, Threshold, Endurance) from short descriptions."
        disabled
      />

      <Section
        title="Strength"
        desc="Build periodized strength routines with progressive overload."
        disabled
      />
        </div>
      </main>
    </div>
  );
}



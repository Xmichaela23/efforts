import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { User, Upload, Download, Settings, Activity, Link, Package, HelpCircle, Trophy } from 'lucide-react';
import { EffortsWordmark } from './EffortsButton';
import { useAppAdmin } from '@/hooks/useAppAdmin';
import { supabase } from '@/lib/supabase';

interface MobileHeaderProps {
  /** Custom content to render on the right side of the header */
  rightContent?: React.ReactNode;
  /** Show back button on the right */
  showBackButton?: boolean;
  /** Back button click handler */
  onBack?: () => void;
  /** Custom menu items (optional, defaults to standard menu) */
  menuItems?: React.ReactNode;
  /** Wordmark size — with cascade on, keep ~≤26 so the SVG fits the fixed header (overflow hidden). */
  wordmarkSize?: number;
  /** Logout handler */
  onLogout?: () => void;
  /** Custom menu item handlers */
  onTrainingBaselinesClick?: () => void;
  onAthleticRecordClick?: () => void;
  onConnectionsClick?: () => void;
  onGearClick?: () => void;
  onImportClick?: () => void;
}

export function MobileHeader({ 
  rightContent, 
  showBackButton = false, 
  onBack,
  menuItems,
  wordmarkSize = 26,
  onLogout,
  onTrainingBaselinesClick,
  onAthleticRecordClick,
  onConnectionsClick,
  onGearClick,
  onImportClick,
}: MobileHeaderProps) {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAppAdmin();

  const openHelpEmail = () => {
    const q = new URLSearchParams({
      subject: 'Efforts — Help request',
    });
    window.location.href = `mailto:support@efforts.work?${q.toString()}`;
  };

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  // Default menu items
  const defaultMenuItems = (
    <>
      <DropdownMenuItem onClick={onTrainingBaselinesClick || (() => navigate('/baselines'))}>
        <Activity className="mr-2 h-4 w-4" />
        Training Baselines
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={onAthleticRecordClick || (() => navigate('/profile/athletic-record'))}
      >
        <Trophy className="mr-2 h-4 w-4" />
        Athletic Record
      </DropdownMenuItem>
      <DropdownMenuItem>
        <User className="mr-2 h-4 w-4" />
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onConnectionsClick || (() => navigate('/connections'))}>
        <Link className="mr-2 h-4 w-4" />
        Connections
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onGearClick || (() => navigate('/gear'))}>
        <Package className="mr-2 h-4 w-4" />
        Gear
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onImportClick}>
        <Download className="mr-2 h-4 w-4" />
        Import
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Upload className="mr-2 h-4 w-4" />
        Export Data
      </DropdownMenuItem>
      <DropdownMenuItem onClick={openHelpEmail}>
        <HelpCircle className="mr-2 h-4 w-4" />
        Help & Support
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleLogout}>
        Sign Out
      </DropdownMenuItem>
      {!adminLoading && isAdmin && (
        <DropdownMenuItem onClick={() => navigate('/plans/admin')}>
          <Settings className="mr-2 h-4 w-4" />
          Admin – Add template (JSON)
        </DropdownMenuItem>
      )}
    </>
  );

  return (
    <header className="mobile-header">
      <div className="relative w-full">
        <div className="relative flex h-16 w-full items-center">
          {/* Left: Menu */}
          <div className="relative z-10 flex flex-1 items-center justify-start pl-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="p-0 text-white/80 hover:text-white/90 hover:bg-white/10 transition-all duration-200"
                  style={{
                    width: '44px',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  aria-label="Menu"
                >
                  <svg 
                    width="3" 
                    height="16" 
                    viewBox="0 0 3 16" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="vertical-dots-icon"
                    style={{
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <circle cx="1.5" cy="1.5" r="1.5" fill="rgba(255, 255, 255, 0.8)"/>
                    <circle cx="1.5" cy="8" r="1.5" fill="rgba(255, 255, 255, 0.8)"/>
                    <circle cx="1.5" cy="14.5" r="1.5" fill="rgba(255, 255, 255, 0.8)"/>
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-white/[0.12] backdrop-blur-xl border border-white/25">
                {menuItems || defaultMenuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Center: Wordmark — true viewport center so wide Back doesn’t pull the logo */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex h-16 items-center justify-center"
            style={{ paddingTop: '6px' }}
            aria-hidden
          >
            <EffortsWordmark size={wordmarkSize} enableParallax={false} />
          </div>

          {/* Right: Custom content or back button */}
          <div className="relative z-10 flex flex-1 items-center justify-end gap-2 pr-4 pl-2">
            {rightContent || (showBackButton && onBack && (
              <Button
                onClick={onBack}
                className="bg-white/[0.05] backdrop-blur-lg border border-white/25 text-white/90 font-light tracking-wide hover:bg-white/[0.08] hover:text-white hover:border-white/35 transition-all duration-300 shadow-lg hover:shadow-xl"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  padding: '8px 12px',
                  borderRadius: '0.75rem',
                  fontSize: '14px'
                }}
              >
                ← Back
              </Button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * AccountPlate — the ACCOUNT plate on Profile (docs/WORKORDER-account-2026-09-06.md §3).
 *
 * Rows: Email (plain text, shown once on the screen) · Change password · Change email · Sign out ·
 * Delete account. Each "Change" row is a bordered pill with a down chevron: the sheet rises under the
 * thumb, the screen is not left (docs/DESIGN-button-shape.md, "Three taps, two glyphs"). Sign out is a
 * plain bordered pill; Delete account is the danger variant.
 *
 * Password and email changes go straight to Supabase Auth (`updateUser`); no current-password field,
 * a signed-in session is what Supabase needs. Delete calls the `delete-account` edge function with the
 * user's own JWT, then signs out locally and leaves a one-time line for the sign-in screen.
 */
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { NumberRow } from '@/components/ui/number-row';
import { pillClass } from '@/lib/number-word';
import { supabase, invokeFunction } from '@/lib/supabase';

/** Ours — the reset page uses the same floor; Supabase's project default is 6. */
export const PASSWORD_MIN = 8;
/** Read once by the sign-in screen after a delete, then cleared. */
export const ACCOUNT_DELETED_KEY = 'efforts:account-deleted';

const fieldClass =
  'mt-1 w-full rounded-xl border border-white/15 bg-zinc-900/70 px-3 py-2 text-[16px] text-white placeholder:text-zinc-500 focus:border-white/35 focus:outline-none';

type SheetKind = 'password' | 'email' | 'delete' | null;

type Props = {
  header: React.ReactNode;
  email: string;
  /** Set when a new address is waiting on its confirmation link. */
  pendingEmail?: string | null;
  onPendingEmail?: (email: string) => void;
  onSignOut: () => void | Promise<void>;
};

export function AccountPlate({ header, email, pendingEmail, onPendingEmail, onSignOut }: Props) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  const open = (k: SheetKind) => { setPw1(''); setPw2(''); setNewEmail(''); setConfirmText(''); setLine(null); setSheet(k); };
  const close = () => { if (!busy) setSheet(null); };

  const pwProblem = pw1.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters.` : pw1 !== pw2 ? 'The two entries differ.' : null;

  const changePassword = async () => {
    if (pwProblem) { setLine(pwProblem); return; }
    setBusy(true); setLine(null);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    setLine(error ? error.message : 'Password changed.');
    if (!error) { setPw1(''); setPw2(''); }
  };

  const changeEmail = async () => {
    const next = newEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(next)) { setLine('That is not an email address.'); return; }
    if (next.toLowerCase() === email.toLowerCase()) { setLine('That is the current address.'); return; }
    setBusy(true); setLine(null);
    const { error } = await supabase.auth.updateUser({ email: next });
    setBusy(false);
    if (error) { setLine(error.message); return; }
    onPendingEmail?.(next);
    setLine('Confirm the change from the link in your new inbox.');
  };

  const deleteAccount = async () => {
    if (confirmText !== 'DELETE') return;
    setBusy(true); setLine(null);
    const { error } = await invokeFunction<{ deleted: boolean }>('delete-account', {});
    if (error) { setBusy(false); setLine(error.message); return; }
    try { sessionStorage.setItem(ACCOUNT_DELETED_KEY, '1'); } catch { /* the line is a courtesy */ }
    // The auth user is gone, so a server sign-out would 4xx; clear this device and let AuthWrapper land on sign-in.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    setBusy(false);
    setSheet(null);
  };

  const sheetClass = 'bg-zinc-950 border-white/10 text-white px-5 pb-8 pt-5';

  return (
    <div className="px-3 py-3">
      {header}
      <NumberRow id="email" name="Email" editable={false} value={email || null}
        note={pendingEmail ? `Changing to ${pendingEmail}. Confirm from the link in that inbox.` : null} />
      <div className="py-1 flex items-center justify-between gap-3">
        <span className="text-[14px] text-white/85">Password</span>
        <button type="button" onClick={() => open('password')} className={`${pillClass} inline-flex items-center gap-1 outline-none focus:outline-none active:brightness-125`}>
          Change password<ChevronDown className="h-4 w-4 text-white/40" aria-hidden="true" />
        </button>
      </div>
      <div className="py-1 flex items-center justify-between gap-3">
        <span className="text-[14px] text-white/85">Sign-in address</span>
        <button type="button" onClick={() => open('email')} className={`${pillClass} inline-flex items-center gap-1 outline-none focus:outline-none active:brightness-125`}>
          Change email<ChevronDown className="h-4 w-4 text-white/40" aria-hidden="true" />
        </button>
      </div>
      <div className="pt-3 flex items-center gap-2">
        <GalaxyButton size="sm" onClick={() => void onSignOut()}>Sign out</GalaxyButton>
        <GalaxyButton size="sm" variant="danger" onClick={() => open('delete')} className="gap-1">
          Delete account<ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
        </GalaxyButton>
      </div>

      <Sheet open={sheet === 'password'} onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent side="bottom" className={sheetClass}>
          <SheetHeader><SheetTitle className="text-left text-white">Change password</SheetTitle></SheetHeader>
          <SheetDescription className="sr-only">Set a new password for this account.</SheetDescription>
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void changePassword(); }}>
            <label className="block text-[13px] text-white/60">New password
              <input type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} className={fieldClass} placeholder={`${PASSWORD_MIN}+ characters`} />
            </label>
            <label className="block text-[13px] text-white/60">Again
              <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={fieldClass} />
            </label>
            {line && <p className="text-[13px] text-white/75">{line}</p>}
            <GalaxyButton type="submit" variant="primary" size="lg" fullWidth disabled={busy}>{busy ? 'Setting…' : 'Set password'}</GalaxyButton>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === 'email'} onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent side="bottom" className={sheetClass}>
          <SheetHeader><SheetTitle className="text-left text-white">Change email</SheetTitle></SheetHeader>
          <SheetDescription className="sr-only">Send a confirmation link to a new sign-in address.</SheetDescription>
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void changeEmail(); }}>
            <label className="block text-[13px] text-white/60">New email
              <input type="email" autoComplete="email" inputMode="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={fieldClass} />
            </label>
            {line && <p className="text-[13px] text-white/75">{line}</p>}
            <GalaxyButton type="submit" variant="primary" size="lg" fullWidth disabled={busy}>{busy ? 'Sending…' : 'Send confirmation'}</GalaxyButton>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === 'delete'} onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent side="bottom" className={sheetClass}>
          <SheetHeader><SheetTitle className="text-left text-white">Delete account</SheetTitle></SheetHeader>
          <SheetDescription className="mt-3 text-left text-[14px] text-white/80 leading-snug">
            This deletes your account and everything in it: workouts, plans, numbers, photo. It cannot be undone.
          </SheetDescription>
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void deleteAccount(); }}>
            <label className="block text-[13px] text-white/60">Type DELETE to confirm.
              <input type="text" autoComplete="off" autoCapitalize="characters" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={fieldClass} />
            </label>
            {line && <p className="text-[13px] text-white/75">{line}</p>}
            <GalaxyButton type="submit" variant="danger" size="lg" fullWidth disabled={busy || confirmText !== 'DELETE'}>{busy ? 'Deleting…' : 'Delete account'}</GalaxyButton>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default AccountPlate;

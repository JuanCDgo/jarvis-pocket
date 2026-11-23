import { useEffect, useRef } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { PendingApproval } from '../types';

interface ApprovalDialogProps {
  approval: PendingApproval | null;
  onClose: () => void;
}

export function ApprovalDialog({ approval, onClose }: ApprovalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (approval && !dialog.open) {
      dialog.showModal();
    } else if (!approval && dialog.open) {
      dialog.close();
    }
  }, [approval]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      const value = dialog.returnValue;
      dialog.returnValue = '';
      if (value === 'approve' && approval) {
        void Promise.resolve(approval.onApprove());
      }
      onClose();
    };

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [approval, onClose]);

  const riskBadge =
    approval?.risk === 'high'
      ? { label: 'Riesgo Alto', cls: 'bg-red-950 text-red-200 border-red-700', Icon: ShieldAlert }
      : approval?.risk === 'medium'
        ? { label: 'Riesgo Medio', cls: 'bg-amber-950 text-amber-200 border-amber-700', Icon: AlertTriangle }
        : { label: 'Riesgo Bajo', cls: 'bg-emerald-950 text-emerald-200 border-emerald-700', Icon: ShieldCheck };

  const RiskIcon = riskBadge.Icon;

  return (
    <dialog ref={dialogRef} aria-labelledby="approval-dialog-title">
      {approval && (
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                Guardrail · TU SÍ
              </p>
              <h2 id="approval-dialog-title" className="text-lg font-bold text-slate-100 mt-0.5">
                {approval.title}
              </h2>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shrink-0 ${riskBadge.cls}`}
            >
              <RiskIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {riskBadge.label}
            </span>
          </div>

          <p className="text-sm text-slate-300">{approval.description}</p>

          <pre className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-sky-200 overflow-x-auto whitespace-pre-wrap break-words">
            <code>{approval.commandPreview}</code>
          </pre>

          {approval.reasons.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
              {approval.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}

          <form method="dialog" className="flex items-center justify-end gap-2 pt-2">
            <button
              type="submit"
              value="cancel"
              autoFocus
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              Cancelar
            </button>
            <button
              type="submit"
              value="approve"
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-sky-300"
            >
              Aprobar y ejecutar
            </button>
          </form>
        </div>
      )}
    </dialog>
  );
}

import { useState } from 'react';
import { Button, Modal } from '../../components/ui';
import type { Countdown, CountdownDraft, CountdownType, RepeatRule } from './api';
import { TYPE_LABEL } from './presentation';

const REMINDERS = [
  [0, 'El mismo día (09:00)'],
  [1, '1 día antes (09:00)'],
  [2, '2 días antes (09:00)'],
  [3, '3 días antes (09:00)'],
  [7, '1 semana antes (09:00)'],
] as const;

const COLORS = [
  ['none', 'Sin color'],
  ['blue', 'Azul'],
  ['teal', 'Turquesa'],
  ['green', 'Verde'],
  ['lime', 'Lima'],
  ['orange', 'Naranja'],
  ['red', 'Rojo'],
  ['pink', 'Rosa'],
  ['purple', 'Morado'],
  ['navy', 'Azul marino'],
  ['brown', 'Marrón'],
  ['black', 'Negro'],
  ['rainbow', 'Arcoíris'],
] as const;

function draftFor(type: CountdownType, value?: Countdown): CountdownDraft {
  return {
    title: value?.title ?? '',
    type: value?.type ?? type,
    emoji: value?.emoji ?? null,
    targetDate: value?.targetDate.slice(0, 10) ?? '',
    repeatRule: value?.repeatRule ?? (type === 'anniversary' || type === 'birthday' ? 'yearly' : 'none'),
    dayMode: value?.dayMode ?? 'standard',
    color: value?.color ?? null,
    notes: value?.notes ?? null,
    showInSidebar: value?.showInSidebar ?? true,
    showInSmartList: value?.showInSmartList ?? true,
    reminders: value?.reminders ?? [],
  };
}

export function CountdownDialog({
  type,
  countdown,
  onClose,
  onSave,
}: {
  readonly type: CountdownType;
  readonly countdown?: Countdown;
  readonly onClose: () => void;
  readonly onSave: (draft: CountdownDraft) => void;
}) {
  const [draft, setDraft] = useState(() => draftFor(type, countdown));
  const [customDays, setCustomDays] = useState('');
  const offsetDays = new Set(draft.reminders.filter((item) => !item.constant).map((item) => item.offsetDays));
  const constant = draft.reminders.some((item) => item.constant);
  const toggleReminder = (offset: number): void => {
    setDraft((current) => ({
      ...current,
      reminders: current.reminders.some((item) => !item.constant && item.offsetDays === offset)
        ? current.reminders.filter((item) => item.constant || item.offsetDays !== offset)
        : [...current.reminders, { offsetDays: offset }],
    }));
  };
  return (
    <Modal title={countdown === undefined ? 'Nueva cuenta atrás' : 'Editar cuenta atrás'} onClose={onClose}>
      <form
        className="countdown-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.title.trim().length > 0 && draft.targetDate.length > 0) onSave({ ...draft, title: draft.title.trim() });
        }}
      >
        <label>Emoji<input aria-label="Emoji" value={draft.emoji ?? ''} maxLength={8} placeholder="⏳" onChange={(event) => setDraft({ ...draft, emoji: event.target.value || null })} /></label>
        <label>Nombre<input autoFocus value={draft.title} maxLength={200} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>Fecha<input type="date" value={draft.targetDate} required onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} /></label>
        <label>Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as CountdownType })}>{(Object.entries(TYPE_LABEL) as [CountdownType, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Color<select value={draft.color ?? 'none'} onChange={(event) => setDraft({ ...draft, color: event.target.value === 'none' ? null : event.target.value as CountdownDraft['color'] })}>{COLORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Repetición<select value={draft.repeatRule} onChange={(event) => setDraft({ ...draft, repeatRule: event.target.value as RepeatRule })}><option value="none">Ninguna</option><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option><option value="yearly">Anual</option></select></label>
        <fieldset><legend>Recordatorios</legend>{REMINDERS.map(([offset, label]) => <label key={offset}><input type="checkbox" checked={offsetDays.has(offset)} onChange={() => toggleReminder(offset)} />{label}</label>)}
          <label>Personalizado (días antes)<input type="number" min="1" max="365" value={customDays} onChange={(event) => setCustomDays(event.target.value)} onBlur={() => { const offset = Number(customDays); if (offset >= 1 && offset <= 365 && !offsetDays.has(offset)) toggleReminder(offset); }} /></label>
          <label><input type="checkbox" checked={constant} onChange={() => setDraft((current) => ({ ...current, reminders: constant ? current.reminders.filter((item) => !item.constant) : [...current.reminders, { offsetDays: 0, constant: true }] }))} />Recordatorio constante</label>
        </fieldset>
        <fieldset><legend>Modo de cálculo</legend><label><input type="radio" checked={draft.dayMode === 'standard'} onChange={() => setDraft({ ...draft, dayMode: 'standard' })} />Estándar — el día 1 empieza después de la fecha</label><label><input type="radio" checked={draft.dayMode === 'plus_one'} onChange={() => setDraft({ ...draft, dayMode: 'plus_one' })} />Estándar +1 día — el día 1 empieza en la fecha</label></fieldset>
        <label><input type="checkbox" checked={draft.showInSmartList} onChange={(event) => setDraft({ ...draft, showInSmartList: event.target.checked })} />Mostrar el día D en Hoy</label>
        <label><input type="checkbox" checked={draft.showInSidebar} onChange={(event) => setDraft({ ...draft, showInSidebar: event.target.checked })} />Mostrar en la barra lateral</label>
        <label>Notas<textarea value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} /></label>
        <div className="countdown-dialog-actions"><Button type="button" onClick={onClose}>Cancelar</Button><Button variant="primary" type="submit">Guardar</Button></div>
      </form>
    </Modal>
  );
}

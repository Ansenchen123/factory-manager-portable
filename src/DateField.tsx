import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { parseCalendarDate } from '../shared/maintenance';

type Props = {
  label: string;
  value: string;
  disabled?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
};

// Typing YYYY-MM-DD stays the primary input; the calendar button opens Chromium's native picker
// through a visually hidden date input that sits outside the label so the label keeps one control.
export function DateField({ label, value, disabled, describedBy, onChange }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  return <div className="dateField">
    <label>{label}
      <input disabled={disabled} type="text" inputMode="numeric" placeholder="YYYY-MM-DD" aria-describedby={describedBy}
        value={value} onChange={event => onChange(event.target.value)} />
    </label>
    <button className="iconButton ghost datePickerButton" type="button" disabled={disabled} aria-label={`從月曆選擇${label}`} title="開啟月曆"
      onClick={() => {
        const input = picker.current;
        if (!input) return;
        input.value = parseCalendarDate(value) ? value : '';
        try { input.showPicker(); } catch { input.focus(); }
      }}>
      <CalendarDays size={16} />
    </button>
    <input ref={picker} className="datePicker" type="date" tabIndex={-1} aria-hidden="true"
      onChange={event => { if (event.target.value) onChange(event.target.value); }} />
  </div>;
}

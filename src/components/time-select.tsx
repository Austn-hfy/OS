import { clockToMinute, formatLocalMinute, minuteToClock } from "@/domain/dayparts";

export function TimeSelect({
  ariaLabel,
  value,
  onChange,
  disabled = false,
  required = false,
  stepMinutes = 30,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  stepMinutes?: 15 | 30;
}) {
  const options = Array.from({ length: (24 * 60) / stepMinutes }, (_, index) => {
    const minute = index * stepMinutes;
    return { value: minuteToClock(minute), label: formatLocalMinute(minute) };
  });
  const customValue = value && !options.some((option) => option.value === value) ? value : null;

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      required={required}
      onChange={(event) => onChange(event.target.value)}
    >
      {customValue ? <option value={customValue}>{formatLocalMinute(clockToMinute(customValue))}</option> : null}
      {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select>
  );
}

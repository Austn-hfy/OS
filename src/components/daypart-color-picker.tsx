"use client";

import { DAYPART_COLOR_PRESET_ROWS, roomShadeColors, type RoomHue } from "@/domain/dayparts";

export function DaypartColorPicker({ value, onChange, ariaLabel, hue }: { value: string; onChange: (value: string) => void; ariaLabel: string; hue?: RoomHue | null }) {
  const allowedColors = hue ? new Set(roomShadeColors(hue)) : null;
  return (
    <div className={`daypart-color-spectrum ${hue ? "single-hue" : ""}`} role="group" aria-label={ariaLabel}>
      {DAYPART_COLOR_PRESET_ROWS.map((row) => (
        <div className="daypart-color-row" key={row.label}>
          <span>{row.label}</span>
          <div className="daypart-color-presets">
            {row.colors.filter((color) => !allowedColors || allowedColors.has(color.value)).map((color) => (
              <button
                aria-label={`Use ${color.label}`}
                aria-pressed={value === color.value}
                title={color.label}
                className={value === color.value ? "active" : ""}
                type="button"
                style={{ background: color.value }}
                onClick={() => onChange(color.value)}
                key={color.value}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

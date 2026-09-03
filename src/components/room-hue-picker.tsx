"use client";

import { ROOM_HUE_ORDER, roomColor, type RoomHue } from "@/domain/dayparts";

const ROOM_HUE_LABELS: Record<RoomHue, string> = {
  blue: "Blue",
  orange: "Orange",
  green: "Green",
  purple: "Purple",
  yellow: "Yellow",
  navy: "Navy",
  red: "Red",
  teal: "Teal",
};

export function RoomHuePicker({ value, onChange, ariaLabel }: { value: RoomHue; onChange: (hue: RoomHue) => void; ariaLabel: string }) {
  return (
    <div className="room-hue-picker" role="radiogroup" aria-label={ariaLabel}>
      {ROOM_HUE_ORDER.map((hue) => (
        <button
          className={value === hue ? "active" : ""}
          type="button"
          role="radio"
          aria-checked={value === hue}
          title={ROOM_HUE_LABELS[hue]}
          onClick={() => onChange(hue)}
          key={hue}
        >
          <i style={{ background: roomColor(hue) }} aria-hidden="true" />
          <span>{ROOM_HUE_LABELS[hue]}</span>
        </button>
      ))}
    </div>
  );
}

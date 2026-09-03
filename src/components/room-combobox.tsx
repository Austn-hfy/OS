"use client";

import { useMemo, useState } from "react";
import { roomColor, type RoomHue } from "@/domain/dayparts";

export type RoomComboboxOption = {
  id: string;
  name: string;
  hue: RoomHue;
};

function normalizedRoomName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function editDistance(left: string, right: string): number {
  const prior = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        prior[rightIndex] + 1,
        prior[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    prior.splice(0, prior.length, ...current);
  }
  return prior[right.length];
}

export function roomMatchScore(query: string, roomName: string): number {
  const normalizedQuery = normalizedRoomName(query);
  const normalizedName = normalizedRoomName(roomName);
  if (!normalizedQuery) return 4;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) return 2;
  const distance = editDistance(normalizedQuery, normalizedName);
  const threshold = Math.max(1, Math.min(3, Math.round(Math.max(normalizedQuery.length, normalizedName.length) * 0.2)));
  return distance <= threshold ? 3 : 4;
}

export function RoomCombobox({
  rooms,
  value,
  selectedRoomId,
  creationConfirmed = false,
  placeholder = "Start typing a room name",
  ariaLabel = "Room or space",
  autoFocus = false,
  onChange,
  onSelect,
  onCreate,
}: {
  rooms: RoomComboboxOption[];
  value: string;
  selectedRoomId?: string | null;
  creationConfirmed?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSelect: (room: RoomComboboxOption) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trimmedValue = value.trim().replace(/\s+/g, " ");
  const rankedRooms = useMemo(() => rooms
    .map((room) => ({ room, score: roomMatchScore(value, room.name) }))
    .sort((left, right) => left.score - right.score || left.room.name.localeCompare(right.room.name)), [rooms, value]);
  const exactRoom = rankedRooms.find(({ score }) => score === 0)?.room;
  const similarRoom = rankedRooms.find(({ score }) => score > 0 && score <= 3)?.room;
  const selectionReady = Boolean(selectedRoomId || creationConfirmed);

  return <div className="room-combobox" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <input
      role="combobox"
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls="room-combobox-options"
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={160}
      onFocus={() => setOpen(true)}
      onClick={() => setOpen(true)}
      onChange={(event) => { onChange(event.target.value); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "Enter") event.preventDefault();
      }}
      required
    />
    {open ? <div className="room-combobox-options" id="room-combobox-options" role="listbox" aria-label="Rooms and spaces">
      {rankedRooms.map(({ room, score }) => <button
        className={room.id === selectedRoomId ? "selected" : ""}
        type="button"
        role="option"
        aria-selected={room.id === selectedRoomId}
        onClick={() => { onSelect(room); setOpen(false); }}
        key={room.id}
      >
        <i style={{ background: roomColor(room.hue) }} aria-hidden="true" />
        <span><strong>{room.name}</strong><small>{score === 0 ? "Existing room — use this" : "Existing room"}</small></span>
        {room.id === selectedRoomId ? <b aria-hidden="true">✓</b> : null}
      </button>)}
      {trimmedValue && !exactRoom ? <button
        className={`create ${creationConfirmed ? "selected" : ""}`}
        type="button"
        role="option"
        aria-selected={creationConfirmed}
        onClick={() => { onCreate(trimmedValue); setOpen(false); }}
      >
        <i aria-hidden="true">+</i>
        <span><strong>Create “{trimmedValue}”</strong><small>{similarRoom ? `Similar room found: ${similarRoom.name}` : "Add as a new room or space"}</small></span>
        {creationConfirmed ? <b aria-hidden="true">✓</b> : null}
      </button> : null}
    </div> : null}
    <small className={selectionReady ? "room-combobox-status ready" : "room-combobox-status"}>
      {selectedRoomId ? "Using an existing room." : creationConfirmed ? "New space selected. Choose its color below." : "Choose an existing room from the list, or explicitly create a new space."}
    </small>
  </div>;
}

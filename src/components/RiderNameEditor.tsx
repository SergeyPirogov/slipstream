import { useState, useRef, useEffect } from "react";
import { useStore, type Slot } from "../store";

export function RiderNameEditor({
  slot,
  className,
  readonly,
}: {
  slot: Slot;
  className?: string;
  readonly?: boolean;
}) {
  const track = useStore((s) => (slot === "A" ? s.trackA : s.trackB));
  const setRiderName = useStore((s) => s.setRiderName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!track) return null;

  if (readonly) {
    return <span className={`rider-name ${className ?? ""}`}>{track.rider}</span>;
  }

  const commit = () => {
    const v = draft.trim();
    if (v.length > 0) setRiderName(slot, v);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`rider-edit ${className ?? ""}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        maxLength={40}
      />
    );
  }

  return (
    <span
      className={`rider-name ${className ?? ""}`}
      title="Click to rename"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDraft(track.rider);
        setEditing(true);
      }}
    >
      {track.rider}
    </span>
  );
}

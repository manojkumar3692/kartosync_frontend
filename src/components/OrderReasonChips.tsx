import React from "react";
import { parseReasonFlags } from "../utils/parseReasonFlags";

type Props = {
  parseReason?: string | null;
  className?: string;
};

const Chip: React.FC<{ title: string; tooltip?: string; tone?: "emerald"|"blue"|"amber"|"slate" }> = ({ title, tooltip, tone = "slate" }) => {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
    blue:    "bg-blue-100 text-blue-700 border-blue-200",
    amber:   "bg-amber-100 text-amber-800 border-amber-200",
    slate:   "bg-slate-100 text-slate-700 border-slate-200",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10px] font-medium ${tones[tone]}`}
      title={tooltip}
    >
      {title}
    </span>
  );
};

export const OrderReasonChips: React.FC<Props> = ({ parseReason, className }) => {
  const f = parseReason ? parseReasonFlags(parseReason) : null;

  if (!f) return null;

  const editedAtStr =
    f.editedAt && !Number.isNaN(f.editedAt)
      ? new Date(f.editedAt).toLocaleString()
      : undefined;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {f.edited && (
        <Chip
          title="Edited"
          tooltip={["Edited order", f.msgId ? `msgid=${f.msgId}` : null, editedAtStr ? `at ${editedAtStr}` : null]
            .filter(Boolean)
            .join(" · ")}
          tone="emerald"
        />
      )}

      {f.merged && (
        <Chip
          title="Merged"
          tooltip={["Appended to prior order", f.msgId ? `msgid=${f.msgId}` : null]
            .filter(Boolean)
            .join(" · ")}
          tone="blue"
        />
      )}

      {f.inquiryKind && (
        <Chip
          title={`Inquiry: ${f.inquiryKind}`}
          tooltip="Detected as inquiry (not an order)"
          tone="amber"
        />
      )}

      {/* Optional: always show a subtle tag if msgId exists (for quick tracing) */}
      {!f.edited && !f.merged && f.msgId && (
        <Chip title="Tagged" tooltip={`msgid=${f.msgId}`} tone="slate" />
      )}
    </div>
  );
};
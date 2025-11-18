// src/components/InquiryCard.tsx
import React from "react";

export type InquiryKind = "price" | "availability" | string;

export type InquiryInfo = {
  last_inquiry_text: string | null;
  last_inquiry_kind: InquiryKind | null;
  last_inquiry_canonical: string | null;
  last_inquiry_at: string | null;
  last_inquiry_status: "unresolved" | "resolved" | null;
};

type Props = {
  inquiry: InquiryInfo;
  phone?: string | null;
  onOpenPricePanel?: () => void;
  onOpenAvailabilityPanel?: () => void;
  onFocusComposer?: () => void;
};

export default function InquiryCard({
  inquiry,
  phone,
  onOpenPricePanel,
  onOpenAvailabilityPanel,
  onFocusComposer,
}: Props) {
  if (!inquiry.last_inquiry_text) return null;

  const kindLabel =
    inquiry.last_inquiry_kind === "price"
      ? "Price enquiry"
      : inquiry.last_inquiry_kind === "availability"
      ? "Availability enquiry"
      : "Customer enquiry";

  const dt = inquiry.last_inquiry_at ? new Date(inquiry.last_inquiry_at) : null;

  return (
    <div
      className="w-full mb-2 flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
    >
      <div className="space-y-1">
        <div className="font-semibold flex items-center gap-1">
          <span>❓ {kindLabel}</span>
          <span className="text-[9px] px-2 py-[1px] rounded-full bg-amber-100 border border-amber-200">
            AI paused
          </span>
        </div>

        <div className="text-[9px] text-slate-500">
          {phone && <span>{phone}</span>}
          {dt && (
            <span>
              {" "}
              •{" "}
              {dt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {inquiry.last_inquiry_status === "unresolved" && (
            <span className="ml-1 font-medium text-amber-700">
              • Needs human reply
            </span>
          )}
        </div>

        <div className="mt-1 text-[10px] italic text-amber-900">
          “{inquiry.last_inquiry_text}”
        </div>

        {inquiry.last_inquiry_canonical && (
          <div className="text-[10px] text-amber-800">
            Matched to:{" "}
            <span className="font-semibold">
              {inquiry.last_inquiry_canonical}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 text-[9px] shrink-0">
        {inquiry.last_inquiry_kind === "price" && onOpenPricePanel && (
          <button
            type="button"
            onClick={onOpenPricePanel}
            className="rounded-full border border-amber-300 bg-white px-2 py-[3px] hover:bg-amber-100 text-amber-900"
          >
            💸 Open price reply
          </button>
        )}

        {inquiry.last_inquiry_kind === "availability" &&
          onOpenAvailabilityPanel && (
            <button
              type="button"
              onClick={onOpenAvailabilityPanel}
              className="rounded-full border border-amber-300 bg-white px-2 py-[3px] hover:bg-amber-100 text-amber-900"
            >
              ✅ Availability reply
            </button>
          )}

        {onFocusComposer && (
          <button
            type="button"
            onClick={onFocusComposer}
            className="rounded-full border border-amber-300 bg-amber-600 px-2 py-[3px] text-white hover:bg-amber-500"
          >
            ✍️ Manual reply
          </button>
        )}
      </div>
    </div>
  );
}
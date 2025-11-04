import React from "react";

export default function UpgradeBanner() {
  return (
    <div className="p-3 bg-indigo-50 rounded border text-sm">
      <div className="font-medium">Free plan limit: 25 orders/day</div>
      <div>
        Upgrade to Pro for unlimited + PDF invoices. Contact{" "}
        <a className="underline" href="mailto:sales@tropicalglow.in">
          sales@tropicalglow.in
        </a>
      </div>
    </div>
  );
}

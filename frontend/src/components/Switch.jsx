import React from "react";

export default function Switch({ checked, onChange, label, testId }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-on={checked ? "true" : "false"}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className="dm-switch"
      />
      <span className="text-[15px] font-semibold tracking-wide text-[var(--dm-text)]">
        {label}
      </span>
    </label>
  );
}

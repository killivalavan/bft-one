"use client";

import RaiseIssueModal from "@/components/support/RaiseIssueModal";

export default function AdminSupportPage() {
  return (
    <div>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <RaiseIssueModal isOpen={true} isInline={true} onClose={() => {}} />
      </div>
    </div>
  );
}

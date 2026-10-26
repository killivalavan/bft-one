"use client";

import React from "react";
import GeofenceGate from "@/components/GeofenceGate";

export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  return <GeofenceGate>{children}</GeofenceGate>;
}

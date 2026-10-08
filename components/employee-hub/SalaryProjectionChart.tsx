"use client";

import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { SalaryProjectionPoint } from "@/lib/services/employeeHubService";

interface SalaryProjectionChartProps {
  data: SalaryProjectionPoint[];
}

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const item: SalaryProjectionPoint = payload[0].payload;
    return (
      <div className="bg-[#0F172A] text-white p-3 rounded-xl shadow-lg border border-slate-700 text-xs space-y-1">
        <div className="font-bold text-blue-300">
          Year {item.calendarYear} {item.year === 0 ? "(Current)" : `(+${item.year} yrs)`}
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Monthly Salary:</span>
          <span className="font-extrabold text-white">
            ₹ {item.monthlySalary.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Annual CTC:</span>
          <span className="font-bold text-emerald-400">
            ₹ {item.annualCTC.toLocaleString("en-IN")}
          </span>
        </div>
        {item.cumulativeIncrement > 0 && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 text-[11px]">
            <span className="text-slate-400">Total Increment:</span>
            <span className="font-bold text-amber-400">
              +₹ {item.cumulativeIncrement.toLocaleString("en-IN")}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function SalaryProjectionChart({ data }: SalaryProjectionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-slate-400">
        No projection data available
      </div>
    );
  }

  // Format y-axis values to "₹ 25k"
  const formatYAxis = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${Math.round(val / 1000)}k`;
    return `₹${val}`;
  };

  return (
    <div className="w-full h-64 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="salaryGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis
            dataKey="calendarYear"
            stroke="#94A3B8"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: "#E2E8F0" }}
          />
          <YAxis
            stroke="#94A3B8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatYAxis}
            domain={["dataMin - 2000", "dataMax + 2000"]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="monthlySalary"
            stroke="#2563EB"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#salaryGradient)"
            dot={{ r: 4, fill: "#2563EB", stroke: "#FFFFFF", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "#1D4ED8", stroke: "#FFFFFF", strokeWidth: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

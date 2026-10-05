"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface DatePreset {
  label: string;
  getDate: () => Date;
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  presets?: DatePreset[];
  align?: "left" | "right";
  className?: string;
}

/**
 * Safely parse date strings in various formats:
 * - "Aug 31, 2026"
 * - "2026-08-31"
 * - "31/08/2026" or "31-08-2026"
 * - "31 Aug 2026"
 */
export function parseFlexibleDate(val: string): Date | null {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Standard JS Date constructor
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d;

  return null;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  label,
  required,
  presets,
  align = "left",
  className,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Parse current value to Date
  const parsedDate = useMemo(() => parseFlexibleDate(value), [value]);

  // Viewing month for calendar navigation
  const [viewMonth, setViewMonth] = useState<Date>(() => parsedDate || new Date());

  // Sync viewing month when popover opens or value changes to a valid date
  useEffect(() => {
    if (parsedDate) {
      setViewMonth(parsedDate);
    }
  }, [value]);

  // Close popover on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Calendar days grid
  const daysInGrid = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [viewMonth]);

  function handleSelectDate(d: Date) {
    const formatted = format(d, "MMM dd, yyyy");
    onChange(formatted);
    setIsOpen(false);
  }

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val) {
      const parts = val.split("-");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(d.getTime())) {
          handleSelectDate(d);
        }
      }
    }
  }

  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div ref={containerRef} className={cn("relative space-y-1", className)}>
      {label && (
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
          {label} {required && <span className="text-slate-400">*</span>}
        </label>
      )}

      {/* Input Field with Calendar Trigger */}
      <div className="relative flex items-center border-0 border-b border-slate-300 focus-within:border-[#2563EB] transition-colors group">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent border-0 rounded-none px-0.5 py-1.5 text-xs font-semibold text-[#0F172A] outline-none placeholder:text-slate-400 placeholder:font-normal"
        />

        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="p-1 text-slate-300 hover:text-slate-600 transition-colors cursor-pointer rounded shrink-0 mr-0.5"
            title="Clear date"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (!isOpen && parsedDate) {
              setViewMonth(parsedDate);
            }
            setIsOpen(!isOpen);
          }}
          className={cn(
            "p-1.5 rounded-md text-slate-400 group-hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer shrink-0",
            isOpen && "text-[#2563EB] bg-blue-50"
          )}
          title="Open calendar"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>

        {/* Hidden HTML5 date input fallback */}
        <input
          ref={nativeInputRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={handleNativeChange}
        />
      </div>

      {/* Calendar Popover */}
      {isOpen && (
        <div
          className={cn(
            "absolute top-full mt-1.5 z-50 w-72 bg-white border border-slate-200 shadow-xl rounded-xl p-3 animate-in fade-in zoom-in-95 duration-150",
            align === "right" ? "right-0 left-auto" : "left-0 right-auto"
          )}
        >
          {/* Header: Month / Year + Navigation */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setViewMonth((prev) => subMonths(prev, 1))}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-bold text-slate-800">
              {format(viewMonth, "MMMM yyyy")}
            </span>

            <button
              type="button"
              onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {weekdays.map((day) => (
              <span key={day} className="text-[10px] font-bold text-slate-400 uppercase py-0.5">
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {daysInGrid.map((day) => {
              const inCurrentMonth = isSameMonth(day, viewMonth);
              const isSelected = parsedDate ? isSameDay(day, parsedDate) : false;
              const isCurrentDay = isToday(day);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDate(day)}
                  className={cn(
                    "h-8 w-8 mx-auto flex items-center justify-center text-xs rounded-lg transition-all cursor-pointer font-medium relative",
                    !inCurrentMonth && "text-slate-300 hover:bg-slate-50",
                    inCurrentMonth && !isSelected && "text-slate-700 hover:bg-blue-50 hover:text-[#2563EB]",
                    isSelected && "bg-[#2563EB] text-white font-bold shadow-xs hover:bg-[#1D4ED8]",
                    isCurrentDay && !isSelected && "border border-blue-400 font-bold text-[#2563EB]"
                  )}
                  title={format(day, "MMM dd, yyyy")}
                >
                  {format(day, "d")}
                  {isCurrentDay && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#2563EB]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Presets */}
          {presets && presets.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Quick Presets
              </span>
              <div className="flex flex-wrap gap-1">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSelectDate(preset.getDate())}
                    className="px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-[#2563EB] border border-slate-200 hover:border-blue-200 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer Action */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => handleSelectDate(new Date())}
              className="font-bold text-[#2563EB] hover:underline cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                if (nativeInputRef.current) {
                  try {
                    nativeInputRef.current.showPicker();
                  } catch {
                    nativeInputRef.current.focus();
                  }
                }
              }}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Open browser native date picker"
            >
              More options
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

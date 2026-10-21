"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SelectOption {
  value: string;
  label: string;
  badge?: string | React.ReactNode;
  badgeVariant?: "default" | "danger" | "success" | "warning" | "info";
  sublabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
  size?: "sm" | "md" | "lg";
  id?: string;
  ariaLabel?: string;
}

export function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = "Select an option...",
  label,
  icon,
  className,
  triggerClassName,
  menuClassName,
  searchable = true,
  searchPlaceholder = "Search options...",
  disabled = false,
  align = "left",
  size = "sm",
  id,
  ariaLabel,
}: SelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Selected Option Object
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  // Filtered Options
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase().trim();
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(query);
      const matchSub = opt.sublabel?.toLowerCase().includes(query);
      const matchBadge = typeof opt.badge === "string" && opt.badge.toLowerCase().includes(query);
      return matchLabel || matchSub || matchBadge;
    });
  }, [options, searchQuery]);

  // Click Outside to Close (Desktop popover)
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
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

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchable) {
      const timer = setTimeout(() => {
        // Focus mobile input on small screens or desktop input on larger screens
        if (window.innerWidth < 640) {
          mobileSearchInputRef.current?.focus();
        } else {
          searchInputRef.current?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen, searchable]);

  function handleSelect(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setIsOpen(false);
  }

  // Size styling tokens
  const sizeStyles = {
    sm: "px-2.5 py-1.5 text-xs min-h-[34px] rounded-xl",
    md: "px-3 py-2 text-xs sm:text-sm min-h-[40px] rounded-xl",
    lg: "px-3.5 py-2.5 text-sm sm:text-base min-h-[46px] rounded-2xl",
  };

  // Badge variants
  function renderBadge(badge: string | React.ReactNode, variant: SelectOption["badgeVariant"] = "default") {
    if (!badge) return null;
    if (typeof badge !== "string") return badge;

    const variantStyles = {
      default: "bg-slate-100 text-slate-700 border-slate-200",
      danger: "bg-rose-100 text-rose-800 border-rose-200",
      success: "bg-emerald-100 text-emerald-800 border-emerald-200",
      warning: "bg-amber-100 text-amber-800 border-amber-200",
      info: "bg-blue-100 text-blue-800 border-blue-200",
    };

    return (
      <span
        className={cn(
          "px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shrink-0 whitespace-nowrap",
          variantStyles[variant] || variantStyles.default
        )}
      >
        {badge}
      </span>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-bold text-[#0F172A] block mb-1"
        >
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || label || placeholder}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between gap-2 bg-white text-[#0F172A] border border-slate-200 shadow-2xs font-bold text-left transition-all duration-150 cursor-pointer",
          "hover:border-slate-300 hover:bg-slate-50/70",
          "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500",
          sizeStyles[size],
          isOpen && "border-blue-500 ring-2 ring-blue-500/20 bg-slate-50/50",
          disabled && "opacity-50 cursor-not-allowed hover:bg-white hover:border-slate-200",
          triggerClassName
        )}
      >
        {/* Left Side: Icon & Selected Label */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-slate-500 shrink-0">{icon}</span>}
          {selectedOption ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {selectedOption.icon && (
                <span className="shrink-0">{selectedOption.icon}</span>
              )}
              <span className="truncate">{selectedOption.label}</span>
              {selectedOption.badge && (
                <span className="inline-flex shrink-0 max-w-[110px] truncate">
                  {renderBadge(selectedOption.badge, selectedOption.badgeVariant)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 font-medium truncate">
              {placeholder}
            </span>
          )}
        </div>

        {/* Right Side: Chevron Indicator */}
        <ChevronDown
          size={14}
          className={cn(
            "text-slate-400 shrink-0 transition-transform duration-200",
            isOpen && "transform rotate-180 text-blue-600"
          )}
        />
      </button>

      {/* ======================================================== */}
      {/* 1. DESKTOP FLOATING POPOVER (FOR SCREENS >= 640px)       */}
      {/* ======================================================== */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className={cn(
            "hidden sm:block absolute z-50 mt-1.5 w-full min-w-[220px] max-w-[420px] bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md",
            align === "right" ? "right-0 left-auto" : "left-0 right-auto",
            menuClassName
          )}
        >
          {/* Optional Search Filter Bar */}
          {searchable && options.length > 4 && (
            <div className="p-2 border-b border-slate-100 bg-slate-50/70 sticky top-0 z-10">
              <div className="relative flex items-center">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Desktop Options List */}
          <div
            ref={listRef}
            className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      "w-full px-2.5 py-2 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between gap-2 cursor-pointer",
                      isSelected
                        ? "bg-blue-50/80 text-blue-700 font-extrabold"
                        : "text-slate-700 hover:bg-slate-100/70 hover:text-slate-900",
                      opt.disabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
                    )}
                  >
                    {/* Option Details */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isSelected ? (
                        <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                          <Check size={10} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                          {opt.icon || <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn("truncate", isSelected && "text-blue-900")}>
                            {opt.label}
                          </span>
                        </div>
                        {opt.sublabel && (
                          <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                            {opt.sublabel}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Option Badge */}
                    {opt.badge && (
                      <div className="shrink-0">
                        {renderBadge(opt.badge, opt.badgeVariant)}
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-6 px-3 text-center text-slate-400 text-xs">
                <p className="font-semibold">No options found</p>
                {searchQuery && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    No results matching &ldquo;{searchQuery}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. MOBILE BOTTOM SHEET (FOR SMALL SCREENS < 640px)       */}
      {/* ======================================================== */}
      {isOpen && mounted && createPortal(
        <div className="sm:hidden fixed inset-0 z-[9999] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Bottom Sheet Drawer */}
          <div className="relative z-10 w-full bg-white rounded-t-3xl border-t border-slate-200 shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200 ease-out">
            {/* Sheet Handle & Header */}
            <div className="p-3 pb-2.5 border-b border-slate-100 text-center relative shrink-0">
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-2" />
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 min-w-0">
                  {icon && <span className="text-slate-500 shrink-0">{icon}</span>}
                  <h3 className="font-extrabold text-sm text-[#0F172A] truncate">
                    {label || placeholder}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs cursor-pointer shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Mobile Search Input */}
            {searchable && options.length > 3 && (
              <div className="p-2.5 border-b border-slate-100 bg-slate-50/70 shrink-0">
                <div className="relative flex items-center">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    ref={mobileSearchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Mobile Options Scroll Area */}
            <div className="overflow-y-auto p-2 space-y-1 max-h-[55vh] overscroll-contain">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => handleSelect(opt)}
                      className={cn(
                        "w-full px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between gap-2.5 active:scale-[0.99] cursor-pointer",
                        isSelected
                          ? "bg-blue-50 text-blue-700 font-extrabold border border-blue-200/80"
                          : "text-slate-700 hover:bg-slate-50 active:bg-slate-100 border border-transparent",
                        opt.disabled && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      {/* Left: Icon, Selection Indicator, Label & Sublabel */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                            <Check size={11} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-5 h-5 shrink-0 flex items-center justify-center text-slate-400">
                            {opt.icon || <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate font-bold text-xs", isSelected ? "text-blue-900" : "text-slate-800")}>
                            {opt.label}
                          </p>
                          {opt.sublabel && (
                            <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                              {opt.sublabel}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Badge */}
                      {opt.badge && (
                        <div className="shrink-0">
                          {renderBadge(opt.badge, opt.badgeVariant)}
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="py-8 px-4 text-center text-slate-400 text-xs">
                  <p className="font-semibold">No options found</p>
                  {searchQuery && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      No results matching &ldquo;{searchQuery}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Safe Area for Mobile Gestures */}
            <div className="h-4 shrink-0" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

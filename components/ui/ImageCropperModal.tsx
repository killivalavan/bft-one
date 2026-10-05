"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Check, ZoomIn, ZoomOut, RotateCcw, Crop, Move, Maximize2 } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils/cn";

interface ImageCropperModalProps {
  isOpen: boolean;
  imageSrc: string;
  cropType: "logo" | "signature";
  aspectRatio?: number; // width / height, e.g. 1 for 1:1, 2.5 for signature
  title?: string;
  minSize?: number; // minimum width in px
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
}

export function ImageCropperModal({
  isOpen,
  imageSrc,
  cropType,
  aspectRatio = 1,
  title = cropType === "logo" ? "Crop Shop Logo (1:1 Square)" : "Crop Authorised Signature (1:1 Square)",
  minSize = 60,
  onClose,
  onCropComplete,
}: ImageCropperModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  type RatioMode = "square" | "rect" | "full";
  const [ratioMode, setRatioMode] = useState<RatioMode>(
    aspectRatio === 2.5 ? "rect" : "square"
  );
  const [activeRatio, setActiveRatio] = useState<number>(aspectRatio);

  useEffect(() => {
    if (aspectRatio === 2.5) {
      setRatioMode("rect");
      setActiveRatio(2.5);
    } else {
      setRatioMode("square");
      setActiveRatio(aspectRatio || 1);
    }
  }, [aspectRatio, isOpen]);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);

  // Crop rectangle state (in display coordinates relative to container image)
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 150,
    height: 150 / aspectRatio,
  });

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null); // 'se' | 'sw' | 'ne' | 'nw'
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cropStartRect = useRef<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 0, height: 0 });

  function handleRatioModeChange(mode: RatioMode) {
    setRatioMode(mode);
    if (!displaySize.width || !displaySize.height) return;
    const w = displaySize.width;
    const h = displaySize.height;

    if (mode === "full") {
      setActiveRatio(w / h);
      setCrop({ x: 0, y: 0, width: w, height: h });
      return;
    }

    const newRatio = mode === "square" ? 1 : 2.5;
    setActiveRatio(newRatio);

    let cropW: number;
    let cropH: number;
    if (newRatio >= 1) {
      cropW = Math.min(w * 0.88, (h * 0.88) * newRatio);
      cropH = cropW / newRatio;
    } else {
      cropH = Math.min(h * 0.88, (w * 0.88) / newRatio);
      cropW = cropH * newRatio;
    }
    cropW = Math.max(cropW, minSize);
    cropH = Math.max(cropH, minSize / newRatio);
    const cropX = Math.max(0, (w - cropW) / 2);
    const cropY = Math.max(0, (h - cropH) / 2);
    setCrop({ x: cropX, y: cropY, width: cropW, height: cropH });
  }

  // Load image dimensions
  useEffect(() => {
    if (!imageSrc || !isOpen) {
      setImageLoaded(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });

      // Calculate display size to fit inside 420x340 area
      const maxW = 420;
      const maxH = 320;
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      const scale = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      setDisplaySize({ width: w, height: h });
      setZoom(1);

      if (ratioMode === "full") {
        setCrop({ x: 0, y: 0, width: w, height: h });
        setActiveRatio(w / h);
      } else {
        const ratioToUse = ratioMode === "square" ? 1 : 2.5;
        let cropW: number;
        let cropH: number;

        if (ratioToUse >= 1) {
          cropW = Math.min(w * 0.88, (h * 0.88) * ratioToUse);
          cropH = cropW / ratioToUse;
        } else {
          cropH = Math.min(h * 0.88, (w * 0.88) / ratioToUse);
          cropW = cropH * ratioToUse;
        }

        cropW = Math.max(cropW, minSize);
        cropH = Math.max(cropH, minSize / ratioToUse);

        const cropX = Math.max(0, (w - cropW) / 2);
        const cropY = Math.max(0, (h - cropH) / 2);

        setCrop({ x: cropX, y: cropY, width: cropW, height: cropH });
        setActiveRatio(ratioToUse);
      }
      setImageLoaded(true);
    };
  }, [imageSrc, isOpen, ratioMode, minSize]);

  // Handle Drag Move (Reposition crop area)
  const handlePointerDownMove = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    cropStartRect.current = { ...crop };
  };

  // Handle Resize Move (Corner handle)
  const handlePointerDownResize = (e: React.PointerEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(handle);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    cropStartRect.current = { ...crop };
  };

  // Global pointer move listener
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging && !isResizing) return;

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      const initial = cropStartRect.current;
      const maxX = displaySize.width;
      const maxY = displaySize.height;

      if (isDragging) {
        // Move box without resizing
        let newX = initial.x + deltaX;
        let newY = initial.y + deltaY;

        // Keep inside bounds
        newX = Math.max(0, Math.min(newX, maxX - initial.width));
        newY = Math.max(0, Math.min(newY, maxY - initial.height));

        setCrop({
          ...initial,
          x: newX,
          y: newY,
        });
      } else if (isResizing) {
        // Resizing from corners preserving aspect ratio
        let newWidth = initial.width;
        let newHeight = initial.height;
        let newX = initial.x;
        let newY = initial.y;

        if (isResizing === "se") {
          const rawW = initial.width + deltaX;
          newWidth = Math.max(minSize, Math.min(rawW, maxX - initial.x, (maxY - initial.y) * activeRatio));
          newHeight = newWidth / activeRatio;
        } else if (isResizing === "sw") {
          const rawW = initial.width - deltaX;
          newWidth = Math.max(minSize, Math.min(rawW, initial.x + initial.width, (maxY - initial.y) * activeRatio));
          newHeight = newWidth / activeRatio;
          newX = initial.x + (initial.width - newWidth);
        } else if (isResizing === "ne") {
          const rawW = initial.width + deltaX;
          newWidth = Math.max(minSize, Math.min(rawW, maxX - initial.x, (initial.y + initial.height) * activeRatio));
          newHeight = newWidth / activeRatio;
          newY = initial.y + (initial.height - newHeight);
        } else if (isResizing === "nw") {
          const rawW = initial.width - deltaX;
          newWidth = Math.max(minSize, Math.min(rawW, initial.x + initial.width, (initial.y + initial.height) * activeRatio));
          newHeight = newWidth / activeRatio;
          newX = initial.x + (initial.width - newWidth);
          newY = initial.y + (initial.height - newHeight);
        }

        setCrop({
          x: Math.max(0, newX),
          y: Math.max(0, newY),
          width: newWidth,
          height: newHeight,
        });
      }
    },
    [isDragging, isResizing, displaySize, minSize, activeRatio]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [isDragging, isResizing, handlePointerMove, handlePointerUp]);

  // Instantly apply entire original image without any cropping or cut
  const handleUseFullImage = () => {
    if (!imgRef.current || !imageLoaded) {
      if (imageSrc) {
        onCropComplete(imageSrc);
        onClose();
      }
      return;
    }
    const img = imgRef.current;
    // Scale down ultra-large camera photos (>1200px) so they don't break local storage or payload limits
    const maxDimension = 1200;
    let targetW = img.naturalWidth;
    let targetH = img.naturalHeight;
    if (targetW > maxDimension || targetH > maxDimension) {
      const scale = Math.min(maxDimension / targetW, maxDimension / targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL("image/png", 0.95);
      onCropComplete(dataUrl);
    } else {
      onCropComplete(imageSrc);
    }
    onClose();
  };

  // Execute Crop to High-Res Canvas
  const handleApplyCrop = () => {
    if (!imgRef.current || !imageLoaded) return;

    const img = imgRef.current;
    // Map display coordinates to natural image coordinates
    const scaleFactorX = img.naturalWidth / displaySize.width;
    const scaleFactorY = img.naturalHeight / displaySize.height;

    const sourceX = Math.max(0, crop.x * scaleFactorX);
    const sourceY = Math.max(0, crop.y * scaleFactorY);
    const sourceW = Math.min(img.naturalWidth - sourceX, crop.width * scaleFactorX);
    const sourceH = Math.min(img.naturalHeight - sourceY, crop.height * scaleFactorY);

    if (sourceW <= 0 || sourceH <= 0) return;

    // Target output dimensions (preserving exact crop aspect ratio)
    const cropAspect = sourceW / sourceH;
    let targetW = Math.min(1000, Math.max(300, Math.round(sourceW)));
    let targetH = Math.round(targetW / cropAspect);
    if (targetH > 1000) {
      targetH = 1000;
      targetW = Math.round(targetH * cropAspect);
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceW,
        sourceH,
        0,
        0,
        targetW,
        targetH
      );

      const croppedDataUrl = canvas.toDataURL("image/png", 0.95);
      onCropComplete(croppedDataUrl);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[95vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 p-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Crop className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="text-[11px] text-slate-400">
                Choose Square (1:1), Rectangle (2.5:1), or Full Image (no cut). You can also drag or resize the crop box.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cropper Workspace Area */}
        <div className="p-5 flex flex-col items-center justify-center bg-zinc-900 overflow-hidden select-none">
          {imageLoaded ? (
            <div
              ref={containerRef}
              style={{ width: displaySize.width, height: displaySize.height }}
              className="relative shadow-lg overflow-hidden bg-black/50 touch-none"
            >
              {/* Image Underlay */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt="Crop Target"
                style={{ width: displaySize.width, height: displaySize.height }}
                className="w-full h-full object-fill pointer-events-none block"
              />

              {/* Darkened Mask Outside Crop */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "rgba(0, 0, 0, 0.55)",
                  clipPath: `polygon(
                    0% 0%, 100% 0%, 100% 100%, 0% 100%,
                    0% ${crop.y}px,
                    ${crop.x}px ${crop.y}px,
                    ${crop.x}px ${crop.y + crop.height}px,
                    ${crop.x + crop.width}px ${crop.y + crop.height}px,
                    ${crop.x + crop.width}px ${crop.y}px,
                    0% ${crop.y}px
                  )`,
                }}
              />

              {/* Interactive Crop Rectangle */}
              <div
                onPointerDown={handlePointerDownMove}
                style={{
                  left: `${crop.x}px`,
                  top: `${crop.y}px`,
                  width: `${crop.width}px`,
                  height: `${crop.height}px`,
                }}
                className={`absolute border-2 border-[#2563EB] shadow-2xl cursor-move ${
                  cropType === "logo" ? "rounded-lg" : "rounded-md"
                }`}
              >
                {/* Center Move Icon Indicator */}
                <div className="absolute inset-0 flex items-center justify-center opacity-30 hover:opacity-75 transition-opacity pointer-events-none">
                  <Move className="w-6 h-6 text-white drop-shadow-md" />
                </div>

                {/* Corner Resize Handles */}
                {/* NW Handle */}
                <div
                  onPointerDown={(e) => handlePointerDownResize(e, "nw")}
                  className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-[#2563EB] rounded-full cursor-nwse-resize shadow-md"
                />
                {/* NE Handle */}
                <div
                  onPointerDown={(e) => handlePointerDownResize(e, "ne")}
                  className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-[#2563EB] rounded-full cursor-nesw-resize shadow-md"
                />
                {/* SW Handle */}
                <div
                  onPointerDown={(e) => handlePointerDownResize(e, "sw")}
                  className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-[#2563EB] rounded-full cursor-nesw-resize shadow-md"
                />
                {/* SE Handle */}
                <div
                  onPointerDown={(e) => handlePointerDownResize(e, "se")}
                  className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-[#2563EB] rounded-full cursor-nwse-resize shadow-md"
                />

                {/* Grid Overlay inside crop box */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none border border-[#2563EB]/20">
                  <div className="border-r border-b border-[#2563EB]/20" />
                  <div className="border-r border-b border-[#2563EB]/20" />
                  <div className="border-b border-[#2563EB]/20" />
                  <div className="border-r border-b border-[#2563EB]/20" />
                  <div className="border-r border-b border-[#2563EB]/20" />
                  <div className="border-b border-[#2563EB]/20" />
                  <div className="border-r border-[#2563EB]/20" />
                  <div className="border-r border-[#2563EB]/20" />
                  <div />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-zinc-400 text-xs">
              Loading image...
            </div>
          )}
        </div>

        {/* Quick Instructions & Dimension Badge & Ratio Switcher */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Crop Ratio:</span>
            <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg gap-0.5">
              <button
                type="button"
                onClick={() => handleRatioModeChange("square")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  ratioMode === "square"
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white"
                }`}
              >
                Square (1:1)
              </button>
              <button
                type="button"
                onClick={() => handleRatioModeChange("rect")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  ratioMode === "rect"
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white"
                }`}
              >
                Rectangle (2.5:1)
              </button>
              <button
                type="button"
                onClick={() => handleRatioModeChange("full")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  ratioMode === "full"
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white"
                }`}
              >
                Full Image (No Cut)
              </button>
            </div>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            {Math.round(crop.width)} × {Math.round(crop.height)} px
          </span>
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold rounded-xl"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleUseFullImage}
              disabled={!imageLoaded}
              className="text-xs font-semibold rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 cursor-pointer flex items-center gap-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Use Entire Image</span>
            </Button>

            <Button
              onClick={handleApplyCrop}
              disabled={!imageLoaded}
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Crop &amp; Apply Image</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

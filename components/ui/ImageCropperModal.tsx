"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Check, ZoomIn, ZoomOut, RotateCcw, Crop, Move } from "lucide-react";
import { Button } from "./Button";

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
  aspectRatio = cropType === "logo" ? 1 : 2.5,
  title = cropType === "logo" ? "Crop Shop Logo (1:1 Square)" : "Crop Authorised Signature",
  minSize = 60,
  onClose,
  onCropComplete,
}: ImageCropperModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

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

      // Default crop: center crop taking ~80% of minimum dimension
      let cropW: number;
      let cropH: number;

      if (aspectRatio >= 1) {
        cropW = Math.min(w * 0.85, (h * 0.85) * aspectRatio);
        cropH = cropW / aspectRatio;
      } else {
        cropH = Math.min(h * 0.85, (w * 0.85) / aspectRatio);
        cropW = cropH * aspectRatio;
      }

      // Ensure minimum size
      cropW = Math.max(cropW, minSize);
      cropH = Math.max(cropH, minSize / aspectRatio);

      // Center
      const cropX = Math.max(0, (w - cropW) / 2);
      const cropY = Math.max(0, (h - cropH) / 2);

      setCrop({ x: cropX, y: cropY, width: cropW, height: cropH });
      setImageLoaded(true);
    };
  }, [imageSrc, isOpen, aspectRatio, minSize]);

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
          newWidth = Math.max(minSize, Math.min(rawW, maxX - initial.x, (maxY - initial.y) * aspectRatio));
          newHeight = newWidth / aspectRatio;
        } else if (isResizing === "sw") {
          const rawW = initial.width - deltaX;
          newWidth = Math.max(minSize, Math.min(rawW, initial.x + initial.width, (maxY - initial.y) * aspectRatio));
          newHeight = newWidth / aspectRatio;
          newX = initial.x + (initial.width - newWidth);
        } else if (isResizing === "ne") {
          const rawW = initial.width + deltaX;
          newWidth = Math.max(minSize, Math.min(rawW, maxX - initial.x, (initial.y + initial.height) * aspectRatio));
          newHeight = newWidth / aspectRatio;
          newY = initial.y + (initial.height - newHeight);
        } else if (isResizing === "nw") {
          const rawW = initial.width - deltaX;
          newWidth = Math.max(minSize, Math.min(rawW, initial.x + initial.width, (initial.y + initial.height) * aspectRatio));
          newHeight = newWidth / aspectRatio;
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
    [isDragging, isResizing, displaySize, minSize, aspectRatio]
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

  // Execute Crop to High-Res Canvas
  const handleApplyCrop = () => {
    if (!imgRef.current || !imageLoaded) return;

    const img = imgRef.current;
    // Map display coordinates to natural image coordinates
    const scaleFactorX = img.naturalWidth / displaySize.width;
    const scaleFactorY = img.naturalHeight / displaySize.height;

    const sourceX = crop.x * scaleFactorX;
    const sourceY = crop.y * scaleFactorY;
    const sourceW = crop.width * scaleFactorX;
    const sourceH = crop.height * scaleFactorY;

    // Target output dimensions
    const targetW = cropType === "logo" ? 400 : 500;
    const targetH = Math.round(targetW / aspectRatio);

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
                {cropType === "logo"
                  ? "Square (1:1) fixed crop. Drag and resize box to frame your logo."
                  : "Landscape (2.5:1) fixed crop. Drag and resize box to frame signature."}
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

        {/* Quick Instructions & Dimension Badge */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
            <span>
              {cropType === "logo"
                ? "Locked 1:1 Aspect Ratio (Square)"
                : "Locked 2.5:1 Aspect Ratio (Landscape)"}
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            {Math.round(crop.width)} × {Math.round(crop.height)} px
          </span>
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-end gap-2.5 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold rounded-xl"
          >
            Cancel
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
  );
}

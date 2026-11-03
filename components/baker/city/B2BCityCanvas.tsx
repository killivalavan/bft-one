"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type {
  CityBuildingPlacement,
  CityLayoutResult,
  CityObjectKind,
} from "./cityLayoutEngine";
import type { CityRecentDispatchTarget } from "@/lib/hooks/useCityDashboardData";
import type { CityWeatherSeason } from "./cityWeatherEngine";

export interface SelectedCityObject {
  id: string;
  kind: CityObjectKind;
  placement: CityBuildingPlacement;
  screenX?: number;
  screenY?: number;
}

interface FloatingLabelItem {
  id: string;
  kind: CityObjectKind;
  label: string;
  subLabel?: string;
  topProduct?: string;
  healthStatus?: "healthy" | "warning" | "urgent" | "new";
  x: number;
  y: number;
  visible: boolean;
}

interface B2BCityCanvasProps {
  layout: CityLayoutResult;
  recentDispatches?: CityRecentDispatchTarget[];
  selectedId: string | null;
  onSelectObject: (obj: SelectedCityObject | null) => void;
  onRequestAddClient?: () => void;
  isNightMode: boolean;
  season?: CityWeatherSeason;
  cameraResetTrigger: number;
  focusTargetId: string | null;
  isSimulating?: boolean;
  onLoaded?: () => void;
}

/**
 * Creates a smooth chamfered/rounded 3D box geometry centered at (0, 0, 0)
 * so every building, roof, awning, and vehicle looks like a crafted diorama model.
 */
function createRoundedBoxGeo(
  width: number,
  height: number,
  depth: number,
  radius: number = 0.08,
  smoothness: number = 3
): THREE.BufferGeometry {
  const r = Math.min(radius, width * 0.25, height * 0.25, depth * 0.25);
  const w = width - r * 2;
  const h = height - r * 2;
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;

  shape.moveTo(x, y + r);
  shape.lineTo(x, y + h - r);
  shape.quadraticCurveTo(x, y + h, x + r, y + h);
  shape.lineTo(x + w - r, y + h);
  shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  shape.lineTo(x + w, y + r);
  shape.quadraticCurveTo(x + w, y, x + w - r, y);
  shape.lineTo(x + r, y);
  shape.quadraticCurveTo(x, y, x, y + r);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - r * 2),
    bevelEnabled: true,
    bevelSegments: smoothness,
    steps: 1,
    bevelSize: r,
    bevelThickness: r,
    curveSegments: smoothness,
  });
  geo.center();
  return geo;
}

/**
 * Builds a multi-stripe cafe awning (alternating colored & cream stripes).
 */
function createStripedAwning(
  width: number,
  depth: number,
  stripeColorHex: number,
  stripeCount: number = 7
): THREE.Group {
  const awningGroup = new THREE.Group();
  const stripeW = width / stripeCount;
  const mainMat = new THREE.MeshStandardMaterial({
    color: stripeColorHex,
    roughness: 0.4,
  });
  const altMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    roughness: 0.45,
  });

  for (let i = 0; i < stripeCount; i++) {
    const isEven = i % 2 === 0;
    const sMesh = new THREE.Mesh(
      createRoundedBoxGeo(stripeW * 1.02, 0.16, depth, 0.03, 2),
      isEven ? mainMat : altMat
    );
    sMesh.position.x = -width / 2 + stripeW / 2 + i * stripeW;
    sMesh.castShadow = true;
    awningGroup.add(sMesh);

    // Front valence flap
    const flap = new THREE.Mesh(
      createRoundedBoxGeo(stripeW * 0.98, 0.18, 0.08, 0.02, 2),
      isEven ? mainMat : altMat
    );
    flap.position.set(
      -width / 2 + stripeW / 2 + i * stripeW,
      -0.1,
      depth / 2 - 0.04
    );
    awningGroup.add(flap);
  }
  return awningGroup;
}

/**
 * Maps bakery product name keywords to appropriate emoji for food speech bubbles.
 */
function getFoodEmoji(name: string): string {
  const p = (name || "").toLowerCase();
  if (p.includes("croissant") || p.includes("puff")) return "🥐";
  if (p.includes("cake") || p.includes("pastry") || p.includes("truffle")) return "🍰";
  if (p.includes("brownie")) return "🍫";
  if (p.includes("bread") || p.includes("loaf") || p.includes("sourdough") || p.includes("baguette")) return "🍞";
  if (p.includes("muffin") || p.includes("cupcake")) return "🧁";
  if (p.includes("donut") || p.includes("doughnut") || p.includes("bagel")) return "🍩";
  if (p.includes("cookie") || p.includes("biscuit")) return "🍪";
  if (p.includes("pie") || p.includes("tart")) return "🥧";
  return "🥖";
}

/**
 * Universal cross-browser rounded rectangle path helper for 2D canvas.
 */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * Creates a crisp floating 3D billboard name card for the top-selling product:
 * cream card with amber accent, emoji badge, "TOP SELLER" caption and the full
 * product name (auto-shrinks to fit before truncating).
 */
function createFoodBubbleSprite(productName: string): THREE.Sprite {
  const W = 640;
  const H = 192;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, W, H);

    const cardX = 18;
    const cardY = 14;
    const cardW = W - 36;
    const cardH = 132;
    const fontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // Soft drop shadow + cream gradient card
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    const cardGrad = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
    cardGrad.addColorStop(0, "#ffffff");
    cardGrad.addColorStop(1, "#fff7e6");
    ctx.fillStyle = cardGrad;
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 40);
    ctx.fill();

    // Pointer tail (same fill, drawn inside shadow pass)
    ctx.beginPath();
    ctx.moveTo(W / 2 - 18, cardY + cardH - 1);
    ctx.lineTo(W / 2, cardY + cardH + 22);
    ctx.lineTo(W / 2 + 18, cardY + cardH - 1);
    ctx.closePath();
    ctx.fillStyle = "#fff7e6";
    ctx.fill();
    ctx.restore();

    // Amber accent border
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 4;
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 40);
    ctx.stroke();

    // Emoji badge circle
    const badgeCx = cardX + 70;
    const badgeCy = cardY + cardH / 2;
    const badgeGrad = ctx.createLinearGradient(0, badgeCy - 46, 0, badgeCy + 46);
    badgeGrad.addColorStop(0, "#fde68a");
    badgeGrad.addColorStop(1, "#f59e0b");
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, 46, 0, Math.PI * 2);
    ctx.fillStyle = badgeGrad;
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `52px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(getFoodEmoji(productName), badgeCx, badgeCy + 3);

    // Caption
    const textX = badgeCx + 70;
    const maxTextW = cardX + cardW - 36 - textX;
    ctx.textAlign = "left";
    ctx.fillStyle = "#b45309";
    ctx.font = `800 22px ${fontStack}`;
    ctx.fillText("★  TOP SELLER", textX, cardY + 42);

    // Product name: shrink to fit, then ellipsis as last resort
    let name =
      productName && productName !== "Assorted Items" ? productName : "Signature Bake";
    let fontSize = 40;
    ctx.font = `800 ${fontSize}px ${fontStack}`;
    while (ctx.measureText(name).width > maxTextW && fontSize > 28) {
      fontSize -= 2;
      ctx.font = `800 ${fontSize}px ${fontStack}`;
    }
    if (ctx.measureText(name).width > maxTextW) {
      while (name.length > 1 && ctx.measureText(`${name}…`).width > maxTextW) {
        name = name.slice(0, -1);
      }
      name = `${name.trimEnd()}…`;
    }
    ctx.fillStyle = "#0f172a";
    ctx.fillText(name, textX, cardY + 90);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.48, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Builds a detailed 3D miniature bakery treat on a porcelain plate with a bistro coffee mug.
 */
function createBakeryFoodMesh(productName: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "bakery-food-dish";

  // 1. Ceramic Porcelain Plate
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.2,
    metalness: 0.08,
  });
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.125, 0.016, 16),
    plateMat
  );
  plate.position.y = 0.008;
  plate.castShadow = true;
  g.add(plate);

  const plateRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.012, 6, 16),
    plateMat
  );
  plateRim.rotation.x = Math.PI / 2;
  plateRim.position.y = 0.016;
  g.add(plateRim);

  // 2. Bistro Coffee Mug beside Plate
  const mugMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.3,
  });
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.038, 0.075, 12),
    mugMat
  );
  mug.position.set(0.16, 0.038, 0.1);
  mug.castShadow = true;
  g.add(mug);

  const coffeeLiquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.01, 10),
    new THREE.MeshBasicMaterial({ color: 0x3f2314 })
  );
  coffeeLiquid.position.set(0.16, 0.07, 0.1);
  g.add(coffeeLiquid);

  const mugHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.024, 0.007, 6, 8),
    mugMat
  );
  mugHandle.position.set(0.205, 0.04, 0.1);
  g.add(mugHandle);

  // 3. 3D Bakery Treat on Plate
  const p = (productName || "").toLowerCase();
  const crustMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.5,
  });
  const darkChocMat = new THREE.MeshStandardMaterial({
    color: 0x3e1d0d,
    roughness: 0.4,
  });
  const creamMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    roughness: 0.3,
  });
  const cherryMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.2,
  });

  if (p.includes("croissant") || p.includes("puff")) {
    // Golden Curved French Croissant
    const body = new THREE.Mesh(
      createRoundedBoxGeo(0.16, 0.05, 0.08, 0.02, 2),
      crustMat
    );
    body.position.y = 0.035;
    g.add(body);

    [-0.07, 0.07].forEach((tx, idx) => {
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.07, 6),
        crustMat
      );
      tip.rotation.z = idx === 0 ? Math.PI / 2.8 : -Math.PI / 2.8;
      tip.rotation.y = idx === 0 ? 0.3 : -0.3;
      tip.position.set(tx, 0.03, 0.02);
      g.add(tip);
    });
  } else if (p.includes("cake") || p.includes("pastry") || p.includes("truffle") || p.includes("brownie")) {
    // Layered Cake Wedge with Chocolate Ganache & Cherry
    const cakeBase = new THREE.Mesh(
      createRoundedBoxGeo(0.14, 0.05, 0.1, 0.015, 2),
      darkChocMat
    );
    cakeBase.position.y = 0.035;
    g.add(cakeBase);

    const creamLayer = new THREE.Mesh(
      new THREE.BoxGeometry(0.145, 0.014, 0.105),
      creamMat
    );
    creamLayer.position.y = 0.05;
    g.add(creamLayer);

    const frosting = new THREE.Mesh(
      createRoundedBoxGeo(0.14, 0.02, 0.1, 0.01, 2),
      new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.3 })
    );
    frosting.position.y = 0.065;
    g.add(frosting);

    const cherry = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 8),
      cherryMat
    );
    cherry.position.set(0, 0.088, 0);
    g.add(cherry);
  } else if (p.includes("bread") || p.includes("sourdough") || p.includes("loaf") || p.includes("baguette")) {
    // Artisan Sourdough Loaf with Floured Scored Crust
    const loaf = new THREE.Mesh(
      createRoundedBoxGeo(0.17, 0.075, 0.1, 0.03, 2),
      new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.65 })
    );
    loaf.position.y = 0.045;
    g.add(loaf);

    [-0.04, 0.04].forEach((sx) => {
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.01, 0.075),
        new THREE.MeshBasicMaterial({ color: 0xfef3c7 })
      );
      slit.rotation.y = 0.4;
      slit.position.set(sx, 0.085, 0);
      g.add(slit);
    });
  } else if (p.includes("muffin") || p.includes("cupcake") || p.includes("tart")) {
    // Cupcake with Swirled Frosting & Sprinkles
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.038, 0.055, 10),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 })
    );
    cup.position.y = 0.035;
    g.add(cup);

    const swirl = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.35 })
    );
    swirl.position.y = 0.075;
    g.add(swirl);

    const topper = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 6, 6),
      cherryMat
    );
    topper.position.y = 0.12;
    g.add(topper);
  } else if (p.includes("donut") || p.includes("doughnut") || p.includes("bagel")) {
    // Strawberry Glazed Ring Donut
    const dough = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.024, 8, 16),
      crustMat
    );
    dough.rotation.x = Math.PI / 2;
    dough.position.y = 0.03;
    g.add(dough);

    const glaze = new THREE.Mesh(
      new THREE.TorusGeometry(0.056, 0.016, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.25 })
    );
    glaze.rotation.x = Math.PI / 2;
    glaze.position.y = 0.045;
    g.add(glaze);
  } else {
    // Golden Signature Bakery Buns / Cookies with Chocolate Chips
    [-0.035, 0.035].forEach((bx, idx) => {
      const bun = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.048, 0.026, 12),
        crustMat
      );
      bun.position.set(bx, 0.025, idx === 0 ? -0.02 : 0.02);
      g.add(bun);

      const chip = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 6, 6),
        darkChocMat
      );
      chip.position.set(bx, 0.04, idx === 0 ? -0.02 : 0.02);
      g.add(chip);
    });
  }

  return g;
}

/**
 * Builds a 3D seated customer character in a relaxed cafe sitting pose with an animated eating arm.
 */
function createSeatedEaterCharacter(
  outfitColorHex: number,
  hairColorHex: number
): {
  characterGroup: THREE.Group;
  rightArm: THREE.Group;
  head: THREE.Group;
} {
  const charGrp = new THREE.Group();
  charGrp.name = "seated-diner";

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xfdba74,
    roughness: 0.45,
  });
  const outfitMat = new THREE.MeshStandardMaterial({
    color: outfitColorHex,
    roughness: 0.5,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.6,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColorHex,
    roughness: 0.5,
  });

  // 1. Pelvis / Seat
  const pelvis = new THREE.Mesh(
    createRoundedBoxGeo(0.24, 0.1, 0.2, 0.025, 2),
    pantsMat
  );
  pelvis.position.set(0, 0.16, 0);
  charGrp.add(pelvis);

  // 2. Thighs bent horizontally forward toward table (-X direction)
  [-0.065, 0.065].forEach((tz) => {
    const thigh = new THREE.Mesh(
      createRoundedBoxGeo(0.22, 0.09, 0.09, 0.02, 2),
      pantsMat
    );
    thigh.position.set(-0.11, 0.16, tz);
    charGrp.add(thigh);

    const calf = new THREE.Mesh(
      createRoundedBoxGeo(0.08, 0.16, 0.08, 0.02, 2),
      pantsMat
    );
    calf.position.set(-0.21, 0.08, tz);
    charGrp.add(calf);

    const shoe = new THREE.Mesh(
      createRoundedBoxGeo(0.12, 0.05, 0.09, 0.015, 2),
      shoeMat
    );
    shoe.position.set(-0.23, 0.025, tz);
    charGrp.add(shoe);
  });

  // 3. Upright Torso
  const torso = new THREE.Mesh(
    createRoundedBoxGeo(0.22, 0.24, 0.18, 0.03, 2),
    outfitMat
  );
  torso.position.set(0, 0.32, 0);
  charGrp.add(torso);

  // 4. Neck & Head
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.06, 8),
    skinMat
  );
  neck.position.set(0, 0.46, 0);
  charGrp.add(neck);

  const headGrp = new THREE.Group();
  headGrp.position.set(0, 0.54, 0);

  const head = new THREE.Mesh(
    createRoundedBoxGeo(0.17, 0.17, 0.17, 0.04, 2),
    skinMat
  );
  headGrp.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  [-0.04, 0.04].forEach((ez) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat);
    eye.position.set(-0.085, 0.015, ez);
    headGrp.add(eye);
  });

  const hair = new THREE.Mesh(
    createRoundedBoxGeo(0.18, 0.08, 0.18, 0.03, 2),
    hairMat
  );
  hair.position.set(0, 0.07, 0);
  headGrp.add(hair);

  charGrp.add(headGrp);

  // 5. Left Arm (resting comfortably on table)
  const leftArm = new THREE.Mesh(
    createRoundedBoxGeo(0.18, 0.065, 0.065, 0.02, 2),
    outfitMat
  );
  leftArm.position.set(-0.1, 0.33, 0.11);
  leftArm.rotation.y = -0.15;
  charGrp.add(leftArm);

  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), skinMat);
  leftHand.position.set(-0.2, 0.33, 0.11);
  charGrp.add(leftHand);

  // 6. Right Arm (Animated Eating Arm)
  const rightArmGrp = new THREE.Group();
  rightArmGrp.name = "eating-arm";
  rightArmGrp.position.set(0, 0.38, -0.11);

  const sleeve = new THREE.Mesh(
    createRoundedBoxGeo(0.15, 0.065, 0.065, 0.02, 2),
    outfitMat
  );
  sleeve.position.set(-0.07, -0.04, 0);
  rightArmGrp.add(sleeve);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), skinMat);
  hand.position.set(-0.15, -0.06, 0);
  rightArmGrp.add(hand);

  // Held bite of food in hand
  const heldBite = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
  );
  heldBite.position.set(-0.18, -0.06, 0);
  rightArmGrp.add(heldBite);

  charGrp.add(rightArmGrp);

  return {
    characterGroup: charGrp,
    rightArm: rightArmGrp,
    head: headGrp,
  };
}

/**
 * Creates a stylized 3D handheld umbrella with a curved J-handle, thin metal shaft,
 * and a colorful 8-segment dome canopy to shield walking citizens from rain and snow.
 */
function createHandheldUmbrellaMesh(fabricColorHex: number): THREE.Group {
  const grp = new THREE.Group();
  grp.name = "handheld-umbrella";

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.8,
    roughness: 0.25,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
  });
  const fabricMat = new THREE.MeshStandardMaterial({
    color: fabricColorHex,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });

  // 1. Curved J-Handle at base
  const handleGeo = new THREE.TorusGeometry(0.045, 0.012, 8, 12, Math.PI);
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.04, -0.22, 0);
  grp.add(handle);

  // 2. Central Shaft
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.009, 0.52, 8),
    metalMat
  );
  shaft.position.y = 0.04;
  grp.add(shaft);

  // 3. Umbrella Dome Canopy (8-panel octagonal dome)
  const canopyGeo = new THREE.ConeGeometry(0.42, 0.16, 8, 1, true);
  const canopy = new THREE.Mesh(canopyGeo, fabricMat);
  canopy.position.y = 0.26;
  canopy.castShadow = true;
  grp.add(canopy);

  // 4. Top silver ferrule tip
  const tip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.012, 0.06, 8),
    metalMat
  );
  tip.position.y = 0.37;
  grp.add(tip);

  return grp;
}

interface CafeTerraceResult {
  group: THREE.Group;
  walkingCustomer: THREE.Group;
  handheldUmbrella: THREE.Group;
  carriedBag: THREE.Mesh;
  tableFood: THREE.Group;
  tableCandle: THREE.Mesh;
  foodBubble: THREE.Sprite;
}

/**
 * Builds a detached circular garden cafe patio beside each bakery store:
 * - Circular sandstone patio deck (radius 0.62m) with stepping stones bridging to the sidewalk
 * - 12-rib Market Parasol positioned behind the table so it never clips store walls/awnings
 * - Pair of terracotta pots with topiary boxwood shrubs
 * - Round bistro table & two curved-backrest cafe chairs with cushions
 * - 3D bakery plate + espresso coffee cup + evening candle lantern
 * - Single continuous articulated customer character (parented to worldGroup)
 * - Floating bestseller speech bubble
 */
function createCafeTerraceDeck(
  accentColor: number,
  topProductName: string = "French Butter Croissant",
  dinerColor: number = 0x2563eb,
  hairColor: number = 0x1e293b,
  umbrellaColor: number = 0x0284c7
): CafeTerraceResult {
  const g = new THREE.Group();
  g.name = "sidewalk-cafe-terrace";

  const travertineMat = new THREE.MeshStandardMaterial({
    color: 0xe7e5e4, // Warm sandstone / travertine
    roughness: 0.72,
  });
  const borderStoneMat = new THREE.MeshStandardMaterial({
    color: 0xa8a29e, // Warm stone rim & stepping stones
    roughness: 0.78,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.6,
    roughness: 0.35,
  });
  const tableWoodMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.48,
  });
  const cushionMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.55,
  });
  const umbrellaFabricMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7, // Warm French cafe cream
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  const umbrellaStripeMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });

  // 1. Detached Circular Sandstone Garden Patio Base (radius 0.62m)
  const patioRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.65, 0.045, 24),
    borderStoneMat
  );
  patioRim.position.y = 0.022;
  patioRim.receiveShadow = true;
  g.add(patioRim);

  const patioSurface = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.56, 0.025, 24),
    travertineMat
  );
  patioSurface.position.y = 0.042;
  patioSurface.receiveShadow = true;
  g.add(patioSurface);

  // 3 Stepping Stones bridging the grass gap from the store sidewalk (+X edge) to the patio
  const steppingStoneCoords: [number, number, number][] = [
    [-0.96, 0.015, 0.24],
    [-0.80, 0.015, 0.18],
    [-0.65, 0.015, 0.11],
  ];
  steppingStoneCoords.forEach(([sx, sy, sz], idx) => {
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.105, 0.028, 12),
      idx % 2 === 0 ? travertineMat : borderStoneMat
    );
    stone.position.set(sx, sy, sz);
    stone.receiveShadow = true;
    g.add(stone);
  });

  // 2. Refined 12-Segment Cafe Market Parasol (behind table at z = -0.22)
  const parasolGrp = new THREE.Group();
  parasolGrp.position.set(0, 0.05, -0.22);

  const baseWeight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.17, 0.035, 14),
    metalMat
  );
  baseWeight.position.y = 0.018;
  parasolGrp.add(baseWeight);

  const mastPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.54, 10),
    new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.5 })
  );
  mastPole.position.y = 0.77;
  mastPole.castShadow = true;
  parasolGrp.add(mastPole);

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.72, 0.24, 12, 1, true),
    umbrellaFabricMat
  );
  canopy.position.y = 1.54;
  canopy.castShadow = true;
  parasolGrp.add(canopy);

  const valance = new THREE.Mesh(
    new THREE.CylinderGeometry(0.725, 0.725, 0.042, 12, 1, true),
    umbrellaStripeMat
  );
  valance.position.y = 1.43;
  parasolGrp.add(valance);

  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 })
  );
  finial.position.y = 1.68;
  parasolGrp.add(finial);

  g.add(parasolGrp);

  // 3. Pair of Terracotta Topiary Planter Pots flanking the back of the patio
  const terracottaMat = new THREE.MeshStandardMaterial({
    color: 0xc2410c,
    roughness: 0.65,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.55,
  });
  [-0.38, 0.38].forEach((px) => {
    const potGrp = new THREE.Group();
    potGrp.position.set(px, 0.05, -0.34);

    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.055, 0.12, 10),
      terracottaMat
    );
    pot.position.y = 0.06;
    pot.castShadow = true;
    potGrp.add(pot);

    const shrub = new THREE.Mesh(
      new THREE.SphereGeometry(0.088, 10, 10),
      foliageMat
    );
    shrub.position.y = 0.15;
    shrub.castShadow = true;
    potGrp.add(shrub);

    g.add(potGrp);
  });

  // 4. Round Pedestal Cafe Bistro Table (centered at 0, 0)
  const tableX = 0;
  const tableZ = 0;
  const tableLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 0.36, 8),
    metalMat
  );
  tableLeg.position.set(tableX, 0.23, tableZ);
  g.add(tableLeg);

  const tableBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12),
    metalMat
  );
  tableBase.position.set(tableX, 0.06, tableZ);
  g.add(tableBase);

  const tableTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.032, 16),
    tableWoodMat
  );
  tableTop.position.set(tableX, 0.41, tableZ);
  tableTop.castShadow = true;
  g.add(tableTop);

  // Brass rim around bistro tabletop
  const tableRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.255, 0.255, 0.02, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide })
  );
  tableRim.position.set(tableX, 0.41, tableZ);
  g.add(tableRim);

  // 5. Two Proper Cafe Bistro Chairs (with pedestal, seat cushion, and curved backrest)
  const buildBistroChair = (cx: number, cz: number, facingSign: number) => {
    const chairGrp = new THREE.Group();
    chairGrp.position.set(cx, 0.05, cz);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.095, 0.018, 10),
      metalMat
    );
    base.position.y = 0.01;
    chairGrp.add(base);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.15, 8),
      metalMat
    );
    stem.position.y = 0.085;
    chairGrp.add(stem);

    const seatFrame = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.022, 12),
      metalMat
    );
    seatFrame.position.y = 0.16;
    seatFrame.castShadow = true;
    chairGrp.add(seatFrame);

    const seatCushion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.022, 12),
      cushionMat
    );
    seatCushion.position.y = 0.18;
    chairGrp.add(seatCushion);

    const backrest = new THREE.Mesh(
      createRoundedBoxGeo(0.028, 0.16, 0.17, 0.01, 2),
      metalMat
    );
    backrest.position.set(facingSign * 0.095, 0.25, 0);
    backrest.castShadow = true;
    chairGrp.add(backrest);

    g.add(chairGrp);
  };

  // Chair 1 (Left companion chair) & Chair 2 (Right diner chair)
  buildBistroChair(-0.35, 0, -1);
  buildBistroChair(0.35, 0, 1);

  // 6. Food Dish on Table & Evening Candle
  const tableFood = new THREE.Group();
  const bakeryBite = createBakeryFoodMesh(topProductName);
  bakeryBite.position.set(tableX - 0.04, 0.43, tableZ);
  bakeryBite.scale.setScalar(0.76);
  tableFood.add(bakeryBite);

  // Ceramic Espresso / Coffee Cup with Saucer
  const saucer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.058, 0.012, 10),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
  );
  saucer.position.set(tableX + 0.08, 0.43, tableZ + 0.06);
  tableFood.add(saucer);

  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.028, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3 })
  );
  cup.position.set(tableX + 0.08, 0.458, tableZ + 0.06);
  tableFood.add(cup);

  g.add(tableFood);

  // Tabletop Evening Candle / Lantern
  const candleMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.2,
    roughness: 0.3,
  });
  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.042, 8),
    candleMat
  );
  candle.position.set(tableX, 0.445, tableZ - 0.08);
  g.add(candle);

  // 7. Single Continuous Articulated Customer Character (parented to worldGroup by caller!)
  const walkingCustomer = createDeliveryWorkerMesh(dinerColor, {
    hasCap: false,
    hairColorHex: hairColor,
    scale: 1.05,
  });
  const defaultCrate = walkingCustomer.getObjectByName("carried-crate");
  if (defaultCrate) defaultCrate.visible = false;

  // Handheld Umbrella positioned neatly over customer's head & right hand during rain/snow
  const handheldUmbrella = createHandheldUmbrellaMesh(umbrellaColor);
  handheldUmbrella.position.set(0.22, 0.72, 0.06);
  handheldUmbrella.rotation.z = -0.12;
  handheldUmbrella.visible = false;
  walkingCustomer.add(handheldUmbrella);

  // Bakery Takeaway Paper Bag in hands when returning from store
  const carriedBag = new THREE.Mesh(
    createRoundedBoxGeo(0.16, 0.22, 0.11, 0.02, 2),
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 })
  );
  carriedBag.position.set(0.15, 0.38, 0.14);
  carriedBag.visible = false;
  walkingCustomer.add(carriedBag);

  walkingCustomer.visible = true;

  // 8. Floating Speech Bubble for Top Bestseller
  const foodBubble = createFoodBubbleSprite(topProductName);
  foodBubble.position.set(tableX, 2.0, tableZ);
  g.add(foodBubble);

  return {
    group: g,
    walkingCustomer,
    handheldUmbrella,
    carriedBag,
    tableFood,
    tableCandle: candle,
    foodBubble,
  };
}

/**
 * Creates a rich procedural grass canvas texture with lawn stripes and blades
 * so the diorama floor looks like lush green turf instead of plain white.
 */
function createGrassCanvasTexture(night: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  // Base rich turf green
  ctx.fillStyle = night ? "#064e3b" : "#22c55e";
  ctx.fillRect(0, 0, 512, 512);

  // Subtle mowed lawn stripes
  const stripeCount = 8;
  const stripeH = 512 / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    if (i % 2 === 0) {
      ctx.fillStyle = night ? "rgba(4, 120, 87, 0.35)" : "rgba(22, 163, 74, 0.28)";
      ctx.fillRect(0, i * stripeH, 512, stripeH);
    }
  }

  // Organic grass blades & speckles
  for (let i = 0; i < 3500; i++) {
    const gx = Math.random() * 512;
    const gy = Math.random() * 512;
    const gh = 3 + Math.random() * 6;
    ctx.fillStyle =
      i % 3 === 0
        ? night
          ? "#047857"
          : "#15803d"
        : i % 3 === 1
        ? night
          ? "#059669"
          : "#4ade80"
        : night
        ? "#065f46"
        : "#16a34a";
    ctx.fillRect(gx, gy, 2, gh);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds an articulated 3D Human Character (with shoes, hinged legs, belt, shirt,
 * collar, hinged arms with hands, head with facial features, and hair/cap).
 * Used for both delivery workers (with a toggleable cargo box) and walking citizens!
 */
function createDeliveryWorkerMesh(
  uniformColorHex: number,
  options?: { hasCap?: boolean; hairColorHex?: number; scale?: number }
): THREE.Group {
  const hasCap = options?.hasCap ?? true;
  const hairColorHex = options?.hairColorHex ?? 0x1e293b;
  const charScale = options?.scale ?? 1.38;

  const worker = new THREE.Group();
  worker.name = "delivery-worker";

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xfdba74,
    roughness: 0.45,
  });
  const uniformMat = new THREE.MeshStandardMaterial({
    color: uniformColorHex,
    roughness: 0.45,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.6,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColorHex,
    roughness: 0.5,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.6,
  });
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });

  // Left & Right Hinged Legs (pivoted at hip y = 0.34, with knee joint at y = -0.14 for sitting & walking)
  const buildArticulatedLeg = (lx: number, legName: string, kneeName: string) => {
    const legGrp = new THREE.Group();
    legGrp.name = legName;
    legGrp.position.set(lx, 0.34, 0);

    const thighMesh = new THREE.Mesh(
      createRoundedBoxGeo(0.11, 0.16, 0.11, 0.03, 2),
      pantsMat
    );
    thighMesh.position.y = -0.07;
    thighMesh.castShadow = true;
    legGrp.add(thighMesh);

    const kneeGrp = new THREE.Group();
    kneeGrp.name = kneeName;
    kneeGrp.position.set(0, -0.14, 0);

    const calfMesh = new THREE.Mesh(
      createRoundedBoxGeo(0.105, 0.15, 0.105, 0.025, 2),
      pantsMat
    );
    calfMesh.position.y = -0.07;
    calfMesh.castShadow = true;
    kneeGrp.add(calfMesh);

    const shoeMesh = new THREE.Mesh(
      createRoundedBoxGeo(0.12, 0.08, 0.17, 0.025, 2),
      shoeMat
    );
    shoeMesh.position.set(0, -0.15, 0.03);
    shoeMesh.castShadow = true;
    kneeGrp.add(shoeMesh);

    legGrp.add(kneeGrp);
    worker.add(legGrp);
  };

  buildArticulatedLeg(-0.075, "left-leg", "left-knee");
  buildArticulatedLeg(0.075, "right-leg", "right-knee");

  // Belt / Waist
  const belt = new THREE.Mesh(
    createRoundedBoxGeo(0.29, 0.06, 0.19, 0.02, 2),
    new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.5 })
  );
  belt.position.y = 0.35;
  worker.add(belt);

  // Torso / Jacket with Shoulders
  const torso = new THREE.Mesh(
    createRoundedBoxGeo(0.3, 0.34, 0.19, 0.05, 2),
    uniformMat
  );
  torso.position.set(0, 0.53, 0);
  torso.castShadow = true;
  worker.add(torso);

  // White Shirt Collar / Neckline
  const collar = new THREE.Mesh(
    createRoundedBoxGeo(0.16, 0.05, 0.2, 0.015, 2),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
  );
  collar.position.set(0, 0.69, 0.01);
  worker.add(collar);

  // Neck
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.06, 0.08, 10),
    skinMat
  );
  neck.position.y = 0.73;
  worker.add(neck);

  // Head + Facial Features + Hair/Cap
  const headGrp = new THREE.Group();
  headGrp.name = "head-group";
  headGrp.position.y = 0.85;
  const head = new THREE.Mesh(
    createRoundedBoxGeo(0.22, 0.23, 0.22, 0.07, 3),
    skinMat
  );
  head.castShadow = true;
  headGrp.add(head);

  // Eyes (facing +Z)
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.2,
  });
  [-0.048, 0.048].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
    eye.position.set(ex, 0.02, 0.108);
    headGrp.add(eye);
  });

  if (hasCap) {
    // Delivery Cap + Visor
    const capDome = new THREE.Mesh(
      createRoundedBoxGeo(0.235, 0.1, 0.24, 0.04, 2),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
    );
    capDome.position.set(0, 0.1, 0);
    headGrp.add(capDome);

    const capVisor = new THREE.Mesh(
      createRoundedBoxGeo(0.22, 0.035, 0.14, 0.01, 2),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 })
    );
    capVisor.position.set(0, 0.07, 0.14);
    headGrp.add(capVisor);
  } else {
    // Styled 3D Hair for Citizens
    const hairTop = new THREE.Mesh(
      createRoundedBoxGeo(0.24, 0.09, 0.24, 0.04, 2),
      hairMat
    );
    hairTop.position.set(0, 0.1, -0.01);
    headGrp.add(hairTop);

    const hairBack = new THREE.Mesh(
      createRoundedBoxGeo(0.23, 0.16, 0.08, 0.03, 2),
      hairMat
    );
    hairBack.position.set(0, 0.03, -0.09);
    headGrp.add(hairBack);
  }
  worker.add(headGrp);

  // Left & Right Hinged Arms (with hands at the bottom)
  [-0.2, 0.2].forEach((ax, idx) => {
    const armGrp = new THREE.Group();
    armGrp.name = idx === 0 ? "left-arm" : "right-arm";
    armGrp.position.set(ax, 0.65, 0);

    const sleeve = new THREE.Mesh(
      createRoundedBoxGeo(0.095, 0.25, 0.095, 0.03, 2),
      uniformMat
    );
    sleeve.position.set(0, -0.11, 0);
    sleeve.castShadow = true;
    armGrp.add(sleeve);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), skinMat);
    hand.position.set(0, -0.25, 0);
    armGrp.add(hand);

    if (idx === 1) {
      // Optional held bakery pastry bite in right hand (shown while seated & dining)
      const heldBite = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
      );
      heldBite.name = "held-bite";
      heldBite.position.set(0, -0.26, 0.045);
      heldBite.visible = false;
      armGrp.add(heldBite);
    }

    worker.add(armGrp);
  });

  // Carried Bakery Delivery Crate in Hands
  const carriedCrate = new THREE.Group();
  carriedCrate.name = "carried-crate";
  carriedCrate.position.set(0, 0.5, 0.24);

  const boxMesh = new THREE.Mesh(
    createRoundedBoxGeo(0.32, 0.24, 0.26, 0.03, 2),
    crateMat
  );
  boxMesh.castShadow = true;
  carriedCrate.add(boxMesh);

  const tapeStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.33, 0.05, 0.1),
    tapeMat
  );
  tapeStrip.position.y = 0.11;
  carriedCrate.add(tapeStrip);

  worker.add(carriedCrate);

  worker.scale.setScalar(charScale);
  return worker;
}

interface SkyCloudItem {
  group: THREE.Group;
  baseY: number;
  speed: number;
  phase: number;
  wrapMinX: number;
  wrapMaxX: number;
}

/**
 * Builds a stylized fluffy 3D diorama cumulus cloud composed of soft overlapping puffs.
 */
function createFluffyCloudMesh(scale: number, night: boolean, isStorm = false): THREE.Group {
  const grp = new THREE.Group();
  const cloudColor = night ? 0x1e293b : isStorm ? 0x334155 : 0xffffff;
  const mat = new THREE.MeshStandardMaterial({
    color: cloudColor,
    roughness: 0.85,
    metalness: 0.02,
  });

  // Multiple volumetric rounded puffs forming a soft cumulus cloud
  const puffs = [
    { x: 0, y: 0, z: 0, rx: 2.2, ry: 1.4, rz: 1.6 },
    { x: -1.7, y: -0.2, z: 0.2, rx: 1.6, ry: 1.1, rz: 1.3 },
    { x: 1.7, y: -0.15, z: -0.2, rx: 1.7, ry: 1.15, rz: 1.35 },
    { x: -0.6, y: -0.4, z: 0.8, rx: 1.3, ry: 0.9, rz: 1.1 },
    { x: 0.7, y: -0.35, z: -0.7, rx: 1.4, ry: 0.95, rz: 1.2 },
    { x: 0.25, y: 0.85, z: 0.1, rx: 1.5, ry: 1.2, rz: 1.3 },
    { x: -1.0, y: 0.55, z: -0.3, rx: 1.3, ry: 1.0, rz: 1.1 },
    { x: 1.1, y: 0.6, z: 0.2, rx: 1.35, ry: 1.05, rz: 1.15 },
  ];

  puffs.forEach((p) => {
    const geo = new THREE.SphereGeometry(1, 14, 10);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x * scale, p.y * scale, p.z * scale);
    m.scale.set(p.rx * scale, p.ry * scale, p.rz * scale);
    m.castShadow = false;
    m.receiveShadow = false;
    grp.add(m);
  });

  return grp;
}

/**
 * Creates a soft circular gradient particle texture so points render as soft round particles
 * instead of square WebGL pixel blocks.
 */
function createCircleParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/**
 * Creates a sparkling nighttime starfield in the upper sky background (single draw call).
 */
function createStarField(count = 180): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 1] = 22 + Math.random() * 32;
    pos[i * 3 + 2] = -42 + Math.random() * 55;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const circleTex = createCircleParticleTexture();
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.38,
    map: circleTex,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const stars = new THREE.Points(geo, mat);
  stars.name = "diorama-stars";
  return stars;
}

/**
 * Creates authentic 3D slanted rain streaks using THREE.LineSegments.
 * Eliminates square point artifacts completely by rendering sleek, needle-thin directional streaks.
 */
function createRainParticles(count = 800): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 2 * 3); // 2 vertices per raindrop streak (top and bottom)

  for (let i = 0; i < count; i++) {
    const rx = (Math.random() - 0.5) * 60;
    const ry = Math.random() * 32;
    const rz = (Math.random() - 0.5) * 55;
    const streakLen = 0.85 + Math.random() * 0.45;

    // Top vertex
    pos[i * 6 + 0] = rx;
    pos[i * 6 + 1] = ry;
    pos[i * 6 + 2] = rz;

    // Bottom vertex (slanted with natural wind)
    pos[i * 6 + 3] = rx - 0.18;
    pos[i * 6 + 4] = ry - streakLen;
    pos[i * 6 + 5] = rz - 0.08;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xc4e5fd,
    transparent: true,
    opacity: 0.65,
    blending: THREE.NormalBlending,
  });
  const rain = new THREE.LineSegments(geo, mat);
  rain.name = "diorama-rain";
  return rain;
}

/**
 * Creates single-draw-call fluttering snowflakes with soft circular textures.
 */
function createSnowParticles(count = 450): { points: THREE.Points; phases: Float32Array } {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = Math.random() * 30;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 55;
    phases[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const circleTex = createCircleParticleTexture();
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.45,
    map: circleTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = "diorama-snow";
  return { points, phases };
}

/**
 * Creates a dramatic 3D zigzag lightning bolt mesh that appears during thunderstorm strikes.
 */
function createLightningMesh(): THREE.Line {
  const points: THREE.Vector3[] = [];
  let curr = new THREE.Vector3(-14, 29, -26);
  points.push(curr.clone());

  const segments = 9;
  for (let s = 0; s < segments; s++) {
    const nextY = curr.y - 3.0;
    const nextX = curr.x + (Math.sin(s * 2.3) > 0 ? 1.6 : -1.6) * (0.8 + Math.random() * 0.9);
    const nextZ = curr.z + (Math.cos(s * 1.9) > 0 ? 1.2 : -1.2) * (0.6 + Math.random() * 0.7);
    curr = new THREE.Vector3(nextX, nextY, nextZ);
    points.push(curr.clone());
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
    });
    const bolt = new THREE.Line(geo, mat);
    bolt.name = "diorama-lightning";
    bolt.visible = false;
    return bolt;
  }

// Fixed 3D Cloud definitions for smooth diorama hovering
const CLOUD_DEFS = [
  { x: -32, y: 17.5, z: -24, scale: 1.5, speed: 0.42, phase: 0.0, wrapMinX: -48, wrapMaxX: 48 },
  { x: -14, y: 21.0, z: -32, scale: 2.1, speed: 0.32, phase: 1.5, wrapMinX: -48, wrapMaxX: 48 },
  { x: 8,   y: 18.5, z: -28, scale: 1.8, speed: 0.36, phase: 3.1, wrapMinX: -48, wrapMaxX: 48 },
  { x: 26,  y: 22.5, z: -30, scale: 2.3, speed: 0.28, phase: 4.4, wrapMinX: -48, wrapMaxX: 48 },
  { x: -42, y: 15.0, z: -10, scale: 1.7, speed: 0.38, phase: 2.2, wrapMinX: -50, wrapMaxX: 48 },
  { x: -34, y: 19.5, z: 6,   scale: 1.4, speed: 0.45, phase: 5.1, wrapMinX: -48, wrapMaxX: 48 },
  { x: 34,  y: 16.5, z: -16, scale: 1.6, speed: 0.35, phase: 0.8, wrapMinX: -48, wrapMaxX: 48 },
  { x: 38,  y: 20.0, z: 2,   scale: 1.9, speed: 0.30, phase: 3.7, wrapMinX: -48, wrapMaxX: 48 },
  { x: -3,  y: 25.0, z: -38, scale: 2.6, speed: 0.22, phase: 1.9, wrapMinX: -52, wrapMaxX: 52 },
  { x: -22, y: 23.5, z: -36, scale: 2.4, speed: 0.25, phase: 4.8, wrapMinX: -52, wrapMaxX: 52 },
  { x: 20,  y: 24.5, z: -34, scale: 2.2, speed: 0.27, phase: 2.6, wrapMinX: -52, wrapMaxX: 52 },
];

function getAtmosphereConfig(isNightMode: boolean, season: CityWeatherSeason = "clear") {
  let skyHex = 0x38bdf8; // Vibrant Daylight Sky Blue (Default / Clear)
  let fogDensity = 0.0052;
  let dirLightColor = 0xfff1d6; // Warm clear-day sunlight
  let dirLightIntensity = 2.05;
  let hemiLightColor = 0xfffbeb;
  let hemiGroundColor = 0x94a3b8;
  let hemiIntensity = 1.0;

  if (isNightMode) {
    skyHex = 0x070b14; // Deep Midnight Sky
    fogDensity = 0.0055;
    dirLightColor = 0x93c5fd; // Soft Cool Moonlight
    dirLightIntensity = 0.95;
    hemiLightColor = 0x38bdf8;
    hemiGroundColor = 0x0f172a;
    hemiIntensity = 0.55;
  } else {
    if (season === "thunderstorm") {
      skyHex = 0x1e293b; // Dark Charcoal Thunderstorm Sky
      fogDensity = 0.007;
      dirLightColor = 0x64748b;
      dirLightIntensity = 1.0;
      hemiLightColor = 0x475569;
      hemiGroundColor = 0x0f172a;
      hemiIntensity = 0.65;
    } else if (season === "monsoon") {
      skyHex = 0x334155; // Overcast Slate Monsoon Sky
      fogDensity = 0.0065;
      dirLightColor = 0x94a3b8;
      dirLightIntensity = 1.15;
      hemiLightColor = 0x64748b;
      hemiGroundColor = 0x1e293b;
      hemiIntensity = 0.72;
    } else if (season === "rain") {
      skyHex = 0x526077; // Misty Rain Sky
      fogDensity = 0.006;
      dirLightColor = 0xa0aec0;
      dirLightIntensity = 1.25;
      hemiLightColor = 0x94a3b8;
      hemiGroundColor = 0x334155;
      hemiIntensity = 0.8;
    } else if (season === "snow") {
      skyHex = 0x93c5fd; // Crisp Winter Ice Blue Sky
      fogDensity = 0.0055;
      dirLightColor = 0xe0f2fe;
      dirLightIntensity = 1.5;
      hemiLightColor = 0xbfdbfe;
      hemiGroundColor = 0x64748b;
      hemiIntensity = 0.9;
    } else if (season === "hot") {
      skyHex = 0x38bdf8; // Vibrant Azure Summer Sky
      fogDensity = 0.0048;
      dirLightColor = 0xffe4b5; // Golden Sunlight
      dirLightIntensity = 2.3;
      hemiLightColor = 0xffedd5;
      hemiGroundColor = 0x94a3b8;
      hemiIntensity = 1.08;
    } else if (season === "cloudy") {
      skyHex = 0x7dd3fc; // Soft Pale Cloudy Sky
      fogDensity = 0.0058;
      dirLightColor = 0xfff4e0; // Sun peeking through clouds
      dirLightIntensity = 1.75;
      hemiLightColor = 0xfef3c7;
      hemiGroundColor = 0x94a3b8;
      hemiIntensity = 0.95;
    }
  }

  return {
    skyHex,
    fogDensity,
    dirLightColor,
    dirLightIntensity,
    hemiLightColor,
    hemiGroundColor,
    hemiIntensity,
    exposure: isNightMode ? 0.95 : 1.12,
    environmentIntensity: isNightMode ? 0.35 : 0.65,
  };
}

export function B2BCityCanvas({
    layout,
    recentDispatches = [],
    selectedId,
    onSelectObject,
    onRequestAddClient,
    isNightMode,
    season = "clear",
    cameraResetTrigger,
    focusTargetId,
    isSimulating = false,
    onLoaded,
  }: B2BCityCanvasProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [labels, setLabels] = useState<FloatingLabelItem[]>([]);
  const cloudsRef = useRef<SkyCloudItem[]>([]);
  const cloudsGroupRef = useRef<THREE.Group | null>(null);

  const [scrollHint, setScrollHint] = useState<{
    type: "desktop" | "touch";
    text: string;
  } | null>(null);
  const scrollHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerScrollHint = (type: "desktop" | "touch") => {
    setScrollHint({
      type,
      text:
        type === "desktop"
          ? "Hold Alt + Scroll to zoom 3D View"
          : "Use 2 fingers to rotate or zoom 3D View",
    });
    if (scrollHintTimerRef.current) clearTimeout(scrollHintTimerRef.current);
    scrollHintTimerRef.current = setTimeout(() => {
      setScrollHint(null);
    }, 1400);
  };
  const triggerScrollHintRef = useRef(triggerScrollHint);
  triggerScrollHintRef.current = triggerScrollHint;

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const lightningFlashStateRef = useRef<{ active: boolean; time: number }>({
    active: false,
    time: 0,
  });
  const lightningTimerRef = useRef<number>(0);
  const nextStrikeTimeRef = useRef<number>(6);

  const onLoadedRef = useRef<(() => void) | undefined>(onLoaded);
  onLoadedRef.current = onLoaded;

  // Mutable refs for animation loop access
  const layoutRef = useRef<CityLayoutResult>(layout);
  layoutRef.current = layout;

  const recentDispatchesRef = useRef<CityRecentDispatchTarget[]>(recentDispatches);
  recentDispatchesRef.current = recentDispatches;

  const isSimulatingRef = useRef<boolean>(isSimulating);
  isSimulatingRef.current = isSimulating;
  const wakeLoopRef = useRef<(() => void) | null>(null);
  const pauseLoopRef = useRef<(() => void) | null>(null);

  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  const hoveredIdRef = useRef<string | null>(hoveredId);
  hoveredIdRef.current = hoveredId;

  const onSelectRef = useRef(onSelectObject);
  onSelectRef.current = onSelectObject;

  const onAddClientRef = useRef(onRequestAddClient);
  onAddClientRef.current = onRequestAddClient;

  // Dynamic Day/Night & Season Atmospheric Refs
  const isNightModeRef = useRef<boolean>(isNightMode);
  isNightModeRef.current = isNightMode;
  const seasonRef = useRef<CityWeatherSeason>(season);
  seasonRef.current = season;

  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const starFieldRef = useRef<THREE.Points | null>(null);
  const rainPointsRef = useRef<THREE.LineSegments | null>(null);
  const snowPointsRef = useRef<THREE.Points | null>(null);
  const lightningMeshRef = useRef<THREE.Line | null>(null);
  const hemiIntensityBaseRef = useRef<number>(1.0);
  const dirIntensityBaseRef = useRef<number>(2.05);

  // Scene references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const worldGroupRef = useRef<THREE.Group | null>(null);
  const clickableGroupsRef = useRef<
    Map<
      string,
      {
        group: THREE.Group;
        placement: CityBuildingPlacement;
        targetScale: number;
        currentScale: number;
      }
    >
  >(new Map());
  interface CafeCustomerAgentItem {
    id: string;
    walkingCustomer: THREE.Group;
    handheldUmbrella: THREE.Group;
    carriedBag: THREE.Mesh;
    tableFood: THREE.Group;
    tableCandle: THREE.Mesh;
    foodBubble: THREE.Sprite;
    baseBubbleY: number;

    chairWorldPos: THREE.Vector3;
    patioEntryWorldPos: THREE.Vector3;
    doorWorldPos: THREE.Vector3;
    storeRotationY: number;

    cycleDuration: number;
    phaseOffset: number;
    eatingSpeed: number;
  }

  const cafeCustomerAgentsRef = useRef<CafeCustomerAgentItem[]>([]);
  const spawnedIdsRef = useRef<Set<string>>(new Set());
  const cameraFlyTargetRef = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
  } | null>(null);
  const selectionRingRef = useRef<THREE.Mesh | null>(null);

  // Build detailed miniature diorama inside `worldGroup`
  const rebuildCityMeshes = useCallback(
    (worldGroup: THREE.Group, currentLayout: CityLayoutResult, night: boolean) => {
      while (worldGroup.children.length > 0) {
        const child = worldGroup.children[0];
        worldGroup.remove(child);
      }
      clickableGroupsRef.current.clear();
      cafeCustomerAgentsRef.current = [];

      const {
        worldWidth,
        worldDepth,
        roads,
        trees,
        hqPlacement,
        warehousePlacement,
        financePlacement,
        storePlacements,
      } = currentLayout;

      // Shared high-craft materials
      const windowGlowMat = new THREE.MeshStandardMaterial({
        color: night ? 0xfef08a : 0xe0f2fe,
        emissive: night ? 0xf59e0b : 0x38bdf8,
        emissiveIntensity: night ? 1.15 : 0.35,
        roughness: 0.15,
        metalness: 0.2,
      });
      const warmWindowMat = new THREE.MeshStandardMaterial({
        color: 0xfffbeb,
        emissive: 0xf59e0b,
        emissiveIntensity: night ? 1.25 : 0.45,
        roughness: 0.2,
      });
      const darkFrameMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5,
        metalness: 0.3,
      });
      const stoneTrimMat = new THREE.MeshStandardMaterial({
        color: night ? 0x475569 : 0xf1f5f9,
        roughness: 0.65,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.25,
        metalness: 0.75,
        roughness: 0.2,
      });

      // ======================================================================
      // 1. ARCHITECTURAL DIORAMA TABLE BASE, CURBS, ROADS & STREETLIGHTS
      // ======================================================================
      const baseGroup = new THREE.Group();

      // Rich Walnut / Slate Diorama Pedestal Base
      const walnutBase = new THREE.Mesh(
        createRoundedBoxGeo(worldWidth + 3.6, 1.5, worldDepth + 3.6, 0.35, 3),
        new THREE.MeshStandardMaterial({
          color: night ? 0x090d16 : 0x334155,
          roughness: 0.55,
          metalness: 0.15,
        })
      );
      walnutBase.position.y = -1.1;
      walnutBase.receiveShadow = true;
      baseGroup.add(walnutBase);

      // Gold rim trim around diorama base
      const brassRim = new THREE.Mesh(
        createRoundedBoxGeo(worldWidth + 2.6, 0.25, worldDepth + 2.6, 0.2, 2),
        new THREE.MeshStandardMaterial({
          color: night ? 0x1e293b : 0x94a3b8,
          roughness: 0.4,
          metalness: 0.4,
        })
      );
      brassRim.position.y = -0.35;
      baseGroup.add(brassRim);

      // Lush manicured green grass turf top layer with procedural lawn stripes & blades
      const grassTexture = createGrassCanvasTexture(night);
      const turfGround = new THREE.Mesh(
        createRoundedBoxGeo(worldWidth + 1.2, 0.55, worldDepth + 1.2, 0.2, 3),
        new THREE.MeshStandardMaterial({
          map: grassTexture,
          color: night ? 0x10b981 : 0x86efac,
          roughness: 0.92,
          metalness: 0.0,
        })
      );
      turfGround.position.y = -0.26;
      turfGround.receiveShadow = true;
      baseGroup.add(turfGround);

      // Decorative 3D Grass Tufts & Wildflower Clumps placed purely in open lawn greenbelts
      // (Strictly avoiding roads z=0.8, z=10.6, z=20.4, spine roads x=±16.2, and sidewalks)
      const grassBladeMat = new THREE.MeshStandardMaterial({
        color: night ? 0x059669 : 0x16a34a,
        roughness: 0.8,
      });
      const flowerColors = [0xfacc15, 0xf472b6, 0x60a5fa, 0xfb923c];
      const safeLawnTuftPositions: Array<[number, number]> = [
        // North Park / behind HQ & Courtyard (z < -3.5)
        [-13.5, -9.2],
        [-6.5, -9.5],
        [6.5, -9.5],
        [13.5, -9.2],
        [-18.5, -6.0],
        [18.5, -6.0],
        [-18.5, -2.5],
        [18.5, -2.5],
        // Far Left & Right outer greenbelts (|x| >= 18.5, well clear of spine roads at x=±16.2)
        [-19.0, 3.5],
        [19.0, 3.5],
        [-19.0, 8.0],
        [19.0, 8.0],
        [-19.0, 13.5],
        [19.0, 13.5],
        [-19.0, 18.0],
        [19.0, 18.0],
        // Lawn pockets between client stores (Tier 1: storeZ=6.0, placed at z=3.8 far from roads z=0.8 and z=10.6)
        [-7.0, 3.8],
        [0.0, 3.8],
        [7.0, 3.8],
        // Lawn pockets between Tier 2 stores (Tier 2: storeZ=15.8, placed at z=13.6 far from roads z=10.6 and z=20.4)
        [-7.0, 13.6],
        [0.0, 13.6],
        [7.0, 13.6],
        // South Perimeter greenbelt
        [-10.5, 23.5],
        [-3.5, 23.5],
        [3.5, 23.5],
        [10.5, 23.5],
      ];

      safeLawnTuftPositions.forEach(([gx, gz], gIdx) => {
        // Double check against all road segments to guarantee no grass ever intersects a road or sidewalk
        const isInRoadway = roads.some((r) => {
          const halfW = r.width / 2 + 0.8;
          const halfD = r.depth / 2 + 0.8;
          return (
            gx >= r.x - halfW &&
            gx <= r.x + halfW &&
            gz >= r.z - halfD &&
            gz <= r.z + halfD
          );
        });
        if (isInRoadway) return;

        const tuftGrp = new THREE.Group();
        tuftGrp.position.set(gx, 0.02, gz);
        for (let b = 0; b < 3; b++) {
          const blade = new THREE.Mesh(
            new THREE.ConeGeometry(0.12, 0.32, 5),
            grassBladeMat
          );
          blade.position.set((b - 1) * 0.12, 0.14, (b % 2) * 0.08);
          blade.rotation.z = (b - 1) * 0.2;
          tuftGrp.add(blade);
        }
        if (gIdx % 2 === 0) {
          const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshStandardMaterial({
              color: flowerColors[gIdx % flowerColors.length],
              roughness: 0.4,
            })
          );
          flower.position.set(0, 0.28, 0.04);
          tuftGrp.add(flower);
        }
        baseGroup.add(tuftGrp);
      });

      // Central Command Plaza Paved Courtyard (set back at z = -6.0 so the 2-lane HQ road at z = 0.8 is 100% visible!)
      const plazaCurb = new THREE.Mesh(
        createRoundedBoxGeo(30.4, 0.1, 5.4, 0.15, 2),
        new THREE.MeshStandardMaterial({
          color: night ? 0x1e293b : 0xcbd5e1,
          roughness: 0.7,
        })
      );
      plazaCurb.position.set(0, 0.02, -6.0);
      plazaCurb.receiveShadow = true;
      baseGroup.add(plazaCurb);

      const plazaPaving = new THREE.Mesh(
        createRoundedBoxGeo(29.6, 0.12, 4.8, 0.12, 2),
        new THREE.MeshStandardMaterial({
          color: night ? 0x334155 : 0xf1f5f9,
          roughness: 0.6,
        })
      );
      plazaPaving.position.set(0, 0.03, -6.0);
      plazaPaving.receiveShadow = true;
      baseGroup.add(plazaPaving);

      // Front HQ Loading Walkway connecting HQ entrance (z = -3.6) to HQ Road North Curb (z = -1.2)
      const hqWalkway = new THREE.Mesh(
        createRoundedBoxGeo(7.2, 0.11, 2.4, 0.08, 2),
        new THREE.MeshStandardMaterial({
          color: night ? 0x334155 : 0xe2e8f0,
          roughness: 0.65,
        })
      );
      hqWalkway.position.set(0, 0.025, -2.3);
      hqWalkway.receiveShadow = true;
      baseGroup.add(hqWalkway);

      // Roads with Sidewalk Curbs, Dashed Markings & Zebra Crosswalks
      const sidewalkMat = new THREE.MeshStandardMaterial({
        color: night ? 0x1e293b : 0xe2e8f0,
        roughness: 0.75,
      });
      const asphaltMat = new THREE.MeshStandardMaterial({
        color: night ? 0x090d16 : 0x1e293b,
        roughness: 0.85,
      });
      const stripeMat = new THREE.MeshBasicMaterial({
        color: night ? 0x94a3b8 : 0xf8fafc,
      });
      const centerDividerMat = new THREE.MeshBasicMaterial({
        color: night ? 0xf59e0b : 0xfbbf24,
      });

      roads.forEach((r) => {
        // Raised Sidewalk Bed under road
        const swWidth = r.orientation === "horizontal" ? r.width + 0.9 : r.width + 1.0;
        const swDepth = r.orientation === "horizontal" ? r.depth + 1.0 : r.depth + 0.9;
        const swMesh = new THREE.Mesh(
          createRoundedBoxGeo(swWidth, 0.1, swDepth, 0.04, 2),
          sidewalkMat
        );
        swMesh.position.set(r.x, 0.05, r.z);
        swMesh.receiveShadow = true;
        baseGroup.add(swMesh);

        // Full 2-Lane Asphalt Roadway (elevated above all courtyard slabs so both lanes are always visible)
        const rMesh = new THREE.Mesh(
          new THREE.BoxGeometry(r.width, 0.09, r.depth),
          asphaltMat
        );
        rMesh.position.set(r.x, 0.08, r.z);
        rMesh.receiveShadow = true;
        baseGroup.add(rMesh);

        if (r.orientation === "horizontal") {
          // Outer White Lane Edge Lines (2-lane boulevard borders: North & South lanes)
          [-r.depth / 2 + 0.18, r.depth / 2 - 0.18].forEach((edgeZ) => {
            const edgeLine = new THREE.Mesh(
              new THREE.BoxGeometry(r.width - 0.4, 0.02, 0.08),
              stripeMat
            );
            edgeLine.position.set(r.x, 0.13, r.z + edgeZ);
            baseGroup.add(edgeLine);
          });

          // Amber Dashed Center Lane Divider (separating outbound & inbound lanes)
          const dashCount = Math.floor(r.width / 2.2);
          for (let i = 0; i < dashCount; i++) {
            const dMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.95, 0.022, 0.14),
              centerDividerMat
            );
            const dx = -r.width / 2 + 1.2 + i * 2.2;
            dMesh.position.set(r.x + dx, 0.132, r.z);
            baseGroup.add(dMesh);
          }

          // Zebra Crosswalk in front of HQ (on Grand Avenue z = 0.8)
          if (Math.abs(r.z - 0.8) < 0.2) {
            for (let zc = -1.2; zc <= 1.2; zc += 0.38) {
              const zebra = new THREE.Mesh(
                new THREE.BoxGeometry(0.95, 0.025, 0.18),
                stripeMat
              );
              zebra.position.set(0, 0.134, r.z + zc);
              baseGroup.add(zebra);
            }
          }
        } else {
          // Outer White Lane Edge Lines for Vertical Spine Roads
          [-r.width / 2 + 0.18, r.width / 2 - 0.18].forEach((edgeX) => {
            const edgeLine = new THREE.Mesh(
              new THREE.BoxGeometry(0.08, 0.02, r.depth - 0.4),
              stripeMat
            );
            edgeLine.position.set(r.x + edgeX, 0.13, r.z);
            baseGroup.add(edgeLine);
          });

          const dashCount = Math.floor(r.depth / 2.2);
          for (let i = 0; i < dashCount; i++) {
            const dMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.14, 0.022, 0.95),
              centerDividerMat
            );
            const dz = -r.depth / 2 + 1.2 + i * 2.2;
            dMesh.position.set(r.x, 0.132, r.z + dz);
            baseGroup.add(dMesh);
          }
        }
      });

      // Decorative Streetlamps, Park Benches, Flower Bushes & Fire Hydrants along Avenues
      const lampPostMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.7,
        roughness: 0.3,
      });
      const lampBulbMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: night ? 2.0 : 0.5,
      });
      const benchWoodMat = new THREE.MeshStandardMaterial({
        color: 0x92400e,
        roughness: 0.75,
      });
      const hydrantMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.35,
        metalness: 0.3,
      });

      // Cafe patio centres (HQ + each store) so streetlamps never block the sitting areas
      const patioCenters: { x: number; z: number }[] = [{ x: -4.6, z: -4.1 }];
      storePlacements.forEach((sp) => {
        const off = new THREE.Vector3(3.05, 0, 1.15).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          sp.rotationY
        );
        patioCenters.push({ x: sp.x + off.x, z: sp.z + off.z });
      });
      const LAMP_PATIO_CLEARANCE = 1.5;

      [
        [-13.5, -1.1],
        [-5.2, -1.1],
        [5.2, -1.1],
        [13.5, -1.1],
        [-13.5, 7.8],
        [-6.8, 7.8],
        [0, 7.8],
        [6.8, 7.8],
        [13.5, 7.8],
        [-13.5, 17.2],
        [0, 17.2],
        [13.5, 17.2],
      ].forEach(([baseLx, lz], idx) => {
        // If a lamp would stand in front of a cafe patio, tuck it into the grass gap
        // just to the patio's right (between the patio and the next store's curb).
        let lx = baseLx;
        const blocking = patioCenters.find(
          (p) => Math.hypot(lx - p.x, lz - p.z) < LAMP_PATIO_CLEARANCE
        );
        const relocated = !!blocking;
        if (blocking) lx = blocking.x + 1.6;

        const lampGroup = new THREE.Group();
        lampGroup.position.set(lx, 0.08, lz);

        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.08, 1.8, 8),
          lampPostMat
        );
        pole.position.y = 0.9;
        pole.castShadow = true;
        lampGroup.add(pole);

        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.06, 0.45),
          lampPostMat
        );
        arm.position.set(0, 1.78, 0.18);
        lampGroup.add(arm);

        const lantern = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 10, 10),
          lampBulbMat
        );
        lantern.position.set(0, 1.72, 0.36);
        lampGroup.add(lantern);

        // Add cozy park bench & flower bush next to alternating lamps
        // (skipped for lamps tucked beside a patio so they don't crowd it)
        if (relocated) {
          // no bench / hydrant
        } else if (idx % 2 === 0) {
          const bench = new THREE.Mesh(
            createRoundedBoxGeo(0.75, 0.22, 0.3, 0.03, 2),
            benchWoodMat
          );
          bench.position.set(0.65, 0.14, 0);
          bench.castShadow = true;
          lampGroup.add(bench);
        } else {
          // Miniature red fire hydrant
          const hyd = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.11, 0.36, 10),
            hydrantMat
          );
          hyd.position.set(-0.55, 0.18, 0.05);
          hyd.castShadow = true;
          lampGroup.add(hyd);
        }

        baseGroup.add(lampGroup);
      });

      // Lush Multi-Style Trees (Rounded Park Trees & Cypresses)
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x78350f,
        roughness: 0.85,
      });
      const foliagePalettes = [0x16a34a, 0x22c55e, 0x15803d, 0x10b981];

      trees.forEach((t, idx) => {
        const treeGrp = new THREE.Group();
        treeGrp.position.set(t.x, 0.05, t.z);
        treeGrp.scale.setScalar(t.scale);

        // Tree planter ring
        const planter = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.48, 0.12, 12),
          stoneTrimMat
        );
        planter.position.y = 0.06;
        treeGrp.add(planter);

        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.18, 0.9, 8),
          trunkMat
        );
        trunk.position.y = 0.45;
        trunk.castShadow = true;
        treeGrp.add(trunk);

        const fMat = new THREE.MeshStandardMaterial({
          color: foliagePalettes[idx % foliagePalettes.length],
          roughness: 0.65,
        });

        if (idx % 2 === 0) {
          // Puff-cloud deciduous park tree
          const mainCrown = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.72, 1),
            fMat
          );
          mainCrown.position.set(0, 1.35, 0);
          mainCrown.castShadow = true;
          treeGrp.add(mainCrown);

          const sidePuff1 = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.48, 1),
            fMat
          );
          sidePuff1.position.set(0.38, 1.15, 0.25);
          sidePuff1.castShadow = true;
          treeGrp.add(sidePuff1);

          const sidePuff2 = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.45, 1),
            fMat
          );
          sidePuff2.position.set(-0.35, 1.65, -0.2);
          sidePuff2.castShadow = true;
          treeGrp.add(sidePuff2);
        } else {
          // Layered pine / cypress tree
          for (let layer = 0; layer < 3; layer++) {
            const cone = new THREE.Mesh(
              new THREE.ConeGeometry(0.75 - layer * 0.16, 1.05 - layer * 0.12, 9),
              fMat
            );
            cone.position.y = 1.05 + layer * 0.55;
            cone.castShadow = true;
            treeGrp.add(cone);
          }
        }

        baseGroup.add(treeGrp);
      });

      worldGroup.add(baseGroup);

      // ======================================================================
      // BUILDING 1: CENTRAL SUPPLY HUB HQ (GRAND ARTISANAL BAKERY & DISPATCH HQ)
      // ======================================================================
      const hqGroup = new THREE.Group();
      hqGroup.position.set(hqPlacement.x, 0.1, hqPlacement.z);
      hqGroup.userData = { clickableId: hqPlacement.id };

      // Stepped Foundation Plinth
      const hqPlinth = new THREE.Mesh(
        createRoundedBoxGeo(6.4, 0.28, 4.8, 0.08, 2),
        stoneTrimMat
      );
      hqPlinth.position.y = 0.14;
      hqPlinth.receiveShadow = true;
      hqGroup.add(hqPlinth);

      // Ground Floor Warm Cream / Sandstone Facade
      const hqFirstFloor = new THREE.Mesh(
        createRoundedBoxGeo(5.6, 1.85, 4.0, 0.12, 3),
        new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.55 })
      );
      hqFirstFloor.position.y = 1.15;
      hqFirstFloor.castShadow = true;
      hqFirstFloor.receiveShadow = true;
      hqGroup.add(hqFirstFloor);

      // Mid Cornice Belt
      const hqMidBelt = new THREE.Mesh(
        createRoundedBoxGeo(5.85, 0.22, 4.25, 0.06, 2),
        new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.45 })
      );
      hqMidBelt.position.y = 2.12;
      hqMidBelt.castShadow = true;
      hqGroup.add(hqMidBelt);

      // Second Floor Executive Royal Blue Tier
      const hqSecondFloor = new THREE.Mesh(
        createRoundedBoxGeo(5.3, 1.55, 3.7, 0.12, 3),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45 })
      );
      hqSecondFloor.position.y = 2.95;
      hqSecondFloor.castShadow = true;
      hqSecondFloor.receiveShadow = true;
      hqGroup.add(hqSecondFloor);

      // Upper Roof Parapet & Crown
      const hqRoofCap = new THREE.Mesh(
        createRoundedBoxGeo(5.6, 0.28, 4.0, 0.08, 2),
        stoneTrimMat
      );
      hqRoofCap.position.y = 3.82;
      hqRoofCap.castShadow = true;
      hqGroup.add(hqRoofCap);

      // Penthouse Clock/Sign Tower
      const hqTower = new THREE.Mesh(
        createRoundedBoxGeo(2.8, 1.05, 2.2, 0.1, 3),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
      );
      hqTower.position.set(0, 4.42, 0.2);
      hqTower.castShadow = true;
      hqGroup.add(hqTower);

      // Gold Signboard Panel on Tower Front
      const hqSignPanel = new THREE.Mesh(
        createRoundedBoxGeo(2.3, 0.55, 0.12, 0.04, 2),
        goldMat
      );
      hqSignPanel.position.set(0, 4.45, 1.32);
      hqGroup.add(hqSignPanel);

      // Multi-Stripe Scalloped Bakery Awning over Front Entrance
      const hqAwning = createStripedAwning(4.2, 1.15, 0xd97706, 9);
      hqAwning.position.set(0, 1.58, 2.38);
      hqAwning.rotation.x = 0.22;
      hqGroup.add(hqAwning);

      // Double Glass Entrance Doors + Warm Bakery Display Windows
      const hqDoorFrame = new THREE.Mesh(
        createRoundedBoxGeo(1.25, 1.25, 0.14, 0.04, 2),
        darkFrameMat
      );
      hqDoorFrame.position.set(0, 0.85, 2.02);
      hqGroup.add(hqDoorFrame);

      const hqDoorGlass = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.1, 0.16),
        warmWindowMat
      );
      hqDoorGlass.position.set(0, 0.85, 2.02);
      hqGroup.add(hqDoorGlass);

      // Side Display Windows on Ground Floor
      [-1.75, 1.75].forEach((wx) => {
        const frame = new THREE.Mesh(
          createRoundedBoxGeo(1.3, 0.95, 0.14, 0.04, 2),
          darkFrameMat
        );
        frame.position.set(wx, 0.98, 2.01);
        hqGroup.add(frame);

        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(1.12, 0.78, 0.16),
          warmWindowMat
        );
        glass.position.set(wx, 0.98, 2.01);
        hqGroup.add(glass);
      });

      // Second Floor Framed Windows (3 front bays + 2 side bays on +X and -X)
      [-1.65, 0, 1.65].forEach((wx) => {
        const frame = new THREE.Mesh(
          createRoundedBoxGeo(1.15, 0.82, 0.14, 0.04, 2),
          stoneTrimMat
        );
        frame.position.set(wx, 2.95, 1.86);
        hqGroup.add(frame);

        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(0.96, 0.64, 0.16),
          windowGlowMat
        );
        glass.position.set(wx, 2.95, 1.86);
        hqGroup.add(glass);
      });

      [-1, 1].forEach((sideSign) => {
        [-0.85, 0.85].forEach((wz) => {
          const sWin = new THREE.Mesh(
            createRoundedBoxGeo(0.14, 0.78, 0.95, 0.03, 2),
            windowGlowMat
          );
          sWin.position.set(sideSign * 2.66, 2.95, wz);
          hqGroup.add(sWin);

          const gWin = new THREE.Mesh(
            createRoundedBoxGeo(0.14, 0.82, 0.98, 0.03, 2),
            warmWindowMat
          );
          gWin.position.set(sideSign * 2.81, 1.05, wz);
          hqGroup.add(gWin);
        });
      });

      // Artisanal Brick Chimney + Animated Steam Puffs
      const chimney = new THREE.Mesh(
        createRoundedBoxGeo(0.68, 1.65, 0.68, 0.06, 2),
        new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.75 })
      );
      chimney.position.set(1.95, 4.5, -0.95);
      chimney.castShadow = true;
      hqGroup.add(chimney);

      const chimneyRim = new THREE.Mesh(
        createRoundedBoxGeo(0.82, 0.18, 0.82, 0.04, 2),
        stoneTrimMat
      );
      chimneyRim.position.set(1.95, 5.32, -0.95);
      hqGroup.add(chimneyRim);

      const steamGroup = new THREE.Group();
      steamGroup.name = "hq-steam";
      steamGroup.position.set(1.95, 5.65, -0.95);
      const steamMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.82,
        roughness: 1,
      });
      for (let s = 0; s < 4; s++) {
        const puff = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.24 + s * 0.06, 1),
          steamMat
        );
        puff.position.y = s * 0.5;
        steamGroup.add(puff);
      }
      hqGroup.add(steamGroup);

      // Rotating Golden Crown Emblem atop HQ Tower
      const hqBeacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        goldMat
      );
      hqBeacon.name = "rotating-emblem";
      hqBeacon.position.set(0, 5.45, 0.2);
      hqGroup.add(hqBeacon);

      worldGroup.add(hqGroup);
      clickableGroupsRef.current.set(hqPlacement.id, {
        group: hqGroup,
        placement: hqPlacement,
        targetScale: 1,
        currentScale: 1,
      });

      // Detached Garden Cafe Patio beside Bakery HQ
      const hqPatio = createCafeTerraceDeck(
        0x2563eb,
        "Signature Butter Croissant",
        0x1d4ed8,
        0x1e293b,
        0x2563eb
      );
      const hqTerraceX = -4.6;
      const hqTerraceZ = -4.1;
      hqPatio.group.position.set(hqTerraceX, 0.05, hqTerraceZ);
      hqPatio.group.scale.setScalar(0.96);
      const hqTreeCafeId = "tree-cafe-hq";
      hqPatio.group.userData = { clickableId: hqTreeCafeId };

      const hqTreeCafePlacement: CityBuildingPlacement = {
        id: hqTreeCafeId,
        kind: "tree_cafe",
        label: "Signature Butter Croissant",
        subLabel: `All-Time Top Seller · ${hqPlacement.label}`,
        x: hqTerraceX,
        z: hqTerraceZ,
        rotationY: 0,
        routeWaypoints: [],
        styleVariant: 0,
        topProductMeta: {
          name: "Signature Butter Croissant",
          storeName: hqPlacement.label,
          units: 148,
          revenue: 6660,
          marginPct: 62.5,
          wholesaleRate: 45,
          category: "Central Hub Signature Bake",
        },
      };

      // Add both the patio group AND the single continuous customer directly to worldGroup
      worldGroup.add(hqPatio.group);
      worldGroup.add(hqPatio.walkingCustomer);
      clickableGroupsRef.current.set(hqTreeCafeId, {
        group: hqPatio.group,
        placement: hqTreeCafePlacement,
        targetScale: 0.96,
        currentScale: 0.96,
      });

      cafeCustomerAgentsRef.current.push({
        id: hqTreeCafeId,
        walkingCustomer: hqPatio.walkingCustomer,
        handheldUmbrella: hqPatio.handheldUmbrella,
        carriedBag: hqPatio.carriedBag,
        tableFood: hqPatio.tableFood,
        tableCandle: hqPatio.tableCandle,
        foodBubble: hqPatio.foodBubble,
        baseBubbleY: 2.0,

        chairWorldPos: new THREE.Vector3(hqTerraceX + 0.35 * 0.96, 0.08, hqTerraceZ),
        patioEntryWorldPos: new THREE.Vector3(hqTerraceX + 0.65, 0.08, hqPlacement.z + 2.35),
        doorWorldPos: new THREE.Vector3(hqPlacement.x, 0.08, hqPlacement.z + 2.35),
        storeRotationY: 0,

        cycleDuration: 30.0,
        phaseOffset: 0,
        eatingSpeed: 1.9,
      });

      // ======================================================================
      // BUILDING 2: CATALOG & STOCK WAREHOUSE (SAWTOOTH INDUSTRIAL FULFILLMENT)
      // ======================================================================
      const whGroup = new THREE.Group();
      whGroup.position.set(warehousePlacement.x, 0.1, warehousePlacement.z);
      whGroup.userData = { clickableId: warehousePlacement.id };

      // Concrete Dock Apron
      const whApron = new THREE.Mesh(
        createRoundedBoxGeo(6.0, 0.24, 4.8, 0.08, 2),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.75 })
      );
      whApron.position.y = 0.12;
      whApron.receiveShadow = true;
      whGroup.add(whApron);

      // Main Warehouse Cladding
      const whBody = new THREE.Mesh(
        createRoundedBoxGeo(5.2, 2.35, 3.8, 0.12, 3),
        new THREE.MeshStandardMaterial({
          color: 0x334155,
          roughness: 0.5,
          metalness: 0.25,
        })
      );
      whBody.position.y = 1.35;
      whBody.castShadow = true;
      whBody.receiveShadow = true;
      whGroup.add(whBody);

      // Emerald Accent Band
      const whBand = new THREE.Mesh(
        createRoundedBoxGeo(5.32, 0.26, 3.92, 0.06, 2),
        new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35 })
      );
      whBand.position.y = 2.38;
      whGroup.add(whBand);

      // Classic 3-Bay Sawtooth Industrial Skylight Roof
      const sawRoofMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.55,
        metalness: 0.3,
      });
      [-1.55, 0, 1.55].forEach((rx) => {
        const tooth = new THREE.Mesh(
          createRoundedBoxGeo(1.52, 0.75, 3.5, 0.06, 2),
          sawRoofMat
        );
        tooth.position.set(rx, 2.72, 0);
        tooth.rotation.z = 0.28;
        tooth.castShadow = true;
        whGroup.add(tooth);

        // Glowing Skylight Strip on each sawtooth
        const skylight = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.55, 3.2),
          windowGlowMat
        );
        skylight.position.set(rx + 0.68, 2.75, 0);
        whGroup.add(skylight);
      });

      // 3 Recessed Roll-Up Steel Loading Doors + Safety Bollards
      const shutterMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.5,
        roughness: 0.35,
      });
      const bollardMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.3,
      });

      [-1.55, 0, 1.55].forEach((bx) => {
        const doorFrame = new THREE.Mesh(
          createRoundedBoxGeo(1.15, 1.45, 0.14, 0.04, 2),
           new THREE.MeshStandardMaterial({ color: 0x0f172a })
        );
        doorFrame.position.set(bx, 0.92, 1.9);
        whGroup.add(doorFrame);

        const shutter = new THREE.Mesh(
          new THREE.BoxGeometry(0.98, 1.28, 0.16),
          shutterMat
        );
        shutter.position.set(bx, 0.92, 1.9);
        whGroup.add(shutter);

        // Yellow safety bollards flanking each bay
        [-0.58, 0.58].forEach((ox) => {
          const bollard = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8),
            bollardMat
          );
          bollard.position.set(bx + ox, 0.38, 2.08);
          whGroup.add(bollard);
        });
      });

      // Active Conveyor Belt with Detailed Shipping Crates
      const beltFrame = new THREE.Mesh(
        createRoundedBoxGeo(2.9, 0.22, 0.78, 0.05, 2),
        darkFrameMat
      );
      beltFrame.position.set(-0.6, 0.32, 2.35);
      beltFrame.castShadow = true;
      whGroup.add(beltFrame);

      const conveyorBoxes = new THREE.Group();
      conveyorBoxes.name = "wh-conveyor";
      conveyorBoxes.position.set(-0.6, 0.62, 2.35);
      const cardboardMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.65,
      });
      for (let c = 0; c < 3; c++) {
        const crateGrp = new THREE.Group();
        const box = new THREE.Mesh(
          createRoundedBoxGeo(0.44, 0.38, 0.44, 0.04, 2),
          cardboardMat
        );
        box.castShadow = true;
        crateGrp.add(box);
        const tape = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.06, 0.12),
          new THREE.MeshBasicMaterial({ color: 0xfef3c7 })
        );
        tape.position.y = 0.18;
        crateGrp.add(tape);
        crateGrp.position.x = (c - 1) * 0.9;
        conveyorBoxes.add(crateGrp);
      }
      whGroup.add(conveyorBoxes);

      // Stacked Wooden Pallet on Right Side of Dock
      const pallet = new THREE.Mesh(
        createRoundedBoxGeo(0.95, 0.12, 0.95, 0.02, 2),
        new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 })
      );
      pallet.position.set(1.85, 0.28, 2.28);
      whGroup.add(pallet);

      const stackedCargo = new THREE.Mesh(
        createRoundedBoxGeo(0.78, 0.55, 0.78, 0.06, 2),
        new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.45 })
      );
      stackedCargo.position.set(1.85, 0.62, 2.28);
      stackedCargo.castShadow = true;
      whGroup.add(stackedCargo);

      worldGroup.add(whGroup);
      clickableGroupsRef.current.set(warehousePlacement.id, {
        group: whGroup,
        placement: warehousePlacement,
        targetScale: 1,
        currentScale: 1,
      });

      // ======================================================================
      // BUILDING 3: FINANCE & RECEIVABLES VAULT (BOUTIQUE GLASS & GOLD BANK)
      // ======================================================================
      const finGroup = new THREE.Group();
      finGroup.position.set(financePlacement.x, 0.1, financePlacement.z);
      finGroup.userData = { clickableId: financePlacement.id };

      // Marble Stepped Podium
      const finPodium = new THREE.Mesh(
        createRoundedBoxGeo(4.8, 0.34, 4.4, 0.08, 2),
        stoneTrimMat
      );
      finPodium.position.y = 0.17;
      finPodium.receiveShadow = true;
      finGroup.add(finPodium);

      // Emerald Glass Curtain-Wall Tower Core
      const finCore = new THREE.Mesh(
        createRoundedBoxGeo(3.9, 3.85, 3.5, 0.16, 3),
        new THREE.MeshStandardMaterial({
          color: 0x064e3b,
          roughness: 0.2,
          metalness: 0.45,
        })
      );
      finCore.position.y = 2.22;
      finCore.castShadow = true;
      finCore.receiveShadow = true;
      finGroup.add(finCore);

      // Architectural Corner Marble Pillars & Horizontal Floor Spandrels
      [
        [-1.85, 1.65],
        [1.85, 1.65],
        [-1.85, -1.65],
        [1.85, -1.65],
      ].forEach(([px, pz]) => {
        const col = new THREE.Mesh(
          createRoundedBoxGeo(0.36, 3.95, 0.36, 0.05, 2),
          stoneTrimMat
        );
        col.position.set(px, 2.25, pz);
        col.castShadow = true;
        finGroup.add(col);
      });

      // Classical Front Portico Columns
      [-1.1, -0.38, 0.38, 1.1].forEach((cx) => {
        const fCol = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.13, 1.45, 12),
          stoneTrimMat
        );
        fCol.position.set(cx, 1.05, 1.92);
        fCol.castShadow = true;
        finGroup.add(fCol);
      });

      // Portico Canopy
      const porticoCap = new THREE.Mesh(
        createRoundedBoxGeo(2.8, 0.24, 0.65, 0.05, 2),
        goldMat
      );
      porticoCap.position.set(0, 1.85, 1.88);
      porticoCap.castShadow = true;
      finGroup.add(porticoCap);

      // 3 Glowing Glass Office Tiers
      [1.35, 2.35, 3.35].forEach((fy) => {
        const glassBand = new THREE.Mesh(
          createRoundedBoxGeo(3.98, 0.48, 3.58, 0.08, 2),
          windowGlowMat
        );
        glassBand.position.y = fy;
        finGroup.add(glassBand);
      });

      // Penthouse Crown & Rotating Golden Vault Coin Ring
      const finCrown = new THREE.Mesh(
        createRoundedBoxGeo(3.2, 0.45, 2.8, 0.1, 2),
        stoneTrimMat
      );
      finCrown.position.y = 4.35;
      finCrown.castShadow = true;
      finGroup.add(finCrown);

      const coinGroup = new THREE.Group();
      coinGroup.name = "rotating-emblem";
      coinGroup.position.set(0, 5.2, 0);

      const outerTorus = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.13, 14, 28),
        goldMat
      );
      coinGroup.add(outerTorus);

      const innerCoin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.12, 20),
        goldMat
      );
      innerCoin.rotation.x = Math.PI / 2;
      coinGroup.add(innerCoin);

      finGroup.add(coinGroup);

      worldGroup.add(finGroup);
      clickableGroupsRef.current.set(financePlacement.id, {
        group: finGroup,
        placement: financePlacement,
        targetScale: 1,
        currentScale: 1,
      });

      // ======================================================================
      // BUILDING 4..N: BOUTIQUE CLIENT STOREFRONTS (5 CHARMING ARCHITECTURES)
      // ======================================================================
      const facadeWallColors = [
        0xfffbeb, // Warm Vanilla Cream
        0xffedd5, // Soft Terracotta / Peach
        0xe0f2fe, // Crisp Sky Blue
        0xfef3c7, // Artisanal Butter
        0xf3e8ff, // Lavender Bistro
      ];

      const healthColorMap = {
        healthy: 0x10b981, // Emerald
        warning: 0xf59e0b, // Amber
        urgent: 0xf43f5e,  // Rose
        new: 0x3b82f6,     // Royal Blue
      };

      storePlacements.forEach((sp, storeIdx) => {
        const stGroup = new THREE.Group();
        stGroup.position.set(sp.x, 0.08, sp.z);
        stGroup.rotation.y = sp.rotationY;
        stGroup.userData = { clickableId: sp.id };

        const health = sp.storeNode?.healthStatus || "healthy";
        const accentHex = healthColorMap[health];
        const wallHex = facadeWallColors[sp.styleVariant % facadeWallColors.length];
        const variant = sp.styleVariant % 5;

        // 1. Raised Stone Sidewalk Patio Lot with Curb
        const lotCurb = new THREE.Mesh(
          createRoundedBoxGeo(4.2, 0.14, 4.0, 0.1, 2),
          new THREE.MeshStandardMaterial({
            color: night ? 0x334155 : 0xcbd5e1,
            roughness: 0.7,
          })
        );
        lotCurb.position.y = 0.07;
        lotCurb.receiveShadow = true;
        stGroup.add(lotCurb);

        const lotPatio = new THREE.Mesh(
          createRoundedBoxGeo(3.96, 0.16, 3.76, 0.08, 2),
          new THREE.MeshStandardMaterial({
            color: night ? 0x1e293b : 0xf8fafc,
            roughness: 0.6,
          })
        );
        lotPatio.position.y = 0.08;
        lotPatio.receiveShadow = true;
        stGroup.add(lotPatio);

        // 2. Main Boutique Storefront Body (Rounded Chamfered Walls + 360° Waist Belt Trim)
        const baseH = variant === 2 ? 2.35 : variant === 4 ? 2.15 : 1.95;
        const bodyMesh = new THREE.Mesh(
          createRoundedBoxGeo(3.2, baseH, 2.6, 0.12, 3),
          new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.55 })
        );
        bodyMesh.position.set(0, baseH / 2 + 0.14, -0.2);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        stGroup.add(bodyMesh);

        // 360-degree lower wainscoting plinth & mid-wall architectural trim
        const wainscot = new THREE.Mesh(
          createRoundedBoxGeo(3.3, 0.36, 2.7, 0.08, 2),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 })
        );
        wainscot.position.set(0, 0.32, -0.2);
        stGroup.add(wainscot);

        // Side Windows on Both +X and -X Walls + Rear Service Window (-Z) so no side is ever blank
        [-1, 1].forEach((sideDir) => {
          const sideFrame = new THREE.Mesh(
            createRoundedBoxGeo(0.14, 0.85, 1.25, 0.04, 2),
            darkFrameMat
          );
          sideFrame.position.set(sideDir * 1.61, 0.92, -0.2);
          stGroup.add(sideFrame);

          const sideGlass = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.68, 1.08),
            warmWindowMat
          );
          sideGlass.position.set(sideDir * 1.61, 0.92, -0.2);
          stGroup.add(sideGlass);

          const sideSill = new THREE.Mesh(
            createRoundedBoxGeo(0.24, 0.1, 1.36, 0.03, 2),
            stoneTrimMat
          );
          sideSill.position.set(sideDir * 1.64, 0.46, -0.2);
          stGroup.add(sideSill);
        });

        // Rear Window & Service Door (-Z face)
        const rearWin = new THREE.Mesh(
          createRoundedBoxGeo(1.2, 0.72, 0.14, 0.03, 2),
          warmWindowMat
        );
        rearWin.position.set(0.45, 0.95, -1.51);
        stGroup.add(rearWin);

        const rearDoor = new THREE.Mesh(
          createRoundedBoxGeo(0.68, 1.05, 0.14, 0.03, 2),
          darkFrameMat
        );
        rearDoor.position.set(-0.75, 0.68, -1.51);
        stGroup.add(rearDoor);

        // Architectural Corner Pilasters
        [
          [-1.56, 1.06],
          [1.56, 1.06],
          [-1.56, -1.46],
          [1.56, -1.46],
        ].forEach(([px, pz]) => {
          const pilaster = new THREE.Mesh(
            createRoundedBoxGeo(0.22, baseH + 0.04, 0.22, 0.04, 2),
            stoneTrimMat
          );
          pilaster.position.set(px, baseH / 2 + 0.14, pz);
          pilaster.castShadow = true;
          stGroup.add(pilaster);
        });

        // 3. Variant Roof Architectures (Pitched Gable, Parisian Mansard, Rooftop Pergola, Clock Bistro)
        const roofMat = new THREE.MeshStandardMaterial({
          color: accentHex,
          roughness: 0.4,
        });

        // Status Trim Cornice around roof line
        const cornice = new THREE.Mesh(
          createRoundedBoxGeo(3.48, 0.22, 2.88, 0.06, 2),
          roofMat
        );
        cornice.position.set(0, baseH + 0.2, -0.2);
        cornice.castShadow = true;
        stGroup.add(cornice);

        if (variant === 0 || variant === 3) {
          // Cozy Pitched Gable Bakery Roof + Rooftop Sign
          const pitchedRoof = new THREE.Mesh(
            new THREE.ConeGeometry(2.35, 0.95, 4),
            new THREE.MeshStandardMaterial({
              color: variant === 0 ? 0x1e293b : 0x7c2d12,
              roughness: 0.6,
            })
          );
          pitchedRoof.rotation.y = Math.PI / 4;
          pitchedRoof.scale.set(1.08, 1, 0.88);
          pitchedRoof.position.set(0, baseH + 0.75, -0.2);
          pitchedRoof.castShadow = true;
          stGroup.add(pitchedRoof);
        } else if (variant === 1) {
          // Parisian Mansard Tier + Rooftop AC & Skylight
          const mansard = new THREE.Mesh(
            createRoundedBoxGeo(2.75, 0.62, 2.15, 0.12, 3),
            new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })
          );
          mansard.position.set(0, baseH + 0.56, -0.2);
          mansard.castShadow = true;
          stGroup.add(mansard);
        } else {
          // Modern Terraced Bistro with Upper Sign Wall & Rooftop Greenery
          const parapetSign = new THREE.Mesh(
            createRoundedBoxGeo(2.4, 0.55, 0.24, 0.05, 2),
            roofMat
          );
          parapetSign.position.set(0, baseH + 0.52, 0.95);
          parapetSign.castShadow = true;
          stGroup.add(parapetSign);

          // Rooftop AC unit
          const acUnit = new THREE.Mesh(
            createRoundedBoxGeo(0.65, 0.38, 0.55, 0.04, 2),
            stoneTrimMat
          );
          acUnit.position.set(-0.85, baseH + 0.45, -0.55);
          acUnit.castShadow = true;
          stGroup.add(acUnit);
        }

        // 4. Striped Scalloped Cafe Awning over Storefront + Classic White Signboard
        const storeAwning = createStripedAwning(2.95, 0.88, accentHex, 7);
        storeAwning.position.set(0, 1.38, 1.38);
        storeAwning.rotation.x = 0.24;
        stGroup.add(storeAwning);

        // Classic White Signboard with Dark Trim mounted above entrance awning
        const signBacking = new THREE.Mesh(
          createRoundedBoxGeo(2.1, 0.36, 0.1, 0.03, 2),
          darkFrameMat
        );
        signBacking.position.set(0, 1.84, 1.18);
        signBacking.castShadow = true;
        stGroup.add(signBacking);

        const signFace = new THREE.Mesh(
          createRoundedBoxGeo(2.02, 0.3, 0.08, 0.02, 2),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.25,
            metalness: 0.05,
          })
        );
        signFace.position.set(0, 1.84, 1.22);
        stGroup.add(signFace);

        // 5. Recessed Storefront Door + Warm Display Window + Flower Planter Box
        const doorFrame = new THREE.Mesh(
          createRoundedBoxGeo(0.78, 1.12, 0.14, 0.03, 2),
          darkFrameMat
        );
        doorFrame.position.set(-0.82, 0.7, 1.11);
        stGroup.add(doorFrame);

        const doorGlass = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.96, 0.16),
          warmWindowMat
        );
        doorGlass.position.set(-0.82, 0.7, 1.11);
        stGroup.add(doorGlass);

        // Large Picture Display Window
        const winFrame = new THREE.Mesh(
          createRoundedBoxGeo(1.48, 0.88, 0.14, 0.04, 2),
          darkFrameMat
        );
        winFrame.position.set(0.52, 0.82, 1.11);
        stGroup.add(winFrame);

        const winPane = new THREE.Mesh(
          new THREE.BoxGeometry(1.32, 0.72, 0.16),
          warmWindowMat
        );
        winPane.position.set(0.52, 0.82, 1.11);
        stGroup.add(winPane);

        // Window Flower Box under Display Window
        const planterBox = new THREE.Mesh(
          createRoundedBoxGeo(1.42, 0.22, 0.28, 0.03, 2),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
        );
        planterBox.position.set(0.52, 0.28, 1.24);
        stGroup.add(planterBox);

        const hedge = new THREE.Mesh(
          createRoundedBoxGeo(1.34, 0.18, 0.22, 0.05, 2),
          new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.7 })
        );
        hedge.position.set(0.52, 0.42, 1.24);
        stGroup.add(hedge);

        // Second-story windows if taller store variant
        if (baseH > 2.05) {
          [-0.75, 0.75].forEach((ux) => {
            const uWin = new THREE.Mesh(
              createRoundedBoxGeo(0.75, 0.52, 0.14, 0.03, 2),
              windowGlowMat
            );
            uWin.position.set(ux, 1.92, 1.11);
            stGroup.add(uWin);
          });
        }

        // 6. Outdoor Sidewalk Cafe Table, Seated Diner & Top-Selling Bakery Treat
        const fallbackBakes = [
          "French Butter Croissant",
          "Chocolate Truffle Cake",
          "Artisan Sourdough Loaf",
          "Blueberry Muffin",
          "Strawberry Glazed Donut",
        ];
        const storeTopProduct =
          sp.storeNode?.topProduct && sp.storeNode.topProduct !== "Assorted Items"
            ? sp.storeNode.topProduct
            : fallbackBakes[storeIdx % fallbackBakes.length];

        const patioDinerColors = [0x2563eb, 0x10b981, 0xd97706, 0xec4899, 0x8b5cf6];
        const patioHairColors = [0x1e293b, 0x78350f, 0x451a03, 0x0f172a, 0x92400e];
        const umbrellaColors = [0x0284c7, 0xef4444, 0x10b981, 0xf59e0b, 0x8b5cf6];

        const patioSet = createCafeTerraceDeck(
          accentHex,
          storeTopProduct,
          patioDinerColors[storeIdx % patioDinerColors.length],
          patioHairColors[storeIdx % patioHairColors.length],
          umbrellaColors[storeIdx % umbrellaColors.length]
        );

        // Position the detached circular garden patio cleanly outside the store's sidewalk curb (x = 2.1)
        const terraceOffset = new THREE.Vector3(3.05, 0.05, 1.15);
        terraceOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), sp.rotationY);
        const worldTableX = sp.x + terraceOffset.x;
        const worldTableZ = sp.z + terraceOffset.z;

        patioSet.group.position.set(worldTableX, 0.05, worldTableZ);
        patioSet.group.rotation.y = sp.rotationY;
        patioSet.group.scale.setScalar(0.95);

        const treeCafeId = `tree-cafe-${sp.id}`;
        patioSet.group.userData = { clickableId: treeCafeId };

        const units = sp.storeNode?.topProductUnits || (18 + (storeIdx % 4) * 8);
        const revenue = sp.storeNode?.topProductRevenue || (units * 45);
        const rate = units > 0 ? Math.round(revenue / units) : 45;

        const treeCafePlacement: CityBuildingPlacement = {
          id: treeCafeId,
          kind: "tree_cafe",
          label: storeTopProduct,
          subLabel: `Top Bestseller · ${sp.label}`,
          x: worldTableX,
          z: worldTableZ,
          rotationY: sp.rotationY,
          routeWaypoints: [],
          styleVariant: 0,
          topProductMeta: {
            name: storeTopProduct,
            storeName: sp.label,
            units,
            revenue,
            marginPct: 58.4,
            wholesaleRate: rate,
            category: "Wholesale Bakery",
          },
        };

        // Add both the patio group AND the single continuous customer directly to worldGroup
        worldGroup.add(patioSet.group);
        worldGroup.add(patioSet.walkingCustomer);

        clickableGroupsRef.current.set(treeCafeId, {
          group: patioSet.group,
          placement: treeCafePlacement,
          targetScale: 0.95,
          currentScale: 0.95,
        });

        // Store entrance door in world coordinates (front porch at local x = -0.82, z = 1.45)
        const doorOffset = new THREE.Vector3(-0.82, 0.08, 1.45);
        doorOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), sp.rotationY);
        const doorWorldPos = new THREE.Vector3(sp.x + doorOffset.x, 0.08, sp.z + doorOffset.z);

        // Patio entry waypoint in front of stepping stones & table (local x = 2.45, z = 1.45)
        const entryOffset = new THREE.Vector3(2.45, 0.08, 1.45);
        entryOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), sp.rotationY);
        const patioEntryWorldPos = new THREE.Vector3(sp.x + entryOffset.x, 0.08, sp.z + entryOffset.z);

        // Diner's chair in world coordinates (local +0.35 * 0.95 from patio center)
        const chairOffset = new THREE.Vector3(0.35 * 0.95, 0.08, 0);
        chairOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), sp.rotationY);
        const chairWorldPos = new THREE.Vector3(worldTableX + chairOffset.x, 0.08, worldTableZ + chairOffset.z);

        cafeCustomerAgentsRef.current.push({
          id: treeCafeId,
          walkingCustomer: patioSet.walkingCustomer,
          handheldUmbrella: patioSet.handheldUmbrella,
          carriedBag: patioSet.carriedBag,
          tableFood: patioSet.tableFood,
          tableCandle: patioSet.tableCandle,
          foodBubble: patioSet.foodBubble,
          baseBubbleY: 2.0,

          chairWorldPos,
          patioEntryWorldPos,
          doorWorldPos,
          storeRotationY: sp.rotationY,

          cycleDuration: 30.0,
          phaseOffset: (storeIdx + 1) * 5.5,
          eatingSpeed: 1.7 + (storeIdx % 3) * 0.35,
        });

        // 7. Urgent / Overdue Pulsing Alert Ring above Roof
        if (health === "urgent") {
          const alertOrb = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.28, 0),
            new THREE.MeshStandardMaterial({
              color: 0xf43f5e,
              emissive: 0xe11d48,
              emissiveIntensity: 1.1,
            })
          );
          alertOrb.name = "urgent-beacon";
          alertOrb.position.set(0, baseH + 1.35, -0.2);
          stGroup.add(alertOrb);
        }

        // Spring Pop-In Construction Animation on New Store Creation
        const alreadySpawned = spawnedIdsRef.current.has(sp.id);
        const startScale =
          alreadySpawned && !sp.storeNode?.isNewlyAdded ? 1 : 0.02;
        spawnedIdsRef.current.add(sp.id);
        stGroup.scale.setScalar(startScale);

        worldGroup.add(stGroup);
        clickableGroupsRef.current.set(sp.id, {
          group: stGroup,
          placement: sp,
          targetScale: 1,
          currentScale: startScale,
        });
      });

      // ======================================================================
      // ANIMATED DELIVERY TRUCKS (2 TRUCKS DELIVERING TO ALTERNATE STORES)
      // Visits recent dispatched stores in alternating sequence (#1, #3 vs #2, etc.)
      // ======================================================================
      const last3Dispatches = recentDispatchesRef.current || [];
      const recentRouteStores: Array<{
        placement: CityBuildingPlacement;
        dispatchRank: number;
        slipNumber: string;
      }> = [];

      if (last3Dispatches.length > 0 && storePlacements.length > 0) {
        last3Dispatches.slice(0, 6).forEach((d, idx) => {
          const matchedPlacement =
            storePlacements.find(
              (sp) =>
                sp.storeNode?.id === d.storeId ||
                sp.storeNode?.name.trim().toLowerCase() ===
                  d.storeName.trim().toLowerCase() ||
                sp.label.trim().toLowerCase() ===
                  d.displayName.trim().toLowerCase()
            ) || storePlacements[idx % storePlacements.length];

          if (matchedPlacement) {
            recentRouteStores.push({
              placement: matchedPlacement,
              dispatchRank: idx + 1,
              slipNumber: d.slipNumber,
            });
          }
        });
      }

      if (recentRouteStores.length === 0) {
        const fallbackList =
          storePlacements.length > 0
            ? storePlacements.slice(0, 4)
            : [hqPlacement];
        fallbackList.forEach((sp, idx) => {
          recentRouteStores.push({
            placement: sp,
            dispatchRank: idx + 1,
            slipNumber: `Recent #${idx + 1}`,
          });
        });
      }

      const vanCount = 2;
      const workerUniformColors = [0x2563eb, 0xd97706];
      const cabColors = [0x1d4ed8, 0xb45309]; // Truck 1: Royal Blue, Truck 2: Amber/Gold

      for (let v = 0; v < vanCount; v++) {
        // Truck 0 starts at store index 0, Truck 1 starts at store index 1 (alternate stores!)
        const initialStoreIdx = v % recentRouteStores.length;
        const targetMeta = recentRouteStores[initialStoreIdx];
        const targetStore = targetMeta.placement;
        // Stagger phases: Truck 0 starts loading at HQ, Truck 1 starts driving out
        const startPhase:
          | "LOADING_AT_HQ"
          | "DRIVING_TO_STORE"
          | "UNLOADING_AT_STORE" = v === 0 ? "LOADING_AT_HQ" : "DRIVING_TO_STORE";

        const vanPlacement: CityBuildingPlacement = {
          id: `van-${v}`,
          kind: "van",
          label: `🚚 Delivery Truck (Dispatch #${targetMeta.dispatchRank})`,
          subLabel: `To ${targetStore.label}`,
          x: v === 0 ? -1.6 : 1.6,
          z: 0.8,
          rotationY: 0,
          routeWaypoints: targetStore.routeWaypoints,
          styleVariant: v,
        };

        // Dedicated 3D Human Worker for this van (loads at HQ & unloads at Store)
        const workerGroup = createDeliveryWorkerMesh(
          workerUniformColors[v % workerUniformColors.length]
        );
        workerGroup.visible = false;
        worldGroup.add(workerGroup);

        const vanGroup = new THREE.Group();
        vanGroup.name = `delivery-van-${v}`;
        vanGroup.position.set(v === 0 ? -1.6 : 1.6, 0.1, 0.8);
        vanGroup.userData = {
          clickableId: vanPlacement.id,
          vanIndex: v,
          vanCount,
          recentRouteStores,
          targetStoreIndex: initialStoreIdx,
          targetStore,
          waypoints: targetStore.routeWaypoints,
          phase: startPhase,
          phaseTimer: 0,
          progress: v === 0 ? 0 : 0.5,
          workerGroup,
        };

        // Dark Chassis Underbody
        const chassis = new THREE.Mesh(
          createRoundedBoxGeo(1.75, 0.16, 0.78, 0.04, 2),
          darkFrameMat
        );
        chassis.position.set(0.1, 0.2, 0);
        vanGroup.add(chassis);

        // Rounded Insulated White Cargo Box with Brand Stripe
        const cargo = new THREE.Mesh(
          createRoundedBoxGeo(1.18, 0.78, 0.82, 0.08, 3),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.3,
            metalness: 0.1,
          })
        );
        cargo.position.set(-0.22, 0.62, 0);
        cargo.castShadow = true;
        vanGroup.add(cargo);

        const brandStripe = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.16, 0.84),
          new THREE.MeshStandardMaterial({
            color: cabColors[v % cabColors.length],
            roughness: 0.35,
          })
        );
        brandStripe.position.set(-0.22, 0.62, 0);
        vanGroup.add(brandStripe);

        // Openable Rear Cargo Doors (swing open during loading at HQ & unloading at Store)
        const doorLeafMat = new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          roughness: 0.35,
          metalness: 0.2,
        });
        const leftRearDoor = new THREE.Group();
        leftRearDoor.name = "left-rear-door";
        leftRearDoor.position.set(-0.82, 0.62, -0.36);
        const leftDoorMesh = new THREE.Mesh(
          createRoundedBoxGeo(0.06, 0.66, 0.36, 0.02, 2),
          doorLeafMat
        );
        leftDoorMesh.position.set(0, 0, 0.18);
        leftRearDoor.add(leftDoorMesh);
        vanGroup.add(leftRearDoor);

        const rightRearDoor = new THREE.Group();
        rightRearDoor.name = "right-rear-door";
        rightRearDoor.position.set(-0.82, 0.62, 0.36);
        const rightDoorMesh = new THREE.Mesh(
          createRoundedBoxGeo(0.06, 0.66, 0.36, 0.02, 2),
          doorLeafMat
        );
        rightDoorMesh.position.set(0, 0, -0.18);
        rightRearDoor.add(rightDoorMesh);
        vanGroup.add(rightRearDoor);

        // Visible Interior Cargo Crates inside back of van
        const interiorCrates = new THREE.Mesh(
          createRoundedBoxGeo(0.32, 0.32, 0.48, 0.03, 2),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65 })
        );
        interiorCrates.name = "interior-crates";
        interiorCrates.position.set(-0.68, 0.48, 0);
        vanGroup.add(interiorCrates);

        // Rounded Aerodynamic Cab + Windshield
        const cab = new THREE.Mesh(
          createRoundedBoxGeo(0.62, 0.62, 0.76, 0.09, 3),
          new THREE.MeshStandardMaterial({
            color: cabColors[v % cabColors.length],
            roughness: 0.3,
            metalness: 0.2,
          })
        );
        cab.position.set(0.64, 0.52, 0);
        cab.castShadow = true;
        vanGroup.add(cab);

        const windshield = new THREE.Mesh(
          createRoundedBoxGeo(0.12, 0.28, 0.64, 0.02, 2),
          windowGlowMat
        );
        windshield.position.set(0.92, 0.62, 0);
        vanGroup.add(windshield);

        // Glowing Headlights & Red Taillights
        const headlightMat = new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xfacc15,
          emissiveIntensity: 1.5,
        });
        const taillightMat = new THREE.MeshStandardMaterial({
          color: 0xf43f5e,
          emissive: 0xe11d48,
          emissiveIntensity: 1.2,
        });
        [-0.26, 0.26].forEach((lz) => {
          const hl = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.1, 0.14),
            headlightMat
          );
          hl.position.set(0.95, 0.38, lz);
          vanGroup.add(hl);

          const tl = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.1, 0.14),
            taillightMat
          );
          tl.position.set(-0.82, 0.38, lz);
          vanGroup.add(tl);
        });

        // 4 Wheels with Silver Hubcaps
        const tireMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.8,
        });
        const hubMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          metalness: 0.7,
          roughness: 0.2,
        });
        [
          [-0.48, 0.2, 0.4],
          [-0.48, 0.2, -0.4],
          [0.58, 0.2, 0.4],
          [0.58, 0.2, -0.4],
        ].forEach(([wx, wy, wz]) => {
          const wheelGrp = new THREE.Group();
          wheelGrp.position.set(wx, wy, wz);
          const tire = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14),
            tireMat
          );
          tire.rotation.x = Math.PI / 2;
          wheelGrp.add(tire);

          const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10),
            hubMat
          );
          hub.rotation.x = Math.PI / 2;
          wheelGrp.add(hub);
          vanGroup.add(wheelGrp);
        });

        worldGroup.add(vanGroup);
        clickableGroupsRef.current.set(vanPlacement.id, {
          group: vanGroup,
          placement: vanPlacement,
          targetScale: 1,
          currentScale: 1,
        });
      }

      // Note: Rather than generic pedestrians traversing across empty streets,
      // all patrons are now situated at storefront cafes and ordering counters,
      // buying, sitting, and savoring the freshly delivered items from HQ.
    },
    []
  );

  // Initialize Three.js WebGL Renderer with ACESFilmicToneMapping & RoomEnvironment
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();

    // 1. Dynamic Season & Day/Night Atmospheric Sky, Fog & Lighting
    const atmos = getAtmosphereConfig(isNightModeRef.current, seasonRef.current);

    scene.background = new THREE.Color(atmos.skyHex);
    scene.fog = new THREE.FogExp2(atmos.skyHex, atmos.fogDensity);
    sceneRef.current = scene;

    // Isometric-style low-FOV camera
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.5, 250);
    camera.position.set(23, 22, 27);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = atmos.exposure;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    renderer.domElement.style.touchAction = "pan-y";

    // Rich Studio / Diorama IBL Reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = atmos.environmentIntensity;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2.18;
    controls.minPolarAngle = Math.PI / 6;
    controls.minDistance = 11;
    controls.maxDistance = 85;
    controls.target.set(0, 0.6, 2.8);
    // Safe scroll by default: zoom is disabled on wheel unless Alt/Ctrl is held
    controls.enableZoom = false;
    // On touch: single-finger swipe scrolls page natively; 2 fingers rotate and zoom 3D diorama
    controls.touches = {
      ONE: undefined as any,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    controlsRef.current = controls;

    // Seasonal Sun / Moonlight & Sky Hemisphere Fill
    const hemiLight = new THREE.HemisphereLight(
      atmos.hemiLightColor,
      atmos.hemiGroundColor,
      atmos.hemiIntensity
    );
    hemiLight.position.set(0, 42, 0);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;
    hemiIntensityBaseRef.current = atmos.hemiIntensity;

    const dirLight = new THREE.DirectionalLight(atmos.dirLightColor, atmos.dirLightIntensity);
    dirLight.position.set(22, 36, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 5;
    dirLight.shadow.camera.far = 110;
    const d = 32;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);
    dirLightRef.current = dirLight;
    dirIntensityBaseRef.current = atmos.dirLightIntensity;

    // Selection Halo Ring on Ground
    const ringGeo = new THREE.RingGeometry(2.25, 2.7, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.position.y = 0.26;
    selectionRing.visible = false;
    scene.add(selectionRing);
    selectionRingRef.current = selectionRing;

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);
    worldGroupRef.current = worldGroup;

    // Diorama Sky Clouds Group
    const cloudsGroup = new THREE.Group();
    cloudsGroup.name = "diorama-sky-clouds";
    scene.add(cloudsGroup);
    cloudsGroupRef.current = cloudsGroup;

    const starField = createStarField(180);
    starField.visible = isNightModeRef.current;
    scene.add(starField);
    starFieldRef.current = starField;

    // Weather Particle Systems (Single Draw-Call Buffer Points: 0ms overhead when hidden)
    const isStorm = seasonRef.current === "thunderstorm" || seasonRef.current === "monsoon";
    const rainPoints = createRainParticles(isStorm ? 1000 : 700);
    rainPoints.visible =
      seasonRef.current === "rain" || seasonRef.current === "monsoon" || seasonRef.current === "thunderstorm";
    scene.add(rainPoints);
    rainPointsRef.current = rainPoints;

    const { points: snowPoints, phases: snowPhases } = createSnowParticles(450);
    snowPoints.visible = seasonRef.current === "snow";
    scene.add(snowPoints);
    snowPointsRef.current = snowPoints;

    const lightningMesh = createLightningMesh();
    scene.add(lightningMesh);
    lightningMeshRef.current = lightningMesh;

    // Build fluffy sky clouds hovering around and behind the city diorama
    cloudsGroup.clear();
    cloudsRef.current = [];
    CLOUD_DEFS.forEach((def) => {
      const cMesh = createFluffyCloudMesh(def.scale, isNightModeRef.current, isStorm);
      cMesh.position.set(def.x, def.y, def.z);
      cloudsGroup.add(cMesh);
      cloudsRef.current.push({
        group: cMesh,
        baseY: def.y,
        speed: def.speed,
        phase: def.phase,
        wrapMinX: def.wrapMinX,
        wrapMaxX: def.wrapMaxX,
      });
    });

    rebuildCityMeshes(worldGroup, layoutRef.current, isNightModeRef.current);

    // Raycaster & Pointer Interaction
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const getHitClickableId = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(worldGroup.children, true);
      for (const hit of intersects) {
        let curr: THREE.Object3D | null = hit.object;
        while (curr && curr !== worldGroup) {
          const cid = curr.userData?.clickableId as string | undefined;
          if (cid) {
            // Cafe patios are only clickable while the customer is seated & eating
            // (food bubble visible); otherwise let the ray pass through.
            const cafeAgent = cafeCustomerAgentsRef.current.find((a) => a.id === cid);
            if (cafeAgent && !cafeAgent.foodBubble.visible) break;
            return cid;
          }
          curr = curr.parent;
        }
      }
      return null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const hitId = getHitClickableId(e.clientX, e.clientY);
      if (hitId !== hoveredIdRef.current) {
        setHoveredId(hitId);
      }
      renderer.domElement.style.cursor = hitId ? "pointer" : "grab";
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (dist > 6) {
        if (e.pointerType === "touch") {
          triggerScrollHintRef.current?.("touch");
        }
        return;
      }

      const hitId = getHitClickableId(e.clientX, e.clientY);
      if (!hitId) {
        onSelectRef.current(null);
        return;
      }

      const entry = clickableGroupsRef.current.get(hitId);
      if (!entry) return;

      if (entry.placement.kind === "add_plot") {
        onAddClientRef.current?.();
        return;
      }

      const worldPos = entry.group.position.clone();
      const isTreeCafe = entry.placement.kind === "tree_cafe";
      cameraFlyTargetRef.current = {
        lookAt: new THREE.Vector3(worldPos.x, isTreeCafe ? 0.6 : 1.2, worldPos.z),
        pos: new THREE.Vector3(
          worldPos.x + (isTreeCafe ? 9 : 13),
          isTreeCafe ? 10 : 14,
          worldPos.z + (isTreeCafe ? 11 : 15)
        ),
      };

      onSelectRef.current({
        id: hitId,
        kind: entry.placement.kind,
        placement: entry.placement,
      });
    };

    const handleWheelCapture = (e: WheelEvent) => {
      const isModifierActive = e.altKey || e.ctrlKey || e.metaKey;
      if (isModifierActive) {
        controls.enableZoom = true;
      } else {
        controls.enableZoom = false;
        triggerScrollHintRef.current?.("desktop");
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener("pointermove", handlePointerMove);
    domElem.addEventListener("pointerdown", handlePointerDown);
    domElem.addEventListener("pointerup", handlePointerUp);
    domElem.addEventListener("wheel", handleWheelCapture, { capture: true, passive: true });

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop (only runs continuously when isSimulating is true AND in viewport)
    let frameId = 0;
    let isLoopRunning = false;
    let lastLabelSync = -1;
    let accumulatedElapsed = 0;
    const clock = new THREE.Clock();

    const cachedProjVec = new THREE.Vector3();

    const syncFloatingLabels = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      const cWidth = rect.width || container.clientWidth || 900;
      const cHeight = rect.height || container.clientHeight || 560;
      const nextLabels: FloatingLabelItem[] = [];

      clickableGroupsRef.current.forEach((entry, id) => {
        const { group, placement } = entry;
        // Skip floating 2D HTML building badge for tree cafe so park trees and lawn remain clean & uncluttered
        if (placement.kind === "tree_cafe") {
          return;
        }

        const topY =
          placement.kind === "hq"
            ? 6.1
            : placement.kind === "finance"
            ? 5.8
            : placement.kind === "van"
            ? 1.75
            : 3.6;
        cachedProjVec.set(group.position.x, topY, group.position.z);
        cachedProjVec.project(camera);

        const sx = (cachedProjVec.x * 0.5 + 0.5) * cWidth;
        const sy = (-(cachedProjVec.y * 0.5) + 0.5) * cHeight;
        const isVisible =
          cachedProjVec.z < 1 &&
          sx > 15 &&
          sx < cWidth - 15 &&
          sy > 15 &&
          sy < cHeight - 15;

        nextLabels.push({
          id,
          kind: placement.kind,
          label: placement.label,
          subLabel: placement.subLabel,
          topProduct: placement.storeNode?.topProduct,
          healthStatus: placement.storeNode?.healthStatus,
          x: sx,
          y: sy,
          visible: isVisible,
        });
      });

      setLabels(nextLabels);
    };

    const animate = () => {
      if (!isSimulatingRef.current) {
        isLoopRunning = false;
        frameId = 0;
        return;
      }
      frameId = requestAnimationFrame(animate);
      isLoopRunning = true;
      const rawDelta = clock.getDelta();
      const delta = Math.min(rawDelta, 0.05);
      accumulatedElapsed += delta;
      const elapsed = accumulatedElapsed;

      if (cameraFlyTargetRef.current) {
        camera.position.lerp(cameraFlyTargetRef.current.pos, 0.07);
        controls.target.lerp(cameraFlyTargetRef.current.lookAt, 0.09);
        if (camera.position.distanceTo(cameraFlyTargetRef.current.pos) < 0.35) {
          cameraFlyTargetRef.current = null;
        }
      }

      controls.update();

      const activeSelId = selectedIdRef.current;
      const activeHovId = hoveredIdRef.current;

      clickableGroupsRef.current.forEach((entry, id) => {
        const { group, placement } = entry;

        const isHovered = id === activeHovId;
        const desiredScale = isHovered ? 1.05 : entry.targetScale;
        entry.currentScale += (desiredScale - entry.currentScale) * 0.14;
        group.scale.setScalar(entry.currentScale);

        const emblem = group.getObjectByName("rotating-emblem");
        if (emblem) {
          emblem.rotation.y = elapsed * 1.4;
          emblem.position.y += Math.sin(elapsed * 2.5) * 0.002;
        }

        const urgentOrb = group.getObjectByName("urgent-beacon");
        if (urgentOrb) {
          const s = 1 + Math.sin(elapsed * 5) * 0.22;
          urgentOrb.scale.setScalar(s);
          urgentOrb.rotation.y = elapsed * 2.2;
        }

        const steam = group.getObjectByName("hq-steam");
        if (steam) {
          steam.children.forEach((puff, idx) => {
            const cycle = (elapsed * 0.7 + idx * 0.25) % 1;
            puff.position.y = cycle * 1.8;
            puff.position.x = Math.sin(elapsed * 2 + idx) * 0.12;
            puff.scale.setScalar(0.55 + Math.sin(cycle * Math.PI) * 0.7);
          });
        }

        const conveyor = group.getObjectByName("wh-conveyor");
        if (conveyor) {
          conveyor.children.forEach((crate, idx) => {
            const cPos = ((elapsed * 0.5 + idx * 0.33) % 1) * 2.3 - 1.15;
            crate.position.x = cPos;
          });
        }

        if (placement.kind === "van") {
          const ud = group.userData;
          const wps: Array<{ x: number; z: number }> = ud.waypoints || [];
          const workerGrp: THREE.Group | undefined = ud.workerGroup;
          const leftDoor = group.getObjectByName("left-rear-door");
          const rightDoor = group.getObjectByName("right-rear-door");
          const dt = delta || 0.016;
          const driveSpeed = 0.42 + (ud.vanIndex || 0) * 0.04;

          // Helper to animate the 3D human worker walking between two points with a crate
          const animateWorkerTrip = (
            fromX: number,
            fromZ: number,
            toX: number,
            toZ: number,
            normTime: number,
            carryingOnOutbound: boolean
          ) => {
            if (!workerGrp) return;
            workerGrp.visible = true;
            // Two full round-trips during the stop
            const tripCycle = (normTime * 2) % 1;
            const isOutbound = tripCycle < 0.5;
            const legT = isOutbound ? tripCycle * 2 : (tripCycle - 0.5) * 2;

            const sx = isOutbound ? fromX : toX;
            const sz = isOutbound ? fromZ : toZ;
            const ex = isOutbound ? toX : fromX;
            const ez = isOutbound ? toZ : fromZ;

            const wx = sx + (ex - sx) * legT;
            const wz = sz + (ez - sz) * legT;
            const hop = Math.abs(Math.sin(elapsed * 14)) * 0.05;
            workerGrp.position.set(wx, 0.1 + hop, wz);

            const angle = Math.atan2(ex - sx, ez - sz);
            workerGrp.rotation.y = angle;

            // Swing legs while walking
            const lLeg = workerGrp.getObjectByName("left-leg");
            const rLeg = workerGrp.getObjectByName("right-leg");
            if (lLeg && rLeg) {
              lLeg.rotation.x = Math.sin(elapsed * 14) * 0.55;
              rLeg.rotation.x = -Math.sin(elapsed * 14) * 0.55;
            }

            // Show crate in hands when carrying (outbound), hide when walking back empty-handed
            const crate = workerGrp.getObjectByName("carried-crate");
            const lArm = workerGrp.getObjectByName("left-arm");
            const rArm = workerGrp.getObjectByName("right-arm");
            const hasBox = carryingOnOutbound ? isOutbound : !isOutbound;
            if (crate) crate.visible = hasBox;
            if (lArm && rArm) {
              lArm.rotation.x = hasBox ? Math.PI / 2.5 : Math.sin(elapsed * 14) * 0.35;
              rArm.rotation.x = hasBox ? Math.PI / 2.5 : -Math.sin(elapsed * 14) * 0.35;
            }
          };

          const routeMetaList: Array<{
            placement: CityBuildingPlacement;
            dispatchRank: number;
            slipNumber: string;
          }> = ud.recentRouteStores || [];
          const curMeta = routeMetaList[ud.targetStoreIndex] || {
            dispatchRank: (ud.targetStoreIndex || 0) + 1,
            slipNumber: "",
          };

          if (ud.phase === "LOADING_AT_HQ") {
            ud.phaseTimer += dt;
            const loadDuration = 3.6;
            // Dedicated off-road HQ Loading Bays (Bay 1 at x = -1.8, Bay 2 at x = 1.8) north of the 2-lane HQ road
            const hqStopX = ud.vanIndex === 0 ? -1.8 : 1.8;
            const hqStopZ = -1.35;

            group.position.set(hqStopX, 0.1, hqStopZ);
            group.rotation.y = ud.targetStore?.x < 0 ? Math.PI : 0;
            placement.x = hqStopX;
            placement.z = hqStopZ;
            placement.label = `📦 Delivery Truck: Loading (#${curMeta.dispatchRank})`;
            placement.subLabel = `Next: ${ud.targetStore?.label || "Store"}`;

            // Open rear cargo doors
            if (leftDoor && rightDoor) {
              leftDoor.rotation.y = THREE.MathUtils.lerp(leftDoor.rotation.y, 1.9, 0.15);
              rightDoor.rotation.y = THREE.MathUtils.lerp(rightDoor.rotation.y, -1.9, 0.15);
            }

            // Human worker walks from HQ front entrance (hqStopX, -3.7) -> Rear of Van (hqStopX, -1.9) carrying crate!
            animateWorkerTrip(
              hqStopX,
              -3.7,
              hqStopX,
              -1.9,
              Math.min(1, ud.phaseTimer / loadDuration),
              true
            );

            if (ud.phaseTimer >= loadDuration) {
              ud.phase = "DRIVING_TO_STORE";
              ud.phaseTimer = 0;
              ud.progress = 0;
              if (workerGrp) workerGrp.visible = false;
              return;
            }
          } else if (ud.phase === "DRIVING_TO_STORE") {
            if (workerGrp) workerGrp.visible = false;
            if (leftDoor && rightDoor) {
              leftDoor.rotation.y = THREE.MathUtils.lerp(leftDoor.rotation.y, 0, 0.2);
              rightDoor.rotation.y = THREE.MathUtils.lerp(rightDoor.rotation.y, 0, 0.2);
            }

            if (wps.length >= 2) {
              // Proximity collision check against the other truck in the same lane
              let isBlockedAhead = false;
              const myFwdX = Math.cos(-group.rotation.y);
              const myFwdZ = Math.sin(-group.rotation.y);
              clickableGroupsRef.current.forEach((otherEntry, otherId) => {
                if (otherId === id || otherEntry.placement.kind !== "van") return;
                const otherUd = otherEntry.group.userData;
                // Only consider collision if the other van is driving in the SAME phase (same outbound lane)
                if (otherUd.phase !== "DRIVING_TO_STORE") return;
                // Only trailing truck stops; leading truck continues freely (prevents deadlock)
                if (ud.progress >= otherUd.progress) return;

                const ox = otherEntry.group.position.x - group.position.x;
                const oz = otherEntry.group.position.z - group.position.z;
                const dist = Math.hypot(ox, oz);
                if (dist > 0.01 && dist < 2.8) {
                  const dot = (ox * myFwdX + oz * myFwdZ) / dist;
                  if (dot > 0.65) isBlockedAhead = true;
                }
              });

              if (!isBlockedAhead) {
                const curSegIdx = Math.min(wps.length - 2, Math.floor(ud.progress));
                const curSegLen =
                  Math.hypot(
                    wps[curSegIdx + 1].x - wps[curSegIdx].x,
                    wps[curSegIdx + 1].z - wps[curSegIdx].z
                  ) || 1;
                const worldSpeed = 7.4 + (ud.vanIndex || 0) * 0.4;
                ud.progress += (worldSpeed * dt) / curSegLen;
              }

              if (ud.progress >= wps.length - 1) {
                ud.progress = wps.length - 1;
                ud.phase = "UNLOADING_AT_STORE";
                ud.phaseTimer = 0;
                return;
              }

              const segIdx = Math.min(wps.length - 2, Math.floor(ud.progress));
              const segT = ud.progress - segIdx;
              const pA = wps[segIdx];
              const pB = wps[segIdx + 1];

              const dx = pB.x - pA.x;
              const dz = pB.z - pA.z;
              const segLen = Math.hypot(dx, dz) || 1;
              const ux = dx / segLen;
              const uz = dz / segLen;

              // Outbound Lane Offset (+0.68 perpendicular to travel direction)
              const laneOffset = 0.68;
              const offX = -uz * laneOffset;
              const offZ = ux * laneOffset;

              const nx = pA.x + dx * segT + offX;
              const nz = pA.z + dz * segT + offZ;
              if (segLen > 0.001) {
                group.rotation.y = Math.atan2(-dz, dx);
              }
              group.position.set(nx, 0.1, nz);
              placement.x = nx;
              placement.z = nz;
              placement.label = `🚚 Delivery Truck (Dispatch #${curMeta.dispatchRank})`;
              placement.subLabel = `To ${ud.targetStore?.label || "Store"}`;
            }
          } else if (ud.phase === "UNLOADING_AT_STORE") {
            ud.phaseTimer += dt;
            const unloadDuration = 4.0;
            const stopPt = wps[wps.length - 1] || { x: 0, z: 0.8 };
            const storeX = ud.targetStore?.x ?? stopPt.x;
            const storeZ = ud.targetStore?.z ?? stopPt.z - 4.6;

            // Pull into the North Curbside Delivery Lane (stopPt.z - 0.72) right next to the store sidewalk!
            const parkedX = stopPt.x;
            const parkedZ = stopPt.z - 0.72;
            group.position.set(parkedX, 0.1, parkedZ);
            placement.x = parkedX;
            placement.z = parkedZ;
            placement.label = `🚚 Delivery in Progress`;
            placement.subLabel = ud.targetStore?.label || "Partner Store";

            // Open rear cargo doors at the store
            if (leftDoor && rightDoor) {
              leftDoor.rotation.y = THREE.MathUtils.lerp(leftDoor.rotation.y, 1.9, 0.15);
              rightDoor.rotation.y = THREE.MathUtils.lerp(rightDoor.rotation.y, -1.9, 0.15);
            }

            // Human worker walks from Rear of Van -> Store Front Door carrying crate!
            animateWorkerTrip(
              parkedX,
              parkedZ - 0.55,
              storeX - 0.55,
              storeZ + 1.45,
              Math.min(1, ud.phaseTimer / unloadDuration),
              true
            );

            if (ud.phaseTimer >= unloadDuration) {
              ud.phase = "RETURNING_TO_HQ";
              ud.phaseTimer = 0;
              ud.progress = Math.max(0, wps.length - 1);
              if (workerGrp) workerGrp.visible = false;
              return;
            }
          } else if (ud.phase === "RETURNING_TO_HQ") {
            if (workerGrp) workerGrp.visible = false;
            if (leftDoor && rightDoor) {
              leftDoor.rotation.y = THREE.MathUtils.lerp(leftDoor.rotation.y, 0, 0.2);
              rightDoor.rotation.y = THREE.MathUtils.lerp(rightDoor.rotation.y, 0, 0.2);
            }

            if (wps.length >= 2) {
              // Proximity collision check in return lane
              let isBlockedAhead = false;
              const myFwdX = Math.cos(-group.rotation.y);
              const myFwdZ = Math.sin(-group.rotation.y);
              clickableGroupsRef.current.forEach((otherEntry, otherId) => {
                if (otherId === id || otherEntry.placement.kind !== "van") return;
                const otherUd = otherEntry.group.userData;
                // Only consider collision if the other van is driving in the SAME phase (same return lane)
                if (otherUd.phase !== "RETURNING_TO_HQ") return;
                // In return lane, progress counts down towards 0 (HQ).
                // Van with lower progress is closer to HQ (leading).
                // Van with higher progress is trailing. Only trailing van yields/waits!
                if (ud.progress <= otherUd.progress) return;

                const ox = otherEntry.group.position.x - group.position.x;
                const oz = otherEntry.group.position.z - group.position.z;
                const dist = Math.hypot(ox, oz);
                if (dist > 0.01 && dist < 2.8) {
                  const dot = (ox * myFwdX + oz * myFwdZ) / dist;
                  if (dot > 0.65) isBlockedAhead = true;
                }
              });

              if (!isBlockedAhead) {
                const curSegIdx = Math.min(
                  wps.length - 2,
                  Math.max(0, Math.floor(ud.progress - 0.0001))
                );
                const curSegLen =
                  Math.hypot(
                    wps[curSegIdx + 1].x - wps[curSegIdx].x,
                    wps[curSegIdx + 1].z - wps[curSegIdx].z
                  ) || 1;
                const worldSpeed = 7.8 + (ud.vanIndex || 0) * 0.4;
                ud.progress -= (worldSpeed * dt) / curSegLen;
              }

              if (ud.progress <= 0) {
                ud.progress = 0;
                ud.phase = "LOADING_AT_HQ";
                ud.phaseTimer = 0;

                // Alternate stores: advance by step of 2 so Truck 1 visits odd stores and Truck 2 visits even stores!
                const rStores: Array<{
                  placement: CityBuildingPlacement;
                  dispatchRank: number;
                  slipNumber: string;
                }> = ud.recentRouteStores || [];
                const step = rStores.length > 1 ? 2 : 1;
                const nextIdx = (ud.targetStoreIndex + step) % Math.max(1, rStores.length);

                ud.targetStoreIndex = nextIdx;
                const nextMeta = rStores[nextIdx];
                if (nextMeta?.placement) {
                  ud.targetStore = nextMeta.placement;
                  ud.waypoints = nextMeta.placement.routeWaypoints;
                  placement.routeWaypoints = nextMeta.placement.routeWaypoints;
                }
                return;
              }

              const segIdx = Math.min(wps.length - 2, Math.floor(ud.progress));
              const segT = ud.progress - segIdx;
              const pA = wps[segIdx];
              const pB = wps[segIdx + 1];

              // Travel direction on return is pB -> pA
              const dx = pA.x - pB.x;
              const dz = pA.z - pB.z;
              const segLen = Math.hypot(dx, dz) || 1;
              const ux = dx / segLen;
              const uz = dz / segLen;

              // Return Lane Offset (+0.68 perpendicular to return vector = opposite side of the 2-lane road!)
              const laneOffset = 0.68;
              const offX = -uz * laneOffset;
              const offZ = ux * laneOffset;

              const nx = pA.x + (pB.x - pA.x) * segT + offX;
              const nz = pA.z + (pB.z - pA.z) * segT + offZ;
              if (segLen > 0.001) {
                group.rotation.y = Math.atan2(-dz, dx);
              }
              group.position.set(nx, 0.1, nz);
              placement.x = nx;
              placement.z = nz;
              placement.label = `↩ Delivery Truck: Returning`;
              placement.subLabel = `Done: ${ud.targetStore?.label || "Store"}`;
            }
          }
        }
      });

      // Dynamic Customer Agents: Walking to shop, buying, walking to terrace, and dining under parasol
      const currentSeason = seasonRef.current;
      const isNight = isNightModeRef.current;
      const isPrecipitation =
        currentSeason === "rain" ||
        currentSeason === "monsoon" ||
        currentSeason === "thunderstorm" ||
        currentSeason === "snow";

      cafeCustomerAgentsRef.current.forEach((agent) => {
        const cycleTime = agent.cycleDuration || 30.0;
        const localTime = (elapsed + agent.phaseOffset) % cycleTime;

        if (agent.tableCandle) {
          (agent.tableCandle.material as THREE.MeshStandardMaterial).emissiveIntensity =
            isNight ? 0.95 : 0.15;
        }

        // Single continuous character is ALWAYS visible — zero mesh swapping or disappearing!
        agent.walkingCustomer.visible = true;

        const lLeg = agent.walkingCustomer.getObjectByName("left-leg");
        const rLeg = agent.walkingCustomer.getObjectByName("right-leg");
        const lKnee = agent.walkingCustomer.getObjectByName("left-knee");
        const rKnee = agent.walkingCustomer.getObjectByName("right-knee");
        const lArm = agent.walkingCustomer.getObjectByName("left-arm");
        const rArm = agent.walkingCustomer.getObjectByName("right-arm");
        const headGrp = agent.walkingCustomer.getObjectByName("head-group");
        const heldBite = agent.walkingCustomer.getObjectByName("held-bite");

        const seatedFacingAngle = agent.storeRotationY - Math.PI / 2;

        if (localTime < 1.2) {
          // =================================================================
          // STAGE 1 (0.0s - 1.2s): SMOOTHLY STAND UP FROM CHAIR & STEP TO PATH
          // =================================================================
          const t = localTime / 1.2;
          const sitFactor = 1 - t; // 1 = seated, 0 = standing
          agent.tableFood.visible = false;
          agent.foodBubble.visible = false;
          agent.carriedBag.visible = false;
          agent.handheldUmbrella.visible = false;
          if (heldBite) heldBite.visible = false;

          const wx = THREE.MathUtils.lerp(agent.chairWorldPos.x, agent.patioEntryWorldPos.x, t);
          const wz = THREE.MathUtils.lerp(agent.chairWorldPos.z, agent.patioEntryWorldPos.z, t);
          const wy = THREE.MathUtils.lerp(0.16, 0.32, t);
          agent.walkingCustomer.position.set(wx, wy, wz);

          const walkOutAngle = Math.atan2(
            agent.patioEntryWorldPos.x - agent.chairWorldPos.x,
            agent.patioEntryWorldPos.z - agent.chairWorldPos.z
          );
          agent.walkingCustomer.rotation.y = THREE.MathUtils.lerp(
            seatedFacingAngle,
            walkOutAngle,
            t
          );

          if (lLeg && rLeg) {
            lLeg.rotation.x = (-Math.PI / 2) * sitFactor;
            rLeg.rotation.x = (-Math.PI / 2) * sitFactor;
          }
          if (lKnee && rKnee) {
            lKnee.rotation.x = (Math.PI / 2) * sitFactor;
            rKnee.rotation.x = (Math.PI / 2) * sitFactor;
          }
          if (lArm && rArm) {
            lArm.rotation.set(-0.25 * sitFactor, 0, 0);
            rArm.rotation.set(-0.25 * sitFactor, 0, 0);
          }
          if (headGrp) headGrp.rotation.x = 0;
        } else if (localTime < 6.5) {
          // =================================================================
          // STAGE 2 (1.2s - 6.5s): WALK ACROSS STEPPING STONES TO STORE DOOR
          // =================================================================
          const t = (localTime - 1.2) / 5.3;
          agent.tableFood.visible = false;
          agent.foodBubble.visible = false;
          agent.carriedBag.visible = false;
          agent.handheldUmbrella.visible = isPrecipitation;
          if (heldBite) heldBite.visible = false;

          const wx = THREE.MathUtils.lerp(agent.patioEntryWorldPos.x, agent.doorWorldPos.x, t);
          const wz = THREE.MathUtils.lerp(agent.patioEntryWorldPos.z, agent.doorWorldPos.z, t);
          const hop = Math.abs(Math.sin(elapsed * 11)) * 0.035;
          agent.walkingCustomer.position.set(wx, 0.32 + hop, wz);

          const angle = Math.atan2(
            agent.doorWorldPos.x - agent.patioEntryWorldPos.x,
            agent.doorWorldPos.z - agent.patioEntryWorldPos.z
          );
          agent.walkingCustomer.rotation.y = angle;

          if (lLeg && rLeg) {
            lLeg.rotation.x = Math.sin(elapsed * 11) * 0.52;
            rLeg.rotation.x = -Math.sin(elapsed * 11) * 0.52;
          }
          if (lKnee && rKnee) {
            lKnee.rotation.x = Math.max(0, -Math.sin(elapsed * 11) * 0.35);
            rKnee.rotation.x = Math.max(0, Math.sin(elapsed * 11) * 0.35);
          }
          if (lArm && rArm) {
            if (isPrecipitation) {
              rArm.rotation.set(-Math.PI / 2.5, 0, 0);
              lArm.rotation.set(Math.sin(elapsed * 11) * 0.35, 0, 0);
            } else {
              lArm.rotation.set(Math.sin(elapsed * 11) * 0.35, 0, 0);
              rArm.rotation.set(-Math.sin(elapsed * 11) * 0.35, 0, 0);
            }
          }
          if (headGrp) headGrp.rotation.x = 0;
        } else if (localTime < 10.5) {
          // =================================================================
          // STAGE 3 (6.5s - 10.5s): ORDER & BUY AT BAKERY STORE ENTRANCE
          // =================================================================
          const t = (localTime - 6.5) / 4.0;
          agent.tableFood.visible = false;
          agent.foodBubble.visible = false;
          agent.handheldUmbrella.visible = isPrecipitation;
          if (heldBite) heldBite.visible = false;

          agent.walkingCustomer.position.set(agent.doorWorldPos.x, 0.32, agent.doorWorldPos.z);
          // Face into the store entrance (-Z local to store = Math.PI + storeRotationY)
          agent.walkingCustomer.rotation.y = agent.storeRotationY + Math.PI;

          if (lLeg && rLeg) {
            lLeg.rotation.x = 0;
            rLeg.rotation.x = 0;
          }
          if (lKnee && rKnee) {
            lKnee.rotation.x = 0;
            rKnee.rotation.x = 0;
          }

          agent.carriedBag.visible = t > 0.38;

          if (lArm && rArm) {
            if (isPrecipitation) {
              rArm.rotation.set(-Math.PI / 2.5, 0, 0);
              lArm.rotation.set(agent.carriedBag.visible ? -Math.PI / 3 : -0.25, 0, 0);
            } else {
              lArm.rotation.set(agent.carriedBag.visible ? -Math.PI / 3.5 : -0.2, 0, 0);
              rArm.rotation.set(agent.carriedBag.visible ? -Math.PI / 3.2 : -0.35, 0, 0);
            }
          }
          if (headGrp) {
            headGrp.rotation.x = Math.sin(localTime * 5) * 0.07;
          }
        } else if (localTime < 15.8) {
          // =================================================================
          // STAGE 4 (10.5s - 15.8s): WALK FROM STORE DOOR BACK TO PATIO ENTRY
          // =================================================================
          const t = (localTime - 10.5) / 5.3;
          agent.tableFood.visible = false;
          agent.foodBubble.visible = false;
          agent.carriedBag.visible = true;
          agent.handheldUmbrella.visible = isPrecipitation;
          if (heldBite) heldBite.visible = false;

          const wx = THREE.MathUtils.lerp(agent.doorWorldPos.x, agent.patioEntryWorldPos.x, t);
          const wz = THREE.MathUtils.lerp(agent.doorWorldPos.z, agent.patioEntryWorldPos.z, t);
          const hop = Math.abs(Math.sin(elapsed * 11)) * 0.035;
          agent.walkingCustomer.position.set(wx, 0.32 + hop, wz);

          const angle = Math.atan2(
            agent.patioEntryWorldPos.x - agent.doorWorldPos.x,
            agent.patioEntryWorldPos.z - agent.doorWorldPos.z
          );
          agent.walkingCustomer.rotation.y = angle;

          if (lLeg && rLeg) {
            lLeg.rotation.x = Math.sin(elapsed * 11) * 0.52;
            rLeg.rotation.x = -Math.sin(elapsed * 11) * 0.52;
          }
          if (lKnee && rKnee) {
            lKnee.rotation.x = Math.max(0, -Math.sin(elapsed * 11) * 0.35);
            rKnee.rotation.x = Math.max(0, Math.sin(elapsed * 11) * 0.35);
          }
          if (lArm && rArm) {
            if (isPrecipitation) {
              rArm.rotation.set(-Math.PI / 2.5, 0, 0);
              lArm.rotation.set(-Math.PI / 3, 0, 0);
            } else {
              lArm.rotation.set(Math.sin(elapsed * 11) * 0.32, 0, 0);
              rArm.rotation.set(-Math.PI / 3.2, 0, 0);
            }
          }
          if (headGrp) headGrp.rotation.x = 0;
        } else if (localTime < 17.0) {
          // =================================================================
          // STAGE 5 (15.8s - 17.0s): STEP TO CHAIR & SMOOTHLY SIT DOWN
          // =================================================================
          const t = (localTime - 15.8) / 1.2;
          const sitFactor = t; // 0 = standing, 1 = seated
          agent.tableFood.visible = t > 0.55;
          agent.foodBubble.visible = t > 0.7;
          agent.carriedBag.visible = t <= 0.55;
          agent.handheldUmbrella.visible = false;
          if (heldBite) heldBite.visible = false;

          const wx = THREE.MathUtils.lerp(agent.patioEntryWorldPos.x, agent.chairWorldPos.x, t);
          const wz = THREE.MathUtils.lerp(agent.patioEntryWorldPos.z, agent.chairWorldPos.z, t);
          const wy = THREE.MathUtils.lerp(0.32, 0.16, t);
          agent.walkingCustomer.position.set(wx, wy, wz);

          const approachAngle = Math.atan2(
            agent.chairWorldPos.x - agent.patioEntryWorldPos.x,
            agent.chairWorldPos.z - agent.patioEntryWorldPos.z
          );
          agent.walkingCustomer.rotation.y = THREE.MathUtils.lerp(
            approachAngle,
            seatedFacingAngle,
            t
          );

          if (lLeg && rLeg) {
            lLeg.rotation.x = (-Math.PI / 2) * sitFactor;
            rLeg.rotation.x = (-Math.PI / 2) * sitFactor;
          }
          if (lKnee && rKnee) {
            lKnee.rotation.x = (Math.PI / 2) * sitFactor;
            rKnee.rotation.x = (Math.PI / 2) * sitFactor;
          }
          if (lArm && rArm) {
            lArm.rotation.set(-0.35 * sitFactor, 0, 0);
            rArm.rotation.set(-0.35 * sitFactor, 0, 0);
          }
          if (headGrp) headGrp.rotation.x = 0;
        } else {
          // =================================================================
          // STAGE 6 (17.0s - 30.0s): SEATED DINING AT TABLE UNDER PARASOL
          // =================================================================
          agent.tableFood.visible = true;
          agent.foodBubble.visible = true;
          agent.carriedBag.visible = false;
          agent.handheldUmbrella.visible = false;
          if (heldBite) heldBite.visible = true;

          agent.walkingCustomer.position.set(
            agent.chairWorldPos.x,
            0.16,
            agent.chairWorldPos.z
          );
          agent.walkingCustomer.rotation.y = seatedFacingAngle;

          if (lLeg && rLeg) {
            lLeg.rotation.x = -Math.PI / 2;
            rLeg.rotation.x = -Math.PI / 2;
          }
          if (lKnee && rKnee) {
            lKnee.rotation.x = Math.PI / 2;
            rKnee.rotation.x = Math.PI / 2;
          }

          const eatCycle = Math.sin((localTime - 17.0) * agent.eatingSpeed);
          const lift = Math.max(0, eatCycle);

          if (lArm) {
            lArm.rotation.set(-0.42, 0, 0.08);
          }
          if (rArm) {
            rArm.rotation.x = THREE.MathUtils.lerp(-0.48, -1.22, lift);
            rArm.rotation.z = THREE.MathUtils.lerp(-0.05, -0.22, lift);
          }
          if (headGrp) {
            headGrp.rotation.x =
              Math.sin((localTime - 17.0) * agent.eatingSpeed * 2) * 0.065;
          }
          if (agent.foodBubble) {
            agent.foodBubble.position.y =
              agent.baseBubbleY + Math.sin(elapsed * 2.2) * 0.04;
          }
        }
      });

      // Drift & bob fluffy clouds across the diorama sky
      cloudsRef.current.forEach((c) => {
        c.group.position.x += c.speed * delta;
        c.group.position.y = c.baseY + Math.sin(elapsed * 0.45 + c.phase) * 0.32;
        if (c.group.position.x > c.wrapMaxX) {
          c.group.position.x = c.wrapMinX;
        }
      });

      // Animate falling rain streaks (single draw-call LineSegments)
      if (rainPoints.visible) {
        const speed =
          season === "thunderstorm" ? 44.0 : season === "monsoon" ? 36.0 : 26.0;
        const positions = rainPoints.geometry.attributes.position
          .array as Float32Array;
        const fallDist = speed * delta;
        const windX = 4.2 * delta;
        const windZ = 1.8 * delta;

        for (let i = 0; i < positions.length; i += 6) {
          // Top vertex
          positions[i] -= windX;
          positions[i + 1] -= fallDist;
          positions[i + 2] -= windZ;

          // Bottom vertex
          positions[i + 3] -= windX;
          positions[i + 4] -= fallDist;
          positions[i + 5] -= windZ;

          // When bottom hits ground level, re-spawn above
          if (positions[i + 4] < 0.05) {
            const rx = (Math.random() - 0.5) * 60;
            const ry = 28 + Math.random() * 6;
            const rz = (Math.random() - 0.5) * 55;
            const streakLen = 0.85 + Math.random() * 0.45;

            positions[i] = rx;
            positions[i + 1] = ry;
            positions[i + 2] = rz;

            positions[i + 3] = rx - 0.18;
            positions[i + 4] = ry - streakLen;
            positions[i + 5] = rz - 0.08;
          }
        }
        rainPoints.geometry.attributes.position.needsUpdate = true;
      }

      // Animate fluttering winter snowflakes (single draw-call buffer points)
      if (snowPoints.visible) {
        const positions = snowPoints.geometry.attributes.position
          .array as Float32Array;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] -= 3.8 * delta;
          const pIdx = i / 3;
          positions[i] +=
            Math.sin(elapsed * 1.8 + snowPhases[pIdx]) * 0.45 * delta;
          if (positions[i + 1] < 0.08) {
            positions[i + 1] = 27 + Math.random() * 5;
          }
        }
        snowPoints.geometry.attributes.position.needsUpdate = true;
      }

      // Thunderstorm Lightning Strike Sequencer
      if (seasonRef.current === "thunderstorm") {
        lightningTimerRef.current += delta;
        if (lightningTimerRef.current >= nextStrikeTimeRef.current) {
          lightningTimerRef.current = 0;
          nextStrikeTimeRef.current = 7 + Math.random() * 6;
          lightningFlashStateRef.current = { active: true, time: 0 };
        }

        if (lightningFlashStateRef.current.active) {
          lightningFlashStateRef.current.time += delta;
          const t = lightningFlashStateRef.current.time;
          let flashPower = 0;
          if (t < 0.07) {
            // First lightning strike
            flashPower = Math.sin((t / 0.07) * Math.PI) * 2.8;
            lightningMesh.visible = true;
          } else if (t < 0.12) {
            // Brief gap between flashes
            flashPower = 0.2;
            lightningMesh.visible = false;
          } else if (t < 0.24) {
            // Second brighter strike
            flashPower = Math.sin(((t - 0.12) / 0.12) * Math.PI) * 3.5;
            lightningMesh.visible = true;
          } else {
            lightningFlashStateRef.current.active = false;
            lightningMesh.visible = false;
          }
          if (hemiLightRef.current) {
            hemiLightRef.current.intensity = hemiIntensityBaseRef.current + flashPower;
          }
          if (dirLightRef.current) {
            dirLightRef.current.intensity = dirIntensityBaseRef.current + flashPower * 1.3;
          }
        }
      }

      // Starfield twinkle at night
      if (isNightModeRef.current && starFieldRef.current) {
        (starFieldRef.current.material as THREE.PointsMaterial).opacity =
          0.72 + Math.sin(elapsed * 2.8) * 0.22;
      }

      if (selectionRingRef.current) {
        if (activeSelId && clickableGroupsRef.current.has(activeSelId)) {
          const selEntry = clickableGroupsRef.current.get(activeSelId)!;
          selectionRingRef.current.visible = true;
          selectionRingRef.current.position.x = selEntry.group.position.x;
          selectionRingRef.current.position.z = selEntry.group.position.z;
          const pulse = 1 + Math.sin(elapsed * 4) * 0.08;
          const ringScale = selEntry.placement.kind === "tree_cafe" ? pulse * 0.42 : pulse;
          selectionRingRef.current.scale.setScalar(ringScale);
        } else {
          selectionRingRef.current.visible = false;
        }
      }

      renderer.render(scene, camera);

      // Smooth floating label synchronization locked onto moving trucks and buildings
      if (elapsed - lastLabelSync >= 0.033) {
        lastLabelSync = elapsed;
        syncFloatingLabels();
      }
    };

    wakeLoopRef.current = () => {
      clock.getDelta(); // Discard elapsed paused time to prevent physics jump
      lastLabelSync = -1;
      syncFloatingLabels(); // Snap labels immediately to exact 3D positions on resume
      if (!isLoopRunning) {
        animate();
      }
    };

    pauseLoopRef.current = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      isLoopRunning = false;
    };

    // When camera is rotated or zoomed by user while paused, keep scene and labels rendered in lockstep
    const handleControlsChange = () => {
      if (!isSimulatingRef.current) {
        renderer.render(scene, camera);
        syncFloatingLabels();
      }
    };
    controls.addEventListener("change", handleControlsChange);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        wakeLoopRef.current?.();
      } else {
        pauseLoopRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    animate();
    // Signal initial frame rendered to dismiss loading shimmer
    requestAnimationFrame(() => {
      onLoadedRef.current?.();
    });

    return () => {
      wakeLoopRef.current = null;
      pauseLoopRef.current = null;
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controls.removeEventListener("change", handleControlsChange);
      resizeObserver.disconnect();
      domElem.removeEventListener("pointermove", handlePointerMove);
      domElem.removeEventListener("pointerdown", handlePointerDown);
      domElem.removeEventListener("pointerup", handlePointerUp);
      domElem.removeEventListener("wheel", handleWheelCapture);
      rendererRef.current = null;
      hemiLightRef.current = null;
      dirLightRef.current = null;
      starFieldRef.current = null;
      rainPointsRef.current = null;
      snowPointsRef.current = null;
      lightningMeshRef.current = null;
      if (cloudsGroupRef.current) {
        cloudsGroupRef.current.clear();
      }
      rainPoints.geometry.dispose();
      (rainPoints.material as THREE.Material).dispose();
      snowPoints.geometry.dispose();
      (snowPoints.material as THREE.Material).dispose();
      starField.geometry.dispose();
      (starField.material as THREE.Material).dispose();
      lightningMesh.geometry.dispose();
      (lightningMesh.material as THREE.Material).dispose();
      pmremGenerator.dispose();
      envTex.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, [rebuildCityMeshes]);

  // Dynamically update Sky, Fog, Lights, Stars, Precipitation & Clouds in-place when isNightMode or season changes
  // Runs in <1ms without destroying the WebGL canvas, controls, or PMREM reflections!
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;

    const atmos = getAtmosphereConfig(isNightMode, season);

    scene.background = new THREE.Color(atmos.skyHex);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(atmos.skyHex);
      scene.fog.density = atmos.fogDensity;
    }

    renderer.toneMappingExposure = atmos.exposure;
    scene.environmentIntensity = atmos.environmentIntensity;

    if (hemiLightRef.current) {
      hemiLightRef.current.color.set(atmos.hemiLightColor);
      hemiLightRef.current.groundColor.set(atmos.hemiGroundColor);
      hemiLightRef.current.intensity = atmos.hemiIntensity;
      hemiIntensityBaseRef.current = atmos.hemiIntensity;
    }

    if (dirLightRef.current) {
      dirLightRef.current.color.set(atmos.dirLightColor);
      dirLightRef.current.intensity = atmos.dirLightIntensity;
      dirIntensityBaseRef.current = atmos.dirLightIntensity;
    }

    if (starFieldRef.current) {
      starFieldRef.current.visible = isNightMode;
    }

    const isStorm = season === "thunderstorm" || season === "monsoon";
    if (rainPointsRef.current) {
      rainPointsRef.current.visible =
        season === "rain" || season === "monsoon" || season === "thunderstorm";
    }

    if (snowPointsRef.current) {
      snowPointsRef.current.visible = season === "snow";
    }

    // Refresh cloud appearances for day/night/storm
    if (cloudsGroupRef.current) {
      cloudsGroupRef.current.clear();
      cloudsRef.current = [];
      CLOUD_DEFS.forEach((def) => {
        const cMesh = createFluffyCloudMesh(def.scale, isNightMode, isStorm);
        cMesh.position.set(def.x, def.y, def.z);
        cloudsGroupRef.current?.add(cMesh);
        cloudsRef.current.push({
          group: cMesh,
          baseY: def.y,
          speed: def.speed,
          phase: def.phase,
          wrapMinX: def.wrapMinX,
          wrapMaxX: def.wrapMaxX,
        });
      });
    }

    wakeLoopRef.current?.();
  }, [isNightMode, season]);

  useEffect(() => {
    return () => {
      if (scrollHintTimerRef.current) clearTimeout(scrollHintTimerRef.current);
    };
  }, []);

  const lastStructureKeyRef = useRef<string>("");

  useEffect(() => {
    if (isSimulating) {
      wakeLoopRef.current?.();
    } else {
      pauseLoopRef.current?.();
    }
  }, [isSimulating]);

  useEffect(() => {
    if (!worldGroupRef.current) return;

    const structureKey = `${isNightMode}|${layout.hqPlacement.label}|${layout.storePlacements
      .map((s) => `${s.id}:${s.x}:${s.z}:${s.storeNode?.healthStatus}`)
      .join(",")}`;

    if (
      lastStructureKeyRef.current !== structureKey ||
      worldGroupRef.current.children.length === 0
    ) {
      lastStructureKeyRef.current = structureKey;
      rebuildCityMeshes(worldGroupRef.current, layout, isNightMode);
      wakeLoopRef.current?.();
      return;
    }

    // In-place update of live store subLabels and truck route queue without interrupting the moving trucks!
    layout.storePlacements.forEach((sp) => {
      const entry = clickableGroupsRef.current.get(sp.id);
      if (entry) {
        entry.placement.label = sp.label;
        entry.placement.subLabel = sp.subLabel;
        entry.placement.storeNode = sp.storeNode;
      }
    });

    const updatedQueue: Array<{
      placement: CityBuildingPlacement;
      dispatchRank: number;
      slipNumber: string;
    }> = [];

    if (recentDispatches.length > 0) {
      recentDispatches.slice(0, 6).forEach((d, idx) => {
        const matched =
          layout.storePlacements.find(
            (sp) =>
              sp.storeNode?.id === d.storeId ||
              sp.storeNode?.name.trim().toLowerCase() ===
                d.storeName.trim().toLowerCase() ||
              sp.label.trim().toLowerCase() ===
                d.displayName.trim().toLowerCase()
          ) || layout.storePlacements[idx % layout.storePlacements.length];
        if (matched) {
          updatedQueue.push({
            placement: matched,
            dispatchRank: idx + 1,
            slipNumber: d.slipNumber,
          });
        }
      });
    }

    if (updatedQueue.length > 0) {
      ["van-0", "van-1"].forEach((vanId) => {
        const vanEntry = clickableGroupsRef.current.get(vanId);
        if (vanEntry) {
          const ud = vanEntry.group.userData;
          ud.recentRouteStores = updatedQueue;
        }
      });
    }
  }, [layout, recentDispatches, isNightMode, rebuildCityMeshes]);

  useEffect(() => {
    if (cameraResetTrigger > 0) {
      cameraFlyTargetRef.current = {
        pos: new THREE.Vector3(23, 22, 27),
        lookAt: new THREE.Vector3(0, 0.6, 2.8),
      };
    }
  }, [cameraResetTrigger]);

  useEffect(() => {
    if (!focusTargetId) return;
    const entry = clickableGroupsRef.current.get(focusTargetId);
    if (entry) {
      const worldPos = entry.group.position.clone();
      const isTreeCafe = entry.placement.kind === "tree_cafe";
      cameraFlyTargetRef.current = {
        lookAt: new THREE.Vector3(worldPos.x, isTreeCafe ? 0.6 : 1.2, worldPos.z),
        pos: new THREE.Vector3(
          worldPos.x + (isTreeCafe ? 9 : 13),
          isTreeCafe ? 10 : 14,
          worldPos.z + (isTreeCafe ? 11 : 15)
        ),
      };
      onSelectRef.current({
        id: focusTargetId,
        kind: entry.placement.kind,
        placement: entry.placement,
      });
    }
  }, [focusTargetId]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden touch-pan-y">
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ touchAction: "pan-y" }}
      />

      {/* Non-intrusive Hint Overlay for Alt+Scroll / 2-Finger Touch */}
      {scrollHint && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-950/85 backdrop-blur-md text-white text-xs font-bold shadow-2xl border border-white/20 animate-in fade-in zoom-in-95 duration-150">
            <span className="px-1.5 py-0.5 rounded-md bg-white/20 font-mono text-[10.5px]">
              {scrollHint.type === "touch" ? "👆👆" : "Alt"}
            </span>
            <span>{scrollHint.text}</span>
          </div>
        </div>
      )}

      {/* Projected 3D Building Floating Badges */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map((lbl) => {
          if (!lbl.visible) return null;
          const isSelected = lbl.id === selectedId;
          const isHovered = lbl.id === hoveredId;

          let badgeStyle =
            "bg-white/95 text-slate-900 border-slate-300/90 shadow-md ring-1 ring-slate-900/5";
          let subLabelStyle = "text-slate-500 font-semibold";

          if (lbl.kind === "hq") {
            badgeStyle =
              "bg-blue-700/95 text-white border-blue-400 shadow-blue-500/20";
            subLabelStyle = "text-blue-100 font-semibold";
          } else if (lbl.kind === "warehouse") {
            badgeStyle =
              "bg-slate-800/92 text-emerald-300 border-emerald-500/40";
            subLabelStyle = "text-emerald-200 font-semibold";
          } else if (lbl.kind === "finance") {
            badgeStyle = "bg-emerald-900/92 text-amber-200 border-amber-400/40";
            subLabelStyle = "text-amber-200 font-semibold";
          } else if (lbl.kind === "add_plot") {
            badgeStyle =
              "bg-blue-600/92 text-white border-blue-300 border-dashed";
            subLabelStyle = "text-blue-100 font-semibold";
          } else if (lbl.kind === "van") {
            badgeStyle =
              "bg-indigo-700/92 text-white border-indigo-400/80 shadow-indigo-500/20";
            subLabelStyle = "text-indigo-100 font-semibold";
          } else if (lbl.healthStatus === "urgent") {
            // Classic White Store Board with Crisp Black Text & Due Warning Accent
            badgeStyle =
              "bg-white/95 text-slate-900 border-rose-400 shadow-md ring-1 ring-rose-400/30";
            subLabelStyle = "text-rose-600 font-bold";
          } else if (lbl.healthStatus === "warning") {
            // Classic White Store Board with Crisp Black Text & Attention Accent
            badgeStyle =
              "bg-white/95 text-slate-900 border-amber-400 shadow-md ring-1 ring-amber-400/30";
            subLabelStyle = "text-amber-600 font-bold";
          } else {
            // Classic White Store Board with Crisp Black Text
            badgeStyle =
              "bg-white/95 text-slate-900 border-slate-300/90 shadow-md ring-1 ring-slate-900/5";
            subLabelStyle = "text-slate-500 font-semibold";
          }

          return (
            <div
              key={lbl.id}
              style={{
                transform: `translate3d(${Math.round(lbl.x)}px, ${Math.round(
                  lbl.y
                )}px, 0) translate(-50%, -100%)`,
              }}
              className={`absolute top-0 left-0 transition-transform duration-75 px-2.5 py-0.5 rounded-lg border text-[10.5px] font-extrabold tracking-tight whitespace-nowrap backdrop-blur-xs shadow-sm ${badgeStyle} ${
                isSelected || isHovered
                  ? "scale-110 ring-2 ring-blue-600 shadow-lg z-20"
                  : "opacity-95 z-10"
              }`}
            >
              <span>{lbl.label}</span>
              {lbl.subLabel && (
                <span className={`ml-1.5 text-[9.5px] ${subLabelStyle}`}>
                  · {lbl.subLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

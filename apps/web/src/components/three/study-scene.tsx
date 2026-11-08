"use client";

import * as React from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type SceneVariant = "student" | "admin";

interface LightPreset {
  name: string;
  key: string;
  rim: string;
  core: string;
  glow: string;
}

// Mood lighting the viewer can switch between: the key light follows the pointer, the rim light
// sits behind the scene, and the core's tint shifts with them.
const PRESETS: Record<SceneVariant, LightPreset[]> = {
  student: [
    { name: "Ember", key: "#ff9a5c", rim: "#ffd8a8", core: "#9a3412", glow: "rgba(247, 128, 69, 0.34)" },
    { name: "Lamplight", key: "#ffd27a", rim: "#f37168", core: "#7c5410", glow: "rgba(245, 190, 61, 0.3)" },
    { name: "Ink", key: "#e9e3d6", rim: "#6d83ff", core: "#1f2a44", glow: "rgba(233, 227, 214, 0.22)" },
  ],
  admin: [
    { name: "Brass", key: "#ffd27a", rim: "#ff9a5c", core: "#6b4a10", glow: "rgba(245, 190, 61, 0.3)" },
    { name: "Signal", key: "#7fd8a4", rim: "#e9e3d6", core: "#1d4a35", glow: "rgba(100, 196, 140, 0.28)" },
    { name: "Ember", key: "#ff9a5c", rim: "#f37168", core: "#9a3412", glow: "rgba(247, 128, 69, 0.3)" },
  ],
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Decorative, interactive WebGL scene. Pointer moves the key light, click/tap cycles the
 * lighting mood, drag spins the core. Everything it shows is ornamental, so the canvas is hidden
 * from assistive tech; the lighting buttons beneath it are the accessible way to play with it.
 */
export function StudyScene({
  variant = "student",
  className,
  showControls = true,
  onDark = false,
}: {
  variant?: SceneVariant;
  className?: string;
  showControls?: boolean;
  /** Controls styled for a permanently dark panel, whatever the app theme. */
  onDark?: boolean;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const presetRef = React.useRef(0);
  const applyPresetRef = React.useRef<((i: number) => void) | null>(null);
  const [preset, setPreset] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const presets = PRESETS[variant];

  const choose = React.useCallback(
    (i: number) => {
      const next = ((i % presets.length) + presets.length) % presets.length;
      presetRef.current = next;
      setPreset(next);
      applyPresetRef.current?.(next);
    },
    [presets.length],
  );

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      setFailed(true);
      return;
    }
    const reduced = prefersReducedMotion();
    // 1.5 keeps edges crisp on high-DPI screens at roughly 25% fewer pixels per frame than 1.75.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 7.2);

    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(x: T) => {
      disposables.push(x);
      return x;
    };

    // ── Lights ──
    scene.add(new THREE.AmbientLight("#ffffff", 0.18));
    const hemi = new THREE.HemisphereLight("#fff1dc", "#141210", 0.35);
    scene.add(hemi);
    const keyLight = new THREE.PointLight("#ffffff", 38, 0, 2);
    keyLight.position.set(2, 1.5, 3.2);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight("#ffffff", 2.2);
    rimLight.position.set(-3, 2, -4);
    scene.add(rimLight);

    // A small glowing orb marks where the key light is, so moving the pointer reads as "holding" it.
    const orbMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }));
    const orb = new THREE.Mesh(track(new THREE.SphereGeometry(0.07, 24, 24)), orbMat);
    scene.add(orb);
    // Soft radial glow for the halo; a sprite without a texture would render as a square.
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 64;
    const g = glowCanvas.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    const glowTexture = track(new THREE.CanvasTexture(glowCanvas));
    const haloMat = track(
      new THREE.SpriteMaterial({ map: glowTexture, color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(0.6, 0.6, 1);
    scene.add(halo);

    // ── Core ──
    const group = new THREE.Group();
    scene.add(group);
    const coreMat = track(new THREE.MeshStandardMaterial({ color: "#9a3412", metalness: 0.45, roughness: 0.22, flatShading: true }));
    const coreGeo = track(variant === "admin" ? new THREE.OctahedronGeometry(1.15, 1) : new THREE.IcosahedronGeometry(1.15, 1));
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    const shellMat = track(new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18 }));
    const shellSrc = track(variant === "admin" ? new THREE.SphereGeometry(1.75, 18, 12) : new THREE.IcosahedronGeometry(1.7, 1));
    const shell = new THREE.LineSegments(track(new THREE.EdgesGeometry(shellSrc)), shellMat);
    group.add(shell);

    // Orbiting "ideas" (student) or "nodes" (admin).
    const orbitColors = variant === "admin" ? ["#f5be3d", "#e9e3d6", "#64c48c", "#f78045"] : ["#f78045", "#f5be3d", "#e9e3d6", "#f37168"];
    const satellites: { mesh: THREE.Mesh; radius: number; speed: number; phase: number; tilt: number }[] = [];
    const satGeo = track(new THREE.SphereGeometry(1, 32, 32));
    for (let i = 0; i < 9; i++) {
      const mat = track(new THREE.MeshStandardMaterial({ color: orbitColors[i % orbitColors.length], metalness: 0.2, roughness: 0.28 }));
      const mesh = new THREE.Mesh(satGeo, mat);
      const s = 0.08 + (i % 3) * 0.035;
      mesh.scale.setScalar(s);
      group.add(mesh);
      satellites.push({ mesh, radius: 2.1 + (i % 4) * 0.28, speed: 0.18 + (i % 5) * 0.05, phase: (i / 9) * Math.PI * 2, tilt: ((i % 3) - 1) * 0.55 });
    }
    const ringMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(2.38, 2.4, 128)), ringMat);
    ring.rotation.x = Math.PI / 2.4;
    group.add(ring);

    // Drifting dust for depth.
    const COUNT = 380;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 3 + Math.random() * 4;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      positions.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t) * 0.6, r * Math.cos(p) - 2], i * 3);
    }
    const dustGeo = track(new THREE.BufferGeometry());
    dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dustMat = track(new THREE.PointsMaterial({ color: "#ffffff", size: 0.025, transparent: true, opacity: 0.55, depthWrite: false }));
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ── Lighting presets, eased rather than snapped ──
    const target = { key: new THREE.Color(), rim: new THREE.Color(), core: new THREE.Color() };
    const applyPreset = (i: number) => {
      const p = PRESETS[variant][i];
      target.key.set(p.key);
      target.rim.set(p.rim);
      target.core.set(p.core);
      host.style.setProperty("--scene-glow", p.glow);
      wake();
    };
    keyLight.color.set(PRESETS[variant][presetRef.current].key);
    rimLight.color.set(PRESETS[variant][presetRef.current].rim);
    coreMat.color.set(PRESETS[variant][presetRef.current].core);
    applyPresetRef.current = applyPreset;

    // ── Pointer: light follows, drag spins, click cycles ──
    const pointer = new THREE.Vector2(0.35, 0.3);
    const lightTarget = new THREE.Vector3(2, 1.5, 3.2);
    let dragging = false;
    let dragMoved = 0;
    let lastX = 0;
    let lastY = 0;
    let spinX = 0;
    let spinY = 0;

    const toNdc = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
      lightTarget.set(pointer.x * 3.4, pointer.y * 2.4, 2.8);
    };
    const onMove = (e: PointerEvent) => {
      toNdc(e);
      if (dragging) {
        spinY += (e.clientX - lastX) * 0.008;
        spinX += (e.clientY - lastY) * 0.008;
        dragMoved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
        lastX = e.clientX;
        lastY = e.clientY;
      }
      wake();
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      dragMoved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      if (dragging && dragMoved < 6) choose(presetRef.current + 1);
      dragging = false;
    };
    const onLeave = () => {
      dragging = false;
      lightTarget.set(2, 1.5, 3.2);
      wake();
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    host.addEventListener("pointerleave", onLeave);

    // ── Sizing ──
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height;
      // Keep the whole composition in frame on narrow panels.
      camera.position.z = width / height < 1 ? 7.2 / Math.max(width / height, 0.6) : 7.2;
      camera.updateProjectionMatrix();
      wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // ── Loop: runs only while visible; with reduced motion, only while something is changing ──
    let visible = true;
    let raf = 0;
    let settleFrames = 0;
    // THREE.Clock is deprecated; Timer is updated once per frame, then read.
    const timer = new THREE.Timer();
    let t = 0;

    function wake() {
      settleFrames = 90;
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function frame(timestamp?: number) {
      raf = 0;
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.05);
      if (!reduced) t += dt;

      keyLight.position.lerp(lightTarget, 0.08);
      orb.position.copy(keyLight.position);
      halo.position.copy(keyLight.position);
      keyLight.color.lerp(target.key, 0.06);
      rimLight.color.lerp(target.rim, 0.06);
      coreMat.color.lerp(target.core, 0.06);
      orbMat.color.copy(keyLight.color);
      haloMat.color.copy(keyLight.color);
      shellMat.color.copy(rimLight.color);

      spinX *= 0.92;
      spinY *= 0.92;
      group.rotation.y += spinY * 0.1 + (reduced ? 0 : dt * 0.12);
      group.rotation.x += spinX * 0.1;
      group.rotation.x *= 0.985;
      core.rotation.y = t * 0.25;
      core.rotation.z = Math.sin(t * 0.4) * 0.15;
      shell.rotation.y = -t * 0.1;
      group.position.y = reduced ? 0 : Math.sin(t * 0.8) * 0.08;

      for (const s of satellites) {
        const a = s.phase + t * s.speed;
        s.mesh.position.set(Math.cos(a) * s.radius, Math.sin(a) * s.radius * s.tilt * 0.6, Math.sin(a) * s.radius * 0.55);
      }
      dust.rotation.y = t * 0.02;

      renderer.render(scene, camera);

      const animating = !reduced || settleFrames-- > 0 || dragging;
      if (animating && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
    });
    io.observe(host);
    const onVisibility = () => {
      if (!document.hidden) {
        // Forget the time spent hidden, so the scene doesn't jump forward.
        timer.reset();
        wake();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    applyPreset(presetRef.current);
    resize();
    wake();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointerleave", onLeave);
      applyPresetRef.current = null;
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      timer.dispose();
      renderer.domElement.remove();
    };
  }, [variant, choose]);

  return (
    <div className={cn("relative flex flex-col", className)}>
      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        style={{ background: "radial-gradient(60% 60% at 50% 45%, var(--scene-glow, rgba(247,128,69,0.3)), transparent 70%)" }}
      >
        {failed && (
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,hsl(var(--primary)/0.35),transparent_65%)]" />
        )}
      </div>
      {showControls && !failed && (
        <div role="group" aria-label="Scene lighting" className="flex flex-wrap items-center justify-center gap-2 pt-3">
          <span className={cn("text-xs font-medium uppercase tracking-wider", onDark ? "text-white/70" : "text-muted-foreground")}>Lighting</span>
          {presets.map((p, i) => (
            <button
              key={p.name}
              type="button"
              aria-pressed={preset === i}
              onClick={() => choose(i)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                onDark
                  ? preset === i
                    ? "border-white/60 bg-white/15 text-white"
                    : "border-white/20 text-white/75 hover:bg-white/10 hover:text-white"
                  : preset === i
                    ? "border-primary bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${p.key}, ${p.rim})` }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** True only on wide screens, so decorative side panels don't create a WebGL context on phones. */

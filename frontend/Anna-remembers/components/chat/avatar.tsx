"use client";

import { forwardRef, useEffect, useRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface AvatarHandle {
  /** Play the given audio blob and drive lip-sync from its amplitude. */
  speakAudio(blob: Blob): Promise<void>;
}

interface AvatarProps {
  avatarUrl?: string;
}

// Candidate morph target names for the jaw/mouth opening, in order of preference.
// ARKit standard is "jawOpen"; many models also have "viseme_aa" or "mouthOpen".
const JAW_MORPHS = [
  "jawOpen",
  "viseme_aa",
  "mouthOpen",
  "Mouth_Open",
  "JawOpen",
  "A25_Jaw_Open",
];

// Candidate bone names for the jaw. Used as a fallback when the model has no
// morph targets (e.g. Avaturn export without blendshapes). The jaw bone is
// rotated around its local X axis to approximate mouth opening.
const JAW_BONE_NAMES = [
  "Jaw", "jaw", "Jaw_M", "mixamorigJaw",
  "Bone_Jaw", "head_jaw", "CC_Base_JawRoot",
];

const Avatar = forwardRef<AvatarHandle, AvatarProps>(
  ({ avatarUrl }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    // Meshes with a usable jaw morph target and the index of that morph.
    const jawMeshesRef = useRef<{ mesh: THREE.Mesh; index: number }[]>([]);
    // Fallback: a jaw bone we can rotate when no morph targets exist.
    const jawBoneRef = useRef<{ bone: THREE.Object3D; restX: number } | null>(null);
    // Second fallback: the Head bone. Used for "speaking" head motion when the
    // model has neither morph targets nor a jaw bone (e.g. Avaturn exports).
    const headBoneRef = useRef<
      { bone: THREE.Object3D; restX: number; restY: number; restZ: number } | null
    >(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container || !avatarUrl) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf5f5f5);

      const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
      camera.position.set(0, 1.55, 1.6);
      camera.lookAt(0, 1.5, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambient);
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
      keyLight.position.set(1, 2, 2);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
      fillLight.position.set(-1, 1, 1);
      scene.add(fillLight);

      let mixer: THREE.AnimationMixer | null = null;
      let model: THREE.Object3D | null = null;
      const clock = new THREE.Clock();
      let cancelled = false;

      const loader = new GLTFLoader();
      loader.load(
        avatarUrl,
        (gltf) => {
          if (cancelled) return;
          model = gltf.scene;
          scene.add(model);

          // Find all meshes that expose at least one of our candidate jaw morphs.
          const found: { mesh: THREE.Mesh; index: number }[] = [];
          const allMorphs: string[] = [];
          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.morphTargetDictionary) {
              for (const name of Object.keys(mesh.morphTargetDictionary)) {
                allMorphs.push(name);
              }
              for (const candidate of JAW_MORPHS) {
                const idx = mesh.morphTargetDictionary[candidate];
                if (idx !== undefined) {
                  found.push({ mesh, index: idx });
                  break;
                }
              }
            }
          });
          jawMeshesRef.current = found;
          console.log(
            `[Avatar] Loaded. Morph targets found:`,
            Array.from(new Set(allMorphs)),
          );
          console.log(`[Avatar] Jaw morphs wired: ${found.length} mesh(es)`);

          // Fallback 1: jaw bone (rotates around X for mouth open).
          // Fallback 2: Head bone (subtle bob/tilt while speaking).
          if (found.length === 0) {
            const allBones: string[] = [];
            let jawBone: THREE.Object3D | null = null;
            let headBone: THREE.Object3D | null = null;
            model.traverse((obj) => {
              if ((obj as THREE.Bone).isBone) {
                allBones.push(obj.name);
                if (!jawBone && obj.name.toLowerCase().includes("jaw")) {
                  jawBone = obj;
                }
                // Pick a Head bone by exact name (covers Avaturn, Mixamo, RPM)
                if (!headBone && (obj.name === "Head" || obj.name === "mixamorigHead")) {
                  headBone = obj;
                }
              }
            });
            console.log(`[Avatar] Bone names:`, allBones);
            if (jawBone) {
              const b = jawBone as THREE.Object3D;
              jawBoneRef.current = { bone: b, restX: b.rotation.x };
              console.log(`[Avatar] Lip-sync via jaw bone: "${b.name}"`);
            } else if (headBone) {
              const b = headBone as THREE.Object3D;
              headBoneRef.current = {
                bone: b,
                restX: b.rotation.x,
                restY: b.rotation.y,
                restZ: b.rotation.z,
              };
              console.log(
                `[Avatar] No jaw — using Head bone "${b.name}" for "speaking" motion`,
              );
            } else {
              console.warn("[Avatar] No jaw, no head bone — no speaking animation");
            }
          }

          // Auto-frame on the head/upper body
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          model.position.y -= box.min.y;
          const h = size.y;
          camera.position.set(0, h * 0.92, h * 0.85);
          camera.lookAt(0, h * 0.88, 0);

          if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            mixer.clipAction(gltf.animations[0]).play();
          }
        },
        undefined,
        (err) => {
          console.error("[Avatar] GLB load failed:", err);
        },
      );

      // Pre-allocate the analyser data buffer
      const freqBuffer = new Uint8Array(64);

      let animationId: number;
      const animate = () => {
        animationId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);

        // Drive lip-sync / speaking motion from current audio amplitude
        const analyser = analyserRef.current;
        const jaws = jawMeshesRef.current;
        const jawBone = jawBoneRef.current;
        const headBone = headBoneRef.current;

        let weight = 0; // target intensity, 0..1
        if (analyser) {
          analyser.getByteFrequencyData(freqBuffer);
          let sum = 0;
          for (let i = 2; i < 24; i++) sum += freqBuffer[i];
          const avg = sum / 22 / 255;
          weight = Math.min(1, avg * 2.2);
        }

        if (jaws.length > 0) {
          for (const { mesh, index } of jaws) {
            if (mesh.morphTargetInfluences) {
              const prev = mesh.morphTargetInfluences[index] ?? 0;
              mesh.morphTargetInfluences[index] = prev * 0.4 + weight * 0.6;
            }
          }
        } else if (jawBone) {
          const targetRot = jawBone.restX + weight * 0.45;
          jawBone.bone.rotation.x = jawBone.bone.rotation.x * 0.4 + targetRot * 0.6;
        } else if (headBone) {
          // No face rig — fake "speaking" with a subtle head bob + tilt.
          // Nod (X) from amplitude, gentle side-to-side (Y) drifts at a slower
          // sinusoidal rhythm so it doesn't look perfectly synced with the audio.
          const t = performance.now() / 1000;
          const nod = headBone.restX + weight * 0.06;          // ~3.4° max
          const sway = headBone.restY + Math.sin(t * 1.7) * weight * 0.05; // ~2.8°
          const tilt = headBone.restZ + Math.sin(t * 2.3) * weight * 0.03; // ~1.7°
          headBone.bone.rotation.x = headBone.bone.rotation.x * 0.7 + nod * 0.3;
          headBone.bone.rotation.y = headBone.bone.rotation.y * 0.7 + sway * 0.3;
          headBone.bone.rotation.z = headBone.bone.rotation.z * 0.7 + tilt * 0.3;
        }

        renderer.render(scene, camera);
      };
      animate();

      const handleResize = () => {
        const w = container.clientWidth;
        const h2 = container.clientHeight;
        camera.aspect = w / h2;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h2);
      };
      window.addEventListener("resize", handleResize);

      return () => {
        cancelled = true;
        cancelAnimationFrame(animationId);
        window.removeEventListener("resize", handleResize);
        if (mixer) mixer.stopAllAction();
        if (model) scene.remove(model);
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
        analyserRef.current = null;
      };
    }, [avatarUrl]);

    useImperativeHandle(
      ref,
      () => ({
        async speakAudio(blob: Blob) {
          // Lazily create an AudioContext (must be inside a user gesture)
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext ||
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).webkitAudioContext)();
          }
          const ctx = audioContextRef.current;
          if (ctx.state === "suspended") {
            await ctx.resume();
          }

          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;

          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.6;

          source.connect(analyser);
          analyser.connect(ctx.destination);

          analyserRef.current = analyser;

          return new Promise<void>((resolve) => {
            source.onended = () => {
              if (analyserRef.current === analyser) {
                analyserRef.current = null;
              }
              resolve();
            };
            source.start(0);
          });
        },
      }),
      [],
    );

    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "400px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          overflow: "hidden",
          position: "relative",
        }}
      />
    );
  },
);

Avatar.displayName = "Avatar";

export default Avatar;

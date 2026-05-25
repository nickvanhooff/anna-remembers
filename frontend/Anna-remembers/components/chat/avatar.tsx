"use client"

import { forwardRef, useEffect, useRef, useImperativeHandle } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

export interface AvatarHandle {
  /** Play the given audio blob and drive lip-sync from its amplitude. */
  speakAudio(blob: Blob): Promise<void>
}

export type AvatarAnimation =
  | "standard_waiting"
  | "stand_look_around"
  | "running_fast"
  | "standard_walk_crouching"
  | "flexing_arm"
  | "gorilla"
  | "laying_on_floor"
  | "just_chilling"
  | "angry"
  | "Expressing_joy"
  | "model"
  | "model (13)"

export const ANIMATION_TO_MODEL: Record<AvatarAnimation, string> = {
  standard_waiting: "/standard_waiting.glb",
  stand_look_around: "/stand_look_around.glb",
  running_fast: "/running_fast.glb",
  standard_walk_crouching: "/standard_walk_crouching.glb",
  flexing_arm: "/flexing_arm.glb",
  gorilla: "/gorilla.glb",
  laying_on_floor: "/laying_on_floor.glb",
  just_chilling: "/just_chilling.glb",
  angry: "/angry.glb",
  Expressing_joy: "/Expressing_joy.glb",
  model: "/model.glb",
  "model (13)": "/model (13).glb",
}

interface AvatarProps {
  avatarUrl?: string
  animation?: AvatarAnimation
}

// ARKit viseme groups mapped to approximate speech frequency bands.
// Vowels dominate low frequencies; fricatives/sibilants dominate high frequencies.
const VISEME_GROUPS = {
  vowelOpen:  ["viseme_aa", "viseme_O"],         // ah, oh  — low freq
  vowelMid:   ["viseme_E", "viseme_I", "viseme_U", "viseme_RR"],  // eh, ih, oo, r
  consonant:  ["viseme_DD", "viseme_kk", "viseme_nn", "viseme_PP"], // d/t, k/g, n, p/b/m
  fricative:  ["viseme_SS", "viseme_CH", "viseme_FF", "viseme_TH"], // s, sh, f/v, th
} as const

// Jaw-open morphs used for the overall mouth-opening amount.
const JAW_MORPHS = ["jawOpen", "mouthOpen", "viseme_aa"]

// Jaw bone fallback names (models without blend shapes).
const JAW_BONE_NAMES = ["Jaw", "jaw", "Jaw_M", "mixamorigJaw", "CC_Base_JawRoot"]

function bandEnergy(buf: Uint8Array, from: number, to: number): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += buf[i]
  return sum / ((to - from) * 255)
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const Avatar = forwardRef<AvatarHandle, AvatarProps>(
  ({ avatarUrl, animation }, ref) => {
    const resolvedUrl =
      avatarUrl ?? (animation ? ANIMATION_TO_MODEL[animation] : ANIMATION_TO_MODEL.standard_waiting)

    const containerRef = useRef<HTMLDivElement>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)

    // All morph targets by name → list of (mesh, index) pairs.
    const morphMapRef = useRef<Map<string, { mesh: THREE.Mesh; index: number }[]>>(new Map())
    // Smoothed weights currently applied to the model.
    const morphWeightsRef = useRef<Map<string, number>>(new Map())
    // Which speech viseme is currently being targeted.
    const currentVisemeRef = useRef<string>("viseme_sil")
    // When to pick the next speech viseme (ms timestamp).
    const nextVisemeSwitchRef = useRef<number>(0)

    // Primary jaw-morph for gross mouth-open amount.
    const jawMorphRef = useRef<{ mesh: THREE.Mesh; index: number } | null>(null)
    // Fallback: jaw bone rotation.
    const jawBoneRef = useRef<{ bone: THREE.Object3D; restX: number } | null>(null)
    // Fallback: head bone subtle motion when no face rig at all.
    const headBoneRef = useRef<{
      bone: THREE.Object3D
      restX: number
      restY: number
      restZ: number
    } | null>(null)

    // Blinking state.
    const blinkRef = useRef({ nextBlink: 3000 + Math.random() * 2000, blinkEnd: 0, active: false })

    useEffect(() => {
      const container = containerRef.current
      if (!container || !resolvedUrl) return

      const width = container.clientWidth
      const height = container.clientHeight

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf5f5f5)

      const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100)
      camera.position.set(0, 1.55, 1.6)
      camera.lookAt(0, 1.5, 0)

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(width, height)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      container.appendChild(renderer.domElement)

      const ambient = new THREE.AmbientLight(0xffffff, 0.8)
      scene.add(ambient)
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
      keyLight.position.set(1, 2, 2)
      scene.add(keyLight)
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4)
      fillLight.position.set(-1, 1, 1)
      scene.add(fillLight)

      let mixer: THREE.AnimationMixer | null = null
      let model: THREE.Object3D | null = null
      const clock = new THREE.Clock()
      let cancelled = false

      // Reset lip-sync state on model change.
      morphMapRef.current = new Map()
      morphWeightsRef.current = new Map()
      currentVisemeRef.current = "viseme_sil"
      jawMorphRef.current = null
      jawBoneRef.current = null
      headBoneRef.current = null

      const loader = new GLTFLoader()
      loader.load(
        resolvedUrl,
        (gltf) => {
          if (cancelled) return
          model = gltf.scene
          scene.add(model)

          // Collect all morph targets.
          const morphMap = new Map<string, { mesh: THREE.Mesh; index: number }[]>()
          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh
            if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
              for (const [name, idx] of Object.entries(mesh.morphTargetDictionary)) {
                if (!morphMap.has(name)) morphMap.set(name, [])
                morphMap.get(name)!.push({ mesh, index: idx })
              }
            }
          })
          morphMapRef.current = morphMap

          // Pick the best jaw-open morph.
          for (const name of JAW_MORPHS) {
            const entries = morphMap.get(name)
            if (entries && entries.length > 0) {
              jawMorphRef.current = entries[0]
              break
            }
          }

          console.log(`[Avatar] Morph targets found:`, Array.from(morphMap.keys()))
          console.log(`[Avatar] Jaw morph: ${jawMorphRef.current ? JAW_MORPHS.find(n => morphMap.has(n)) : "none"}`)

          // Bone fallbacks when no morph targets exist.
          if (morphMap.size === 0) {
            const allBones: string[] = []
            let jawBone: THREE.Object3D | null = null
            let headBone: THREE.Object3D | null = null
            model.traverse((obj) => {
              if ((obj as THREE.Bone).isBone) {
                allBones.push(obj.name)
                if (!jawBone && JAW_BONE_NAMES.some(n => obj.name === n || obj.name.toLowerCase().includes("jaw"))) {
                  jawBone = obj
                }
                if (!headBone && (obj.name === "Head" || obj.name === "mixamorigHead")) {
                  headBone = obj
                }
              }
            })
            if (jawBone) {
              const b = jawBone as THREE.Object3D
              jawBoneRef.current = { bone: b, restX: b.rotation.x }
            } else if (headBone) {
              const b = headBone as THREE.Object3D
              headBoneRef.current = { bone: b, restX: b.rotation.x, restY: b.rotation.y, restZ: b.rotation.z }
            }
          }

          // Auto-frame camera to model bounds.
          const box = new THREE.Box3().setFromObject(model)
          model.position.y -= box.min.y
          const box2 = new THREE.Box3().setFromObject(model)
          const size = new THREE.Vector3()
          const center = new THREE.Vector3()
          box2.getSize(size)
          box2.getCenter(center)
          const fov = (camera.fov * Math.PI) / 180
          const fitDistance = Math.max(
            size.y / (2 * Math.tan(fov / 2)),
            size.x / (2 * Math.tan(fov / 2) * camera.aspect),
          ) * 1.22
          const targetY = center.y + size.y * 0.05
          camera.position.set(center.x, targetY, center.z + fitDistance)
          camera.near = Math.max(0.01, fitDistance / 100)
          camera.far = Math.max(camera.far, fitDistance * 100)
          camera.updateProjectionMatrix()
          camera.lookAt(center.x, targetY, center.z)

          if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model)
            mixer.clipAction(gltf.animations[0]).play()
          }
        },
        undefined,
        (err) => console.error("[Avatar] GLB load failed:", err),
      )

      // fftSize 256 → 128 bins, each ≈ sampleRate/256 Hz wide.
      const freqBuffer = new Uint8Array(128)

      let animationId: number
      const animate = () => {
        animationId = requestAnimationFrame(animate)
        const delta = clock.getDelta()
        if (mixer) mixer.update(delta)

        const analyser = analyserRef.current
        const morphMap = morphMapRef.current
        const now = performance.now()

        // ── Lip sync ──────────────────────────────────────────────────────────
        if (morphMap.size > 0) {
          let lowEnergy = 0, midEnergy = 0, highEnergy = 0

          if (analyser) {
            analyser.getByteFrequencyData(freqBuffer)
            // At 44100 Hz: bin≈172 Hz wide.  Low: 172-1032 Hz, Mid: 1032-3268 Hz, High: 3268-7740 Hz
            lowEnergy  = bandEnergy(freqBuffer, 1,  6)
            midEnergy  = bandEnergy(freqBuffer, 6, 19)
            highEnergy = bandEnergy(freqBuffer, 19, 45)
          }

          const totalAmplitude = Math.min(1, (lowEnergy * 1.6 + midEnergy + highEnergy * 0.6) * 3)
          const isSpeaking = totalAmplitude > 0.04

          // Pick a new speech viseme every 80-160 ms based on frequency content.
          if (isSpeaking && now > nextVisemeSwitchRef.current) {
            nextVisemeSwitchRef.current = now + 80 + Math.random() * 80

            let group: readonly string[]
            if (highEnergy > midEnergy * 1.2) {
              group = VISEME_GROUPS.fricative
            } else if (lowEnergy > midEnergy * 0.8) {
              group = Math.random() < 0.6 ? VISEME_GROUPS.vowelOpen : VISEME_GROUPS.vowelMid
            } else {
              group = VISEME_GROUPS.consonant
            }

            const available = (group as string[]).filter(v => morphMap.has(v))
            if (available.length > 0) currentVisemeRef.current = pickRandom(available)
          }
          if (!isSpeaking) currentVisemeRef.current = "viseme_sil"

          // Build target weights.
          const targets = new Map<string, number>()

          if (isSpeaking) {
            // Jaw opens proportional to low+mid energy.
            // Cap at 0.22 — in realistic speech the jaw rarely opens more than ~20%.
            const jawAmt = Math.min(0.22, (lowEnergy * 1.8 + midEnergy * 0.8) * 1.4)
            targets.set("jawOpen", jawAmt)
            targets.set("mouthOpen", jawAmt * 0.4)
            targets.set("mouthClose", 0)

            // Blend in current speech viseme at reduced weight so it doesn't stack
            // with jawOpen and push the mouth wider than natural.
            const v = currentVisemeRef.current
            if (v !== "viseme_sil") targets.set(v, totalAmplitude * 0.45)

            // Add a subtle secondary viseme to avoid frozen look between switches.
            const blendMap: Record<string, string> = {
              viseme_aa: "viseme_O", viseme_O: "viseme_aa",
              viseme_E: "viseme_I",  viseme_I: "viseme_E",
              viseme_SS: "viseme_CH", viseme_CH: "viseme_SS",
              viseme_DD: "viseme_nn", viseme_nn: "viseme_DD",
            }
            const secondary = blendMap[v]
            if (secondary && morphMap.has(secondary)) {
              targets.set(secondary, totalAmplitude * 0.12)
            }
          } else {
            targets.set("viseme_sil", 0.08)
            targets.set("jawOpen", 0)
            targets.set("mouthOpen", 0)
          }

          // Smooth all weights: decay toward target with exponential smoothing.
          const weights = morphWeightsRef.current
          for (const [name, target] of targets) {
            const cur = weights.get(name) ?? 0
            weights.set(name, cur * 0.42 + target * 0.58)
          }
          for (const [name, cur] of weights) {
            if (!targets.has(name)) {
              const next = cur * 0.38  // faster decay for inactive morphs
              weights.set(name, next < 0.001 ? 0 : next)
            }
          }

          // Write weights to mesh morph targets.
          for (const [name, weight] of weights) {
            if (weight < 0.001) continue
            const entries = morphMap.get(name)
            if (entries) {
              for (const { mesh, index } of entries) {
                if (mesh.morphTargetInfluences) {
                  mesh.morphTargetInfluences[index] = weight
                }
              }
            }
          }
          // Zero out any morph that dropped to ~0 so the mixer can't drift it.
          for (const [name, weight] of weights) {
            if (weight < 0.001) {
              const entries = morphMap.get(name)
              if (entries) {
                for (const { mesh, index } of entries) {
                  if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = 0
                }
              }
              weights.delete(name)
            }
          }

          // ── Blinking ────────────────────────────────────────────────────────
          const blink = blinkRef.current
          if (!blink.active && now > blink.nextBlink) {
            blink.active = true
            blink.blinkEnd = now + 120
          }
          if (blink.active && now > blink.blinkEnd) {
            blink.active = false
            blink.nextBlink = now + 2500 + Math.random() * 3500
          }
          const blinkW = blink.active ? 1 : 0
          for (const name of ["eyeBlinkLeft", "eyeBlinkRight"]) {
            const entries = morphMap.get(name)
            if (entries) {
              for (const { mesh, index } of entries) {
                if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = blinkW
              }
            }
          }

        } else {
          // ── Bone fallback (no morph targets) ────────────────────────────────
          const jawBone = jawBoneRef.current
          const headBone = headBoneRef.current
          let weight = 0

          if (analyser) {
            analyser.getByteFrequencyData(freqBuffer)
            let sum = 0
            for (let i = 2; i < 24; i++) sum += freqBuffer[i]
            weight = Math.min(1, (sum / 22 / 255) * 2.2)
          }

          if (jawBone) {
            const target = jawBone.restX + weight * 0.45
            jawBone.bone.rotation.x = jawBone.bone.rotation.x * 0.4 + target * 0.6
          } else if (headBone) {
            const t = now / 1000
            const nod  = headBone.restX + weight * 0.06
            const sway = headBone.restY + Math.sin(t * 1.7) * weight * 0.05
            const tilt = headBone.restZ + Math.sin(t * 2.3) * weight * 0.03
            headBone.bone.rotation.x = headBone.bone.rotation.x * 0.7 + nod  * 0.3
            headBone.bone.rotation.y = headBone.bone.rotation.y * 0.7 + sway * 0.3
            headBone.bone.rotation.z = headBone.bone.rotation.z * 0.7 + tilt * 0.3
          }
        }

        renderer.render(scene, camera)
      }
      animate()

      const handleResize = () => {
        const w = container.clientWidth
        const h = container.clientHeight
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      }
      window.addEventListener("resize", handleResize)

      return () => {
        cancelled = true
        cancelAnimationFrame(animationId)
        window.removeEventListener("resize", handleResize)
        if (mixer) mixer.stopAllAction()
        if (model) scene.remove(model)
        renderer.dispose()
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement)
        }
        analyserRef.current = null
      }
    }, [resolvedUrl])

    useImperativeHandle(
      ref,
      () => ({
        async speakAudio(blob: Blob) {
          if (!audioContextRef.current) {
            audioContextRef.current = new (
              window.AudioContext ||
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).webkitAudioContext
            )()
          }
          const ctx = audioContextRef.current
          if (ctx.state === "suspended") await ctx.resume()

          const arrayBuffer = await blob.arrayBuffer()
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))

          const source = ctx.createBufferSource()
          source.buffer = audioBuffer

          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256                  // 128 bins for better freq resolution
          analyser.smoothingTimeConstant = 0.55   // slightly less smoothing for crisper viseme transitions

          source.connect(analyser)
          analyser.connect(ctx.destination)
          analyserRef.current = analyser

          return new Promise<void>((resolve) => {
            source.onended = () => {
              if (analyserRef.current === analyser) analyserRef.current = null
              resolve()
            }
            source.start(0)
          })
        },
      }),
      [],
    )

    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "800px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          overflow: "hidden",
          position: "relative",
        }}
      />
    )
  },
)

Avatar.displayName = "Avatar"
export default Avatar

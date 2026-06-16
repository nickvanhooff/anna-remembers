/**
 * Generates captions JSON files from hardcoded narration text + scene durations.
 * No audio or Whisper needed — timestamps are calculated from word count.
 *
 * Run: node --experimental-strip-types scripts/generate-captions.mts
 */

import fs from "fs";
import path from "path";
import type { Caption } from "@remotion/captions";

type Scene = {
  id: string;
  durationSec: number;
  narration: string;
  /** Korte globale zinnen i.p.v. woord-voor-woord (laatste entries krijgen resterende tijd) */
  phrases?: { text: string; durationSec: number }[];
};

// Must match the scenes in AnnaRemembers.tsx
const SCENES: Scene[] = [
  {
    id: "01-intro",
    durationSec: 20,
    narration:
      "Anna Remembers is een AI-gezondheidsassistent voor hartfalenpatiënten. Het systeem voert wekelijkse check-ins uit, onthoudt wat patiënten eerder hebben gezegd, herkent verslechterende patronen, en escaleert automatisch naar een zorgverlener.",
  },
  {
    id: "02-patients",
    durationSec: 15,
    narration:
      "Drie gesimuleerde patiënten — elk met een eigen scenario. Patiënt 2 verslechtert geleidelijk over meerdere weken.",
  },
  {
    id: "03-chat-rag",
    durationSec: 60,
    narration:
      "Zodra een sessie start, bouwt het systeem context op in drie lagen: het patiëntdossier als compact JSON, RAG-geheugen via ChromaDB met semantisch zoeken via bge-m3, en de volledige gesprekshistorie uit PostgreSQL. Anna refereert aan wat de patiënt vorige week zei — dat is een live ChromaDB-resultaat, niet hardcoded.",
  },
  {
    id: "04-escalation",
    durationSec: 16,
    narration:
      "Na elk bericht draait op de achtergrond een licht model — DeepSeek-V4-Flash via Portkey — dat één ding doet: triage. Bij een positief signaal schrijft het systeem automatisch een escalatieregel en stuurt Twilio SMS naar de zorgverlener.",
    phrases: [
      { text: "Licht triage-model op de achtergrond", durationSec: 1.7 },
      { text: "Parallel: LLM-antwoord + urgentiescore", durationSec: 3 },
      { text: "Drempel overschreden → escalatie", durationSec: 4 },
      { text: "Escalatieregel + SMS naar zorgverlener", durationSec: 5.7 },
    ],
  },
  {
    id: "05-trends",
    durationSec: 40,
    narration:
      "Na elke sessie extraheert een apart model gestructureerde symptoomdata: kortademigheid, gewicht, medicatietrouw. Per datapunt zie je de klinische redenering én de exacte citaten van de patiënt waarop het gebaseerd is.",
  },
  {
    id: "06-settings",
    durationSec: 50,
    narration:
      "Het systeem is volledig configureerbaar. Met één klik wissel je tussen lokale stack op Ollama of cloud via Portkey. TTS, embeddings, en het LLM per functie zijn elk apart in te stellen — zonder code aan te passen.",
  },
  {
    id: "07-avatar",
    durationSec: 35,
    narration:
      "3D-avatar met 72 ARKit morph targets, lip sync via Web Audio API FFT-analyse. De stem is mijn eigen stem, gekloond via XTTS v2. Spraakherkenning loopt via de Web Speech API in de browser.",
  },
  {
    id: "08-outro",
    durationSec: 10,
    narration: "Anna Remembers — zodat niets tussen de sessies verloren gaat.",
  },
];

// Average Dutch reading speed: ~130 words per minute spoken
const WORDS_PER_SECOND = 130 / 60;

function generatePhraseCaptions(scene: Scene): Caption[] {
  const phrases = scene.phrases ?? [];
  const startOffsetMs = 800;
  const endPaddingMs = 500;
  let cursor = startOffsetMs;

  return phrases.map((phrase) => {
    const startMs = cursor;
    const endMs = Math.min(
      cursor + phrase.durationSec * 1000,
      scene.durationSec * 1000 - endPaddingMs
    );
    cursor = endMs;
    return {
      text: phrase.text,
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      timestampMs: Math.round(startMs),
      confidence: 1,
    };
  });
}

function generateCaptions(scene: Scene): Caption[] {
  if (scene.phrases) return generatePhraseCaptions(scene);

  const words = scene.narration.split(/\s+/);
  const totalWords = words.length;

  // Natural spoken duration based on word count
  const spokenDuration = totalWords / WORDS_PER_SECOND;

  // Start captions after a short pause (0.8s), end before scene ends
  const startOffsetMs = 800;
  const availableMs = Math.min(spokenDuration * 1000, scene.durationSec * 1000 - startOffsetMs - 500);
  const msPerWord = availableMs / totalWords;

  const captions: Caption[] = [];
  let cursor = startOffsetMs;

  for (const word of words) {
    const wordDuration = (word.length / 5) * msPerWord * 0.8 + msPerWord * 0.2;
    captions.push({
      text: ` ${word}`,
      startMs: Math.round(cursor),
      endMs: Math.round(cursor + wordDuration),
      timestampMs: Math.round(cursor),
      confidence: 1,
    });
    cursor += wordDuration;
  }

  return captions;
}

const outDir = path.join(process.cwd(), "public", "captions");
fs.mkdirSync(outDir, { recursive: true });

for (const scene of SCENES) {
  const captions = generateCaptions(scene);
  const outPath = path.join(outDir, `${scene.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(captions, null, 2));
  console.log(`✓ ${scene.id}.json — ${captions.length} ${scene.phrases ? "zinnen" : "woorden"}`);
}

console.log("\nKlaar! Captions staan in public/captions/");

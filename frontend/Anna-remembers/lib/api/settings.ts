import { get, put } from "./_base"
import type { Settings } from "@/types"

export async function getSettings(): Promise<Settings> {
  return get<Settings>("/settings")
}

export async function updateSetting(
  key: keyof Settings,
  value: string
): Promise<void> {
  await put<{ key: string; value: string }>(`/settings/${key}`, { value })
}

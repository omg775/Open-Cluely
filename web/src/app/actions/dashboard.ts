"use server";

import { revalidatePath } from "next/cache";
import {
  addDocument,
  createLaunchToken,
  deleteDocument,
  MODELS,
  revokeDeviceToken,
  saveModel,
} from "@/lib/data";
import { requireUser } from "@/lib/auth";

export type ActionState = { error: string | null; message: string | null };

const MAX_DOCUMENT_BYTES = 200_000;

export async function updateModel(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const model = String(formData.get("model") ?? "");

  if (!MODELS.some((entry) => entry.id === model)) {
    return { error: "Unknown model.", message: null };
  }

  await saveModel(user.userId, model);
  revalidatePath("/dashboard/settings");
  return { error: null, message: "Model preference saved." };
}

export async function uploadDocument(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const file = formData.get("document");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a text file to upload.", message: null };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: "Documents must be under 200 KB of text.", message: null };
  }

  const content = await file.text();
  if (!content.trim()) {
    return { error: "That file has no readable text.", message: null };
  }

  await addDocument(user.userId, file.name, content);
  revalidatePath("/dashboard/settings");
  return { error: null, message: `${file.name} added to your grounding library.` };
}

export async function removeDocument(formData: FormData): Promise<void> {
  const user = await requireUser();
  await deleteDocument(user.userId, String(formData.get("documentId") ?? ""));
  revalidatePath("/dashboard/settings");
}

export async function revokeDevice(formData: FormData): Promise<void> {
  const user = await requireUser();
  await revokeDeviceToken(user.userId, String(formData.get("deviceId") ?? ""));
  revalidatePath("/dashboard/settings");
}

export async function mintLaunchToken(): Promise<{ token: string; expiresInSeconds: number }> {
  const user = await requireUser();
  const ttlSeconds = 120;
  const token = await createLaunchToken(user.userId, ttlSeconds);
  return { token, expiresInSeconds: ttlSeconds };
}

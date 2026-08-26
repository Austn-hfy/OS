"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { talentOnboardingSubmissions } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type OnboardingState = { status: "idle" | "success" | "error"; message: string };

const submissionSchema = z.object({
  stageName: z.string().trim().min(1),
  fullName: z.string().trim().min(2),
  email: z.email(),
  phone: z.string().trim().min(7),
  instagramHandle: z.string().trim(),
  homeMarket: z.string().trim(),
  genres: z.string(),
  notes: z.string(),
  website: z.string().max(0),
});

export async function submitTalentOnboarding(_previous: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const parsed = submissionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Complete the required contact fields." };
  const file = formData.get("w9");
  if (file instanceof File && file.size > 8 * 1024 * 1024) return { status: "error", message: "W-9 must be smaller than 8 MB." };
  if (file instanceof File && file.size > 0 && !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
    return { status: "error", message: "W-9 must be a PDF, JPG, or PNG." };
  }

  try {
    const submissionId = crypto.randomUUID();
    let w9StoragePath: string | null = null;
    if (file instanceof File && file.size > 0) {
      const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
      w9StoragePath = `onboarding/${submissionId}/w9.${extension}`;
      const upload = await createSupabaseAdminClient().storage.from("talent-documents").upload(w9StoragePath, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });
      if (upload.error) throw upload.error;
    }
    try {
      await getDb().insert(talentOnboardingSubmissions).values({
      id: submissionId,
      stageName: parsed.data.stageName,
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      instagramHandle: parsed.data.instagramHandle,
      homeMarket: parsed.data.homeMarket,
      genres: parsed.data.genres.split(",").map((genre) => genre.trim()).filter(Boolean),
      notes: parsed.data.notes,
      w9StoragePath,
      });
    } catch (error) {
      if (w9StoragePath) await createSupabaseAdminClient().storage.from("talent-documents").remove([w9StoragePath]);
      throw error;
    }
    return { status: "success", message: "Thank you. HFY will review your information." };
  } catch {
    return { status: "error", message: "We couldn't save this submission. Please contact HFY directly." };
  }
}

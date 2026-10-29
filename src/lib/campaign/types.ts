import type { VideoReport } from "@/lib/types";

// A campaign is one brand brief applied to many creator videos.
export interface Campaign {
  id: string; // url-safe slug, e.g. "alani-nu-fall"
  name: string; // "Alani Nu: Fall creators"
  brand: string; // "Alani Nu"
  prompt: string; // SAM concept prompt, a short noun phrase: "drink can"
  productDescription: string; // for look-alike checks: "a slim teal Alani Nu can with a peach graphic"
  brandTerms: string[]; // spoken names: ["Alani", "Alani Nu"]
  contractTerms: string[]; // plain English, one per line
  createdAt: string; // ISO
  /** True for the built-in preview campaign whose numbers come from labels, not a real run. */
  synthetic?: boolean;
}

export type StepId = "normalize" | "track" | "verify" | "listen" | "measure" | "contract";

export const STEPS: { id: StepId; label: string }[] = [
  { id: "normalize", label: "Prepare video" },
  { id: "track", label: "Track product (SAM 3.1)" },
  { id: "verify", label: "Reject look-alikes (Muse Spark)" },
  { id: "listen", label: "Listen for the brand (Voice Transcribe)" },
  { id: "measure", label: "Measure screen time" },
  { id: "contract", label: "Check contract terms (Muse Spark)" },
];

export type VideoStatus = "uploaded" | "running" | "done" | "failed";

export interface VideoEntry {
  id: string; // url-safe, unique in the campaign
  campaignId: string;
  creator: string; // "@aldo"
  title: string; // file name or caption
  videoUrl: string; // playable URL of the normalized video (or the upload before normalization)
  status: VideoStatus;
  step: StepId | null; // current or last step
  error?: string;
  report?: VideoReport;
  createdAt: string;
  updatedAt: string;
  /** The original upload; videoUrl moves to the normalized copy once the run has prepared it. */
  sourceUrl?: string;
  /** True for preview videos whose report is built from hand labels, not a real run. */
  synthetic?: boolean;
  /** A still of the moment the product was largest on screen (or the middle frame when it never appeared). */
  thumbUrl?: string;
  /** A crop of each tracked object at its largest, keyed by objectId. */
  cropUrls?: Record<string, string>;
  /** Set when the creator sent the video through a request link: what they agreed to, and the link's one-time id. */
  consent?: { at: string; text: string };
  requestNonce?: string;
}

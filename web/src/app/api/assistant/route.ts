import { streamAnswer, composeSystemPrompt, type AssistantContent } from "@/lib/anthropic";
import { getSession } from "@/lib/session";
import {
  countRequestsToday,
  getDocumentContents,
  getSettings,
  MODELS,
  recordRequest,
} from "@/lib/data";

// One shared key pays for everyone, so each account gets a daily ceiling.
const DAILY_REQUEST_LIMIT = Number(process.env.ASSISTANT_DAILY_REQUEST_LIMIT ?? 200);
const MAX_SCREENSHOT_BYTES = 4_000_000;
const MAX_PROMPT_CHARS = 8_000;

export const maxDuration = 60;

type Body = {
  prompt?: unknown;
  transcript?: unknown;
  screenshot?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in to use the assistant" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "The assistant is not configured on the server yet." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : "";
  const transcript =
    typeof body.transcript === "string" ? body.transcript.trim().slice(0, MAX_PROMPT_CHARS) : "";
  const screenshot = typeof body.screenshot === "string" ? body.screenshot : "";

  if (!prompt && !transcript && !screenshot) {
    return Response.json({ error: "Nothing to answer yet" }, { status: 400 });
  }
  if (screenshot.length > MAX_SCREENSHOT_BYTES) {
    return Response.json({ error: "Screenshot is too large" }, { status: 413 });
  }

  const used = await countRequestsToday(session.userId);
  if (used >= DAILY_REQUEST_LIMIT) {
    return Response.json(
      { error: `Daily limit of ${DAILY_REQUEST_LIMIT} answers reached. Try again tomorrow.` },
      { status: 429 }
    );
  }

  const [settings, documents] = await Promise.all([
    getSettings(session.userId),
    getDocumentContents(session.userId),
  ]);
  const model = MODELS.some((entry) => entry.id === settings.model)
    ? settings.model
    : MODELS[0].id;

  const content: AssistantContent[] = [];
  if (screenshot) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: screenshot },
    });
  }
  if (transcript) {
    content.push({ type: "text", text: `Live transcript:\n${transcript}` });
  }
  content.push({
    type: "text",
    text:
      prompt ||
      "Answer the question being asked in the transcript, using the screen capture if it is relevant.",
  });

  await recordRequest(session.userId);

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        for await (const delta of streamAnswer({
          model,
          system: composeSystemPrompt(documents),
          content,
          signal: controller.signal,
        })) {
          streamController.enqueue(encoder.encode(delta));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : "Claude request failed";
          streamController.enqueue(encoder.encode(`\n\n[error] ${message}`));
        }
      } finally {
        streamController.close();
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-model": model,
    },
  });
}

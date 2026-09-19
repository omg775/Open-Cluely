import {
  streamAnswer,
  composeSystemPrompt,
  IMAGE_MEDIA_TYPES,
  type AssistantContent,
  type AssistantMessage,
  type ImageMediaType,
} from "@/lib/anthropic";
import { getSession } from "@/lib/session";
import { authenticateDevice } from "@/lib/device";
import {
  countRequestsToday,
  getDocumentContents,
  getSettings,
  MODELS,
  recordRequest,
} from "@/lib/data";

// One shared key pays for everyone, so each account gets a daily ceiling.
const DAILY_REQUEST_LIMIT = Number(process.env.ASSISTANT_DAILY_REQUEST_LIMIT ?? 200);
const MAX_IMAGE_CHARS = 4_000_000;
const MAX_PROMPT_CHARS = 8_000;
const MAX_MESSAGES = 20;
const MAX_SYSTEM_CHARS = 8_000;
const MAX_TOTAL_IMAGE_CHARS = 8_000_000;

export const maxDuration = 60;

type Body = {
  prompt?: unknown;
  transcript?: unknown;
  screenshot?: unknown;
  mediaType?: unknown;
  system?: unknown;
  messages?: unknown;
  maxTokens?: unknown;
};

class InvalidRequest extends Error {}

const asImageMediaType = (value: unknown): ImageMediaType =>
  IMAGE_MEDIA_TYPES.find((type) => type === value) ?? "image/jpeg";

/**
 * The desktop app sends Claude-shaped turns so it keeps its skill prompts and
 * conversation history; everything is re-validated here because a device token
 * is all a caller needs to reach this route.
 */
function parseMessages(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    throw new InvalidRequest("messages must be a non-empty array of at most 20 turns");
  }

  let imageBudget = MAX_TOTAL_IMAGE_CHARS;

  const messages = value.map((entry): AssistantMessage => {
    const raw = entry as { role?: unknown; content?: unknown };
    const role = raw.role === "assistant" ? "assistant" : "user";
    const blocks = Array.isArray(raw.content)
      ? raw.content
      : typeof raw.content === "string"
        ? [{ type: "text", text: raw.content }]
        : [];

    const content = blocks.flatMap((block): AssistantContent[] => {
      const candidate = block as {
        type?: unknown;
        text?: unknown;
        source?: { type?: unknown; media_type?: unknown; data?: unknown };
      };

      if (candidate.type === "text" && typeof candidate.text === "string") {
        const text = candidate.text.slice(0, MAX_PROMPT_CHARS);
        return text.trim() ? [{ type: "text", text }] : [];
      }

      if (candidate.type === "image" && typeof candidate.source?.data === "string") {
        const data = candidate.source.data;
        if (data.length > MAX_IMAGE_CHARS || data.length > imageBudget) {
          throw new InvalidRequest("Image is too large");
        }
        imageBudget -= data.length;
        return [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: asImageMediaType(candidate.source.media_type),
              data,
            },
          },
        ];
      }

      return [];
    });

    if (content.length === 0) throw new InvalidRequest("Every message needs usable content");
    return { role, content };
  });

  if (messages[0].role !== "user") {
    throw new InvalidRequest("The conversation must start with a user turn");
  }
  return messages;
}

function parseBrowserPayload(body: Body): AssistantMessage[] {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : "";
  const transcript =
    typeof body.transcript === "string" ? body.transcript.trim().slice(0, MAX_PROMPT_CHARS) : "";
  const screenshot = typeof body.screenshot === "string" ? body.screenshot : "";

  if (!prompt && !transcript && !screenshot) {
    throw new InvalidRequest("Nothing to answer yet");
  }
  if (screenshot.length > MAX_IMAGE_CHARS) {
    throw new InvalidRequest("Screenshot is too large");
  }

  const content: AssistantContent[] = [];
  if (screenshot) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: asImageMediaType(body.mediaType), data: screenshot },
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

  return [{ role: "user", content }];
}

export async function POST(request: Request): Promise<Response> {
  // Browser clients carry the session cookie, the desktop app carries a device
  // token, so neither ever needs an Anthropic key of its own.
  const account = (await getSession()) ?? (await authenticateDevice(request));
  if (!account) {
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

  let messages: AssistantMessage[];
  try {
    messages = body.messages === undefined ? parseBrowserPayload(body) : parseMessages(body.messages);
  } catch (error) {
    if (error instanceof InvalidRequest) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const used = await countRequestsToday(account.userId);
  if (used >= DAILY_REQUEST_LIMIT) {
    return Response.json(
      { error: `Daily limit of ${DAILY_REQUEST_LIMIT} answers reached. Try again tomorrow.` },
      { status: 429 }
    );
  }

  const [settings, documents] = await Promise.all([
    getSettings(account.userId),
    getDocumentContents(account.userId),
  ]);
  const model = MODELS.some((entry) => entry.id === settings.model)
    ? settings.model
    : MODELS[0].id;

  const basePrompt =
    typeof body.system === "string" ? body.system.slice(0, MAX_SYSTEM_CHARS) : undefined;
  const maxTokens = typeof body.maxTokens === "number" ? body.maxTokens : undefined;

  await recordRequest(account.userId);

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        for await (const delta of streamAnswer({
          model,
          system: composeSystemPrompt(documents, basePrompt),
          messages,
          maxTokens,
          signal: controller.signal,
        })) {
          streamController.enqueue(encoder.encode(delta));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("assistant stream failed", error);
          streamController.enqueue(
            encoder.encode("\n\n[error] Claude could not finish this answer. Try again.")
          );
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

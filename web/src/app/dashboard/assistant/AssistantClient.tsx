"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
};
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const TRANSCRIPT_LIMIT = 12;

const subscribeNever = () => () => {};
const speechSupportedInBrowser = () =>
  Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
// Assume support while rendering on the server so the warning never flashes.
const speechSupportedOnServer = () => true;

export function AssistantClient({ model }: { model: string }) {
  const [sharing, setSharing] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const speechSupported = useSyncExternalStore(
    subscribeNever,
    speechSupportedInBrowser,
    speechSupportedOnServer
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const transcriptRef = useRef<string[]>([]);
  const inFlightRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<{ id: string; startedAt: number; utterances: number; answers: number } | null>(
    null
  );

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.videoWidth === 0) return null;

    const scale = Math.min(1, 1280 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7).split(",")[1] ?? null;
  }, []);

  const ask = useCallback(
    async (prompt: string, spokenContext: string[]) => {
      // A newer question always supersedes whatever is still streaming.
      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;

      setThinking(true);
      setError(null);
      setAnswer("");

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            prompt,
            transcript: spokenContext.join("\n"),
            screenshot: captureFrame(),
          }),
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "The assistant could not answer that.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setAnswer(text);
        }

        if (sessionRef.current) sessionRef.current.answers += 1;
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError((caught as Error).message);
        }
      } finally {
        if (inFlightRef.current === controller) {
          inFlightRef.current = null;
          setThinking(false);
        }
      }
    },
    [captureFrame]
  );

  const startSession = useCallback(async () => {
    if (sessionRef.current) return;
    try {
      const response = await fetch("/api/assistant/session", { method: "POST" });
      if (!response.ok) return;
      const payload = (await response.json()) as { sessionId: string };
      sessionRef.current = {
        id: payload.sessionId,
        startedAt: Date.now(),
        utterances: 0,
        answers: 0,
      };
    } catch {
      // Session metadata is best-effort; never block answering on it.
    }
  }, []);

  const endSession = useCallback(() => {
    const active = sessionRef.current;
    if (!active) return;
    sessionRef.current = null;

    const payload = JSON.stringify({
      sessionId: active.id,
      durationSeconds: Math.round((Date.now() - active.startedAt) / 1000),
      utteranceCount: active.utterances,
      answerCount: active.answers,
      ended: true,
    });

    void fetch("/api/assistant/session", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSharing(false);
  }, []);

  const startSharing = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", stopSharing, { once: true });
      setSharing(true);
      await startSession();
    } catch (caught) {
      setError(
        (caught as Error).name === "NotAllowedError"
          ? "Screen sharing permission was denied."
          : "Could not start screen sharing."
      );
    }
  }, [startSession, stopSharing]);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    try {
      // Prompt for the mic explicitly so the permission state is obvious.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((track) => track.stop());
    } catch {
      setError("Microphone permission was denied.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result.isFinal) continue;
        const text = result[0].transcript.trim();
        if (!text) continue;

        if (sessionRef.current) sessionRef.current.utterances += 1;
        transcriptRef.current = [...transcriptRef.current, text].slice(-TRANSCRIPT_LIMIT);
        setTranscript(transcriptRef.current);
        void ask(text, transcriptRef.current);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone permission was denied.");
        stopListening();
      }
    };

    // Chrome ends recognition on silence; restart while the user wants to listen.
    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          stopListening();
        }
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    recognition.start();
    setListening(true);
    await startSession();
  }, [ask, startSession, stopListening]);

  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
      listeningRef.current = false;
      recognitionRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      endSession();
    };
  }, [endSession]);

  return (
    <div className="flex flex-col gap-6">
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          className={sharing ? "btn btn-secondary" : "btn btn-primary"}
          onClick={sharing ? stopSharing : startSharing}
        >
          {sharing ? "Stop sharing" : "Share screen"}
        </button>
        <button
          type="button"
          className={listening ? "btn btn-secondary" : "btn btn-primary"}
          onClick={listening ? stopListening : startListening}
          disabled={!speechSupported}
        >
          {listening ? "Stop listening" : "Start listening"}
        </button>
        <span className="text-xs text-[var(--muted)]">
          {model} · screen {sharing ? "on" : "off"} · mic {listening ? "on" : "off"}
        </span>
      </div>

      {!speechSupported ? (
        <p className="panel p-4 text-sm text-amber-300">
          Live transcription uses the browser speech API, which only Chrome and Edge implement. You
          can still share your screen and type a question.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="panel border-red-500/40 p-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = question.trim();
          if (!text) return;
          setQuestion("");
          void ask(text, transcript);
        }}
      >
        <input
          className="input flex-1"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about what's on screen…"
        />
        <button type="submit" className="btn btn-primary" disabled={thinking}>
          {thinking ? "Answering…" : "Ask"}
        </button>
      </form>

      <section className="panel min-h-40 p-6">
        <h2 className="text-sm font-medium text-[var(--muted)]">Answer</h2>
        {answer ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            {thinking ? "Thinking…" : "Answers stream here as questions are asked."}
          </p>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-medium text-[var(--muted)]">Transcript (this tab only)</h2>
        {transcript.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Nothing heard yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {transcript.map((line, index) => (
              <li key={`${index}-${line.slice(0, 12)}`}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <video ref={videoRef} className="sr-only" muted playsInline />
    </div>
  );
}

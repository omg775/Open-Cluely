"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/actions/dashboard";
import { updateAnthropicKey, updateModel, uploadDocument } from "@/app/actions/dashboard";

const INITIAL: ActionState = { error: null, message: null };

function Status({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-400">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return <p className="text-sm text-emerald-400">{state.message}</p>;
  }
  return null;
}

export function ApiKeyForm({ maskedKey }: { maskedKey: string | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateAnthropicKey,
    INITIAL
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm">
        Anthropic API key
        <input
          className="input font-mono"
          type="password"
          name="anthropicKey"
          placeholder={maskedKey ? `Saved: ${maskedKey}` : "sk-ant-…"}
          autoComplete="off"
        />
      </label>
      <p className="text-xs text-[var(--muted)]">
        Encrypted at rest and only handed to your desktop app during launch.
      </p>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save key"}
        </button>
        {maskedKey ? (
          <button
            type="submit"
            name="intent"
            value="remove"
            className="btn btn-secondary"
            disabled={pending}
          >
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function ModelForm({
  model,
  models,
}: {
  model: string;
  models: readonly { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateModel, INITIAL);
  // React resets uncontrolled fields when the action returns, which would show
  // the pre-submit model until the revalidated prop arrives.
  const [selected, setSelected] = useState(model);
  const [savedModel, setSavedModel] = useState(model);
  if (model !== savedModel) {
    setSavedModel(model);
    setSelected(model);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm">
        Model
        <select
          className="input"
          name="model"
          value={selected}
          onChange={event => setSelected(event.target.value)}
        >
          {models.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <Status state={state} />
      <button type="submit" className="btn btn-primary self-start" disabled={pending}>
        {pending ? "Saving…" : "Save model"}
      </button>
    </form>
  );
}

export function DocumentUploadForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadDocument,
    INITIAL
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm">
        Add a document
        <input
          className="input"
          type="file"
          name="document"
          accept=".txt,.md,.markdown,.csv,.json,text/plain"
          required
        />
      </label>
      <p className="text-xs text-[var(--muted)]">
        Plain text or markdown, up to 200 KB. These are the only contents we store, and only because
        you uploaded them.
      </p>
      <Status state={state} />
      <button type="submit" className="btn btn-primary self-start" disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/actions/dashboard";
import { updateModel, uploadDocument } from "@/app/actions/dashboard";

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

export function ModelForm({
  model,
  models,
}: {
  model: string;
  models: readonly { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateModel, INITIAL);
  const [selected, setSelected] = useState(model);
  const [savedModel, setSavedModel] = useState(model);
  if (model !== savedModel) {
    setSavedModel(model);
    setSelected(model);
  }

  // The select sits outside the form: submitting resets the form's own fields,
  // and a reset select falls back to the option React marked at mount rather
  // than the one just chosen. The hidden input carries the choice instead.
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm">
        Model
        <select
          className="input"
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
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="model" value={selected} readOnly />
        <Status state={state} />
        <button type="submit" className="btn btn-primary self-start" disabled={pending}>
          {pending ? "Saving…" : "Save model"}
        </button>
      </form>
    </div>
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

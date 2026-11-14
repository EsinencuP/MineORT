"use client";

import { useActionState } from "react";
import {
  createInvitationAction,
  type CreateInvitationState,
} from "@/app/actions/admin";
import { Button } from "@/components/ui/button";

/** Shows the invitation link once; the token is never stored or placed in a URL. */
export function CreateInvitationForm({ origin }: { origin: string }) {
  const [state, action, pending] = useActionState<
    CreateInvitationState,
    FormData
  >(createInvitationAction, null);
  const link = state?.token ? `${origin}/invite/${state.token}` : null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <Button type="submit" disabled={pending} className="self-start">
        Создать приглашение
      </Button>
      {state?.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      {link && (
        <div role="status" className="border-line rounded-lg border p-3">
          <p className="mb-1 text-sm font-medium">
            Ссылка показана один раз, скопируйте её сейчас:
          </p>
          <input
            readOnly
            value={link}
            aria-label="Ссылка-приглашение"
            className="border-line bg-paper text-ink min-h-11 w-full rounded-lg border px-3 font-mono text-sm"
          />
        </div>
      )}
    </form>
  );
}

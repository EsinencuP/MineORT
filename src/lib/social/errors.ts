/** Stable error codes of the Social module; user texts live in access/messages.ts. */
export class SocialError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

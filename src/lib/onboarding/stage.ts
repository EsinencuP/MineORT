/**
 * Derived onboarding_stage (docs/01-product/02-user-status-model.md, section 8) and the main CTA
 * per stage (docs/01-product/01-information-architecture.md, section 4). Pure and easy to test.
 * The stage is computed from independent dimensions; it is never stored.
 */
export type OnboardingStage =
  | "guest"
  | "restricted"
  | "application_rejected"
  | "needs_rules"
  | "needs_nick"
  | "application_pending"
  | "needs_access"
  | "access_preparing"
  | "ready_to_install"
  | "first_login_pending"
  | "active";

export type StageInput = {
  signedIn: boolean;
  accountStatus: string | null;
  membership: "pending" | "approved" | "suspended" | "revoked" | null;
  lastApplication: { status: string; decidedAt: string | null } | null;
  rulesAccepted: boolean;
  hasNick: boolean;
  whitelist: { desired: string; applied: string } | null;
  gameIdentity: "unconfirmed" | "confirmed" | null;
  firstLoginStarted: boolean;
  now?: number;
};

export const REAPPLY_AFTER_MS = 7 * 24 * 3600_000;

export function computeStage(i: StageInput): OnboardingStage {
  const now = i.now ?? Date.now();
  if (!i.signedIn) return "guest";

  const rejected = i.lastApplication?.status === "rejected";
  if (
    i.accountStatus === "suspended" ||
    i.accountStatus === "banned" ||
    i.membership === "suspended" ||
    (i.membership === "revoked" && !rejected)
  ) {
    return "restricted";
  }

  const decided = i.lastApplication?.decidedAt
    ? Date.parse(i.lastApplication.decidedAt)
    : 0;
  if (
    rejected &&
    i.membership !== "approved" &&
    now - decided < REAPPLY_AFTER_MS
  ) {
    return "application_rejected";
  }

  if (!i.rulesAccepted && i.membership !== "approved") return "needs_rules";
  if (!i.hasNick) return "needs_nick";
  if (i.lastApplication?.status === "pending" || i.membership === "pending")
    return "application_pending";
  if (i.membership !== "approved") return "needs_access";

  const applied =
    i.whitelist?.desired === "on" && i.whitelist.applied === "applied";
  if (!applied) return "access_preparing";
  if (i.gameIdentity === "confirmed") return "active";
  return i.firstLoginStarted ? "first_login_pending" : "ready_to_install";
}

export type Cta = {
  label: string;
  href: string;
  secondary?: { label: string; href: string };
};

export function ctaFor(stage: OnboardingStage): Cta {
  switch (stage) {
    case "guest":
      return {
        label: "Начать играть",
        href: "/login?return_to=/onboarding/minecraft",
        secondary: { label: "О проекте", href: "/#about" },
      };
    case "restricted":
      return { label: "Доступ ограничен", href: "/dashboard" };
    case "application_rejected":
      return {
        label: "Заявка отклонена",
        href: "/dashboard",
        secondary: { label: "Как играть", href: "/guide" },
      };
    case "needs_rules":
      return {
        label: "Принять правила",
        href: "/onboarding/minecraft",
        secondary: { label: "Читать правила", href: "/rules" },
      };
    case "needs_nick":
      return {
        label: "Указать ник и получить доступ",
        href: "/onboarding/minecraft",
      };
    case "needs_access":
      return {
        label: "Продолжить регистрацию",
        href: "/onboarding/minecraft",
        secondary: { label: "Изучить инструкции", href: "/guide" },
      };
    case "application_pending":
      return {
        label: "Заявка на рассмотрении",
        href: "/dashboard",
        secondary: { label: "Изучить инструкции", href: "/guide" },
      };
    case "access_preparing":
      return {
        label: "Доступ подготавливается",
        href: "/start",
        secondary: { label: "Статус в кабинете", href: "/dashboard" },
      };
    case "ready_to_install":
      return { label: "Установить сборку и подключиться", href: "/start" };
    case "first_login_pending":
      return {
        label: "Подтвердить первый вход",
        href: "/start",
        secondary: { label: "Не получается войти", href: "/guide" },
      };
    case "active":
      return {
        label: "Как подключиться",
        href: "/guide",
        secondary: { label: "Личный кабинет", href: "/dashboard" },
      };
  }
}

/** Server address and "you can connect" may be shown only in these stages (applied_state = applied). */
export const CAN_CONNECT: ReadonlySet<OnboardingStage> = new Set([
  "ready_to_install",
  "first_login_pending",
  "active",
]);

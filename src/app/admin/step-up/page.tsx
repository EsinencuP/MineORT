import type { Metadata } from "next";
import { stepUpAction } from "@/app/actions/staff";
import { isStepUpFresh } from "@/lib/admin/store";
import { requireStaff } from "@/lib/auth/guards";
import { safeReturnTo } from "@/lib/auth/session-policy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Подтверждение" };

export default async function StepUpPage({
  searchParams,
}: PageProps<"/admin/step-up">) {
  const user = await requireStaff();
  const sp = await searchParams;
  const back = safeReturnTo(
    typeof sp.return_to === "string" ? sp.return_to : "/admin",
  );
  const fresh = isStepUpFresh(user.stepUpUntil);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Подтверждение действия</h1>
      <Notice error={sp.error} />
      <Card className="flex flex-col gap-4">
        <p>
          {fresh
            ? "Подтверждение ещё действует. Можно ввести новый код, чтобы продлить его."
            : "Это действие критичное. Введите код из приложения-аутентификатора: он действует 15 минут."}
        </p>
        <form action={stepUpAction} className="flex flex-col gap-3">
          <input type="hidden" name="return_to" value={back} />
          <Field
            name="code"
            label="Код из приложения"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          <Button type="submit" className="self-start">
            Подтвердить
          </Button>
        </form>
      </Card>
    </>
  );
}

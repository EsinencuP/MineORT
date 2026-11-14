"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function KitToastDemo() {
  const toast = useToast();
  return (
    <Button variant="secondary" onClick={() => toast("ok", "Сохранено")}>
      Показать уведомление
    </Button>
  );
}

import { ButtonLink } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">MineOrt IV</h1>
      <p className="text-ink-muted mt-3 max-w-prose text-lg">
        Сервер Minecraft для своих. Узнайте, как подключиться, и начните играть.
      </p>
      <div className="mt-6">
        <ButtonLink href="/start">Начать играть</ButtonLink>
      </div>
    </div>
  );
}

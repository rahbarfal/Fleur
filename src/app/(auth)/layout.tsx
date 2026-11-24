import { MeadowScene } from "./meadow-scene";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-white">
      <MeadowScene />
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}

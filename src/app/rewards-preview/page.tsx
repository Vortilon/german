import Image from "next/image";
import manifest from "@/lib/reward-manifest.json";

export const metadata = {
  title: "Reward images preview",
  robots: { index: false, follow: false },
};

function Section({
  title,
  paths,
}: {
  title: string;
  paths: readonly string[];
}) {
  if (!paths.length) {
    return (
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-bold text-[#f4d03f]">{title}</h2>
        <p className="text-sm text-white/70">No images yet. Run `npm run generate:rewards` with your API key.</p>
      </section>
    );
  }
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-bold text-[#f4d03f]">
        {title} ({paths.length})
      </h2>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {paths.map((src) => (
          <li
            key={src}
            className="overflow-hidden rounded-xl border border-white/10 bg-black/20"
          >
            <div className="relative aspect-square w-full bg-white/5">
              <Image
                src={src}
                alt=""
                fill
                className="object-contain"
                sizes="(max-width: 640px) 100vw, 33vw"
                unoptimized
              />
            </div>
            <p className="break-all p-2 font-mono text-xs text-white/80">{src}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function RewardsPreviewPage() {
  const generated =
    manifest.generatedAt && typeof manifest.generatedAt === "string"
      ? manifest.generatedAt
      : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-black text-white">Reward image assets</h1>
      <p className="mb-6 text-sm text-white/70">
        Files live under <code className="text-[#f4d03f]">public/rewards/</code>.
        {generated ? (
          <>
            {" "}
            Last generated:{" "}
            <time dateTime={generated}>{generated}</time>
          </>
        ) : null}
      </p>
      <Section title="Success" paths={manifest.success} />
      <Section title="Fail" paths={manifest.fail} />
    </main>
  );
}

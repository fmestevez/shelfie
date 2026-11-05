import ClientApp from "@/components/ClientApp";
import { WelcomeGate } from "@/components/WelcomeGate";
import { Credit } from "@/components/Credit";
import { REPO_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "GameApplication",
  operatingSystem: "Any (web browser with WebGL)",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://www.gnu.org/licenses/gpl-3.0.html",
  codeRepository: REPO_URL,
  featureList: [
    "Import a BoardGameGeek collection by username",
    "3D IKEA Kallax and Billy shelves",
    "Sort by game type, theme, mechanic, designer, publisher, series, colour, size, year, complexity or rating",
    "Upright, stacked or mixed box orientation with rows in depth",
    "Share links and image export",
  ],
};

export default function Page() {
  return (
    <>
      <ClientApp />
      <WelcomeGate>
        <section
          aria-labelledby="intro-title"
          className="pointer-events-none fixed inset-0 z-[5] flex items-start justify-center p-4 pt-16 md:left-80 md:items-center md:pt-4"
        >
          <div className="pointer-events-auto max-w-md rounded-2xl bg-neutral-950/80 p-6 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
            <h1 id="intro-title" className="text-2xl font-bold tracking-tight">
              See your board game collection on real shelves
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Shelfie loads your <strong>BoardGameGeek</strong> collection, works out every box size, and packs the
              games onto IKEA <strong>Kallax</strong> and <strong>Billy</strong> shelves in 3D, so you can plan your
              shelves before you buy them.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">
              <li>Sort by game type, theme, mechanic, designer, series or colour</li>
              <li>Stand boxes up, stack them, or mix both; use rows behind rows</li>
              <li>Fix box sizes, add or remove games, share a link or export an image</li>
            </ul>
            <p className="mt-4 text-sm text-amber-300">
              Enter your BoardGameGeek username in the panel to start, or try the demo collection.
            </p>
            <p className="mt-3 text-xs text-white/40">
              Free and{" "}
              <a href={REPO_URL} className="underline hover:text-white" rel="noopener">
                open source
              </a>
              . Not affiliated with BoardGameGeek or IKEA.
            </p>
            <Credit className="mt-1 text-xs text-white/40" />
          </div>
        </section>
      </WelcomeGate>
      <script
        type="application/ld+json"
        // Static, trusted data; escaping "<" keeps it from closing the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </>
  );
}

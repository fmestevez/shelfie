import { CREATOR_HANDLE, CREATOR_URL } from "@/lib/site";

/** "Created with ♥ by @theboardgamesfamily on Instagram". */
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      Created with{" "}
      <span className="text-red-400" aria-label="love">
        ♥
      </span>{" "}
      by{" "}
      <a href={CREATOR_URL} target="_blank" rel="noopener" className="underline hover:text-white">
        @{CREATOR_HANDLE}
      </a>{" "}
      on Instagram
    </p>
  );
}

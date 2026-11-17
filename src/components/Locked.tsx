import { family } from "@/config";

// What a stranger sees: the name, a polite line, and a place for the key.
export function Locked({
  next,
  wrong,
  wait = false,
}: {
  next: "/" | "/remote";
  wrong: boolean;
  wait?: boolean;
}) {
  const tv = next === "/";
  return (
    <div
      data-surface={tv ? "tv" : undefined}
      className="paper flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <h1 className={`font-masthead leading-none ${tv ? "text-[7rem]" : "text-5xl"}`}>
        {family.name}
      </h1>
      <div className={`rule-double mt-4 ${tv ? "w-[60rem]" : "w-full max-w-sm"}`} />
      <p className={`mt-6 text-ink-soft italic ${tv ? "text-[2.2rem]" : "text-xl"}`}>
        This screen belongs to one family.
      </p>
      <form
        method="post"
        action="/pair"
        className={`mt-10 flex flex-col items-center gap-4 ${tv ? "text-[2rem]" : "text-lg"}`}
      >
        <input type="hidden" name="next" value={next} />
        <label className="kicker" htmlFor="key">
          {wait
            ? "Too many tries lately. Try again in a little while."
            : wrong
              ? "That key didn’t fit. Try again."
              : "The family key"}
        </label>
        <input
          id="key"
          name="key"
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`border-b-2 border-rule bg-transparent text-center outline-none ${tv ? "w-[40rem] py-2" : "w-72 py-1"}`}
        />
        <button type="submit" className="kicker mt-2 border border-rule px-6 py-2">
          Come in
        </button>
      </form>
    </div>
  );
}

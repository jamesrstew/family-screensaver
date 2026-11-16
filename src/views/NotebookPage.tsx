import { Ink } from "@/components/Ink";
import { entryFor } from "@/lib/pick";
import { Credit, KIND_LABEL, Passage, SectionHead, sizeFor, type ViewProps } from "./parts";

export function NotebookPage({ snapshot, now }: ViewProps) {
  const item = entryFor(snapshot.notebook, now);
  return (
    <div className="flex h-full flex-col">
      <Ink order={0}>
        <SectionHead title="Ideas" snapshot={snapshot} now={now} />
      </Ink>
      <Ink k={item?.id ?? "none"} order={1} className="flex flex-1 items-center justify-center">
        {item ? (
          <article className="max-w-[86rem]">
            <p className="kicker mb-6 text-center text-[1.7rem]">{KIND_LABEL[item.kind]}</p>
            <Passage item={item} className={sizeFor(item.text, "page")} />
            <Credit item={item} className="mt-8 text-right text-[1.6rem]" />
          </article>
        ) : (
          <p className="text-[3rem] text-ink-soft italic">The notebook is empty today.</p>
        )}
      </Ink>
    </div>
  );
}

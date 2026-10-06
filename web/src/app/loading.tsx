import { Page } from "@/components/journal";

/** While a page is fetched: the shape of a journal page, its lines still faint. */
export default function Loading() {
  return (
    <Page>
      <div role="status" aria-label="Loading" className="animate-pulse space-y-5 motion-reduce:animate-none">
        <div className="h-3 w-28 rounded-full bg-paper/10" />
        <div className="h-11 w-4/5 rounded-md bg-paper/10" />
        <div className="h-11 w-3/5 rounded-md bg-paper/10" />
        <div className="space-y-2.5 pt-2">
          <div className="h-3.5 w-full rounded-full bg-paper/[0.07]" />
          <div className="h-3.5 w-11/12 rounded-full bg-paper/[0.07]" />
          <div className="h-3.5 w-2/3 rounded-full bg-paper/[0.07]" />
        </div>
      </div>
    </Page>
  );
}

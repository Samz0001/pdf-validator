import { FileType2, Image, LayoutTemplate, Link2, ScanText, ShieldCheck, Table2, Type } from "lucide-react";

const ITEMS = [
  { Icon: ScanText, title: "Text & content", text: "Missing, extra and changed lines, spelling, unfilled {{placeholders}}." },
  { Icon: Type, title: "Formatting", text: "Font family, size, weight and colour per line." },
  { Icon: LayoutTemplate, title: "Layout", text: "Alignment, spacing, margins and position shifts." },
  { Icon: Table2, title: "Tables & forms", text: "Table shape and cells, form fields, bookmarks." },
  { Icon: Image, title: "Images & visuals", text: "Replaced, stretched or low-resolution images, pixel diff." },
  { Icon: Link2, title: "Hyperlinks", text: "Missing, changed and malformed link targets." },
  { Icon: FileType2, title: "Data formats", text: "Dates, amounts, emails, phone, GSTIN and PAN." },
  { Icon: ShieldCheck, title: "Compliance", text: "Accessibility, JavaScript, attachments, PDF/A, custom rules." },
];

/** What a comparison checks — shown under the upload form before the first run. */
export default function Capabilities() {
  return (
    <section>
      <div className="mb-3 text-sm font-semibold text-white">What every comparison checks</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map(({ Icon, title, text }) => (
          <div key={title} className="card !p-4">
            <span className="mb-2 grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/15 text-indigo-400"><Icon className="h-4 w-4" /></span>
            <div className="text-sm font-semibold text-white">{title}</div>
            <div className="mt-0.5 text-xs text-slate-400">{text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

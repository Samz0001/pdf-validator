import type { Category } from "./types";

/** Plain-language help for each issue type: what it means, why it matters and how to fix it. */
export interface Explanation {
  title: string;
  meaning: string;
  fix: string;
}

export const EXPLAIN: Record<Category, Explanation> = {
  text_missing: {
    title: "Text is missing",
    meaning: "This text is in the reference but was not found in the candidate. It may have been deleted or reworded beyond recognition.",
    fix: "Restore the missing text, or confirm it was removed on purpose.",
  },
  text_extra: {
    title: "Extra text added",
    meaning: "The candidate contains text that is not in the reference.",
    fix: "Remove the added text, or confirm the addition is intended.",
  },
  text_changed: {
    title: "Text was changed",
    meaning: "This line exists in both documents but the wording differs.",
    fix: "Compare the two versions and correct any unintended edit.",
  },
  font: {
    title: "Different font",
    meaning: "The typeface here does not match the reference, so the document may look inconsistent.",
    fix: "Apply the reference font to this text.",
  },
  font_size: {
    title: "Different font size",
    meaning: "The text is bigger or smaller than in the reference.",
    fix: "Set the font size back to the reference value.",
  },
  color: {
    title: "Different text colour",
    meaning: "The text colour does not match the reference.",
    fix: "Use the reference colour, or confirm this is a brand-approved change.",
  },
  alignment: {
    title: "Alignment changed",
    meaning: "The text is aligned differently (left, centre or right) from the reference.",
    fix: "Restore the reference alignment.",
  },
  spacing: {
    title: "Line spacing changed",
    meaning: "The gap between this line and the one above it differs from the reference. Everything below may shift as a result.",
    fix: "Restore the original spacing or paragraph gap.",
  },
  margin: {
    title: "Page margin changed",
    meaning: "The content area on this page starts or ends at a different distance from the page edge.",
    fix: "Reset the page margins to match the reference.",
  },
  position: {
    title: "Text has moved",
    meaning: "This text sits in a different spot than in the reference.",
    fix: "Move the text back to its original position.",
  },
  page_structure: {
    title: "Page structure differs",
    meaning: "Page count, size or rotation does not match the reference.",
    fix: "Check for added or removed pages and confirm the page size.",
  },
  visual: {
    title: "Visual difference",
    meaning: "This area looks different when the pages are compared as images, but no specific text cause was found. It may be a graphic, line, shading or logo.",
    fix: "Open the Diff heatmap view to see exactly what changed.",
  },
  link: {
    title: "Link changed",
    meaning: "The clickable link points somewhere different from the reference. A wrong or insecure (http) link can send readers to the wrong place.",
    fix: "Correct the link target.",
  },
  placeholder: {
    title: "Unfilled placeholder",
    meaning: "A template field such as [NAME] or {{date}} was left in the document instead of real data.",
    fix: "Replace the placeholder with the actual value.",
  },
  data_format: {
    title: "Data format differs",
    meaning: "A date, amount, email, phone number or ID is written in a different format from the reference.",
    fix: "Reformat the value to match the reference style.",
  },
  spelling: {
    title: "Possible spelling mistake",
    meaning: "A word in the newly added text is not in the dictionary. Names and technical terms can be false alarms.",
    fix: "Fix the typo, or ignore it if the word is correct.",
  },
  table: {
    title: "Table cell differs",
    meaning: "A value inside a table does not match the reference table.",
    fix: "Check the cell value and correct it.",
  },
  image: {
    title: "Image problem",
    meaning: "An image was replaced, stretched or is low resolution compared with the reference.",
    fix: "Use the original image at its correct proportions and resolution.",
  },
  accessibility: {
    title: "Accessibility gap",
    meaning: "Screen-reader users may struggle here, for example missing tags, document language, alt text or low contrast.",
    fix: "Add the missing accessibility information.",
  },
  security: {
    title: "Security risk",
    meaning: "The file contains something risky such as JavaScript, auto-launch actions, attachments or leaked metadata.",
    fix: "Remove the risky element before sharing this PDF.",
  },
  outline: {
    title: "Bookmarks differ",
    meaning: "The document's bookmark outline does not match the reference.",
    fix: "Rebuild the bookmarks to match the reference.",
  },
  form_field: {
    title: "Form field differs",
    meaning: "A fillable form field is missing, added or changed.",
    fix: "Restore the form field to match the reference.",
  },
  rule: {
    title: "Custom rule broken",
    meaning: "One of your must / must-not rules was violated.",
    fix: "Update the document so it satisfies the rule.",
  },
};

export const SEVERITY_NOTE = {
  critical: "Critical — serious; the document fails until this is fixed.",
  major: "Major — clearly visible; should be reviewed.",
  minor: "Minor — small deviation; low risk.",
} as const;

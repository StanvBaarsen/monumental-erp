import type { Procurement } from "./types";

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  return rows;
}

export function normProcurement(v: string): Procurement {
  const s = v.toLowerCase().trim();
  if (s.includes("laser") || s.includes("bent")) return "laser";
  if (s.includes("print") || s.includes("3d")) return "3d-print";
  if (s.includes("long")) return "long-lead";
  if (s.includes("custom") || s.includes("machin")) return "custom";
  return "off-shelf";
}

export const parseNumber = (raw: string): number => Number(raw.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;

/** Map a header cell to a canonical field name, or undefined if unrecognised. */
export function headerField<T extends string>(map: Record<string, T>, header: string): T | undefined {
  return map[header.toLowerCase().trim()];
}

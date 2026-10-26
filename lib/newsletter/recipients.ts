export type RecipientStatus = "valid" | "invalid";

export type ParsedRecipient = {
  email: string;
  name: string;
  status: RecipientStatus;
  reason: string;
};

export type RecipientParseResult = {
  recipients: ParsedRecipient[];
  validCount: number;
  invalidCount: number;
  emailHeader: string;
  nameHeader: string | null;
};

const EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isEmailAddress(value: string) {
  const email = value.trim();
  return email.length <= 254 && EMAIL.test(email);
}

function asCell(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export function recipientNameFromCell(value: unknown) {
  return asCell(value);
}

function headerLooksLikeEmail(value: string) {
  return /e-?mail/i.test(value);
}

function nameScore(value: string) {
  if (/e-?mail/i.test(value) || /user\s*name/i.test(value)) return 0;
  if (/^name$/i.test(value.trim())) return 3;
  if (/full\s*name|first\s*name|recipient\s*name|contact\s*name/i.test(value)) return 2;
  if (/name/i.test(value)) return 1;
  return 0;
}

function columnLabel(index: number) {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return `Column ${label}`;
}

function firstEmailColumn(rows: string[][]) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  for (let index = 0; index < width; index += 1) {
    if (rows.some((row) => isEmailAddress((row[index] ?? "").replace(/^mailto:/i, "").trim()))) {
      return index;
    }
  }
  return -1;
}

export function classifyRecipientRows(matrix: unknown[][]): RecipientParseResult {
  const rows = matrix
    .map((row) => (Array.isArray(row) ? row.map(asCell) : []))
    .filter((row) => row.some((cell) => cell !== ""));

  if (rows.length === 0) {
    return {
      recipients: [],
      validCount: 0,
      invalidCount: 0,
      emailHeader: "Email",
      nameHeader: null,
    };
  }

  const header = rows[0];
  const hasHeader = header.some(headerLooksLikeEmail);
  const data = hasHeader ? rows.slice(1) : rows;
  let emailIndex = hasHeader ? header.findIndex(headerLooksLikeEmail) : firstEmailColumn(data);
  if (emailIndex < 0) emailIndex = 0;

  let nameIndex: number | null = null;
  if (hasHeader) {
    let bestScore = 0;
    header.forEach((cell, index) => {
      if (index === emailIndex) return;
      const score = nameScore(cell);
      if (score > bestScore) {
        bestScore = score;
        nameIndex = index;
      }
    });
  }

  const seen = new Set<string>();
  const recipients: ParsedRecipient[] = [];
  for (const row of data) {
    const rawEmail = (row[emailIndex] ?? "").replace(/^mailto:/i, "").trim();
    const name = nameIndex === null ? "" : recipientNameFromCell(row[nameIndex] ?? "");
    if (!rawEmail && !name) continue;
    if (!rawEmail) {
      recipients.push({ email: "", name, status: "invalid", reason: "Missing email" });
      continue;
    }
    if (!isEmailAddress(rawEmail)) {
      recipients.push({ email: rawEmail, name, status: "invalid", reason: "Invalid email" });
      continue;
    }
    const key = rawEmail.toLowerCase();
    if (seen.has(key)) {
      recipients.push({ email: rawEmail, name, status: "invalid", reason: "Duplicate" });
      continue;
    }
    seen.add(key);
    recipients.push({ email: rawEmail, name, status: "valid", reason: "" });
  }

  const validCount = recipients.filter((row) => row.status === "valid").length;
  return {
    recipients,
    validCount,
    invalidCount: recipients.length - validCount,
    emailHeader: hasHeader && header[emailIndex] ? header[emailIndex] : columnLabel(emailIndex),
    nameHeader: nameIndex === null ? null : header[nameIndex] || columnLabel(nameIndex),
  };
}

const EMPTY_PARSE: RecipientParseResult = {
  recipients: [],
  validCount: 0,
  invalidCount: 0,
  emailHeader: "Email",
  nameHeader: null,
};

// A workbook often keeps a short first sheet and the full list on the next one.
// Merge every sheet. The first valid copy of an email wins.
export function combineRecipientParses(parts: RecipientParseResult[]) {
  const present = parts.filter((part) => part.recipients.length > 0);
  if (present.length === 0) return EMPTY_PARSE;
  if (present.length === 1) return present[0];
  const seen = new Set<string>();
  const recipients: ParsedRecipient[] = [];
  let emailHeader = "Email";
  let nameHeader: string | null = null;
  for (const part of present) {
    if (part.emailHeader && part.emailHeader !== "Email") emailHeader = part.emailHeader;
    if (part.nameHeader) nameHeader = part.nameHeader;
    for (const row of part.recipients) {
      const key = row.email.trim().toLowerCase();
      if (row.status === "valid" && key) {
        if (seen.has(key)) {
          recipients.push({ ...row, status: "invalid", reason: "Duplicate" });
          continue;
        }
        seen.add(key);
      }
      recipients.push(row);
    }
  }
  const validCount = recipients.filter((row) => row.status === "valid").length;
  return {
    recipients,
    validCount,
    invalidCount: recipients.length - validCount,
    emailHeader,
    nameHeader,
  };
}

type WorkbookSheet = {
  ["!ref"]?: string;
  [cell: string]: unknown;
};

// sheet_to_json stops at !ref. Some files set that range to a short preview
// while the rest of the cells are still in the sheet.
export function expandSheetRef(sheet: WorkbookSheet, decode: (address: string) => { r: number; c: number }, encode: (range: { s: { r: number; c: number }; e: { r: number; c: number } }) => string) {
  let minRow = Number.POSITIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  let maxCol = -1;
  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!")) continue;
    let cell: { r: number; c: number };
    try {
      cell = decode(key);
    } catch {
      continue;
    }
    minRow = Math.min(minRow, cell.r);
    minCol = Math.min(minCol, cell.c);
    maxRow = Math.max(maxRow, cell.r);
    maxCol = Math.max(maxCol, cell.c);
  }
  if (maxRow < 0) return;
  sheet["!ref"] = encode({ s: { r: minRow, c: minCol }, e: { r: maxRow, c: maxCol } });
}

export async function parseRecipientFile(file: File) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    throw new Error("Attach an .xlsx, .xls, or .csv file.");
  }
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  if (!workbook.SheetNames.length) throw new Error("That file has no sheets.");
  const parts = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName] as WorkbookSheet | undefined;
    if (!sheet) return EMPTY_PARSE;
    expandSheetRef(sheet, XLSX.utils.decode_cell, XLSX.utils.encode_range);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    return classifyRecipientRows(matrix);
  });
  return combineRecipientParses(parts);
}

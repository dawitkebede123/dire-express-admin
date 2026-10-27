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

// Headers are matched after trim, so "name " is the name column label and is not a contact.
const HEADER_LABEL =
  /^(?:e-?mail(?:\s+(?:address|id))?|mail|ኢሜይል|ኢሜል|name|full\s+name|first\s+name|last\s+name|company(?:\s+name)?|contact(?:\s+name)?|recipient(?:\s+name)?|ስም|organization|organisation|phone|telephone|mobile|tel|address|city|country|notes?|comments?|id|no|#|number)$/i;

const EMAIL_HEADER = /^(?:e-?mail(?:\s+(?:address|id))?|mail|ኢሜይል|ኢሜል)$/i;

function emailsInCell(value: string) {
  const emails: string[] = [];
  for (const piece of value.split(/[,;/\s]+/)) {
    const token = piece
      .replace(/^mailto:/i, "")
      .replace(/^[<"'(]+|[>"')]+$/g, "")
      .trim()
      .toLowerCase();
    // Realtime Database accepts an email string longer than 3 and at most 200.
    if (token.length > 3 && token.length <= 200 && isEmailAddress(token)) emails.push(token);
  }
  return emails;
}

function isHeaderRow(row: string[]) {
  const filled = row.filter((cell) => cell !== "");
  if (!filled.length) return false;
  if (filled.some((cell) => cell.includes("@"))) return false;
  return filled.every((cell) => HEADER_LABEL.test(cell));
}

function finishParse(
  recipients: ParsedRecipient[],
  emailHeader: string,
  nameHeader: string | null,
): RecipientParseResult {
  const validCount = recipients.filter((row) => row.status === "valid").length;
  return {
    recipients,
    validCount,
    invalidCount: recipients.length - validCount,
    emailHeader,
    nameHeader,
  };
}

// Each row is read on its own. Whichever cell is an email address is the address,
// and the other non-empty cells are the name. A swapped column later in the sheet
// still imports. Header rows and blank rows are not counted as errors.
export function classifyRecipientRows(matrix: unknown[][]): RecipientParseResult {
  const rows = matrix
    .map((row) => (Array.isArray(row) ? row.map(asCell) : []))
    .filter((row) => row.some((cell) => cell !== ""));

  const seen = new Set<string>();
  const recipients: ParsedRecipient[] = [];
  let emailHeader = "per row";
  let nameHeader: string | null = null;

  for (const row of rows) {
    if (isHeaderRow(row)) {
      const emailLabel = row.find((cell) => EMAIL_HEADER.test(cell));
      const nameLabel = row.find((cell) => cell !== emailLabel && HEADER_LABEL.test(cell));
      if (emailLabel) emailHeader = emailLabel;
      if (nameLabel) nameHeader = nameLabel;
      continue;
    }

    const emails: string[] = [];
    const nameParts: string[] = [];
    let invalidRaw = "";
    for (const cell of row) {
      if (!cell) continue;
      const found = emailsInCell(cell);
      if (found.length) {
        emails.push(...found);
        continue;
      }
      if (cell.includes("@")) {
        if (!invalidRaw) invalidRaw = cell;
        continue;
      }
      nameParts.push(cell);
    }
    const name = nameParts.join(" ").replace(/\s+/g, " ").trim().slice(0, 200);

    if (!emails.length) {
      if (!name && !invalidRaw) continue;
      if (invalidRaw) {
        recipients.push({
          email: invalidRaw.slice(0, 200),
          name,
          status: "invalid",
          reason: "invalid email",
        });
      } else {
        recipients.push({ email: "", name, status: "invalid", reason: "no email found" });
      }
      continue;
    }

    for (const email of emails) {
      if (seen.has(email)) {
        recipients.push({ email, name, status: "invalid", reason: "duplicate in file" });
        continue;
      }
      seen.add(email);
      recipients.push({ email, name, status: "valid", reason: "" });
    }
  }

  return finishParse(recipients, emailHeader, nameHeader);
}

export function countExistingSubscribers(existingEmails: Iterable<string>, recipients: ParsedRecipient[]) {
  const existing = new Set<string>();
  for (const email of existingEmails) {
    const key = email.trim().toLowerCase();
    if (key) existing.add(key);
  }
  let alreadyInList = 0;
  let toAdd = 0;
  const alreadyExamples: string[] = [];
  for (const row of recipients) {
    if (row.status !== "valid") continue;
    if (existing.has(row.email)) {
      alreadyInList += 1;
      if (alreadyExamples.length < 3) alreadyExamples.push(row.email);
    } else {
      toAdd += 1;
    }
  }
  return { toAdd, alreadyInList, alreadyExamples };
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
          recipients.push({ ...row, status: "invalid", reason: "duplicate in file" });
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

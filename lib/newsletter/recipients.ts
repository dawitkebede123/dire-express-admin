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

export async function parseRecipientFile(file: File) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    throw new Error("Attach an .xlsx, .xls, or .csv file.");
  }
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("That file has no sheets.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return classifyRecipientRows(matrix);
}

export class GmailTokenExpired extends Error {
  constructor() {
    super("Gmail access expired.");
    this.name = "GmailTokenExpired";
  }
}

export function isTokenExpired(error: unknown) {
  return error instanceof GmailTokenExpired || (error instanceof Error && error.name === "GmailTokenExpired");
}

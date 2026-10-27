// Latin letters become Title Case. Amharic and other scripts are left as written.
export function toTitleCaseName(value: string) {
  const cleaned = value.replace(/[\r\n]+/g, " ").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((word) => {
      let seenLetter = false;
      let next = "";
      for (const char of word) {
        if (!/[A-Za-z]/.test(char)) {
          next += char;
          continue;
        }
        next += seenLetter ? char.toLocaleLowerCase("en") : char.toLocaleUpperCase("en");
        seenLetter = true;
      }
      return next;
    })
    .join(" ")
    .slice(0, 200);
}

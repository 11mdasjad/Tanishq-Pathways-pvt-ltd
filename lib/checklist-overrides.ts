export type ChecklistOverride = {country: string; visa: string; documents: string};

export function checklistOverrides(rows: ChecklistOverride[]): Record<string, string[]> {
  const entries: [string, string[]][] = [];
  const keys = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const country = row.country.trim();
    const visa = row.visa.trim();
    if (!country) throw new Error(`Checklist ${index + 1}: select a country or remove the unused checklist.`);
    const key = visa ? `${country}/${visa}` : country;
    if (keys.has(key)) throw new Error(`There is more than one checklist for ${key}. Combine the document names into one checklist.`);
    const documents = [...new Set(row.documents.split('\n').map(name => name.trim()).filter(Boolean))];
    if (!documents.length) throw new Error(`${key}: enter at least one document name or remove this checklist to use the default.`);
    if (documents.some(name => name.length > 80)) throw new Error(`${key}: each document name must be 80 characters or fewer.`);
    entries.push([key, documents]);
    keys.add(key);
  }
  return Object.fromEntries(entries);
}

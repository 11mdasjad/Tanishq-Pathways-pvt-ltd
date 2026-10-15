/** Safe readiness metadata: never exposes company signature or agreement text. */
export function agreementSetup(settings: Record<string, unknown>) {
  const fields = [
    ['companyName', 'Registered company name'],
    ['address', 'Registered company address'],
    ['email', 'Official email'],
    ['phone', 'Official phone'],
    ['signatory', 'Authorized signatory name'],
    ['designation', 'Signatory designation'],
    ['logoId', 'Official logo uploaded for agreements'],
    ['signatureId', 'Authorized company signature'],
    ['terms', 'Approved agreement terms'],
  ];
  const missing = fields.filter(([key]) => typeof settings[key] !== 'string' || !(settings[key] as string).trim()).map(([key, label]) => ({key, label}));
  if (settings.approved !== true) missing.push({key: 'approved', label: 'Admin confirmation of company details and template approval'});
  return {ready: missing.length === 0, missing};
}

/* eslint-disable @typescript-eslint/no-require-imports -- Firebase CLI exposes CommonJS modules. */
// Use the existing Firebase CLI account; never print tokens or OAuth secrets.
const { getProjectDefaultAccount } = require("firebase-tools/lib/auth");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { getAuthDomains, updateAuthDomains } = require("firebase-tools/lib/gcp/auth");
const { Client } = require("firebase-tools/lib/apiv2");
async function main() {
  const project = "gap-seam";
  const account = getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error("Firebase CLI login required");
  await requireAuth({ project, ...account, nonInteractive: true });
  const domains = await getAuthDomains(project);
  const domain = "my-web-app--gap-seam.us-east4.hosted.app";
  if (!domains.includes(domain)) await updateAuthDomains(project, [...domains, domain]);
  const client = new Client({ urlPrefix: "https://identitytoolkit.googleapis.com", auth: true });
  const provider = await client.get("/admin/v2/projects/gap-seam/defaultSupportedIdpConfigs/google.com");
  console.log(JSON.stringify({ authorizedDomain: domain, googleEnabled: provider.body.enabled === true }));
}
main().catch(() => { console.error("Firebase Google configuration check failed."); process.exitCode = 1; });

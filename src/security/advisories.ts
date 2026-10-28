import type { Advisory, AdvisoryDatabase } from "./architecture.js";
import { versionSatisfies } from "./semver.js";

export const LOCAL_ADVISORIES: Advisory[] = [
  {
    id: "GHSA-35jh-r3h4-6jhm",
    packageName: "lodash",
    ecosystem: "npm",
    vulnerableRange: "<4.17.21",
    severity: "high",
    cve: "CVE-2021-23337",
    cwe: "CWE-94",
    title: "Command injection in lodash template",
    url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
  },
  {
    id: "GHSA-xvch-5gv4-984h",
    packageName: "minimist",
    ecosystem: "npm",
    vulnerableRange: "<1.2.6",
    severity: "critical",
    cve: "CVE-2021-44906",
    cwe: "CWE-1321",
    title: "Prototype pollution in minimist",
    url: "https://github.com/advisories/GHSA-xvch-5gv4-984h",
  },
  {
    id: "GHSA-r683-h6q6-6jwh",
    packageName: "node-fetch",
    ecosystem: "npm",
    vulnerableRange: "<2.6.7",
    severity: "high",
    cve: "CVE-2022-0235",
    cwe: "CWE-601",
    title: "Forwarding of sensitive headers in node-fetch",
    url: "https://github.com/advisories/GHSA-r683-h6q6-6jwh",
  },
  {
    id: "GHSA-27h2-hvpr-p9p7",
    packageName: "jsonwebtoken",
    ecosystem: "npm",
    vulnerableRange: "<9.0.0",
    severity: "high",
    cve: "CVE-2022-23529",
    cwe: "CWE-20",
    title: "jsonwebtoken unrestricted key type in verify",
    url: "https://github.com/advisories/GHSA-27h2-hvpr-p9p7",
  },
  {
    id: "GHSA-qwcr-r2fm-qrc7",
    packageName: "express",
    ecosystem: "npm",
    vulnerableRange: "<4.19.2",
    severity: "high",
    cve: "CVE-2024-29041",
    cwe: "CWE-601",
    title: "Open redirect in express",
    url: "https://github.com/advisories/GHSA-qwcr-r2fm-qrc7",
  },
  {
    id: "GHSA-3h5v-q93c-6h6q",
    packageName: "ws",
    ecosystem: "npm",
    vulnerableRange: "<8.17.1",
    severity: "high",
    cve: "CVE-2024-37890",
    cwe: "CWE-400",
    title: "DoS in ws when handling many HTTP headers",
    url: "https://github.com/advisories/GHSA-3h5v-q93c-6h6q",
  },
  {
    id: "GHSA-f9jv-655g-36p3",
    packageName: "tar",
    ecosystem: "npm",
    vulnerableRange: "<6.2.1",
    severity: "medium",
    cve: "CVE-2024-28863",
    cwe: "CWE-400",
    title: "Denial of service in tar extraction",
    url: "https://github.com/advisories/GHSA-f9jv-655g-36p3",
  },
];

export class LocalAdvisoryDatabase implements AdvisoryDatabase {
  readonly id = "local-advisories";

  constructor(private readonly advisories: readonly Advisory[] = LOCAL_ADVISORIES) {}

  async lookup(packageName: string, version: string): Promise<Advisory[]> {
    const name = packageName.toLowerCase();
    return this.advisories.filter(
      (advisory) =>
        advisory.packageName.toLowerCase() === name &&
        versionSatisfies(version, advisory.vulnerableRange),
    );
  }
}

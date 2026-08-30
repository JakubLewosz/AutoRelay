import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerignore = readFileSync(".dockerignore", "utf8");
const nginxConfig = readFileSync("nginx.conf", "utf8");

describe("frontend deployment safety", () => {
  it("keeps local environment and registry files out of the Docker build context", () => {
    const patterns = dockerignore.split(/\r?\n/);
    expect(patterns).toEqual(expect.arrayContaining([".env", ".env.*", ".npmrc"]));
  });

  it("relaxes script policy only on exact API documentation routes", () => {
    const globalCsp = nginxConfig
      .split(/\r?\n/)
      .find((line: string) => line.includes("add_header Content-Security-Policy"));
    expect(globalCsp).toContain("script-src 'self';");
    expect(globalCsp).not.toContain("script-src 'self' 'unsafe-inline'");

    const docsMarker = "location ~ ^/api/(docs|docs/oauth2-redirect|redoc)$ {";
    const docsBlock = nginxConfig.split(docsMarker)[1]?.split("\n    }\n")[0];
    expect(docsBlock).toContain("script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;");
    expect(docsBlock).toContain("proxy_pass http://api:8000;");
  });
});

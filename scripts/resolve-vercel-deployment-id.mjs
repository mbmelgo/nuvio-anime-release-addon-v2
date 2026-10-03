export function resolveVercelDeploymentId(payload) {
  const statuses = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.statuses)
      ? payload.statuses
      : [];

  for (const status of statuses) {
    if (
      String(status?.context || "").toLowerCase() !== "vercel" ||
      String(status?.state || "").toLowerCase() !== "success"
    ) {
      continue;
    }

    const target = String(status?.target_url || "");
    let url;
    try {
      url = new URL(target);
    } catch {
      continue;
    }

    if (url.hostname !== "vercel.com" && url.hostname !== "www.vercel.com") {
      continue;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const deploymentSegment = segments.at(-1) || "";

    if (/^dpl_[A-Za-z0-9]+$/.test(deploymentSegment)) {
      return deploymentSegment;
    }

    if (/^[A-Za-z0-9]+$/.test(deploymentSegment)) {
      return `dpl_${deploymentSegment}`;
    }
  }

  return null;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    const deploymentId = resolveVercelDeploymentId(JSON.parse(input));
    if (!deploymentId) {
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${deploymentId}\n`);
  });
}

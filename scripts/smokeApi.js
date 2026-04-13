const baseUrl = String(process.env.SMOKE_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

const checks = [
  {
    name: "health",
    run: async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      if (!res.ok) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body?.ok) throw new Error("health response missing ok=true");
    },
  },
  {
    name: "ready",
    run: async () => {
      const res = await fetch(`${baseUrl}/api/ready`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body?.ok) throw new Error("ready response missing ok=true");
    },
  },
  {
    name: "auth login validation",
    run: async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "", password: "" }),
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    },
  },
];

const run = async () => {
  console.log(`Running smoke checks against ${baseUrl}`);
  for (const check of checks) {
    await check.run();
    console.log(`✓ ${check.name}`);
  }
  console.log("Smoke checks passed");
};

run().catch((error) => {
  console.error("Smoke checks failed:", error.message || error);
  process.exit(1);
});

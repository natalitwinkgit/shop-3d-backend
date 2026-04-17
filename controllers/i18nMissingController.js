export const getI18nMissingStatus = (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    enabled: false,
    aiEnabled: false,
    provider: "",
    model: "",
    supportedLangs: ["ua", "en"],
    missingReports: {
      pending: 0,
      resolved: 0,
      failed: 0,
    },
  });
};

export const createMissingTranslation = (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    enabled: false,
    translated: false,
    saved: false,
  });
};

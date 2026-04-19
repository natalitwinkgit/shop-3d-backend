const parseList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const envAllowedOrigins = parseList(process.env.CLIENT_URL);
const devAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];
const vercelProdOrigin = "https://shop-3d-frontend-1222.vercel.app";

export const vercelPreviewRegex =
  /^https:\/\/shop-3d-frontend-1222-[a-z0-9-]+-nataliasumska95-1299s-projects\.vercel\.app$/i;

export const allowedOrigins = Array.from(
  new Set([
    ...envAllowedOrigins,
    ...(process.env.NODE_ENV === "production" ? [] : devAllowedOrigins),
    vercelProdOrigin,
  ])
);

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (vercelPreviewRegex.test(origin)) return true;
  return false;
};

export const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true,
};

export const socketCorsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true,
};

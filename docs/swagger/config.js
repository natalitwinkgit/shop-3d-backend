import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { env } from "../../config/env.js";

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const getServerUrl = () => {
  const explicitUrl = trimTrailingSlash(env.publicApiUrl);
  if (explicitUrl) {
    return explicitUrl.startsWith("http") ? explicitUrl : `https://${explicitUrl}`;
  }

  return `http://localhost:${env.port}`;
};

const definition = {
  openapi: "3.0.3",
  info: {
    title: "shop-3d-backend API",
    version: "1.0.0",
    description:
      "OpenAPI documentation for the shop-3d backend. Add endpoint annotations in docs/swagger/openapi.js and extend them as routes evolve.",
  },
  servers: [
    {
      url: getServerUrl(),
      description: env.nodeEnv === "production" ? "Production" : "Local development",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  tags: [
    { name: "System", description: "Service status and readiness probes." },
    { name: "Auth", description: "Authentication and account profile routes." },
    { name: "Products", description: "Catalog browsing and product detail routes." },
  ],
};

export const openApiDocument = swaggerJsdoc({
  definition,
  apis: ["./docs/swagger/**/*.js"],
});

export const swaggerUiOptions = {
  explorer: true,
  customSiteTitle: "shop-3d-backend Swagger",
  swaggerOptions: {
    displayRequestDuration: true,
    persistAuthorization: true,
  },
};

export const swaggerDocsSecurityHeaders = (_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "font-src 'self' data: https:",
      "connect-src 'self' http: https: ws: wss:",
    ].join("; ")
  );
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
};

export { swaggerUi };

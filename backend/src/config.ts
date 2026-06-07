export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://dealradar:dealradar@localhost:5432/dealradar",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
};

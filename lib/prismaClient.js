// lib/prismaClient.js
import { PrismaClient } from "@prisma/client";

// In dev, keep a single instance across hot-reloads.
const prisma = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;

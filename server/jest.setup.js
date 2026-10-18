// Keep tests from generating a real signing key file in server/data.
process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || "test-only-jwt-secret"

// GET /api/health — smoke test. Says WHETHER keys are configured, never their values.
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    keys: {
      ORS_API_KEY: Boolean(process.env.ORS_API_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    time: new Date().toISOString(),
  });
}

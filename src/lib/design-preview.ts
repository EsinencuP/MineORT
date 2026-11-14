/** The design preview pages show every screen state with demo data. Not available in production. */
export const previewAllowed = () => process.env.APP_ENV !== "production";

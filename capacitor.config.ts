import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.neuroquiz.app",
  appName: "NeuroQuiz",
  webDir: "dist",
  // Allow talking to a self-hosted sync server on the LAN over plain http.
  server: { cleartext: true, androidScheme: "https" },
  android: { allowMixedContent: true }
};

export default config;

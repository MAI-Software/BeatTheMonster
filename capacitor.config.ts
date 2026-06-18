import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.waxblythe.monstersboxinghero",
  appName: "Monsters Boxing Hero",
  webDir: "dist",
  android: {
    allowMixedContent: true
  },
  server: {
    androidScheme: "https"
  }
};

export default config;

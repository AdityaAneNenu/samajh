import { Reader } from "@/components/Reader";
import { getAiStatus } from "@/services/ai";

// The status depends on the server environment, so it is resolved per request
// rather than baked in at build time. Otherwise a missing API key would be
// frozen into the page.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const status = getAiStatus();
  return <Reader status={status} />;
}
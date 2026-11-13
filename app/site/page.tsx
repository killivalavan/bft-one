import { CounterCubLandingPage } from "@/components/marketing/CounterCubLandingPage";

/**
 * Public landing page. The edge router rewrites `/` on the marketing host
 * (localhost / countercub.com / www.countercub.com) to this route, and redirects
 * `/site` on shop and platform admin hosts, so it only ever renders on the public website.
 */
export default function SitePage() {
  return <CounterCubLandingPage />;
}


import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.countercub.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/site",
          "/api/",
          "/admin/",
          "/b2b/",
          "/billing",
          "/invoices",
          "/daily-sales",
          "/sales",
          "/expenses",
          "/stock",
          "/inventory",
          "/notice-board",
          "/notifications",
          "/timesheet",
          "/mysalary",
          "/profile",
          "/contacts",
          "/calendar",
          "/debug",
          "/pending",
          "/super-admin/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

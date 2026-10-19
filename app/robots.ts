import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://seyalpro.in";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/super-admin/login"],
        disallow: [
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

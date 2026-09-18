"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export interface SearchResult {
  id: string;
  kind: "PROJECT" | "APARTMENT" | "CHANGE" | "CONSULTANT_REQUEST";
  title: string;
  subtitle: string;
  href: string;
}

/**
 * חיפוש גלובלי — פרויקטים, דירות, שמות דיירים, קודי שינוי ובקשות יועצים.
 * החיפוש מוגבל לארגונים שהמשתמש חבר בהם.
 */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const term = query.trim();
  if (term.length < 2) return [];

  const organizationIds = user.organizationIds;
  if (organizationIds.length === 0 && !user.isSuperAdmin) return [];

  const projectScope = user.isSuperAdmin ? {} : { organizationId: { in: organizationIds } };

  const [projects, apartments, changeItems, consultantRequests] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectScope, name: { contains: term, mode: "insensitive" } },
      take: 4,
      select: { id: true, name: true, city: true, developerName: true },
    }),
    prisma.apartment.findMany({
      where: {
        project: projectScope,
        OR: [
          { number: { startsWith: term } },
          { buyerName: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 6,
      include: { building: true, project: { select: { id: true, name: true } } },
      orderBy: { number: "asc" },
    }),
    prisma.changeItem.findMany({
      where: {
        changeSet: { apartment: { project: projectScope } },
        OR: [
          { code: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 5,
      include: {
        changeSet: {
          include: {
            apartment: { select: { id: true, number: true, projectId: true } },
          },
        },
      },
    }),
    prisma.consultantRequest.findMany({
      where: {
        apartment: { project: projectScope },
        code: { contains: term, mode: "insensitive" },
      },
      take: 3,
      include: { apartment: { select: { id: true, number: true, projectId: true } } },
    }),
  ]);

  const results: SearchResult[] = [];

  for (const project of projects) {
    results.push({
      id: project.id,
      kind: "PROJECT",
      title: project.name,
      subtitle: [project.developerName, project.city].filter(Boolean).join(" · "),
      href: `/projects/${project.id}`,
    });
  }

  for (const apartment of apartments) {
    results.push({
      id: apartment.id,
      kind: "APARTMENT",
      title: `דירה ${apartment.number}`,
      subtitle: [apartment.building.name, apartment.buyerName, apartment.project.name]
        .filter(Boolean)
        .join(" · "),
      href: `/projects/${apartment.project.id}/apartments/${apartment.id}`,
    });
  }

  for (const item of changeItems) {
    const apartment = item.changeSet.apartment;
    results.push({
      id: item.id,
      kind: "CHANGE",
      title: `${item.code} · ${item.description}`,
      subtitle: `דירה ${apartment.number}`,
      href: `/projects/${apartment.projectId}/apartments/${apartment.id}?tab=changes&change=${item.id}`,
    });
  }

  for (const request of consultantRequests) {
    results.push({
      id: request.id,
      kind: "CONSULTANT_REQUEST",
      title: `בקשת יועץ ${request.code}`,
      subtitle: `דירה ${request.apartment.number}`,
      href: `/projects/${request.apartment.projectId}/apartments/${request.apartment.id}?tab=consultants`,
    });
  }

  return results;
}

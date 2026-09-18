/**
 * הפשטת אחסון קבצים.
 *
 * תוכניות דירה הן מידע עסקי רגיש. המערכת אינה שולחת אותן לשירות חיצוני,
 * והמימוש הפעיל נקבע בנקודה אחת בלבד. בעתיד ניתן להחליף ל-S3, Google Cloud
 * Storage או Azure Blob עם קישורים חתומים, ללא שינוי בשאר המערכת.
 */

export interface StoredObject {
  /** מפתח האחסון — לעולם לא נתיב מוחלט של המערכת */
  key: string;
  originalName: string;
  mimeType?: string;
  sizeBytes: number;
}

export interface StorageProvider {
  readonly name: string;

  put(input: {
    key: string;
    originalName: string;
    mimeType?: string;
    body: Buffer;
  }): Promise<StoredObject>;

  get(key: string): Promise<Buffer>;

  delete(key: string): Promise<void>;

  /**
   * קישור גישה זמני. מימוש מרוחק יחזיר Signed URL עם תפוגה;
   * המימוש המקומי מחזיר נתיב פנימי שנבדק מול הרשאות המשתמש.
   */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

class NotConfiguredStorageProvider implements StorageProvider {
  readonly name = "not-configured";

  private fail(): never {
    throw new Error(
      "אחסון הקבצים אינו מוגדר בסביבה זו. יש להגדיר ספק אחסון לפני העלאת קבצים.",
    );
  }

  async put(): Promise<StoredObject> {
    this.fail();
  }

  async get(): Promise<Buffer> {
    this.fail();
  }

  async delete(): Promise<void> {
    this.fail();
  }

  async signedUrl(): Promise<string> {
    this.fail();
  }
}

let provider: StorageProvider = new NotConfiguredStorageProvider();

export function getStorageProvider(): StorageProvider {
  return provider;
}

/** נקודת ההחלפה היחידה בין מימושי אחסון */
export function setStorageProvider(next: StorageProvider): void {
  provider = next;
}

/** מפתח אחסון עקבי: ארגון / פרויקט / דירה / גרסה / קובץ */
export function buildStorageKey(parts: {
  organizationId: string;
  projectId?: string;
  apartmentId?: string;
  planVersionId?: string;
  fileName: string;
}): string {
  // ניקוי שם הקובץ: אין מפרידי נתיב ואין מעבר בין תיקיות
  const safeName = parts.fileName
    .replace(/[\\/]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/[^\w.\-֐-׿]/g, "_")
    .replace(/^[.\-]+/, "_")
    .slice(0, 180);
  return [
    "org",
    parts.organizationId,
    parts.projectId ? `project/${parts.projectId}` : null,
    parts.apartmentId ? `apartment/${parts.apartmentId}` : null,
    parts.planVersionId ? `version/${parts.planVersionId}` : null,
    safeName,
  ]
    .filter(Boolean)
    .join("/");
}

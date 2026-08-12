import { Type, type Static } from "@sinclair/typebox";

export const BackupSchema = Type.Object({
  filename: Type.String(), createdAt: Type.String({ format: "date-time" }),
  bytes: Type.Integer({ minimum: 0 }), schemaVersion: Type.Integer({ minimum: 1 }),
});
export const BackupListSchema = Type.Object({ backups: Type.Array(BackupSchema) });
export const RestoreBackupSchema = Type.Object({ filename: Type.String(), confirmed: Type.Literal(true) });
export type BackupInfo = Static<typeof BackupSchema>;
export type BackupList = Static<typeof BackupListSchema>;
export type RestoreBackupInput = Static<typeof RestoreBackupSchema>;
